'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  type SessionDetailResponse,
  type SessionStateResponse,
  type SessionMediaResponse,
  type JoinSessionResponse,
  type SwipeResponse,
} from '@/types/api';
import type { SwipeDirection } from '@/modules/swiping/SwipeDeck';

interface SwipeResult {
  matchFound: boolean;
  title: string | null;
}

const POLL_INTERVAL_MS = 5000;

export function useSession(sessionId: string) {
  const [sessionState, setSessionState] = useState<SessionStateResponse | null>(null);
  const [mediaPool, setMediaPool] = useState<SessionDetailResponse['mediaPool'] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsJoin, setNeedsJoin] = useState(false);

  const [joinError, setJoinError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const prevStatusRef = useRef<SessionStateResponse['session']['status'] | null>(null);

  const fetchSessionState = useCallback(
    async (options?: { silent?: boolean }): Promise<boolean> => {
      if (!sessionId) return false;

      try {
        const res = await fetch(`/api/sessions/${sessionId}`, {
          credentials: 'same-origin',
        });

        if (res.status === 401) {
          setNeedsJoin(true);
          setSessionState(null);
          if (!options?.silent) setIsLoading(false);
          return false;
        }

        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error || 'Failed to load session');
        }

        const data = (await res.json()) as SessionStateResponse;
        setSessionState(data);
        setNeedsJoin(false);
        setError(null);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
        if (!options?.silent) setIsLoading(false);
        return false;
      }
    },
    [sessionId]
  );

  const fetchMedia = useCallback(async (): Promise<boolean> => {
    if (!sessionId) return false;

    try {
      const res = await fetch(`/api/sessions/${sessionId}/media`, {
        credentials: 'same-origin',
      });

      if (res.status === 401) {
        setNeedsJoin(true);
        setIsLoading(false);
        return false;
      }

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error || 'Failed to load media pool');
      }

      const data = (await res.json()) as SessionMediaResponse;
      setMediaPool(data.mediaPool);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setIsLoading(false);
      return false;
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;

    const init = async () => {
      setIsLoading(true);
      const ok = await fetchSessionState({ silent: false });
      if (ok) await fetchMedia();
      setIsLoading(false);
    };

    init();

    const interval = setInterval(() => {
      void fetchSessionState({ silent: true });
      if (sessionState?.session.status === 'LOBBY') {
        void fetchMedia();
      }
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, [sessionId, fetchSessionState, fetchMedia, sessionState?.session.status]);

  useEffect(() => {
    const currentStatus = sessionState?.session.status;
    if (!currentStatus) return;

    if (
      prevStatusRef.current === 'LOBBY' &&
      currentStatus === 'SWIPING_ACTIVE'
    ) {
      void fetchMedia();
    }

    prevStatusRef.current = currentStatus;
  }, [sessionState?.session.status, fetchMedia]);

  const session = useMemo<SessionDetailResponse | null>(() => {
    if (!sessionState) return null;
    return { ...sessionState, mediaPool: mediaPool ?? [] };
  }, [sessionState, mediaPool]);

  const refetch = useCallback(async () => {
    setIsLoading(true);
    await Promise.all([
      fetchSessionState({ silent: false }),
      fetchMedia(),
    ]);
    setIsLoading(false);
  }, [fetchSessionState, fetchMedia]);

  const join = useCallback(
    async (displayName: string) => {
      if (!sessionId) return;

      setJoinError(null);
      const name = displayName.trim();
      if (!name) {
        setJoinError('Display name is required.');
        throw new Error('Display name is required.');
      }

      setIsJoining(true);

      try {
        const res = await fetch(`/api/sessions/${sessionId}/join`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ displayName: name }),
        });

        const data = (await res.json()) as
          | JoinSessionResponse
          | { error?: string };

        if (!res.ok) {
          const message =
            'error' in data && typeof data.error === 'string'
              ? data.error
              : 'Failed to join session';
          throw new Error(message);
        }

        setIsLoading(true);
        const ok = await fetchSessionState({ silent: false });
        if (ok) await fetchMedia();
        setIsLoading(false);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Something went wrong';
        setJoinError(message);
        throw err;
      } finally {
        setIsJoining(false);
      }
    },
    [sessionId, fetchSessionState, fetchMedia]
  );

  const swipe = async (
    mediaId: string,
    direction: SwipeDirection
  ): Promise<SwipeResult> => {
    if (!sessionId || !session?.userId) {
      return { matchFound: false, title: null };
    }

    try {
      const res = await fetch(`/api/sessions/${sessionId}/swipe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          mediaId,
          vote: direction,
        }),
      });

      const data = (await res.json()) as SwipeResponse;

      if (!res.ok) {
        console.error('Swipe failed', data);
        return { matchFound: false, title: null };
      }

      const title = data.matchFound
        ? (session.mediaPool.find((m) => m.id === mediaId)?.title ??
            'this title')
        : null;

      return { matchFound: data.matchFound ?? false, title };
    } catch (err) {
      console.error(err);
      return { matchFound: false, title: null };
    }
  };

  const endSession = useCallback(async () => {
    if (!sessionId || !session) return;
    if (session.userId !== session.session.hostId) return;

    const confirmed = window.confirm(
      'End swiping early and see results?'
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/sessions/${sessionId}/end`, {
        method: 'POST',
        credentials: 'same-origin',
      });

      if (res.status === 403) {
        setError('Only the host can end the session early.');
        return;
      }

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error || 'Failed to end session');
      }

      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }, [sessionId, session, refetch]);

  const startSession = useStartSession(sessionId, session, refetch, setError);

  return {
    session,
    error,
    isLoading,
    needsJoin,
    join,
    joinError,
    isJoining,
    swipe,
    endSession,
    startSession,
    refetch,
  };
}

function useStartSession(
  sessionId: string,
  session: SessionDetailResponse | null,
  refetch: () => Promise<void>,
  setError: (error: string | null) => void
) {
  return useCallback(async () => {
    if (!sessionId || !session) return;
    if (session.userId !== session.session.hostId) {
      setError('Only the host can start the session.');
      return;
    }

    try {
      const res = await fetch(`/api/sessions/${sessionId}/start`, {
        method: 'POST',
        credentials: 'same-origin',
      });

      if (res.status === 403) {
        setError('Only the host can start the session.');
        return;
      }

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error || 'Failed to start session');
      }

      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }, [sessionId, session, refetch, setError]);
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  type SessionDetailResponse,
  type JoinSessionResponse,
  type SwipeResponse,
} from '@/types/api';
import type { SwipeDirection } from '@/modules/swiping/SwipeDeck';

interface SwipeResult {
  matchFound: boolean;
  title: string | null;
}

export function useSession(sessionId: string) {
  const [session, setSession] = useState<SessionDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsJoin, setNeedsJoin] = useState(false);

  const [joinError, setJoinError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);

  const fetchSession = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!sessionId) return;

      try {
        const res = await fetch(`/api/sessions/${sessionId}`, {
          credentials: 'same-origin',
        });

        if (res.status === 401) {
          setNeedsJoin(true);
          setSession(null);
          if (!options?.silent) {
            setIsLoading(false);
          }
          return;
        }

        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error || 'Failed to load session');
        }

        const data = (await res.json()) as SessionDetailResponse;
        setSession(data);
        setNeedsJoin(false);
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Something went wrong'
        );
      } finally {
        if (!options?.silent) {
          setIsLoading(false);
        }
      }
    },
    [sessionId]
  );

  useEffect(() => {
    if (!sessionId) return;

    const initialTimer = setTimeout(() => {
      fetchSession({ silent: false });
    }, 0);

    const interval = setInterval(() => {
      fetchSession({ silent: true });
    }, 5000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [sessionId, fetchSession]);

  const refetch = useCallback(
    () => fetchSession({ silent: false }),
    [fetchSession]
  );

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

        await fetchSession({ silent: false });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Something went wrong';
        setJoinError(message);
        throw err;
      } finally {
        setIsJoining(false);
      }
    },
    [sessionId, fetchSession]
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

      await fetchSession({ silent: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    }
  }, [sessionId, session, fetchSession]);

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
    refetch,
  };
}

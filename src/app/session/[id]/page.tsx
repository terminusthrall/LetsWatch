'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import PairwiseVote from '@/modules/head-to-head/PairwiseVote';
import WinnerView from '@/modules/sessions/WinnerView';
import CountdownTimer from '@/modules/sessions/CountdownTimer';
import InviteModal from '@/modules/sessions/InviteModal';
import {
  SwipeDeck,
  type SwipeMedia,
  type SwipeDirection,
} from '@/modules/swiping/SwipeDeck';

type SessionStatus =
  | 'SWIPING_ACTIVE'
  | 'HEAD_TO_HEAD_ACTIVE'
  | 'DEADLINE_RESOLVED'
  | 'COMPLETED';

type Participant = {
  userId: string;
  displayName: string;
  isHost: boolean;
  swipedCount: number;
  totalMediaCount: number;
  isFinished: boolean;
};

type SessionResponse = {
  session: {
    id: string;
    title: string;
    joinCode: string | null;
    hostId: string;
    status: SessionStatus;
    deadlineAt: string;
    finalWinningMediaId: string | null;
  };
  participants: Participant[];
  mediaPool: Array<{
    id: string;
    tmdbId: string;
    mediaType: string;
    title: string;
    posterPath: string | null;
    releaseYear: string | null;
    overview: string | null;
    isMatched: boolean;
  }>;
  matches: string[];
  participantCount: number;
  redisState: unknown;
  userId: string;
  headToHeadVotes: Array<{
    userId: string;
    preferredMediaId: string;
    opponentMediaId: string;
  }>;
  headToHeadStandings: Array<{ mediaId: string; wins: number }>;
  winningMedia: {
    id: string;
    tmdbId: string;
    mediaType: string;
    title: string;
    posterPath: string | null;
    releaseYear: string | null;
    overview: string | null;
    voteAverage: number | null;
    watchUrl: string;
  } | null;
};

type JoinSessionResponse = {
  sessionId: string;
  userId: string;
  title: string;
  status: string;
  deadlineAt: string;
  participantCount: number;
};

type SwipeResponse = {
  success: boolean;
  matchFound: boolean;
  matchedMedia?: {
    id: string;
    title: string;
    posterPath: string | null;
  };
};

type EndSessionResponse = {
  status: SessionStatus;
  winningMedia: SessionResponse['winningMedia'];
};

function ParticipantRoster({
  participants,
  currentUserId,
}: {
  participants: Participant[];
  currentUserId: string;
}) {
  return (
    <section className="mb-6 w-full max-w-3xl rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Participants
      </h2>
      <ul className="space-y-3">
        {participants.map((p) => {
          const progress =
            p.totalMediaCount > 0 ? p.swipedCount / p.totalMediaCount : 0;
          return (
            <li key={p.userId} className="flex items-center gap-3">
              <div className="flex flex-1 flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    {p.displayName}
                    {p.userId === currentUserId && ' (You)'}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {p.swipedCount}/{p.totalMediaCount}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
              </div>
              {p.isHost && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
                  Host
                </span>
              )}
              {p.isFinished && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200">
                  Done
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function MatchToast({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, 6000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed top-4 left-1/2 z-50 w-[90%] max-w-md -translate-x-1/2 animate-in fade-in slide-in-from-top-2">
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-emerald-500/30 bg-emerald-500 px-5 py-4 text-white shadow-lg shadow-emerald-500/30">
        <div>
          <p className="font-bold">It&apos;s a match!</p>
          <p className="text-sm opacity-90">Everyone liked {title}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 hover:bg-emerald-600"
          aria-label="Dismiss match"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default function SessionRoomPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';

  const [session, setSession] = useState<SessionResponse | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsJoin, setNeedsJoin] = useState(false);

  const [joinDisplayName, setJoinDisplayName] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const [toast, setToast] = useState<{ mediaId: string; title: string } | null>(
    null
  );
  const [inviteOpen, setInviteOpen] = useState(false);

  const fetchSession = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!id) return;

      try {
        const res = await fetch(`/api/sessions/${id}`, {
          credentials: 'same-origin',
        });

        if (res.status === 401) {
          setNeedsJoin(true);
          setSession(null);
          if (!options?.silent) {
            setIsInitialLoading(false);
          }
          return;
        }

        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error || 'Failed to load session');
        }

        const data = (await res.json()) as SessionResponse;
        setSession(data);
        setNeedsJoin(false);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      } finally {
        if (!options?.silent) {
          setIsInitialLoading(false);
        }
      }
    },
    [id]
  );

  useEffect(() => {
    if (!id) return;

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
  }, [id, fetchSession]);

  const handleJoin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setJoinError(null);

    const displayName = joinDisplayName.trim();
    if (!displayName) {
      setJoinError('Display name is required.');
      return;
    }

    setIsJoining(true);

    try {
      const res = await fetch(`/api/sessions/${id}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName }),
      });

      const data = (await res.json()) as JoinSessionResponse | { error?: string };

      if (!res.ok) {
        const message =
          'error' in data && typeof data.error === 'string'
            ? data.error
            : 'Failed to join session';
        setJoinError(message);
        return;
      }

      setJoinDisplayName('');
      await fetchSession({ silent: false });
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsJoining(false);
    }
  };

  const handleEndSession = useCallback(async () => {
    if (!id || !session) return;
    if (session.userId !== session.session.hostId) return;

    const confirmed = window.confirm(
      'End swiping early and see results?'
    );
    if (!confirmed) return;

    try {
      const res = await fetch(`/api/sessions/${id}/end`, {
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
  }, [id, session, fetchSession]);

  const handleVote = useCallback(
    async (mediaId: string, direction: SwipeDirection) => {
      if (!id || !session?.userId) return;

      try {
        const res = await fetch(`/api/sessions/${id}/swipe`, {
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
          return;
        }

        if (data.matchFound) {
          const title =
            session.mediaPool.find((m) => m.id === mediaId)?.title ??
            data.matchedMedia?.title ??
            'this title';
          setToast({ mediaId, title });
        }
      } catch (err) {
        console.error(err);
      }
    },
    [id, session]
  );

  if (!id) {
    return (
      <main className="flex min-h-full flex-1 items-center justify-center px-6">
        <p className="text-zinc-600 dark:text-zinc-400">Invalid session link.</p>
      </main>
    );
  }

  if (isInitialLoading) {
    return (
      <main className="flex min-h-full flex-1 items-center justify-center px-6">
        <p className="text-zinc-600 dark:text-zinc-400">Loading session...</p>
      </main>
    );
  }

  if (error && !session) {
    return (
      <main className="flex min-h-full flex-1 flex-col items-center justify-center gap-4 px-6">
        <p className="text-center text-red-600 dark:text-red-400">{error}</p>
        <button
          type="button"
          onClick={() => fetchSession({ silent: false })}
          className="rounded-xl bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          Try again
        </button>
      </main>
    );
  }

  return (
    <main className="flex min-h-full flex-1 flex-col items-center px-4 py-6">
      {toast && (
        <MatchToast title={toast.title} onClose={() => setToast(null)} />
      )}

      {needsJoin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
          <form
            onSubmit={handleJoin}
            className="w-full max-w-sm rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
          >
            <h2 className="mb-2 text-xl font-bold text-zinc-900 dark:text-zinc-50">
              Join session
            </h2>
            <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
              Enter a display name to start swiping.
            </p>

            <div className="flex flex-col gap-2">
              <label
                htmlFor="joinDisplayName"
                className="text-sm font-semibold text-zinc-700 dark:text-zinc-300"
              >
                Display name
              </label>
              <input
                id="joinDisplayName"
                type="text"
                value={joinDisplayName}
                onChange={(e) => setJoinDisplayName(e.target.value)}
                placeholder="e.g. Alex"
                maxLength={50}
                required
                className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
              />
            </div>

            {joinError && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-200">
                {joinError}
              </p>
            )}

            <button
              type="submit"
              disabled={isJoining}
              className="mt-5 w-full rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-white shadow-md shadow-emerald-500/30 transition hover:bg-emerald-600 disabled:opacity-60"
            >
              {isJoining ? 'Joining...' : 'Join Session'}
            </button>
          </form>
        </div>
      )}

      {session && (
        <>
          <header className="mb-6 w-full max-w-3xl">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                  {session.session.title}
                </h1>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {session.participantCount} participant
                  {session.participantCount === 1 ? '' : 's'} · ends in{' '}
                  <CountdownTimer
                    deadlineAt={session.session.deadlineAt}
                    onExpired={() => fetchSession({ silent: false })}
                  />
                </p>
              </div>
              <div className="flex items-center gap-2">
                {session.session.hostId === session.userId &&
                  session.session.status === 'SWIPING_ACTIVE' && (
                    <button
                      type="button"
                      onClick={handleEndSession}
                      className="inline-flex items-center rounded-full bg-rose-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-rose-600"
                    >
                      End Swiping & See Results
                    </button>
                  )}
                <button
                  type="button"
                  onClick={() => setInviteOpen(true)}
                  className="inline-flex items-center rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600"
                >
                  Invite Group
                </button>
                <span className="inline-flex w-fit items-center rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {session.session.status.replace(/_/g, ' ')}
                </span>
              </div>
            </div>
          </header>

          <ParticipantRoster
            participants={session.participants}
            currentUserId={session.userId}
          />

          {(() => {
            const matchedItems = session.mediaPool.filter(
              (m) =>
                session.matches.includes(m.id) ||
                (m.isMatched && session.matches.length === 0)
            );

            if (
              session.session.status === 'COMPLETED' ||
              session.session.status === 'DEADLINE_RESOLVED' ||
              session.session.finalWinningMediaId
            ) {
              const fallbackMedia = session.session.finalWinningMediaId
                ? session.mediaPool.find(
                    (m) => m.id === session.session.finalWinningMediaId
                  ) ?? null
                : null;

              const winner = session.winningMedia ??
                (fallbackMedia
                  ? {
                      id: fallbackMedia.id,
                      tmdbId: fallbackMedia.tmdbId,
                      mediaType: fallbackMedia.mediaType,
                      title: fallbackMedia.title,
                      posterPath: fallbackMedia.posterPath,
                      releaseYear: fallbackMedia.releaseYear,
                      overview: fallbackMedia.overview,
                      voteAverage: null,
                      watchUrl: `https://www.justwatch.com/us/search?q=${encodeURIComponent(fallbackMedia.title)}`,
                    }
                  : null);

              return winner ? (
                <WinnerView media={winner} />
              ) : (
                <div className="flex w-full max-w-md flex-col items-center rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
                  <p className="text-lg font-medium text-zinc-700 dark:text-zinc-200">
                    No winner selected.
                  </p>
                </div>
              );
            }

            if (
              session.session.status === 'HEAD_TO_HEAD_ACTIVE' ||
              matchedItems.length > 1
            ) {
              return matchedItems.length >= 2 ? (
                <PairwiseVote
                  sessionId={id}
                  userId={session.userId}
                  items={matchedItems.map((m) => ({
                    id: m.id,
                    tmdbId: m.tmdbId,
                    mediaType: m.mediaType,
                    title: m.title,
                    posterPath: m.posterPath,
                    releaseYear: m.releaseYear,
                    overview: m.overview,
                  }))}
                  myVotes={session.headToHeadVotes.filter(
                    (v) => v.userId === session.userId
                  )}
                  standings={session.headToHeadStandings}
                  participantCount={session.participantCount}
                  onVoteSubmitted={() => fetchSession({ silent: false })}
                />
              ) : (
                <div className="flex w-full max-w-md flex-col items-center rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
                  <p className="text-lg font-medium text-zinc-700 dark:text-zinc-200">
                    Waiting for the tie-breaker pool.
                  </p>
                </div>
              );
            }

            return (
              <SwipeDeck
                items={session.mediaPool.map(
                  (media): SwipeMedia => ({
                    id: media.id,
                    title: media.title,
                    releaseYear: media.releaseYear ?? undefined,
                    overview: media.overview ?? 'No overview available.',
                    posterPath: media.posterPath,
                  })
                )}
                onVote={handleVote}
                onEmpty={() => {}}
                emptyMessage="You've swiped through the deck. Wait for the results!"
              />
            );
          })()}

          <InviteModal
            joinCode={session.session.joinCode}
            open={inviteOpen}
            onClose={() => setInviteOpen(false)}
          />
        </>
      )}
    </main>
  );
}

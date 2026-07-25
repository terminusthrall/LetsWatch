'use client';

import { useEffect, useMemo, useState } from 'react';
import { getPosterUrl } from '@/lib/poster';

type PairwiseItem = {
  id: string;
  tmdbId: string | null;
  mediaType: string;
  title: string;
  posterPath: string | null;
  releaseYear: string | null;
  overview: string | null;
};

type PairwiseVoteRecord = {
  preferredMediaId: string;
  opponentMediaId: string;
};

type PairwiseStanding = {
  mediaId: string;
  wins: number;
};

type PairwiseVoteProps = {
  sessionId: string;
  userId: string;
  items: PairwiseItem[];
  myVotes: PairwiseVoteRecord[];
  standings: PairwiseStanding[];
  participantCount: number;
  onVoteSubmitted: () => void;
};

function pairKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function PosterCard({
  item,
  onSelect,
  disabled,
  label,
}: {
  item: PairwiseItem;
  onSelect: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className="group relative flex flex-1 flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white text-left shadow-lg transition hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-emerald-500/30 disabled:opacity-70 dark:border-zinc-800 dark:bg-zinc-900"
      aria-label={`${label}: ${item.title}`}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-zinc-100 dark:bg-zinc-800">
        {item.posterPath ? (
          <img
            src={getPosterUrl(item.posterPath, 'w342') ?? undefined}
            alt={item.title}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-zinc-400">
            No poster
          </div>
        )}
        <span className="absolute right-3 top-3 rounded-full bg-emerald-500 px-2.5 py-1 text-xs font-bold text-white shadow">
          {label}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
          {item.title}
        </h3>
        {item.releaseYear && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {item.releaseYear}
          </p>
        )}
        <p className="mt-2 line-clamp-3 text-sm text-zinc-600 dark:text-zinc-400">
          {item.overview ?? 'No overview available.'}
        </p>
      </div>
    </button>
  );
}

export default function PairwiseVote({
  sessionId,
  userId,
  items,
  myVotes,
  standings,
  participantCount,
  onVoteSubmitted,
}: PairwiseVoteProps) {
  const [voted, setVoted] = useState<Set<string>>(
    () =>
      new Set(myVotes.map((v) => pairKey(v.preferredMediaId, v.opponentMediaId)))
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setVoted((prev) => {
      const next = new Set(prev);
      for (const v of myVotes) {
        next.add(pairKey(v.preferredMediaId, v.opponentMediaId));
      }
      return next;
    });
  }, [myVotes]);

  const allPairs = useMemo(() => {
    const pairs: Array<[PairwiseItem, PairwiseItem]> = [];
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        pairs.push([items[i], items[j]]);
      }
    }
    return pairs;
  }, [items]);

  const currentPair = useMemo(() => {
    return (
      allPairs.find(([a, b]) => !voted.has(pairKey(a.id, b.id))) ?? null
    );
  }, [allPairs, voted]);

  const userTotalPairs = allPairs.length;
  const userProgress =
    userTotalPairs > 0 ? Math.round((voted.size / userTotalPairs) * 100) : 0;

  const totalVotesCast = standings.reduce((sum, s) => sum + s.wins, 0);
  const totalConsensusVotes = userTotalPairs * participantCount;
  const consensusProgress =
    totalConsensusVotes > 0
      ? Math.min(100, Math.round((totalVotesCast / totalConsensusVotes) * 100))
      : 0;

  const itemById = useMemo(() => {
    const map = new Map<string, PairwiseItem>();
    for (const item of items) {
      map.set(item.id, item);
    }
    return map;
  }, [items]);

  const rankedStandings = useMemo(() => {
    const base = new Map<string, number>();
    for (const item of items) {
      base.set(item.id, 0);
    }
    for (const s of standings) {
      base.set(s.mediaId, s.wins);
    }
    return Array.from(base.entries())
      .map(([mediaId, wins]) => ({
        mediaId,
        wins,
        title: itemById.get(mediaId)?.title ?? mediaId,
      }))
      .sort((a, b) => b.wins - a.wins || a.mediaId.localeCompare(b.mediaId));
  }, [items, standings, itemById]);

  const submitVote = async (
    preferred: PairwiseItem,
    opponent: PairwiseItem
  ) => {
    if (isSubmitting) return;
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/sessions/${sessionId}/head-to-head`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          userId,
          preferredMediaId: preferred.id,
          opponentMediaId: opponent.id,
        }),
      });

      const data = (await res.json()) as { error?: string };

      if (!res.ok) {
        throw new Error(data.error || 'Failed to record vote');
      }

      setVoted((prev) => {
        const next = new Set(prev);
        next.add(pairKey(preferred.id, opponent.id));
        return next;
      });

      onVoteSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vote failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-4xl">
      <div className="mb-6 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
          Head-to-Head Tie-Breaker
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Pick your favorite between the two options.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <div className="mb-1 flex justify-between text-xs font-medium text-zinc-700 dark:text-zinc-300">
              <span>Your progress</span>
              <span>{userProgress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${userProgress}%` }}
              />
            </div>
          </div>

          {participantCount > 1 && (
            <div>
              <div className="mb-1 flex justify-between text-xs font-medium text-zinc-700 dark:text-zinc-300">
                <span>Room progress</span>
                <span>{consensusProgress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all"
                  style={{ width: `${consensusProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {currentPair ? (
        <div className="flex flex-col gap-4 md:flex-row md:items-stretch md:gap-6">
          <PosterCard
            item={currentPair[0]}
            label="Option A"
            disabled={isSubmitting}
            onSelect={() => submitVote(currentPair[0], currentPair[1])}
          />

          <div className="flex items-center justify-center">
            <span className="rounded-full bg-zinc-100 px-4 py-2 text-sm font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              VS
            </span>
          </div>

          <PosterCard
            item={currentPair[1]}
            label="Option B"
            disabled={isSubmitting}
            onSelect={() => submitVote(currentPair[1], currentPair[0])}
          />
        </div>
      ) : (
        <div className="rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
            You&apos;ve voted on every pair.
          </p>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Waiting for the rest of the room to finish. ({consensusProgress}% complete)
          </p>
        </div>
      )}

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-center text-sm text-red-700 dark:bg-red-900/30 dark:text-red-200">
          {error}
        </p>
      )}

      {rankedStandings.length > 0 && (
        <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Current standings
          </h3>
          <ol className="space-y-2">
            {rankedStandings.slice(0, 5).map((entry, index) => (
              <li
                key={entry.mediaId}
                className="flex items-center justify-between rounded-xl bg-zinc-50 px-4 py-2 dark:bg-zinc-800"
              >
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  {index + 1}. {entry.title}
                </span>
                <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  {entry.wins} win{entry.wins === 1 ? '' : 's'}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

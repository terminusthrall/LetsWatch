'use client';

import PairwiseVote from '@/modules/head-to-head/PairwiseVote';
import WinnerView from '@/modules/sessions/WinnerView';
import {
  SwipeDeck,
  type SwipeMedia,
  type SwipeDirection,
} from '@/modules/swiping/SwipeDeck';
import { type SessionDetailResponse, type WinnerMedia } from '@/types/api';

interface SessionPhaseViewProps {
  session: SessionDetailResponse;
  sessionId: string;
  onVote: (mediaId: string, direction: SwipeDirection) => void;
  refetch: () => Promise<void>;
}

export default function SessionPhaseView({
  session,
  sessionId,
  onVote,
  refetch,
}: SessionPhaseViewProps) {
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

    const winner: WinnerMedia | null =
      session.winningMedia ??
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
            watchUrl: `https://www.justwatch.com/us/search?q=${encodeURIComponent(
              fallbackMedia.title
            )}`,
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
        sessionId={sessionId}
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
        onVoteSubmitted={() => refetch()}
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
      onVote={onVote}
      onEmpty={() => {}}
      emptyMessage="You've swiped through the deck. Wait for the results!"
    />
  );
}

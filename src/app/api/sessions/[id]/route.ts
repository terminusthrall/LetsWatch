import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { sessions, sessionMedia, headToHeadVotes, users, swipes } from '@/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { getMediaDetails } from '@/modules/tmdb';
import { computeHeadToHeadStandings } from '@/modules/head-to-head/standings';
import { getAuthenticatedParticipant } from '@/modules/auth';
import {
  getSessionMatches,
  acquireSessionLock,
  releaseSessionLock,
  cacheWinner,
  getCachedWinner,
} from '@/modules/redis';
import {
  getSessionParticipants,
  getParticipantCount,
} from '@/modules/sessions/participants';

type WinnerMedia = {
  id: string;
  tmdbId: string;
  mediaType: string;
  title: string;
  posterPath: string | null;
  releaseYear: string | null;
  overview: string | null;
  voteAverage: number | null;
  watchUrl: string;
};

function watchUrlForTitle(title: string): string {
  return `https://www.justwatch.com/us/search?q=${encodeURIComponent(title)}`;
}

async function resolveDeadlineIfExpired(
  session: {
    id: string;
    status: string;
    deadlineAt: Date;
    finalWinningMediaId: string | null;
  }
): Promise<{ status: string; finalWinningMediaId: string | null }> {
  if (
    (session.status !== 'SWIPING_ACTIVE' && session.status !== 'HEAD_TO_HEAD_ACTIVE') ||
    new Date() <= session.deadlineAt
  ) {
    return { status: session.status, finalWinningMediaId: session.finalWinningMediaId };
  }

  const lockToken = await acquireSessionLock(session.id, 10);
  if (!lockToken) {
    return { status: session.status, finalWinningMediaId: session.finalWinningMediaId };
  }

  try {
    const matches = await getSessionMatches(session.id);
    let newStatus = session.status;
    let winnerId: string | null = session.finalWinningMediaId;

    if (session.status === 'SWIPING_ACTIVE') {
      if (matches.length >= 2) {
        newStatus = 'HEAD_TO_HEAD_ACTIVE';
      } else if (matches.length === 1) {
        newStatus = 'COMPLETED';
        winnerId = matches[0];
      } else {
        newStatus = 'DEADLINE_RESOLVED';
        winnerId = null;
      }
    } else {
      // HEAD_TO_HEAD_ACTIVE deadline resolution
      const matchIds = matches;
      if (matchIds.length === 0) {
        newStatus = 'DEADLINE_RESOLVED';
        winnerId = null;
      } else {
        const [allVotes, mediaItems] = await Promise.all([
          db.query.headToHeadVotes.findMany({
            where: eq(headToHeadVotes.sessionId, session.id),
          }),
          db.query.sessionMedia.findMany({
            where: and(
              eq(sessionMedia.sessionId, session.id),
              inArray(sessionMedia.id, matchIds)
            ),
            columns: { id: true, addedAt: true },
          }),
        ]);
        const addedAtByMediaId = new Map(mediaItems.map((m) => [m.id, m.addedAt]));
        const standings = computeHeadToHeadStandings(matchIds, allVotes, addedAtByMediaId);
        if (standings.length > 0) {
          newStatus = 'COMPLETED';
          winnerId = standings[0].mediaId;
        } else {
          newStatus = 'DEADLINE_RESOLVED';
          winnerId = null;
        }
      }
    }

    await db
      .update(sessions)
      .set({ status: newStatus as 'SWIPING_ACTIVE' | 'HEAD_TO_HEAD_ACTIVE' | 'COMPLETED' | 'DEADLINE_RESOLVED', finalWinningMediaId: winnerId })
      .where(eq(sessions.id, session.id));

    if (winnerId) {
      const winner = await buildWinnerMedia(winnerId);
      if (winner) {
        await cacheWinner(session.id, winner);
      }
    }

    return { status: newStatus, finalWinningMediaId: winnerId };
  } finally {
    await releaseSessionLock(session.id, lockToken);
  }
}

async function buildWinnerMedia(
  mediaId: string
): Promise<WinnerMedia | null> {
  const media = await db.query.sessionMedia.findFirst({
    where: eq(sessionMedia.id, mediaId),
  });

  if (!media) return null;

  let voteAverage: number | null = null;
  try {
    const details = await getMediaDetails(media.mediaType, media.tmdbId);
    voteAverage = details.vote_average ?? null;
  } catch {
    voteAverage = null;
  }

  return {
    id: media.id,
    tmdbId: media.tmdbId,
    mediaType: media.mediaType,
    title: media.title,
    posterPath: media.posterPath,
    releaseYear: media.releaseYear,
    overview: media.overview,
    voteAverage,
    watchUrl: watchUrlForTitle(media.title),
  };
}

async function getWinnerFromState(
  sessionId: string,
  fallbackMediaId: string | null
): Promise<WinnerMedia | null> {
  const cached = await getCachedWinner(sessionId);

  if (cached) return cached as WinnerMedia;
  if (!fallbackMediaId) return null;
  return buildWinnerMedia(fallbackMediaId);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionId = (await params).id;

    // Verify participant authentication
    const auth = await getAuthenticatedParticipant(request, sessionId);
    if (auth instanceof NextResponse) {
      return auth;
    }
    const { userId } = auth;
    const participantIds = await getSessionParticipants(sessionId);

    // Get session from database
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
    });

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const resolved = await resolveDeadlineIfExpired(session);
    session.status = resolved.status as (typeof session.status);
    session.finalWinningMediaId = resolved.finalWinningMediaId;

    // Get media pool for session
    const mediaPool = await db.query.sessionMedia.findMany({
      where: eq(sessionMedia.sessionId, sessionId),
      orderBy: (sessionMedia, { asc }) => [asc(sessionMedia.addedAt)],
    });

    // Get participant display names and swipe progress
    const [userRecords, swipeRecords] = await Promise.all([
      participantIds.length > 0
        ? db.query.users.findMany({
            where: inArray(users.id, participantIds),
            columns: { id: true, displayName: true },
          })
        : Promise.resolve([]),
      db.query.swipes.findMany({
        where: eq(swipes.sessionId, sessionId),
        columns: { userId: true, mediaId: true },
      }),
    ]);

    const totalMediaCount = mediaPool.length;
    const swipedByUser = new Map<string, Set<string>>();
    for (const swipe of swipeRecords) {
      const set = swipedByUser.get(swipe.userId) ?? new Set<string>();
      set.add(swipe.mediaId);
      swipedByUser.set(swipe.userId, set);
    }

    const participants = participantIds
      .map((id) => {
        const user = userRecords.find((u) => u.id === id);
        const swipedCount = swipedByUser.get(id)?.size ?? 0;
        return {
          userId: id,
          displayName: user?.displayName ?? 'Guest',
          isHost: id === session.hostId,
          swipedCount,
          totalMediaCount,
          isFinished: swipedCount >= totalMediaCount,
        };
      })
      .sort((a, b) => {
        if (a.isHost !== b.isHost) return a.isHost ? -1 : 1;
        return a.displayName.localeCompare(b.displayName);
      });

    // Get head-to-head votes and standings
    const h2hVotes = await db.query.headToHeadVotes.findMany({
      where: eq(headToHeadVotes.sessionId, sessionId),
    });

    const winCounts: Record<string, number> = {};
    for (const vote of h2hVotes) {
      winCounts[vote.preferredMediaId] = (winCounts[vote.preferredMediaId] ?? 0) + 1;
    }

    const headToHeadStandings = Object.entries(winCounts)
      .map(([mediaId, wins]) => ({ mediaId, wins }))
      .sort((a, b) => b.wins - a.wins || a.mediaId.localeCompare(b.mediaId));

    const matches = await getSessionMatches(sessionId);
    const participantCount = await getParticipantCount(sessionId);

    const winningMedia =
      session.status === 'COMPLETED' || session.status === 'DEADLINE_RESOLVED'
        ? await getWinnerFromState(sessionId, session.finalWinningMediaId)
        : null;

    return NextResponse.json({
      session: {
        id: session.id,
        title: session.title,
        joinCode: session.joinCode,
        hostId: session.hostId,
        status: session.status,
        deadlineAt: session.deadlineAt.toISOString(),
        finalWinningMediaId: session.finalWinningMediaId,
      },
      participants,
      mediaPool: mediaPool.map(media => ({
        id: media.id,
        tmdbId: media.tmdbId,
        mediaType: media.mediaType,
        title: media.title,
        posterPath: media.posterPath,
        releaseYear: media.releaseYear,
        overview: media.overview,
        isMatched: media.isMatched === 1,
      })),
      matches,
      participantCount,
      userId,
      headToHeadVotes: h2hVotes.map((vote) => ({
        userId: vote.userId,
        preferredMediaId: vote.preferredMediaId,
        opponentMediaId: vote.opponentMediaId,
      })),
      headToHeadStandings,
      winningMedia,
    });
  } catch (error) {
    console.error('Error fetching session:', error);
    return NextResponse.json({ error: 'Failed to fetch session' }, { status: 500 });
  }
}

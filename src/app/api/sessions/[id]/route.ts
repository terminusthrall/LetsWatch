import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { sessions, sessionMedia, headToHeadVotes } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getMediaDetails } from '@/modules/tmdb';
import {
  getSessionState,
  getSessionMatches,
  getParticipantCount,
  getSessionParticipants,
} from '@/modules/redis';

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

function getWinnerFromState(
  state: unknown,
  fallbackMediaId: string | null
): Promise<WinnerMedia | null> {
  const typedState =
    typeof state === 'string'
      ? (JSON.parse(state) as unknown)
      : state;

  const winner =
    typedState &&
    typeof typedState === 'object' &&
    'winner' in typedState
      ? (typedState as { winner?: WinnerMedia | null }).winner
      : null;

  if (winner) return Promise.resolve(winner);
  if (!fallbackMediaId) return Promise.resolve(null);
  return buildWinnerMedia(fallbackMediaId);
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sessionId = params.id;

    // Verify participant authentication
    const cookie = request.cookies.get('user_session')?.value;
    if (!cookie) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let userId: string;
    let cookieSessionId: string;
    try {
      const parsed = JSON.parse(cookie) as { userId?: unknown; sessionId?: unknown };
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Invalid cookie');
      }
      if (typeof parsed.userId !== 'string' || typeof parsed.sessionId !== 'string') {
        throw new Error('Invalid cookie');
      }
      userId = parsed.userId;
      cookieSessionId = parsed.sessionId;
    } catch {
      return NextResponse.json({ error: 'Invalid session cookie' }, { status: 401 });
    }

    if (cookieSessionId !== sessionId) {
      return NextResponse.json({ error: 'Session mismatch' }, { status: 401 });
    }

    const participants = await getSessionParticipants(sessionId);
    if (!participants.includes(userId)) {
      return NextResponse.json({ error: 'Not a participant' }, { status: 401 });
    }

    // Get session from database
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
    });

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Get media pool for session
    const mediaPool = await db.query.sessionMedia.findMany({
      where: eq(sessionMedia.sessionId, sessionId),
      orderBy: (sessionMedia, { asc }) => [asc(sessionMedia.addedAt)],
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

    // Get Redis state
    const redisState = await getSessionState(sessionId);
    const matches = await getSessionMatches(sessionId);
    const participantCount = await getParticipantCount(sessionId);

    const winningMedia =
      session.status === 'COMPLETED'
        ? await getWinnerFromState(redisState, session.finalWinningMediaId)
        : null;

    return NextResponse.json({
      session: {
        id: session.id,
        title: session.title,
        status: session.status,
        deadlineAt: session.deadlineAt.toISOString(),
        finalWinningMediaId: session.finalWinningMediaId,
      },
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
      redisState,
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

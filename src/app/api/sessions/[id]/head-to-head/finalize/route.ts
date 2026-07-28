import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { sessions, sessionMedia, headToHeadVotes } from '@/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { getMediaDetails } from '@/modules/tmdb';
import { computeHeadToHeadStandings } from '@/modules/head-to-head/standings';
import { getAuthenticatedParticipant } from '@/modules/auth';
import { getSessionMatches, cacheWinner } from '@/modules/redis';
import { type HeadToHeadResponse, type WinnerMedia } from '@/types/api';

function watchUrlForTitle(title: string): string {
  return `https://www.justwatch.com/us/search?q=${encodeURIComponent(title)}`;
}

async function buildWinnerMedia(mediaId: string): Promise<WinnerMedia | null> {
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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionId = (await params).id;

    const auth = await getAuthenticatedParticipant(request, sessionId);
    if (auth instanceof NextResponse) {
      return auth;
    }
    const { userId } = auth;

    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
    });

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.hostId !== userId) {
      return NextResponse.json(
        { error: 'Only the host can finalize results' },
        { status: 403 }
      );
    }

    if (
      session.status !== 'HEAD_TO_HEAD_ACTIVE' &&
      session.status !== 'SWIPING_ACTIVE'
    ) {
      return NextResponse.json(
        { error: 'Session is not in head-to-head' },
        { status: 400 }
      );
    }

    let matchIds = await getSessionMatches(sessionId);

    if (matchIds.length === 0) {
      const matched = await db.query.sessionMedia.findMany({
        where: and(
          eq(sessionMedia.sessionId, sessionId),
          eq(sessionMedia.isMatched, true)
        ),
        orderBy: (sessionMedia, { asc }) => [asc(sessionMedia.addedAt)],
      });
      matchIds = matched.map((m) => m.id);
    }

    if (matchIds.length === 0) {
      return NextResponse.json(
        { error: 'No matched media to finalize' },
        { status: 400 }
      );
    }

    let winningMediaId: string | null = null;

    if (matchIds.length === 1) {
      winningMediaId = matchIds[0];
    } else {
      const allVotes = await db.query.headToHeadVotes.findMany({
        where: eq(headToHeadVotes.sessionId, sessionId),
      });

      const mediaForStandings = await db.query.sessionMedia.findMany({
        where: and(
          eq(sessionMedia.sessionId, sessionId),
          inArray(sessionMedia.id, matchIds)
        ),
        columns: { id: true, addedAt: true },
      });

      const addedAtByMediaId = new Map(
        mediaForStandings.map((m) => [m.id, m.addedAt])
      );

      const standings = computeHeadToHeadStandings(
        matchIds,
        allVotes,
        addedAtByMediaId
      );

      winningMediaId = standings.length > 0 ? standings[0].mediaId : null;
    }

    await db
      .update(sessions)
      .set({
        status: 'COMPLETED',
        finalWinningMediaId: winningMediaId,
      })
      .where(eq(sessions.id, sessionId));

    const winner = winningMediaId
      ? await buildWinnerMedia(winningMediaId)
      : null;

    if (winner) {
      await cacheWinner(sessionId, winner);
    }

    return NextResponse.json<HeadToHeadResponse>({
      success: true,
      completed: true,
      winner,
      standings: [],
    });
  } catch (error) {
    console.error('Error finalizing head-to-head results:', error);
    return NextResponse.json(
      { error: 'Failed to finalize results' },
      { status: 500 }
    );
  }
}

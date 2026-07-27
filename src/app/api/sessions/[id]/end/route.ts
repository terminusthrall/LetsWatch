import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { sessions, sessionMedia, swipes } from '@/db/schema';
import { eq, and, inArray } from 'drizzle-orm';
import { getMediaDetails } from '@/modules/tmdb';
import {
  getParticipantCount,
  addSessionMatch,
  getSessionMatches,
  setSessionState,
  acquireSessionLock,
  releaseSessionLock,
} from '@/modules/redis';
import { getAuthenticatedParticipant } from '@/modules/auth';
import { resolveEndSession } from '@/modules/sessions/resolve';

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
        { error: 'Forbidden: only the host can end swiping' },
        { status: 403 }
      );
    }

    if (session.status !== 'SWIPING_ACTIVE') {
      return NextResponse.json(
        { error: 'Session is not in swiping phase' },
        { status: 400 }
      );
    }

    const lockAcquired = await acquireSessionLock(sessionId, 10);
    if (!lockAcquired) {
      return NextResponse.json(
        { error: 'Session is being updated, please try again' },
        { status: 503 }
      );
    }

    try {
      const currentSession = await db.query.sessions.findFirst({
        where: eq(sessions.id, sessionId),
      });
      if (!currentSession || currentSession.status !== 'SWIPING_ACTIVE') {
        return NextResponse.json(
          { error: 'Session is no longer active' },
          { status: 400 }
        );
      }

      const [mediaItems, swipeRecords, participantCount] = await Promise.all([
        db.query.sessionMedia.findMany({
          where: eq(sessionMedia.sessionId, sessionId),
          orderBy: (sessionMedia, { asc }) => [asc(sessionMedia.addedAt)],
        }),
        db.query.swipes.findMany({
          where: eq(swipes.sessionId, sessionId),
        }),
        getParticipantCount(sessionId),
      ]);

      const mediaIds = new Set(mediaItems.map((m) => m.id));
      const likeCounts = new Map<string, number>();
      for (const media of mediaItems) {
        likeCounts.set(media.id, 0);
      }
      for (const swipe of swipeRecords) {
        if (swipe.vote === 'LIKE' && mediaIds.has(swipe.mediaId)) {
          likeCounts.set(
            swipe.mediaId,
            (likeCounts.get(swipe.mediaId) ?? 0) + 1
          );
        }
      }

      const { newStatus, winningMediaId, candidateIds } = resolveEndSession(
        likeCounts,
        participantCount
      );

      if (candidateIds.length > 0) {
        await db
          .update(sessionMedia)
          .set({ isMatched: 1 })
          .where(
            and(
              eq(sessionMedia.sessionId, sessionId),
              inArray(sessionMedia.id, candidateIds)
            )
          );

        await Promise.all(
          candidateIds.map((mediaId) => addSessionMatch(sessionId, mediaId))
        );
      }

      await db
        .update(sessions)
        .set({ status: newStatus, finalWinningMediaId: winningMediaId })
        .where(eq(sessions.id, sessionId));

      const winningMedia = winningMediaId
        ? await buildWinnerMedia(winningMediaId)
        : null;
      const matches = await getSessionMatches(sessionId);

      await setSessionState(sessionId, {
        status: newStatus,
        participantCount,
        mediaCount: mediaItems.length,
        matches,
        deadlineAt: session.deadlineAt.toISOString(),
        winner: winningMedia,
      });

      return NextResponse.json({
        status: newStatus,
        winningMedia,
      });
    } finally {
      await releaseSessionLock(sessionId);
    }
  } catch (error) {
    console.error('Error ending session:', error);
    return NextResponse.json(
      { error: 'Failed to end session' },
      { status: 500 }
    );
  }
}

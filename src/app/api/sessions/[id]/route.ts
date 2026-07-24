import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { sessions, sessionMedia } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getSessionState, getSessionMatches, getParticipantCount } from '@/modules/redis';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sessionId = params.id;

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

    // Get Redis state
    const redisState = await getSessionState(sessionId);
    const matches = await getSessionMatches(sessionId);
    const participantCount = await getParticipantCount(sessionId);

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
    });
  } catch (error) {
    console.error('Error fetching session:', error);
    return NextResponse.json({ error: 'Failed to fetch session' }, { status: 500 });
  }
}

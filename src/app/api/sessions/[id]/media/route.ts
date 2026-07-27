import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { sessionMedia } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getAuthenticatedParticipant } from '@/modules/auth';
import { type SessionMediaResponse } from '@/types/api';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionId = (await params).id;

    const auth = await getAuthenticatedParticipant(request, sessionId);
    if (auth instanceof NextResponse) {
      return auth;
    }

    const media = await db.query.sessionMedia.findMany({
      where: eq(sessionMedia.sessionId, sessionId),
      orderBy: (sessionMedia, { asc }) => [asc(sessionMedia.addedAt)],
    });

    const response: SessionMediaResponse = {
      mediaPool: media.map((item) => ({
        id: item.id,
        tmdbId: item.tmdbId,
        mediaType: item.mediaType,
        title: item.title,
        posterPath: item.posterPath,
        releaseYear: item.releaseYear,
        overview: item.overview,
        isMatched: item.isMatched,
      })),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching media pool:', error);
    return NextResponse.json(
      { error: 'Failed to fetch media pool' },
      { status: 500 }
    );
  }
}

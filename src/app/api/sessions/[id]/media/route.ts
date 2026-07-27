import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { sessions, sessionMedia } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getAuthenticatedParticipant } from '@/modules/auth';
import {
  addSessionMediaBodySchema,
  type AddSessionMediaResponse,
  type SessionMediaResponse,
} from '@/types/api';

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

    const body = await request.json();
    const parsed = addSessionMediaBodySchema.safeParse(body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((issue) => issue.message).join(', ');
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const { tmdbId, mediaType, title, posterPath, releaseYear, overview } = parsed.data;

    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
      columns: { status: true },
    });

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.status !== 'LOBBY') {
      return NextResponse.json(
        { error: 'Media can only be added while the session is in the lobby' },
        { status: 400 }
      );
    }

    const [inserted] = await db
      .insert(sessionMedia)
      .values({
        id: crypto.randomUUID(),
        sessionId,
        tmdbId,
        mediaType,
        title,
        posterPath: posterPath ?? null,
        releaseYear: releaseYear ?? null,
        overview: overview ?? null,
        isMatched: false,
      })
      .onConflictDoNothing({
        target: [sessionMedia.sessionId, sessionMedia.tmdbId],
      })
      .returning({ id: sessionMedia.id });

    return NextResponse.json<AddSessionMediaResponse>({
      success: true,
      id: inserted?.id,
    });
  } catch (error) {
    console.error('Error adding session media:', error);
    return NextResponse.json(
      { error: 'Failed to add media' },
      { status: 500 }
    );
  }
}

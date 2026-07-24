import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { users, sessions, sessionMedia } from '@/db/schema';
import { discoverMovies, discoverTV, mapMovieToSessionMedia, mapTVToSessionMedia, TMDBMovie, TMDBTV } from '@/modules/tmdb';
import { addSessionParticipant, setSessionState } from '@/modules/redis';
import { z } from 'zod';

const createSessionBodySchema = z.object({
  displayName: z.string().min(1).max(50),
  title: z.string().max(100).optional(),
  deadlineHours: z.coerce.number().int().min(1).max(168).optional().default(24),
  mediaType: z.string().optional(),
  genreIds: z.array(z.number().int()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createSessionBodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join(', ') },
        { status: 400 }
      );
    }

    const { displayName, title, deadlineHours, mediaType, genreIds } = parsed.data;

    // Create ephemeral user
    const userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      displayName,
      isGuest: 1,
      isProSubscriber: 0,
    });

    // Create session
    const sessionId = crypto.randomUUID();
    const deadlineAt = new Date(Date.now() + deadlineHours * 60 * 60 * 1000);
    
    await db.insert(sessions).values({
      id: sessionId,
      hostId: userId,
      title: title || 'Movie Night',
      status: 'SWIPING_ACTIVE',
      deadlineAt,
    });

    // Build TMDB discover filters
    const withGenres =
      Array.isArray(genreIds) && genreIds.length > 0
        ? genreIds.join(',')
        : undefined;

    let records: Array<{
      id: string;
      sessionId: string;
      tmdbId: string;
      mediaType: string;
      title: string;
      posterPath: string | null;
      releaseYear: string;
      overview: string;
    }> = [];

    if (mediaType === 'tv') {
      const tv = await discoverTV({
        sort_by: 'popularity.desc',
        page: 1,
        with_genres: withGenres,
      });
      records = tv.results.slice(0, 15).map((item: TMDBTV) => ({
        id: crypto.randomUUID(),
        sessionId,
        ...mapTVToSessionMedia(item),
      }));
    } else if (mediaType === 'movie' || !mediaType) {
      const movies = await discoverMovies({
        sort_by: 'popularity.desc',
        page: 1,
        with_genres: withGenres,
      });
      records = movies.results.slice(0, 15).map((movie: TMDBMovie) => ({
        id: crypto.randomUUID(),
        sessionId,
        ...mapMovieToSessionMedia(movie),
      }));
    } else {
      const [trendingMovies, trendingTV] = await Promise.all([
        discoverMovies({ sort_by: 'popularity.desc', page: 1, with_genres: withGenres }),
        discoverTV({ sort_by: 'popularity.desc', page: 1, with_genres: withGenres }),
      ]);
      records = [
        ...trendingMovies.results.slice(0, 10).map((movie: TMDBMovie) => ({
          id: crypto.randomUUID(),
          sessionId,
          ...mapMovieToSessionMedia(movie),
        })),
        ...trendingTV.results.slice(0, 5).map((tv: TMDBTV) => ({
          id: crypto.randomUUID(),
          sessionId,
          ...mapTVToSessionMedia(tv),
        })),
      ];
    }

    if (records.length > 0) {
      await db.insert(sessionMedia).values(records);
    }

    // Set up Redis state
    await addSessionParticipant(sessionId, userId);
    await setSessionState(sessionId, {
      status: 'SWIPING_ACTIVE',
      participantCount: 1,
      mediaCount: records.length,
    });

    // Set cookie with user and session info
    const response = NextResponse.json({
      sessionId,
      userId,
      title: title || 'Movie Night',
      status: 'SWIPING_ACTIVE',
      deadlineAt: deadlineAt.toISOString(),
    });

    response.cookies.set('user_session', JSON.stringify({ userId, sessionId }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24, // 24 hours
    });

    return response;
  } catch (error) {
    console.error('Error creating session:', error);
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }
}

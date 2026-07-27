import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { users, sessions, sessionMedia } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { discoverMovies, discoverTV, mapMovieToSessionMedia, mapTVToSessionMedia, TMDBMovie, TMDBTV } from '@/modules/tmdb';
import { addSessionParticipant, setSessionState } from '@/modules/redis';
import { mintSessionToken } from '@/modules/auth';
import { z } from 'zod';

const createSessionBodySchema = z.object({
  displayName: z.string().min(1).max(50),
  title: z.string().max(100).optional(),
  deadlineAt: z.string().datetime().optional(),
  initialPoolType: z
    .enum(['trending_movies', 'top_tv', 'sci_fi_action', 'custom'])
    .optional()
    .default('trending_movies'),
  mediaType: z.string().optional(),
  genreIds: z.array(z.number().int()).optional(),
  customMedia: z
    .array(
      z.object({
        tmdbId: z.string().min(1),
        mediaType: z.enum(['movie', 'tv']),
        title: z.string().min(1),
        posterPath: z.string().nullable().optional(),
        releaseYear: z.string().optional(),
        overview: z.string().optional(),
      })
    )
    .optional(),
});

function generateJoinCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const values = new Uint8Array(6);
  crypto.getRandomValues(values);
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[values[i] % chars.length];
  }
  return code;
}

async function generateUniqueJoinCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateJoinCode();
    const existing = await db.query.sessions.findFirst({
      where: eq(sessions.joinCode, code),
    });
    if (!existing) return code;
  }
  throw new Error('Unable to generate a unique join code');
}

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

    const {
      displayName,
      title,
      deadlineAt: deadlineAtInput,
      initialPoolType,
      mediaType,
      genreIds,
      customMedia,
    } = parsed.data;

    // Resolve deadline
    let deadlineAt: Date;
    if (deadlineAtInput) {
      deadlineAt = new Date(deadlineAtInput);
      if (
        isNaN(deadlineAt.getTime()) ||
        deadlineAt.getTime() <= Date.now()
      ) {
        return NextResponse.json(
          { error: 'Deadline must be a future date' },
          { status: 400 }
        );
      }
    } else {
      deadlineAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    }

    // Create ephemeral user
    const userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      displayName,
      isGuest: 1,
      isProSubscriber: 0,
    });

    // Create session with unique join code
    const sessionId = crypto.randomUUID();
    const joinCode = await generateUniqueJoinCode();

    await db.insert(sessions).values({
      id: sessionId,
      hostId: userId,
      title: title || 'Movie Night',
      joinCode,
      status: 'SWIPING_ACTIVE',
      deadlineAt,
    });

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

    if (initialPoolType === 'custom' && customMedia && customMedia.length > 0) {
      records = customMedia.map((item) => ({
        id: crypto.randomUUID(),
        sessionId,
        tmdbId: item.tmdbId,
        mediaType: item.mediaType,
        title: item.title,
        posterPath: item.posterPath ?? null,
        releaseYear: item.releaseYear ?? '',
        overview: item.overview ?? 'No overview available.',
      }));
    } else if (initialPoolType === 'top_tv' || mediaType === 'tv') {
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
    } else if (initialPoolType === 'sci_fi_action') {
      const movies = await discoverMovies({
        sort_by: 'popularity.desc',
        page: 1,
        with_genres: '878,28',
      });
      records = movies.results.slice(0, 15).map((movie: TMDBMovie) => ({
        id: crypto.randomUUID(),
        sessionId,
        ...mapMovieToSessionMedia(movie),
      }));
    } else if (initialPoolType === 'trending_movies' || mediaType === 'movie' || !mediaType) {
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
      deadlineAt: deadlineAt.toISOString(),
    });

    // Set cookie with signed session token
    const token = await mintSessionToken({ userId, sessionId });
    const response = NextResponse.json({
      sessionId,
      userId,
      title: title || 'Movie Night',
      joinCode,
      status: 'SWIPING_ACTIVE',
      deadlineAt: deadlineAt.toISOString(),
    });

    response.cookies.set('user_session', token, {
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

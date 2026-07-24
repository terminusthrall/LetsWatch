import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { users, sessions, sessionMedia } from '@/db/schema';
import { discoverMovies, discoverTV, mapMovieToSessionMedia, mapTVToSessionMedia, TMDBMovie, TMDBTV } from '@/modules/tmdb';
import { addSessionParticipant, setSessionState } from '@/modules/redis';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { displayName, title, deadlineHours } = body;

    // Validate input
    if (!displayName) {
      return NextResponse.json({ error: 'Display name is required' }, { status: 400 });
    }

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
    const deadlineAt = new Date(Date.now() + (deadlineHours || 24) * 60 * 60 * 1000);
    
    await db.insert(sessions).values({
      id: sessionId,
      hostId: userId,
      title: title || 'Movie Night',
      status: 'SWIPING_ACTIVE',
      deadlineAt,
    });

    // Fetch trending movies from TMDB to seed the session
    const trendingMovies = await discoverMovies({ sort_by: 'popularity.desc', page: 1 });
    const trendingTV = await discoverTV({ sort_by: 'popularity.desc', page: 1 });

    // Insert movies into session media
    const movieRecords = trendingMovies.results.slice(0, 10).map((movie: TMDBMovie) => ({
      id: crypto.randomUUID(),
      sessionId,
      ...mapMovieToSessionMedia(movie),
    }));
    
    await db.insert(sessionMedia).values(movieRecords);

    // Insert TV shows into session media
    const tvRecords = trendingTV.results.slice(0, 5).map((tv: TMDBTV) => ({
      id: crypto.randomUUID(),
      sessionId,
      ...mapTVToSessionMedia(tv),
    }));
    
    await db.insert(sessionMedia).values(tvRecords);

    // Set up Redis state
    await addSessionParticipant(sessionId, userId);
    await setSessionState(sessionId, {
      status: 'SWIPING_ACTIVE',
      participantCount: 1,
      mediaCount: movieRecords.length + tvRecords.length,
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

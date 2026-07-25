import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { swipes, sessionMedia, sessions } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { 
  incrementMediaLike, 
  getMediaLikeCount, 
  getParticipantCount, 
  addSessionMatch,
  acquireEvaluationLock,
  releaseEvaluationLock,
  getSessionParticipants,
} from '@/modules/redis';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionId = (await params).id;

    // Authenticate participant via cookie
    const cookie = request.cookies.get('user_session')?.value;
    if (!cookie) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let userId: string;
    let cookieSessionId: string;
    try {
      const parsed = JSON.parse(cookie) as { userId?: unknown; sessionId?: unknown };
      if (
        typeof parsed.userId !== 'string' ||
        typeof parsed.sessionId !== 'string'
      ) {
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

    const body = await request.json();
    const { mediaId, vote } = body;

    // Validate input
    if (!mediaId || !vote) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (vote !== 'LIKE' && vote !== 'PASS') {
      return NextResponse.json({ error: 'Invalid vote value' }, { status: 400 });
    }

    // Check if session exists and is active
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
    });

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.status !== 'SWIPING_ACTIVE') {
      return NextResponse.json({ error: 'Session is not in swiping phase' }, { status: 400 });
    }

    // Record swipe in database
    await db.insert(swipes).values({
      id: crypto.randomUUID(),
      sessionId,
      userId,
      mediaId,
      vote,
    });

    let matchFound = false;

    // If LIKE, increment Redis like count and check for unanimous match
    if (vote === 'LIKE') {
      const likeCount = await incrementMediaLike(sessionId, mediaId);
      const participantCount = await getParticipantCount(sessionId);

      // Check if all participants have liked this media
      if (likeCount >= participantCount) {
        // Acquire evaluation lock to prevent race conditions
        const lockAcquired = await acquireEvaluationLock(sessionId);
        
        if (lockAcquired) {
          try {
            // Double-check the like count after acquiring lock
            const currentLikeCount = await getMediaLikeCount(sessionId, mediaId);
            
            if (currentLikeCount >= participantCount) {
              // Update session_media.isMatched in database
              await db.update(sessionMedia)
                .set({ isMatched: 1 })
                .where(and(
                  eq(sessionMedia.id, mediaId),
                  eq(sessionMedia.sessionId, sessionId)
                ));

              // Add to Redis matches set
              await addSessionMatch(sessionId, mediaId);
              matchFound = true;
            }
          } finally {
            await releaseEvaluationLock(sessionId);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      matchFound,
    });
  } catch (error) {
    console.error('Error recording swipe:', error);
    return NextResponse.json({ error: 'Failed to record swipe' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { swipes, sessionMedia, sessions } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { 
  incrementMediaLike, 
  getMediaLikeCount, 
  addSessionMatch,
  acquireEvaluationLock,
  releaseEvaluationLock,
  getSessionMatches,
  acquireSessionLock,
  releaseSessionLock,
} from '@/modules/redis';
import { getAuthenticatedParticipant } from '@/modules/auth';
import {
  getSessionParticipants,
  getParticipantCount,
  getSessionRedisTtlSeconds,
} from '@/modules/sessions/participants';

const submitSwipeSchema = z.object({
  mediaId: z.string().uuid(),
  vote: z.enum(['LIKE', 'PASS']),
});

async function checkAllParticipantsFinished(sessionId: string): Promise<boolean> {
  const [mediaRecords, swipeRecords, participants] = await Promise.all([
    db.query.sessionMedia.findMany({
      where: eq(sessionMedia.sessionId, sessionId),
      columns: { id: true },
    }),
    db.query.swipes.findMany({
      where: eq(swipes.sessionId, sessionId),
      columns: { userId: true, mediaId: true },
    }),
    getSessionParticipants(sessionId),
  ]);

  const mediaCount = mediaRecords.length;
  if (mediaCount === 0 || participants.length === 0) return false;

  const swipedByUser = new Map<string, Set<string>>();
  for (const swipe of swipeRecords) {
    const set = swipedByUser.get(swipe.userId) ?? new Set<string>();
    set.add(swipe.mediaId);
    swipedByUser.set(swipe.userId, set);
  }

  return participants.every(
    (userId) => (swipedByUser.get(userId)?.size ?? 0) >= mediaCount
  );
}

async function checkAndTransitionSession(sessionId: string) {
  const isComplete = await checkAllParticipantsFinished(sessionId);
  if (!isComplete) return;

  const lockAcquired = await acquireSessionLock(sessionId, 10);
  if (!lockAcquired) return;

  try {
    const stillComplete = await checkAllParticipantsFinished(sessionId);
    if (!stillComplete) return;

    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
    });
    if (!session || session.status !== 'SWIPING_ACTIVE') return;

    const matches = await getSessionMatches(sessionId);
    if (matches.length === 1) {
      await db
        .update(sessions)
        .set({ status: 'COMPLETED', finalWinningMediaId: matches[0] })
        .where(eq(sessions.id, sessionId));
    } else {
      await db
        .update(sessions)
        .set({ status: 'HEAD_TO_HEAD_ACTIVE' })
        .where(eq(sessions.id, sessionId));
    }
  } finally {
    await releaseSessionLock(sessionId);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionId = (await params).id;

    // Authenticate participant via cookie
    const auth = await getAuthenticatedParticipant(request, sessionId);
    if (auth instanceof NextResponse) {
      return auth;
    }
    const { userId } = auth;

    const body = await request.json();
    const parsed = submitSwipeSchema.safeParse(body);

    if (!parsed.success) {
      const message = parsed.error.issues.map((issue) => issue.message).join(', ');
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const { mediaId, vote } = parsed.data;

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

    // Verify the media belongs to this session
    const mediaItem = await db.query.sessionMedia.findFirst({
      where: and(
        eq(sessionMedia.id, mediaId),
        eq(sessionMedia.sessionId, sessionId)
      ),
    });

    if (!mediaItem) {
      return NextResponse.json({ error: 'Media not found in session' }, { status: 404 });
    }

    // Record swipe in database, ignoring duplicate submissions
    const insertedSwipe = await db
      .insert(swipes)
      .values({
        id: crypto.randomUUID(),
        sessionId,
        userId,
        mediaId,
        vote,
      })
      .onConflictDoNothing({
        target: [swipes.sessionId, swipes.userId, swipes.mediaId],
      })
      .returning({ id: swipes.id });

    if (insertedSwipe.length === 0) {
      return NextResponse.json({ success: true });
    }

    let matchFound = false;

    // If LIKE, increment Redis like count and check for unanimous match
    if (vote === 'LIKE') {
      const ttl = getSessionRedisTtlSeconds(session.deadlineAt);
      const likeCount = await incrementMediaLike(sessionId, mediaId, ttl);
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
              await addSessionMatch(sessionId, mediaId, ttl);
              matchFound = true;
            }
          } finally {
            await releaseEvaluationLock(sessionId);
          }
        }
      }
    }

    await checkAndTransitionSession(sessionId);

    return NextResponse.json({
      success: true,
      matchFound,
    });
  } catch (error) {
    console.error('Error recording swipe:', error);
    return NextResponse.json({ error: 'Failed to record swipe' }, { status: 500 });
  }
}

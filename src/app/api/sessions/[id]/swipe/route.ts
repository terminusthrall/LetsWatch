import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { swipes, sessionMedia, sessions } from '@/db/schema';
import { eq, and } from 'drizzle-orm';
import { submitSwipeBodySchema, type SwipeResponse } from '@/types/api';
import { 
  addMediaLike, 
  getMediaLikeCount,
  getSnapshotParticipantCount,
  getSnapshotMediaCount,
  isMediaLikedByAllSnapshotParticipants,
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
  getSessionRedisTtlSeconds,
} from '@/modules/sessions/participants';


async function checkAllParticipantsFinished(sessionId: string): Promise<boolean> {
  const [snapshotParticipantCount, snapshotMediaCount, totalSwipes] = await Promise.all([
    getSnapshotParticipantCount(sessionId),
    getSnapshotMediaCount(sessionId),
    db.$count(swipes, eq(swipes.sessionId, sessionId)),
  ]);

  // The snapshot is the single source of truth for the denominator. It is
  // written once, atomically, when the host starts the session (see
  // src/app/api/sessions/[id]/start/route.ts) and must never be recomputed
  // from live participant/media counts here: those can change mid-round
  // (e.g. a guest joins while swiping is active) and would let the round
  // complete before every original participant has actually finished, or
  // never complete at all. If the snapshot hasn't been written yet, the
  // round cannot possibly be finished.
  if (snapshotParticipantCount == null || snapshotMediaCount == null) return false;
  if (snapshotParticipantCount === 0 || snapshotMediaCount === 0) return false;

  return totalSwipes === snapshotParticipantCount * snapshotMediaCount;
}

async function checkAndTransitionSession(sessionId: string) {
  const isComplete = await checkAllParticipantsFinished(sessionId);
  if (!isComplete) return;

  const lockToken = await acquireSessionLock(sessionId, 10);
  if (!lockToken) return;

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
    await releaseSessionLock(sessionId, lockToken);
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
    const parsed = submitSwipeBodySchema.safeParse(body);

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
      return NextResponse.json<SwipeResponse>({ success: true });
    }

    let matchFound = false;

    // If LIKE, add userId to the media like set and check for unanimous match
    if (vote === 'LIKE') {
      const ttl = getSessionRedisTtlSeconds(session.deadlineAt);
      const likeCount = await addMediaLike(sessionId, mediaId, userId, ttl);

      // Use the immutable snapshot created when the session started so the
      // denominator cannot shift mid-swipe. A unanimous match requires at least
      // two participants (prevents the host from matching with themselves).
      const snapshotCount = await getSnapshotParticipantCount(sessionId);
      const participantCount = snapshotCount ?? (await getSessionParticipants(sessionId)).length;

      if (participantCount >= 1 && likeCount >= participantCount) {
        // Acquire evaluation lock to prevent race conditions
        const evaluationToken = await acquireEvaluationLock(sessionId);

        if (evaluationToken) {
          try {
            // Double-check the like count and verify every snapshot participant is a member
            const [currentLikeCount, allParticipantsLiked] = await Promise.all([
              getMediaLikeCount(sessionId, mediaId),
              isMediaLikedByAllSnapshotParticipants(sessionId, mediaId),
            ]);

            if (currentLikeCount >= participantCount && allParticipantsLiked) {
              // Update session_media.isMatched in database
              await db.update(sessionMedia)
                .set({ isMatched: true })
                .where(and(
                  eq(sessionMedia.id, mediaId),
                  eq(sessionMedia.sessionId, sessionId)
                ));

              // Add to Redis matches set
              await addSessionMatch(sessionId, mediaId, ttl);
              matchFound = true;
            }
          } finally {
            await releaseEvaluationLock(sessionId, evaluationToken);
          }
        }
      }
    }

    // Only run the expensive completion/transition check if the current user
    // has now finished swiping through every media item.
    const [mediaCount, userSwipeCount] = await Promise.all([
      db.$count(sessionMedia, eq(sessionMedia.sessionId, sessionId)),
      db.$count(swipes, and(eq(swipes.sessionId, sessionId), eq(swipes.userId, userId))),
    ]);

    if (userSwipeCount >= mediaCount) {
      await checkAndTransitionSession(sessionId);
    }

    return NextResponse.json<SwipeResponse>({
      success: true,
      matchFound,
    });
  } catch (error) {
    console.error('Error recording swipe:', error);
    return NextResponse.json({ error: 'Failed to record swipe' }, { status: 500 });
  }
}

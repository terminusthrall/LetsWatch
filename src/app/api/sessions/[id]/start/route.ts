import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { sessions, sessionMedia, sessionParticipants } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getAuthenticatedParticipant } from '@/modules/auth';
import { setSessionSnapshot, acquireSessionLock, releaseSessionLock } from '@/modules/redis';
import { getSessionRedisTtlSeconds } from '@/modules/sessions/participants';
import { type StartSessionResponse } from '@/types/api';

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
        { error: 'Only the host can start the session' },
        { status: 403 }
      );
    }

    if (session.status !== 'LOBBY') {
      return NextResponse.json(
        { error: 'Session has already started' },
        { status: 409 }
      );
    }

    const lockToken = await acquireSessionLock(sessionId, 30);
    if (!lockToken) {
      return NextResponse.json(
        { error: 'Could not acquire session lock. Try again.' },
        { status: 409 }
      );
    }

    try {
      const current = await db.query.sessions.findFirst({
        where: eq(sessions.id, sessionId),
        columns: { hostId: true, status: true },
      });

      if (!current || current.status !== 'LOBBY' || current.hostId !== userId) {
        return NextResponse.json(
          { error: 'Session state changed' },
          { status: 409 }
        );
      }

      const participantRows = await db
        .select({ userId: sessionParticipants.userId })
        .from(sessionParticipants)
        .where(eq(sessionParticipants.sessionId, sessionId));

      const participantIds = participantRows.map((row) => row.userId);
      const mediaCount = await db.$count(sessionMedia, eq(sessionMedia.sessionId, sessionId));

      const ttl = getSessionRedisTtlSeconds(session.deadlineAt);
      await setSessionSnapshot(sessionId, participantIds, mediaCount, ttl);

      await db
        .update(sessions)
        .set({ status: 'SWIPING_ACTIVE' })
        .where(eq(sessions.id, sessionId));

      return NextResponse.json<StartSessionResponse>({
        sessionId,
        status: 'SWIPING_ACTIVE',
        participantCount: participantIds.length,
        mediaCount,
      });
    } finally {
      await releaseSessionLock(sessionId, lockToken);
    }
  } catch (error) {
    console.error('Error starting session:', error);
    return NextResponse.json(
      { error: 'Failed to start session' },
      { status: 500 }
    );
  }
}

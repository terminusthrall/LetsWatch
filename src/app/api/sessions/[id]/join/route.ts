import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { users, sessions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { setSessionState } from '@/modules/redis';
import {
  addSessionParticipant,
  getParticipantCount,
  getSessionRedisTtlSeconds,
} from '@/modules/sessions/participants';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionId = (await params).id;
    const body = await request.json();
    const { displayName } = body;

    // Validate input
    if (!displayName) {
      return NextResponse.json({ error: 'Display name is required' }, { status: 400 });
    }

    // Check if session exists
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
    });

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.status !== 'SWIPING_ACTIVE') {
      return NextResponse.json({ error: 'Session is not accepting new participants' }, { status: 400 });
    }

    // Create ephemeral user
    const userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      displayName,
      isGuest: 1,
      isProSubscriber: 0,
    });

    // Add to Redis participants set
    await addSessionParticipant(sessionId, userId, session.deadlineAt);

    // Update participant count in session state
    const participantCount = await getParticipantCount(sessionId);
    const ttl = getSessionRedisTtlSeconds(session.deadlineAt);
    await setSessionState(sessionId, {
      status: session.status,
      participantCount,
    }, ttl);

    // Set cookie with user and session info
    const response = NextResponse.json({
      sessionId,
      userId,
      title: session.title,
      status: session.status,
      deadlineAt: session.deadlineAt.toISOString(),
      participantCount,
    });

    response.cookies.set('user_session', JSON.stringify({ userId, sessionId }), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24, // 24 hours
    });

    return response;
  } catch (error) {
    console.error('Error joining session:', error);
    return NextResponse.json({ error: 'Failed to join session' }, { status: 500 });
  }
}

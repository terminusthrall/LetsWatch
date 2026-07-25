import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { users, sessions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  addSessionParticipant,
  getParticipantCount,
  setSessionState,
} from '@/modules/redis';
import { z } from 'zod';

const joinBodySchema = z.object({
  code: z.string().min(6).max(6),
  displayName: z.string().min(1).max(50),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = joinBodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues.map((i) => i.message).join(', ') },
        { status: 400 }
      );
    }

    const { code, displayName } = parsed.data;

    const session = await db.query.sessions.findFirst({
      where: eq(sessions.joinCode, code.toUpperCase()),
    });

    if (!session) {
      return NextResponse.json({ error: 'Invalid room code' }, { status: 404 });
    }

    if (session.status !== 'SWIPING_ACTIVE') {
      return NextResponse.json(
        { error: 'Session is not accepting new participants' },
        { status: 400 }
      );
    }

    const sessionId = session.id;

    // Create ephemeral guest user
    const userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      displayName,
      isGuest: 1,
      isProSubscriber: 0,
    });

    await addSessionParticipant(sessionId, userId);

    const participantCount = await getParticipantCount(sessionId);
    await setSessionState(sessionId, {
      status: session.status,
      participantCount,
      deadlineAt: session.deadlineAt.toISOString(),
    });

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
    console.error('Error joining session by code:', error);
    return NextResponse.json({ error: 'Failed to join session' }, { status: 500 });
  }
}

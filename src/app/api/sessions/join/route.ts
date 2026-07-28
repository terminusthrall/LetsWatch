import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { users, sessions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  addSessionParticipant,
  getParticipantCount,
} from '@/modules/sessions/participants';
import { mintSessionToken } from '@/modules/auth';
import { checkRateLimit, getClientIp } from '@/modules/rate-limit';
import {
  joinByCodeBodySchema,
  type JoinSessionResponse,
  type SessionStatus,
} from '@/types/api';


const MAX_PARTICIPANTS = 20;

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    const { allowed } = await checkRateLimit(`join-session:${ip}`, {
      requests: 10,
      window: '1 m',
    });

    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests' },
        { status: 429 }
      );
    }

    const body = await request.json();
    const parsed = joinByCodeBodySchema.safeParse(body);

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

    if (session.status !== 'LOBBY' && session.status !== 'SWIPING_ACTIVE') {
      return NextResponse.json(
        { error: 'Session is not accepting new participants' },
        { status: 400 }
      );
    }

    const sessionId = session.id;
    const participantCount = await getParticipantCount(sessionId);

    if (participantCount >= MAX_PARTICIPANTS) {
      return NextResponse.json(
        { error: 'Session is full' },
        { status: 400 }
      );
    }

    // Create ephemeral guest user
    const userId = crypto.randomUUID();
    await db.insert(users).values({
      id: userId,
      displayName,
      isGuest: true,
      isProSubscriber: false,
    });

    await addSessionParticipant(sessionId, userId, session.deadlineAt);

    const updatedParticipantCount = await getParticipantCount(sessionId);

    const token = await mintSessionToken({ userId, sessionId });
    const response = NextResponse.json<JoinSessionResponse>({
      sessionId,
      userId,
      title: session.title,
      status: session.status as SessionStatus,
      deadlineAt: session.deadlineAt.toISOString(),
      participantCount: updatedParticipantCount,
    });

    response.cookies.set('user_session', token, {
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

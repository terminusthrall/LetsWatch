import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { users, sessions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  addSessionParticipant,
  getParticipantCount,
  getSessionRedisTtlSeconds,
} from '@/modules/sessions/participants';
import {
  joinByIdBodySchema,
  type JoinSessionResponse,
  type SessionStatus,
} from '@/types/api';
import { mintSessionToken } from '@/modules/auth';
import { checkRateLimit, getClientIp } from '@/modules/rate-limit';


const MAX_PARTICIPANTS = 20;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionId = (await params).id;

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
    const parsed = joinByIdBodySchema.safeParse(body);

    if (!parsed.success) {
      const message = parsed.error.issues.map((issue) => issue.message).join(', ');
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const { displayName } = parsed.data;

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

    const initialParticipantCount = await getParticipantCount(sessionId);

    if (initialParticipantCount >= MAX_PARTICIPANTS) {
      return NextResponse.json(
        { error: 'Session is full' },
        { status: 400 }
      );
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

    // Set cookie with signed session token
    const token = await mintSessionToken({ userId, sessionId });
    const response = NextResponse.json<JoinSessionResponse>({
      sessionId,
      userId,
      title: session.title,
      status: session.status as SessionStatus,
      deadlineAt: session.deadlineAt.toISOString(),
      participantCount,
    });

    response.cookies.set('user_session', token, {
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

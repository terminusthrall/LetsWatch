import { NextRequest, NextResponse } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';
import { getSessionParticipants } from '@/modules/redis';

const COOKIE_NAME = 'user_session';

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  return new TextEncoder().encode(secret);
}

export interface SessionTokenPayload {
  userId: string;
  sessionId: string;
}

export async function mintSessionToken({
  userId,
  sessionId,
}: SessionTokenPayload): Promise<string> {
  const secret = getSecret();
  return new SignJWT({ userId, sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(secret);
}

export async function verifySessionToken(
  token: string
): Promise<SessionTokenPayload | null> {
  const secret = getSecret();
  try {
    const { payload } = await jwtVerify(token, secret);
    if (
      payload &&
      typeof payload.userId === 'string' &&
      typeof payload.sessionId === 'string'
    ) {
      return { userId: payload.userId, sessionId: payload.sessionId };
    }
    return null;
  } catch {
    return null;
  }
}

export async function getAuthenticatedParticipant(
  request: NextRequest,
  sessionId: string
): Promise<{ userId: string } | NextResponse> {
  const cookie = request.cookies.get(COOKIE_NAME)?.value;
  if (!cookie) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await verifySessionToken(cookie);
  if (!payload) {
    return NextResponse.json(
      { error: 'Invalid session cookie' },
      { status: 401 }
    );
  }

  if (payload.sessionId !== sessionId) {
    return NextResponse.json({ error: 'Session mismatch' }, { status: 401 });
  }

  const participants = await getSessionParticipants(sessionId);
  if (!participants.includes(payload.userId)) {
    return NextResponse.json({ error: 'Not a participant' }, { status: 401 });
  }

  return { userId: payload.userId };
}

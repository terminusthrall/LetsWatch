import { db } from '@/db';
import { sessionParticipants, sessions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  redis,
  addSessionParticipant as addRedisSessionParticipant,
  getSessionParticipants as getRedisSessionParticipants,
} from '@/modules/redis';

const PARTICIPANTS_PREFIX = 'session_participants:';

function participantsKey(sessionId: string): string {
  return `${PARTICIPANTS_PREFIX}${sessionId}`;
}

export function getSessionRedisTtlSeconds(deadlineAt: Date | string): number {
  const ONE_DAY_SECONDS = 24 * 60 * 60;
  const deadlineMs = new Date(deadlineAt).getTime();
  const remainingSeconds = Math.ceil((deadlineMs - Date.now()) / 1000);
  return Math.max(remainingSeconds + ONE_DAY_SECONDS, ONE_DAY_SECONDS);
}

export async function getSessionParticipants(sessionId: string): Promise<string[]> {
  const key = participantsKey(sessionId);

  // Fast hot-path: if the Redis set exists, return it directly.
  const cached = (await redis.exists(key)) === 1;
  if (cached) {
    return getRedisSessionParticipants(sessionId);
  }

  // Fall back to Postgres and prime the cache.
  const rows = await db.query.sessionParticipants.findMany({
    where: eq(sessionParticipants.sessionId, sessionId),
    columns: { userId: true },
  });
  const userIds = rows.map((row) => row.userId);

  const session = await db.query.sessions.findFirst({
    where: eq(sessions.id, sessionId),
    columns: { deadlineAt: true },
  });
  const ttl = session
    ? getSessionRedisTtlSeconds(session.deadlineAt)
    : 24 * 60 * 60;

  if (userIds.length > 0) {
    const [first, ...rest] = userIds;
    await redis.sadd(key, first, ...rest);
    await redis.expire(key, ttl);
  }

  return userIds;
}

export async function getParticipantCount(sessionId: string): Promise<number> {
  const participants = await getSessionParticipants(sessionId);
  return participants.length;
}

export async function addSessionParticipant(
  sessionId: string,
  userId: string,
  deadlineAt: Date | string
): Promise<void> {
  await db
    .insert(sessionParticipants)
    .values({
      sessionId,
      userId,
      joinedAt: new Date(),
    })
    .onConflictDoNothing({
      target: [sessionParticipants.sessionId, sessionParticipants.userId],
    });

  const ttl = getSessionRedisTtlSeconds(deadlineAt);
  await addRedisSessionParticipant(sessionId, userId, ttl);
}

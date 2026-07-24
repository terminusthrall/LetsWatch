import { Redis } from '@upstash/redis';
import { requireEnv } from '@/lib/env';

const redis = new Redis({
  url: requireEnv('UPSTASH_REDIS_REST_URL'),
  token: requireEnv('UPSTASH_REDIS_REST_TOKEN'),
});

const DEFAULT_TTL_SECONDS = 3600;
const DEFAULT_LOCK_TTL_SECONDS = 30;

// Session State Engine Keys
const SESSION_KEY_PREFIXES = {
  state: 'session:',
  lock: 'session_lock:',
  participants: 'session_participants:',
  matches: 'session_matches:',
} as const;

type SessionKeyKind = keyof typeof SESSION_KEY_PREFIXES;

const sessionKey = (kind: SessionKeyKind, sessionId: string) =>
  `${SESSION_KEY_PREFIXES[kind]}${sessionId}`;

/** Add a member to a session set and refresh its expiry. */
async function addToSessionSet(
  kind: SessionKeyKind,
  sessionId: string,
  member: string,
  ttl: number,
): Promise<void> {
  const key = sessionKey(kind, sessionId);
  await redis.sadd(key, member);
  await redis.expire(key, ttl);
}

/**
 * Acquire a distributed lock for a session
 * @param sessionId - The session ID to lock
 * @param ttl - Time to live in seconds (default: 30)
 * @returns true if lock acquired, false otherwise
 */
export async function acquireSessionLock(
  sessionId: string,
  ttl: number = DEFAULT_LOCK_TTL_SECONDS,
): Promise<boolean> {
  const result = await redis.set(sessionKey('lock', sessionId), `${Date.now()}`, {
    nx: true,
    ex: ttl,
  });

  return result === 'OK';
}

/**
 * Release a distributed lock for a session
 * @param sessionId - The session ID to unlock
 */
export async function releaseSessionLock(sessionId: string): Promise<void> {
  await redis.del(sessionKey('lock', sessionId));
}

/**
 * Get session state from Redis
 * @param sessionId - The session ID
 */
export async function getSessionState(sessionId: string) {
  return await redis.get(sessionKey('state', sessionId));
}

/**
 * Set session state in Redis
 * @param sessionId - The session ID
 * @param state - The session state object
 * @param ttl - Time to live in seconds (default: 3600)
 */
export async function setSessionState(
  sessionId: string,
  state: unknown,
  ttl: number = DEFAULT_TTL_SECONDS,
): Promise<void> {
  await redis.set(sessionKey('state', sessionId), JSON.stringify(state), { ex: ttl });
}

/**
 * Add participant to session
 * @param sessionId - The session ID
 * @param userId - The user ID
 * @param ttl - Time to live in seconds (default: 3600)
 */
export async function addSessionParticipant(
  sessionId: string,
  userId: string,
  ttl: number = DEFAULT_TTL_SECONDS,
): Promise<void> {
  await addToSessionSet('participants', sessionId, userId, ttl);
}

/**
 * Get all participants for a session
 * @param sessionId - The session ID
 */
export async function getSessionParticipants(sessionId: string): Promise<string[]> {
  return await redis.smembers(sessionKey('participants', sessionId));
}

/**
 * Remove participant from session
 * @param sessionId - The session ID
 * @param userId - The user ID
 */
export async function removeSessionParticipant(sessionId: string, userId: string): Promise<void> {
  await redis.srem(sessionKey('participants', sessionId), userId);
}

/**
 * Add matched media to session
 * @param sessionId - The session ID
 * @param mediaId - The media ID
 * @param ttl - Time to live in seconds (default: 3600)
 */
export async function addSessionMatch(
  sessionId: string,
  mediaId: string,
  ttl: number = DEFAULT_TTL_SECONDS,
): Promise<void> {
  await addToSessionSet('matches', sessionId, mediaId, ttl);
}

/**
 * Get all matched media for a session
 * @param sessionId - The session ID
 */
export async function getSessionMatches(sessionId: string): Promise<string[]> {
  return await redis.smembers(sessionKey('matches', sessionId));
}

/**
 * Clear all session data from Redis
 * @param sessionId - The session ID
 */
export async function clearSessionData(sessionId: string): Promise<void> {
  const keys = (Object.keys(SESSION_KEY_PREFIXES) as SessionKeyKind[]).map((kind) =>
    sessionKey(kind, sessionId),
  );

  await redis.del(...keys);
}

export { redis };

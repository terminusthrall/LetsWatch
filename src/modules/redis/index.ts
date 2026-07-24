import { Redis } from '@upstash/redis';

if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
  throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN environment variables are required');
}

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Session State Engine Keys
const SESSION_PREFIX = 'session:';
const SESSION_LOCK_PREFIX = 'session_lock:';
const SESSION_PARTICIPANTS_PREFIX = 'session_participants:';
const SESSION_MATCHES_PREFIX = 'session_matches:';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Ensure an identifier is a UUID before it is interpolated into a Redis key,
 * preventing key-namespace injection from untrusted input.
 */
function assertId(id: string, label: string): string {
  if (!UUID_REGEX.test(id)) {
    throw new Error(`Invalid ${label}`);
  }
  return id;
}

const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

/**
 * Acquire a distributed lock for a session
 * @param sessionId - The session ID to lock
 * @param ttl - Time to live in seconds (default: 30)
 * @returns the lock token if acquired, null otherwise
 */
export async function acquireSessionLock(sessionId: string, ttl: number = 30): Promise<string | null> {
  const lockKey = `${SESSION_LOCK_PREFIX}${assertId(sessionId, 'sessionId')}`;
  const lockValue = crypto.randomUUID();

  const result = await redis.set(lockKey, lockValue, {
    nx: true,
    ex: ttl,
  });

  return result === 'OK' ? lockValue : null;
}

/**
 * Release a distributed lock for a session. The lock is only released when
 * `lockValue` matches the token returned by `acquireSessionLock`, so a holder
 * cannot release a lock that has expired and been re-acquired by someone else.
 * @param sessionId - The session ID to unlock
 * @param lockValue - The token returned by acquireSessionLock
 * @returns true if this caller still held the lock and released it
 */
export async function releaseSessionLock(sessionId: string, lockValue: string): Promise<boolean> {
  const lockKey = `${SESSION_LOCK_PREFIX}${assertId(sessionId, 'sessionId')}`;
  const released = await redis.eval(RELEASE_LOCK_SCRIPT, [lockKey], [lockValue]);
  return released === 1;
}

/**
 * Get session state from Redis
 * @param sessionId - The session ID
 */
export async function getSessionState(sessionId: string) {
  const stateKey = `${SESSION_PREFIX}${assertId(sessionId, 'sessionId')}`;
  return await redis.get(stateKey);
}

/**
 * Set session state in Redis
 * @param sessionId - The session ID
 * @param state - The session state object
 * @param ttl - Time to live in seconds (default: 3600)
 */
export async function setSessionState(sessionId: string, state: unknown, ttl: number = 3600): Promise<void> {
  const stateKey = `${SESSION_PREFIX}${assertId(sessionId, 'sessionId')}`;
  await redis.set(stateKey, JSON.stringify(state), { ex: ttl });
}

/**
 * Add participant to session
 * @param sessionId - The session ID
 * @param userId - The user ID
 * @param ttl - Time to live in seconds (default: 3600)
 */
export async function addSessionParticipant(sessionId: string, userId: string, ttl: number = 3600): Promise<void> {
  const participantsKey = `${SESSION_PARTICIPANTS_PREFIX}${assertId(sessionId, 'sessionId')}`;
  await redis.sadd(participantsKey, assertId(userId, 'userId'));
  await redis.expire(participantsKey, ttl);
}

/**
 * Get all participants for a session
 * @param sessionId - The session ID
 */
export async function getSessionParticipants(sessionId: string): Promise<string[]> {
  const participantsKey = `${SESSION_PARTICIPANTS_PREFIX}${assertId(sessionId, 'sessionId')}`;
  return await redis.smembers(participantsKey);
}

/**
 * Remove participant from session
 * @param sessionId - The session ID
 * @param userId - The user ID
 */
export async function removeSessionParticipant(sessionId: string, userId: string): Promise<void> {
  const participantsKey = `${SESSION_PARTICIPANTS_PREFIX}${assertId(sessionId, 'sessionId')}`;
  await redis.srem(participantsKey, assertId(userId, 'userId'));
}

/**
 * Add matched media to session
 * @param sessionId - The session ID
 * @param mediaId - The media ID
 * @param ttl - Time to live in seconds (default: 3600)
 */
export async function addSessionMatch(sessionId: string, mediaId: string, ttl: number = 3600): Promise<void> {
  const matchesKey = `${SESSION_MATCHES_PREFIX}${assertId(sessionId, 'sessionId')}`;
  await redis.sadd(matchesKey, assertId(mediaId, 'mediaId'));
  await redis.expire(matchesKey, ttl);
}

/**
 * Get all matched media for a session
 * @param sessionId - The session ID
 */
export async function getSessionMatches(sessionId: string): Promise<string[]> {
  const matchesKey = `${SESSION_MATCHES_PREFIX}${assertId(sessionId, 'sessionId')}`;
  return await redis.smembers(matchesKey);
}

/**
 * Clear all session data from Redis
 * @param sessionId - The session ID
 */
export async function clearSessionData(sessionId: string): Promise<void> {
  assertId(sessionId, 'sessionId');
  const keys = [
    `${SESSION_PREFIX}${sessionId}`,
    `${SESSION_LOCK_PREFIX}${sessionId}`,
    `${SESSION_PARTICIPANTS_PREFIX}${sessionId}`,
    `${SESSION_MATCHES_PREFIX}${sessionId}`,
  ];
  
  await redis.del(...keys);
}

export { redis };

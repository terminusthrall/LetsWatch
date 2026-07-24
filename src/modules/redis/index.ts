import { Redis } from '@upstash/redis';
import { requireEnv } from '@/lib/env';
import { RedisDataError, RedisOperationError, withRedisErrors } from '@/lib/errors';

const redis = new Redis({
  url: requireEnv('UPSTASH_REDIS_REST_URL'),
  token: requireEnv('UPSTASH_REDIS_REST_TOKEN'),
});

// Session State Engine Keys
const SESSION_PREFIX = 'session:';
const SESSION_LOCK_PREFIX = 'session_lock:';
const SESSION_PARTICIPANTS_PREFIX = 'session_participants:';
const SESSION_MATCHES_PREFIX = 'session_matches:';

export type SessionState = Record<string, unknown>;

/**
 * A held session lock. The token identifies the owner so that releasing a lock
 * cannot delete a lock that has since been acquired by another process.
 */
export interface SessionLock {
  sessionId: string;
  token: string;
}

const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

/**
 * Acquire a distributed lock for a session.
 * @param sessionId - The session ID to lock
 * @param ttl - Time to live in seconds (default: 30)
 * @returns the lock handle, or null if the lock is already held
 * @throws RedisOperationError if the Redis command fails
 */
export async function acquireSessionLock(
  sessionId: string,
  ttl: number = 30,
): Promise<SessionLock | null> {
  const lockKey = `${SESSION_LOCK_PREFIX}${sessionId}`;
  const token = `${Date.now()}-${crypto.randomUUID()}`;

  const result = await withRedisErrors('SET NX', lockKey, () =>
    redis.set(lockKey, token, { nx: true, ex: ttl }),
  );

  return result === 'OK' ? { sessionId, token } : null;
}

/**
 * Release a previously acquired session lock.
 * @returns true if this owner's lock was released, false if it had already
 *          expired or been taken over by another owner
 * @throws RedisOperationError if the Redis command fails
 */
export async function releaseSessionLock(lock: SessionLock): Promise<boolean> {
  const lockKey = `${SESSION_LOCK_PREFIX}${lock.sessionId}`;

  const released = await withRedisErrors('EVAL (release lock)', lockKey, () =>
    redis.eval(RELEASE_LOCK_SCRIPT, [lockKey], [lock.token]),
  );

  return released === 1;
}

/**
 * Run `fn` while holding the session lock, always releasing it afterwards.
 * Release failures are surfaced only when `fn` itself succeeded, so the
 * original error is never masked.
 * @throws RedisOperationError if the lock cannot be acquired
 */
export async function withSessionLock<T>(
  sessionId: string,
  fn: () => Promise<T>,
  ttl: number = 30,
): Promise<T> {
  const lock = await acquireSessionLock(sessionId, ttl);

  if (!lock) {
    throw new RedisOperationError(`Session lock for "${sessionId}" is already held`);
  }

  let result: T;
  try {
    result = await fn();
  } catch (error) {
    await releaseSessionLock(lock).catch(() => undefined);
    throw error;
  }

  await releaseSessionLock(lock);
  return result;
}

/**
 * Get session state from Redis.
 * @returns the stored state, or null if the key is absent
 * @throws RedisOperationError if the Redis command fails
 * @throws RedisDataError if the stored value is not a session state object
 */
export async function getSessionState(sessionId: string): Promise<SessionState | null> {
  const stateKey = `${SESSION_PREFIX}${sessionId}`;

  const raw = await withRedisErrors('GET', stateKey, () => redis.get(stateKey));

  if (raw === null || raw === undefined) {
    return null;
  }

  // Upstash transparently JSON-parses values it recognises, so the stored
  // payload comes back either as an object or as its JSON string form.
  const value: unknown =
    typeof raw === 'string' ? parseSessionStateJson(stateKey, raw) : raw;

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new RedisDataError(
      `Session state at "${stateKey}" is not an object (received ${typeof value})`,
    );
  }

  return value as SessionState;
}

function parseSessionStateJson(stateKey: string, raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (cause) {
    throw new RedisDataError(`Session state at "${stateKey}" is not valid JSON`, { cause });
  }
}

/**
 * Set session state in Redis.
 * @throws RedisOperationError if the Redis command fails
 */
export async function setSessionState(
  sessionId: string,
  state: SessionState,
  ttl: number = 3600,
): Promise<void> {
  const stateKey = `${SESSION_PREFIX}${sessionId}`;

  await withRedisErrors('SET', stateKey, () =>
    redis.set(stateKey, JSON.stringify(state), { ex: ttl }),
  );
}

/**
 * Add participant to session.
 * @throws RedisOperationError if the Redis command fails
 */
export async function addSessionParticipant(
  sessionId: string,
  userId: string,
  ttl: number = 3600,
): Promise<void> {
  const participantsKey = `${SESSION_PARTICIPANTS_PREFIX}${sessionId}`;

  await withRedisErrors('SADD + EXPIRE', participantsKey, () =>
    redis
      .multi()
      .sadd(participantsKey, userId)
      .expire(participantsKey, ttl)
      .exec(),
  );
}

/**
 * Get all participants for a session.
 * @throws RedisOperationError if the Redis command fails
 */
export async function getSessionParticipants(sessionId: string): Promise<string[]> {
  const participantsKey = `${SESSION_PARTICIPANTS_PREFIX}${sessionId}`;

  return withRedisErrors('SMEMBERS', participantsKey, () => redis.smembers(participantsKey));
}

/**
 * Remove participant from session.
 * @throws RedisOperationError if the Redis command fails
 */
export async function removeSessionParticipant(sessionId: string, userId: string): Promise<void> {
  const participantsKey = `${SESSION_PARTICIPANTS_PREFIX}${sessionId}`;

  await withRedisErrors('SREM', participantsKey, () => redis.srem(participantsKey, userId));
}

/**
 * Add matched media to session.
 * @throws RedisOperationError if the Redis command fails
 */
export async function addSessionMatch(
  sessionId: string,
  mediaId: string,
  ttl: number = 3600,
): Promise<void> {
  const matchesKey = `${SESSION_MATCHES_PREFIX}${sessionId}`;

  await withRedisErrors('SADD + EXPIRE', matchesKey, () =>
    redis.multi().sadd(matchesKey, mediaId).expire(matchesKey, ttl).exec(),
  );
}

/**
 * Get all matched media for a session.
 * @throws RedisOperationError if the Redis command fails
 */
export async function getSessionMatches(sessionId: string): Promise<string[]> {
  const matchesKey = `${SESSION_MATCHES_PREFIX}${sessionId}`;

  return withRedisErrors('SMEMBERS', matchesKey, () => redis.smembers(matchesKey));
}

/**
 * Clear all session data from Redis.
 * @throws RedisOperationError if the Redis command fails
 */
export async function clearSessionData(sessionId: string): Promise<void> {
  const keys = [
    `${SESSION_PREFIX}${sessionId}`,
    `${SESSION_LOCK_PREFIX}${sessionId}`,
    `${SESSION_PARTICIPANTS_PREFIX}${sessionId}`,
    `${SESSION_MATCHES_PREFIX}${sessionId}`,
  ];

  await withRedisErrors('DEL', keys.join(', '), () => redis.del(...keys));
}

export { redis };

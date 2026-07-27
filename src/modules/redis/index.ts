import { Redis } from '@upstash/redis';

let redisInstance: Redis | undefined;

function getRedis(): Redis {
  if (redisInstance) return redisInstance;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN environment variables are required');
  }

  redisInstance = new Redis({ url, token });
  return redisInstance;
}

const redis = new Proxy({} as Redis, {
  get(_, prop) {
    return Reflect.get(getRedis(), prop);
  },
});

// Session State Engine Keys
const SESSION_PREFIX = 'session:';
const SESSION_LOCK_PREFIX = 'session_lock:';
const SESSION_PARTICIPANTS_PREFIX = 'session_participants:';
const SESSION_MATCHES_PREFIX = 'session_matches:';

function getSessionMediaLikesKey(sessionId: string, mediaId: string): string {
  return `${SESSION_PREFIX}${sessionId}:media:${mediaId}:likes`;
}

/**
 * Acquire a distributed lock for a session
 * @param sessionId - The session ID to lock
 * @param ttl - Time to live in seconds (default: 30)
 * @returns true if lock acquired, false otherwise
 */
export async function acquireSessionLock(sessionId: string, ttl: number = 30): Promise<boolean> {
  const lockKey = `${SESSION_LOCK_PREFIX}${sessionId}`;
  const lockValue = `${Date.now()}`;
  
  const result = await redis.set(lockKey, lockValue, {
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
  const lockKey = `${SESSION_LOCK_PREFIX}${sessionId}`;
  await redis.del(lockKey);
}

/**
 * Get session state from Redis
 * @param sessionId - The session ID
 */
export async function getSessionState(sessionId: string) {
  const stateKey = `${SESSION_PREFIX}${sessionId}`;
  return await redis.get(stateKey);
}

/**
 * Set session state in Redis
 * @param sessionId - The session ID
 * @param state - The session state object
 * @param ttl - Time to live in seconds (default: 3600)
 */
export async function setSessionState(sessionId: string, state: unknown, ttl: number = 3600): Promise<void> {
  const stateKey = `${SESSION_PREFIX}${sessionId}`;
  await redis.set(stateKey, JSON.stringify(state), { ex: ttl });
}

/**
 * Add participant to session
 * @param sessionId - The session ID
 * @param userId - The user ID
 * @param ttl - Time to live in seconds (default: 3600)
 */
export async function addSessionParticipant(sessionId: string, userId: string, ttl: number = 3600): Promise<void> {
  const participantsKey = `${SESSION_PARTICIPANTS_PREFIX}${sessionId}`;
  await redis.sadd(participantsKey, userId);
  await redis.expire(participantsKey, ttl);
}

/**
 * Get all participants for a session
 * @param sessionId - The session ID
 */
export async function getSessionParticipants(sessionId: string): Promise<string[]> {
  const participantsKey = `${SESSION_PARTICIPANTS_PREFIX}${sessionId}`;
  return await redis.smembers(participantsKey);
}

/**
 * Get participant count for a session
 * @param sessionId - The session ID
 */
export async function getParticipantCount(sessionId: string): Promise<number> {
  const participantsKey = `${SESSION_PARTICIPANTS_PREFIX}${sessionId}`;
  return await redis.scard(participantsKey);
}

/**
 * Remove participant from session
 * @param sessionId - The session ID
 * @param userId - The user ID
 */
export async function removeSessionParticipant(sessionId: string, userId: string): Promise<void> {
  const participantsKey = `${SESSION_PARTICIPANTS_PREFIX}${sessionId}`;
  await redis.srem(participantsKey, userId);
}

/**
 * Add matched media to session
 * @param sessionId - The session ID
 * @param mediaId - The media ID
 * @param ttl - Time to live in seconds (default: 3600)
 */
export async function addSessionMatch(sessionId: string, mediaId: string, ttl: number = 3600): Promise<void> {
  const matchesKey = `${SESSION_MATCHES_PREFIX}${sessionId}`;
  await redis.sadd(matchesKey, mediaId);
  await redis.expire(matchesKey, ttl);
}

/**
 * Get all matched media for a session
 * @param sessionId - The session ID
 */
export async function getSessionMatches(sessionId: string): Promise<string[]> {
  const matchesKey = `${SESSION_MATCHES_PREFIX}${sessionId}`;
  return await redis.smembers(matchesKey);
}

/**
 * Add a user's LIKE for a media item in a session
 * @param sessionId - The session ID
 * @param mediaId - The media ID
 * @param userId - The user ID that liked the media
 * @param ttl - Time to live in seconds (default: 3600)
 * @returns The new like count
 */
export async function addMediaLike(sessionId: string, mediaId: string, userId: string, ttl: number = 3600): Promise<number> {
  const likesKey = getSessionMediaLikesKey(sessionId, mediaId);
  await redis.sadd(likesKey, userId);
  const count = await redis.scard(likesKey);
  await redis.expire(likesKey, ttl);
  return count;
}

/**
 * Get like count for a media item in a session
 * @param sessionId - The session ID
 * @param mediaId - The media ID
 */
export async function getMediaLikeCount(sessionId: string, mediaId: string): Promise<number> {
  const likesKey = getSessionMediaLikesKey(sessionId, mediaId);
  return await redis.scard(likesKey);
}

/**
 * Check whether every active participant has liked the given media item.
 * Uses SINTER between the participants set and the media likes set.
 * @param sessionId - The session ID
 * @param mediaId - The media ID
 */
export async function isMediaLikedByAllParticipants(sessionId: string, mediaId: string): Promise<boolean> {
  const participantsKey = `${SESSION_PARTICIPANTS_PREFIX}${sessionId}`;
  const likesKey = getSessionMediaLikesKey(sessionId, mediaId);
  const [participantCount, likedByParticipants] = await Promise.all([
    redis.scard(participantsKey),
    redis.sinter(participantsKey, likesKey),
  ]);
  return participantCount > 0 && likedByParticipants.length === participantCount;
}

/**
 * Reset like count for a media item in a session
 * @param sessionId - The session ID
 * @param mediaId - The media ID
 */
export async function resetMediaLikeCount(sessionId: string, mediaId: string): Promise<void> {
  const likesKey = getSessionMediaLikesKey(sessionId, mediaId);
  await redis.del(likesKey);
}

/**
 * Acquire atomic evaluation lock for session
 * @param sessionId - The session ID
 * @param ttl - Time to live in seconds (default: 10)
 * @returns true if lock acquired, false otherwise
 */
export async function acquireEvaluationLock(sessionId: string, ttl: number = 10): Promise<boolean> {
  const lockKey = `${SESSION_LOCK_PREFIX}evaluation:${sessionId}`;
  const lockValue = `${Date.now()}`;
  
  const result = await redis.set(lockKey, lockValue, {
    nx: true,
    ex: ttl,
  });
  
  return result === 'OK';
}

/**
 * Release atomic evaluation lock for session
 * @param sessionId - The session ID
 */
export async function releaseEvaluationLock(sessionId: string): Promise<void> {
  const lockKey = `${SESSION_LOCK_PREFIX}evaluation:${sessionId}`;
  await redis.del(lockKey);
}

/**
 * Clear all session data from Redis
 * @param sessionId - The session ID
 */
export async function clearSessionData(sessionId: string): Promise<void> {
  const keys = [
    `${SESSION_PREFIX}${sessionId}`,
    `${SESSION_LOCK_PREFIX}${sessionId}`,
    `${SESSION_LOCK_PREFIX}evaluation:${sessionId}`,
    `${SESSION_PARTICIPANTS_PREFIX}${sessionId}`,
    `${SESSION_MATCHES_PREFIX}${sessionId}`,
  ];
  
  await redis.del(...keys);
}

export { redis };

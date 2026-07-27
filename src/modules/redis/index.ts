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

/**
 * Redis keys owned by this module:
 *
 * - session_participants:{sessionId} — Set of userId strings. TTL set by caller
 *   (participants.ts passes getSessionRedisTtlSeconds(deadlineAt), default 3600s).
 * - session:{sessionId}:media:{mediaId}:likes — Set of userId strings who liked the media.
 *   TTL set by caller (default 3600s).
 * - session_matches:{sessionId} — Set of matched sessionMedia.id strings.
 *   TTL set by caller (default 3600s).
 * - session_winner:{sessionId} — Cached winner JSON/string. TTL 24h.
 * - session_lock:{sessionId} — Distributed lock string. TTL set by caller (default 30s).
 * - session_lock:evaluation:{sessionId} — Distributed lock for swipe match evaluation.
 *   TTL set by caller (default 10s).
 */

// Session State Engine Keys
const SESSION_PREFIX = 'session:';
const SESSION_LOCK_PREFIX = 'session_lock:';
const SESSION_PARTICIPANTS_PREFIX = 'session_participants:';
const SESSION_MATCHES_PREFIX = 'session_matches:';
const SESSION_WINNER_PREFIX = 'session_winner:';

function getSessionMediaLikesKey(sessionId: string, mediaId: string): string {
  return `${SESSION_PREFIX}${sessionId}:media:${mediaId}:likes`;
}

function getSessionWinnerKey(sessionId: string): string {
  return `${SESSION_WINNER_PREFIX}${sessionId}`;
}

const DELETE_IF_MATCHES_SCRIPT = `
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
 * @returns The lock token if acquired, null otherwise
 */
export async function acquireSessionLock(sessionId: string, ttl: number = 30): Promise<string | null> {
  const lockKey = `${SESSION_LOCK_PREFIX}${sessionId}`;
  const token = crypto.randomUUID();

  const result = await redis.set(lockKey, token, {
    nx: true,
    ex: ttl,
  });

  return result === 'OK' ? token : null;
}

/**
 * Release a distributed lock for a session
 * @param sessionId - The session ID to unlock
 * @param token - The token returned when the lock was acquired
 */
export async function releaseSessionLock(sessionId: string, token: string): Promise<void> {
  const lockKey = `${SESSION_LOCK_PREFIX}${sessionId}`;
  await redis.eval(DELETE_IF_MATCHES_SCRIPT, [lockKey], [token]);
}

const WINNER_CACHE_TTL_SECONDS = 24 * 60 * 60;

/**
 * Cache the resolved winner for a session
 * @param sessionId - The session ID
 * @param winner - The winner payload to cache
 */
export async function cacheWinner(sessionId: string, winner: unknown): Promise<void> {
  await redis.set(getSessionWinnerKey(sessionId), winner, { ex: WINNER_CACHE_TTL_SECONDS });
}

/**
 * Get the cached winner for a session
 * @param sessionId - The session ID
 */
export async function getCachedWinner(sessionId: string): Promise<unknown | null> {
  return await redis.get(getSessionWinnerKey(sessionId));
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
 * @returns The lock token if acquired, null otherwise
 */
export async function acquireEvaluationLock(sessionId: string, ttl: number = 10): Promise<string | null> {
  const lockKey = `${SESSION_LOCK_PREFIX}evaluation:${sessionId}`;
  const token = crypto.randomUUID();

  const result = await redis.set(lockKey, token, {
    nx: true,
    ex: ttl,
  });

  return result === 'OK' ? token : null;
}

/**
 * Release atomic evaluation lock for session
 * @param sessionId - The session ID
 * @param token - The token returned when the lock was acquired
 */
export async function releaseEvaluationLock(sessionId: string, token: string): Promise<void> {
  const lockKey = `${SESSION_LOCK_PREFIX}evaluation:${sessionId}`;
  await redis.eval(DELETE_IF_MATCHES_SCRIPT, [lockKey], [token]);
}

/**
 * Clear all session data from Redis
 * @param sessionId - The session ID
 */
export async function clearSessionData(sessionId: string): Promise<void> {
  const keys = [
    `${SESSION_LOCK_PREFIX}${sessionId}`,
    `${SESSION_LOCK_PREFIX}evaluation:${sessionId}`,
    `${SESSION_PARTICIPANTS_PREFIX}${sessionId}`,
    `${SESSION_MATCHES_PREFIX}${sessionId}`,
    `${SESSION_WINNER_PREFIX}${sessionId}`,
  ];
  
  await redis.del(...keys);
}

export { redis };

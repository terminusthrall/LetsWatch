import { Redis } from '@upstash/redis';
import { env } from '@/lib/env';

let redisInstance: Redis | undefined;

function getRedis(): Redis {
  if (redisInstance) return redisInstance;

  redisInstance = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
  return redisInstance;
}

const REDIS_PREFIX =
  process.env.REDIS_KEY_PREFIX ?? (process.env.NODE_ENV === 'test' ? 'test:' : '');

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
const SESSION_PREFIX = `${REDIS_PREFIX}session:`;
const SESSION_LOCK_PREFIX = `${REDIS_PREFIX}session_lock:`;
const SESSION_PARTICIPANTS_PREFIX = `${REDIS_PREFIX}session_participants:`;
const SESSION_MATCHES_PREFIX = `${REDIS_PREFIX}session_matches:`;
const SESSION_WINNER_PREFIX = `${REDIS_PREFIX}session_winner:`;

export function getSessionParticipantsKey(sessionId: string): string {
  return `${SESSION_PARTICIPANTS_PREFIX}${sessionId}`;
}

function getSessionMediaLikesKey(sessionId: string, mediaId: string): string {
  return `${SESSION_PREFIX}${sessionId}:media:${mediaId}:likes`;
}

function getSessionWinnerKey(sessionId: string): string {
  return `${SESSION_WINNER_PREFIX}${sessionId}`;
}

function getSessionSnapshotCountsKey(sessionId: string): string {
  return `${SESSION_PREFIX}${sessionId}:snapshot:counts`;
}

function getSessionSnapshotParticipantsKey(sessionId: string): string {
  return `${SESSION_PREFIX}${sessionId}:snapshot:participants`;
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
 * Get participant count for a session. Prefers the immutable snapshot created
 * when the session starts so the swiping denominator cannot change mid-session.
 * @param sessionId - The session ID
 */
export async function getParticipantCount(sessionId: string): Promise<number> {
  const snapshotCount = await redis.hget(getSessionSnapshotCountsKey(sessionId), 'participantCount');
  if (snapshotCount != null) {
    const parsed = Number(snapshotCount);
    if (!Number.isNaN(parsed)) return parsed;
  }

  const participantsKey = `${SESSION_PARTICIPANTS_PREFIX}${sessionId}`;
  return await redis.scard(participantsKey);
}

/**
 * Persist an immutable snapshot of participant/media counts and the participant
 * list used for unanimous-match evaluation.
 * @param sessionId - The session ID
 * @param participantIds - Final list of participant user IDs
 * @param mediaCount - Final number of media items in the pool
 * @param ttl - Time to live in seconds
 */
export async function setSessionSnapshot(
  sessionId: string,
  participantIds: string[],
  mediaCount: number,
  ttl: number
): Promise<void> {
  const countsKey = getSessionSnapshotCountsKey(sessionId);
  const snapshotParticipantsKey = getSessionSnapshotParticipantsKey(sessionId);
  const participantsKey = `${SESSION_PARTICIPANTS_PREFIX}${sessionId}`;

  await redis.del(snapshotParticipantsKey);
  if (participantIds.length > 0) {
    const [first, ...rest] = participantIds;
    await redis.sadd(snapshotParticipantsKey, first, ...rest);
  }
  await redis.expire(snapshotParticipantsKey, ttl);

  await redis.hset(countsKey, { participantCount: participantIds.length, mediaCount });
  await redis.expire(countsKey, ttl);

  // Keep the live participants set in sync with the snapshot at start time
  await redis.del(participantsKey);
  if (participantIds.length > 0) {
    const [first, ...rest] = participantIds;
    await redis.sadd(participantsKey, first, ...rest);
  }
  await redis.expire(participantsKey, ttl);
}

/**
 * Get the snapshot participant count if one has been stored.
 * @param sessionId - The session ID
 */
export async function getSnapshotParticipantCount(sessionId: string): Promise<number | null> {
  const value = await redis.hget(getSessionSnapshotCountsKey(sessionId), 'participantCount');
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Get the snapshot media count if one has been stored.
 * @param sessionId - The session ID
 */
export async function getSnapshotMediaCount(sessionId: string): Promise<number | null> {
  const value = await redis.hget(getSessionSnapshotCountsKey(sessionId), 'mediaCount');
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Check whether every snapshot participant has liked the given media item.
 * @param sessionId - The session ID
 * @param mediaId - The media ID
 */
export async function isMediaLikedByAllSnapshotParticipants(sessionId: string, mediaId: string): Promise<boolean> {
  const participantCount = await getSnapshotParticipantCount(sessionId);
  if (participantCount == null || participantCount === 0) return false;

  const snapshotParticipantsKey = getSessionSnapshotParticipantsKey(sessionId);
  const likesKey = getSessionMediaLikesKey(sessionId, mediaId);
  const likedByParticipants = await redis.sinter(snapshotParticipantsKey, likesKey);
  return likedByParticipants.length === participantCount;
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

/**
 * Delete every key prefixed with `test:` from Redis using SCAN.
 * Only available in the test environment as a CI safety gate.
 */
export async function cleanupTestKeys(): Promise<void> {
  const isTestEnvironment =
    process.env.NODE_ENV === 'test' || REDIS_PREFIX.startsWith('test');
  if (!isTestEnvironment) {
    throw new Error(
      'cleanupTestKeys can only be called when NODE_ENV=test or REDIS_KEY_PREFIX starts with "test"'
    );
  }

  let cursor = '0';
  do {
    const [nextCursor, keys] = await redis.scan(cursor, {
      match: 'test:*',
      count: 100,
    });
    cursor = nextCursor;

    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } while (cursor !== '0');
}

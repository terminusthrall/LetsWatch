import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { sessionMedia, swipes } from '@/db/schema';
import { getParticipantCount } from '@/modules/redis';

export type ResolveEndSessionResult = {
  newStatus: 'COMPLETED' | 'HEAD_TO_HEAD_ACTIVE' | 'DEADLINE_RESOLVED';
  winningMediaId: string | null;
  topIds: string[];
  consensusIds: string[];
  candidateIds: string[];
};

export function resolveEndSession(
  likeCounts: Map<string, number>,
  participantCount: number
): ResolveEndSessionResult {
  let maxLikes = 0;
  const topIds: string[] = [];
  const consensusIds: string[] = [];

  for (const [mediaId, count] of likeCounts) {
    if (count > maxLikes) {
      maxLikes = count;
      topIds.length = 0;
      topIds.push(mediaId);
    } else if (count === maxLikes) {
      topIds.push(mediaId);
    }

    if (participantCount > 0 && count === participantCount) {
      consensusIds.push(mediaId);
    }
  }

  if (maxLikes === 0) {
    return {
      newStatus: 'DEADLINE_RESOLVED',
      winningMediaId: null,
      topIds,
      consensusIds,
      candidateIds: [],
    };
  }

  if (consensusIds.length === 1) {
    return {
      newStatus: 'COMPLETED',
      winningMediaId: consensusIds[0],
      topIds,
      consensusIds,
      candidateIds: [consensusIds[0]],
    };
  }

  if (topIds.length === 1) {
    return {
      newStatus: 'COMPLETED',
      winningMediaId: topIds[0],
      topIds,
      consensusIds,
      candidateIds: [topIds[0]],
    };
  }

  const ranked = [...likeCounts.entries()]
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([mediaId]) => mediaId);

  return {
    newStatus: 'HEAD_TO_HEAD_ACTIVE',
    winningMediaId: null,
    topIds,
    consensusIds,
    candidateIds: ranked,
  };
}

export async function resolveSessionOutcome(
  sessionId: string
): Promise<ResolveEndSessionResult> {
  const [mediaItems, swipeRecords, participantCount] = await Promise.all([
    db.query.sessionMedia.findMany({
      where: eq(sessionMedia.sessionId, sessionId),
    }),
    db.query.swipes.findMany({
      where: eq(swipes.sessionId, sessionId),
    }),
    getParticipantCount(sessionId),
  ]);

  const mediaIds = new Set(mediaItems.map((m) => m.id));
  const likeCounts = new Map<string, number>();
  for (const media of mediaItems) {
    likeCounts.set(media.id, 0);
  }
  for (const swipe of swipeRecords) {
    if (swipe.vote === 'LIKE' && mediaIds.has(swipe.mediaId)) {
      likeCounts.set(swipe.mediaId, (likeCounts.get(swipe.mediaId) ?? 0) + 1);
    }
  }

  return resolveEndSession(likeCounts, participantCount);
}

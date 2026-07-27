export type ResolveEndSessionResult = {
  newStatus: 'COMPLETED' | 'HEAD_TO_HEAD_ACTIVE';
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

  let winningMediaId: string | null = null;
  let newStatus: 'COMPLETED' | 'HEAD_TO_HEAD_ACTIVE';

  if (consensusIds.length === 1) {
    winningMediaId = consensusIds[0];
    newStatus = 'COMPLETED';
  } else if (topIds.length === 1) {
    winningMediaId = topIds[0];
    newStatus = 'COMPLETED';
  } else {
    newStatus = 'HEAD_TO_HEAD_ACTIVE';
  }

  const candidateIds =
    newStatus === 'HEAD_TO_HEAD_ACTIVE'
      ? topIds
      : winningMediaId
        ? [winningMediaId]
        : [];

  return { newStatus, winningMediaId, topIds, consensusIds, candidateIds };
}

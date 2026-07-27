export interface H2HVote {
  preferredMediaId: string;
}

export function computeHeadToHeadStandings(
  matchIds: string[],
  votes: H2HVote[],
  addedAtByMediaId: Map<string, Date>
): { mediaId: string; wins: number }[] {
  const winCounts = new Map<string, number>();
  for (const id of matchIds) {
    winCounts.set(id, 0);
  }

  for (const vote of votes) {
    const current = winCounts.get(vote.preferredMediaId);
    if (current !== undefined) {
      winCounts.set(vote.preferredMediaId, current + 1);
    }
  }

  return [...winCounts.entries()]
    .map(([mediaId, wins]) => ({ mediaId, wins }))
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;

      const aAdded = addedAtByMediaId.get(a.mediaId)?.getTime() ?? 0;
      const bAdded = addedAtByMediaId.get(b.mediaId)?.getTime() ?? 0;
      if (aAdded !== bAdded) return aAdded - bAdded;

      return a.mediaId.localeCompare(b.mediaId);
    });
}

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { headToHeadVotes, sessions, sessionMedia } from '@/db/schema';
import { eq, and, or } from 'drizzle-orm';
import { getMediaDetails } from '@/modules/tmdb';
import { z } from 'zod';
import {
  setSessionState,
  getSessionMatches,
} from '@/modules/redis';
import { getAuthenticatedParticipant } from '@/modules/auth';
import {
  getParticipantCount,
  getSessionRedisTtlSeconds,
} from '@/modules/sessions/participants';

const headToHeadVoteSchema = z.object({
  preferredMediaId: z.string().uuid(),
  opponentMediaId: z.string().uuid(),
});

type WinnerMedia = {
  id: string;
  tmdbId: string;
  mediaType: string;
  title: string;
  posterPath: string | null;
  releaseYear: string | null;
  overview: string | null;
  voteAverage: number | null;
  watchUrl: string;
};

function watchUrlForTitle(title: string): string {
  return `https://www.justwatch.com/us/search?q=${encodeURIComponent(title)}`;
}

async function buildWinnerMedia(
  mediaId: string
): Promise<WinnerMedia | null> {
  const media = await db.query.sessionMedia.findFirst({
    where: eq(sessionMedia.id, mediaId),
  });

  if (!media) return null;

  let voteAverage: number | null = null;
  try {
    const details = await getMediaDetails(media.mediaType, media.tmdbId);
    voteAverage = details.vote_average ?? null;
  } catch {
    voteAverage = null;
  }

  return {
    id: media.id,
    tmdbId: media.tmdbId,
    mediaType: media.mediaType,
    title: media.title,
    posterPath: media.posterPath,
    releaseYear: media.releaseYear,
    overview: media.overview,
    voteAverage,
    watchUrl: watchUrlForTitle(media.title),
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionId = (await params).id;

    // Authenticate participant via cookie
    const auth = await getAuthenticatedParticipant(request, sessionId);
    if (auth instanceof NextResponse) {
      return auth;
    }
    const { userId } = auth;

    const body = await request.json();
    const parsed = headToHeadVoteSchema.safeParse(body);

    if (!parsed.success) {
      const message = parsed.error.issues.map((issue) => issue.message).join(', ');
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const { preferredMediaId, opponentMediaId } = parsed.data;

    if (preferredMediaId === opponentMediaId) {
      return NextResponse.json(
        { error: 'Preferred and opponent media must be different' },
        { status: 400 }
      );
    }

    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
    });

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const ttl = getSessionRedisTtlSeconds(session.deadlineAt);

    if (session.status === 'COMPLETED') {
      return NextResponse.json(
        { error: 'Session is already completed' },
        { status: 400 }
      );
    }

    // Resolve the set of matched/tied media for this tie-breaker
    let matchIds = await getSessionMatches(sessionId);

    if (matchIds.length === 0) {
      const matched = await db.query.sessionMedia.findMany({
        where: and(
          eq(sessionMedia.sessionId, sessionId),
          eq(sessionMedia.isMatched, 1)
        ),
        orderBy: (sessionMedia, { asc }) => [asc(sessionMedia.addedAt)],
      });
      matchIds = matched.map((m) => m.id);
    }

    if (matchIds.length < 2) {
      const [participantCount, mediaCount] = await Promise.all([
        getParticipantCount(sessionId),
        db.$count(sessionMedia, eq(sessionMedia.sessionId, sessionId)),
      ]);
      const winningMediaId = matchIds[0] ?? null;
      await db
        .update(sessions)
        .set({
          status: 'COMPLETED',
          finalWinningMediaId: winningMediaId,
        })
        .where(eq(sessions.id, sessionId));

      const winner = winningMediaId
        ? await buildWinnerMedia(winningMediaId)
        : null;
      await setSessionState(
        sessionId,
        {
          status: 'COMPLETED',
          participantCount,
          mediaCount,
          deadlineAt: session.deadlineAt.toISOString(),
          matches: matchIds,
          winner,
          completedAt: Date.now(),
        },
        ttl
      );

      return NextResponse.json({
        success: true,
        completed: true,
        winner,
        standings: winner
          ? [{ mediaId: winner.id, wins: 0, title: winner.title }]
          : [],
      });
    }

    if (!matchIds.includes(preferredMediaId) || !matchIds.includes(opponentMediaId)) {
      return NextResponse.json(
        { error: 'Selected media is not part of the tie-breaker pool' },
        { status: 400 }
      );
    }

    // Transition from swiping into head-to-head on the first vote
    if (session.status === 'SWIPING_ACTIVE') {
      await db
        .update(sessions)
        .set({ status: 'HEAD_TO_HEAD_ACTIVE' })
        .where(eq(sessions.id, sessionId));
    }

    // Upsert: remove any previous vote from this user for the same unordered pair
    const existingVote = await db.query.headToHeadVotes.findFirst({
      where: and(
        eq(headToHeadVotes.sessionId, sessionId),
        eq(headToHeadVotes.userId, userId),
        or(
          and(
            eq(headToHeadVotes.preferredMediaId, preferredMediaId),
            eq(headToHeadVotes.opponentMediaId, opponentMediaId)
          ),
          and(
            eq(headToHeadVotes.preferredMediaId, opponentMediaId),
            eq(headToHeadVotes.opponentMediaId, preferredMediaId)
          )
        )
      ),
    });

    if (existingVote) {
      await db
        .delete(headToHeadVotes)
        .where(eq(headToHeadVotes.id, existingVote.id));
    }

    await db.insert(headToHeadVotes).values({
      id: crypto.randomUUID(),
      sessionId,
      userId,
      preferredMediaId,
      opponentMediaId,
    });

    const allVotes = await db.query.headToHeadVotes.findMany({
      where: eq(headToHeadVotes.sessionId, sessionId),
    });

    const winCounts: Record<string, number> = {};
    for (const id of matchIds) {
      winCounts[id] = 0;
    }

    for (const vote of allVotes) {
      winCounts[vote.preferredMediaId] = (winCounts[vote.preferredMediaId] ?? 0) + 1;
    }

    const standings = Object.entries(winCounts)
      .map(([mediaId, wins]) => ({ mediaId, wins }))
      .sort((a, b) => b.wins - a.wins || a.mediaId.localeCompare(b.mediaId));

    const participantCount = await getParticipantCount(sessionId);
    const totalPairs = Math.floor((matchIds.length * (matchIds.length - 1)) / 2);
    const expectedVotes = totalPairs * participantCount;

    if (allVotes.length >= expectedVotes && standings.length > 0) {
      const winningMediaId = standings[0].mediaId;
      const winner = await buildWinnerMedia(winningMediaId);
      const mediaCount = await db.$count(sessionMedia, eq(sessionMedia.sessionId, sessionId));

      await db
        .update(sessions)
        .set({
          status: 'COMPLETED',
          finalWinningMediaId: winningMediaId,
        })
        .where(eq(sessions.id, sessionId));

      await setSessionState(
        sessionId,
        {
          status: 'COMPLETED',
          participantCount,
          mediaCount,
          deadlineAt: session.deadlineAt.toISOString(),
          matches: matchIds,
          winner,
          completedAt: Date.now(),
        },
        ttl
      );

      return NextResponse.json({
        success: true,
        completed: true,
        winner,
        standings,
      });
    }

    return NextResponse.json({
      success: true,
      completed: false,
      standings,
    });
  } catch (error) {
    console.error('Error recording head-to-head vote:', error);
    return NextResponse.json(
      { error: 'Failed to record head-to-head vote' },
      { status: 500 }
    );
  }
}

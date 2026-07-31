import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { headToHeadVotes, sessions, sessionMedia } from '@/db/schema';
import { eq, and, or, inArray } from 'drizzle-orm';
import { getMediaDetails } from '@/modules/tmdb';
import { computeHeadToHeadStandings } from '@/modules/head-to-head/standings';
import {
  headToHeadVoteBodySchema,
  type HeadToHeadResponse,
  type WinnerMedia,
} from '@/types/api';
import {
  cacheWinner,
  getSessionMatches,
} from '@/modules/redis';
import { getAuthenticatedParticipant } from '@/modules/auth';
import {
  getParticipantCount,
  getSessionRedisTtlSeconds,
} from '@/modules/sessions/participants';

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
    const parsed = headToHeadVoteBodySchema.safeParse(body);

    if (!parsed.success) {
      console.error('Invalid head-to-head vote body:', parsed.error);
      const message = parsed.error.issues.map((issue) => issue.message).join(', ');
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const preferredMediaId = parsed.data.preferredMediaId.trim();
    const opponentMediaId = parsed.data.opponentMediaId.trim();

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
          eq(sessionMedia.isMatched, true)
        ),
        orderBy: (sessionMedia, { asc }) => [asc(sessionMedia.addedAt)],
      });
      matchIds = matched.map((m) => m.id);
    }

    const matchIdSet = new Set(matchIds.map((id) => id.trim()));

    if (matchIds.length < 2) {
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

      if (winner) {
        await cacheWinner(sessionId, winner);
      }

      return NextResponse.json<HeadToHeadResponse>({
        success: true,
        completed: true,
        winner,
        standings: winner
          ? [{ mediaId: winner.id, wins: 0, title: winner.title }]
          : [],
      });
    }

    if (!matchIdSet.has(preferredMediaId) || !matchIdSet.has(opponentMediaId)) {
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

    // Upsert: remove any previous vote from this user for the same unordered pair.
    // Note: the neon-http driver used in src/db/index.ts does not support
    // db.transaction() (it throws "No transactions support in neon-http
    // driver"), which was the direct cause of the 500 here. Delete-then-insert
    // sequentially instead; onConflictDoNothing on the immediately following
    // insert guards against a concurrent duplicate slipping in between the
    // delete and the insert.
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

    await db
      .insert(headToHeadVotes)
      .values({
        id: crypto.randomUUID(),
        sessionId,
        userId,
        preferredMediaId,
        opponentMediaId,
      })
      .onConflictDoNothing();

    const allVotes = await db.query.headToHeadVotes.findMany({
      where: eq(headToHeadVotes.sessionId, sessionId),
    });

    const mediaForStandings = await db.query.sessionMedia.findMany({
      where: and(
        eq(sessionMedia.sessionId, sessionId),
        inArray(sessionMedia.id, matchIds)
      ),
      columns: { id: true, addedAt: true },
    });
    const addedAtByMediaId = new Map(mediaForStandings.map((m) => [m.id, m.addedAt]));

    const standings = computeHeadToHeadStandings(matchIds, allVotes, addedAtByMediaId);

    const participantCount = await getParticipantCount(sessionId);
    const totalPairs = Math.floor((matchIds.length * (matchIds.length - 1)) / 2);
    const expectedVotes = totalPairs * participantCount;

    if (allVotes.length >= expectedVotes && standings.length > 0) {
      const winningMediaId = standings[0].mediaId;
      const winner = await buildWinnerMedia(winningMediaId);

      await db
        .update(sessions)
        .set({
          status: 'COMPLETED',
          finalWinningMediaId: winningMediaId,
        })
        .where(eq(sessions.id, sessionId));

      if (winner) {
        await cacheWinner(sessionId, winner);
      }

      return NextResponse.json<HeadToHeadResponse>({
        success: true,
        completed: true,
        winner,
        standings,
      });
    }

    return NextResponse.json<HeadToHeadResponse>({
      success: true,
      completed: false,
      standings,
    });
  } catch (error) {
    console.error('Error recording head-to-head vote:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      error,
    });
    return NextResponse.json(
      { error: 'Failed to record head-to-head vote' },
      { status: 500 }
    );
  }
}

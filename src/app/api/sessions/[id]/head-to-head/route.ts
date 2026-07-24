import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { headToHeadVotes, sessions } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sessionId = params.id;
    const body = await request.json();
    const { userId, preferredMediaId, opponentMediaId } = body;

    // Validate input
    if (!userId || !preferredMediaId || !opponentMediaId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (preferredMediaId === opponentMediaId) {
      return NextResponse.json({ error: 'Preferred and opponent media must be different' }, { status: 400 });
    }

    // Check if session exists and is in head-to-head phase
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.id, sessionId),
    });

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.status !== 'HEAD_TO_HEAD_ACTIVE') {
      return NextResponse.json({ error: 'Session is not in head-to-head phase' }, { status: 400 });
    }

    // Record head-to-head vote
    await db.insert(headToHeadVotes).values({
      id: crypto.randomUUID(),
      sessionId,
      userId,
      preferredMediaId,
      opponentMediaId,
    });

    // Calculate pairwise standings for this session
    const votes = await db.query.headToHeadVotes.findMany({
      where: eq(headToHeadVotes.sessionId, sessionId),
    });

    // Calculate win counts for each media
    const winCounts: Record<string, number> = {};
    
    for (const vote of votes) {
      if (!winCounts[vote.preferredMediaId]) {
        winCounts[vote.preferredMediaId] = 0;
      }
      winCounts[vote.preferredMediaId]++;
    }

    // Sort by win count
    const standings = Object.entries(winCounts)
      .map(([mediaId, wins]) => ({ mediaId, wins }))
      .sort((a, b) => b.wins - a.wins);

    return NextResponse.json({
      success: true,
      standings,
    });
  } catch (error) {
    console.error('Error recording head-to-head vote:', error);
    return NextResponse.json({ error: 'Failed to record head-to-head vote' }, { status: 500 });
  }
}

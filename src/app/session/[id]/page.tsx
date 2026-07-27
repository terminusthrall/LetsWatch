'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from '@/modules/sessions/useSession';
import ParticipantRoster from '@/modules/sessions/ParticipantRoster';
import MatchToast from '@/modules/sessions/MatchToast';
import JoinModal from '@/modules/sessions/JoinModal';
import LobbyPanel from '@/modules/sessions/LobbyPanel';
import SessionPhaseView from '@/modules/sessions/SessionPhaseView';
import InviteModal from '@/modules/sessions/InviteModal';
import CountdownTimer from '@/modules/sessions/CountdownTimer';
import type { SwipeDirection } from '@/modules/swiping/SwipeDeck';

export default function SessionRoomPage() {
  const params = useParams();
  const id = typeof params.id === 'string' ? params.id : '';

  const {
    session,
    error,
    isLoading,
    needsJoin,
    join,
    joinError,
    isJoining,
    swipe,
    endSession,
    startSession,
    refetch,
  } = useSession(id);

  const [toast, setToast] = useState<{ mediaId: string; title: string } | null>(
    null
  );
  const [inviteOpen, setInviteOpen] = useState(false);

  if (!id) {
    return (
      <main className="flex min-h-full flex-1 items-center justify-center px-6">
        <p className="text-zinc-600 dark:text-zinc-400">Invalid session link.</p>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className="flex min-h-full flex-1 items-center justify-center px-6">
        <p className="text-zinc-600 dark:text-zinc-400">Loading session...</p>
      </main>
    );
  }

  if (error && !session) {
    return (
      <main className="flex min-h-full flex-1 flex-col items-center justify-center gap-4 px-6">
        <p className="text-center text-red-600 dark:text-red-400">{error}</p>
        <button
          type="button"
          onClick={refetch}
          className="rounded-xl bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          Try again
        </button>
      </main>
    );
  }

  const handleVote = async (mediaId: string, direction: SwipeDirection) => {
    const result = await swipe(mediaId, direction);
    if (result.matchFound && result.title) {
      setToast({ mediaId, title: result.title });
    }
  };

  return (
    <main className="flex min-h-full flex-1 flex-col items-center px-4 py-6">
      {toast && (
        <MatchToast title={toast.title} onClose={() => setToast(null)} />
      )}

      {needsJoin && !session && (
        <JoinModal onJoin={join} isLoading={isJoining} error={joinError} />
      )}

      {session && (
        <>
          <header className="mb-6 w-full max-w-3xl">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
                  {session.session.title}
                </h1>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {session.participantCount} participant
                  {session.participantCount === 1 ? '' : 's'} · ends in{' '}
                  <CountdownTimer
                    deadlineAt={session.session.deadlineAt}
                    onExpired={refetch}
                  />
                </p>
              </div>
              <div className="flex items-center gap-2">
                {session.session.hostId === session.userId &&
                  session.session.status === 'SWIPING_ACTIVE' && (
                    <button
                      type="button"
                      onClick={endSession}
                      className="inline-flex items-center rounded-full bg-rose-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-rose-600"
                    >
                      End Swiping & See Results
                    </button>
                  )}
                <button
                  type="button"
                  onClick={() => setInviteOpen(true)}
                  className="inline-flex items-center rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600"
                >
                  Invite Group
                </button>
                <span className="inline-flex w-fit items-center rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {session.session.status.replace(/_/g, ' ')}
                </span>
              </div>
            </div>
          </header>

          <ParticipantRoster
            participants={session.participants}
            currentUserId={session.userId}
          />

          {session.session.status === 'LOBBY' ? (
            <LobbyPanel
              sessionId={id}
              isHost={session.userId === session.session.hostId}
              mediaPool={session.mediaPool}
              participantCount={session.participantCount}
              joinCode={session.session.joinCode}
              onStart={startSession}
              onMediaAdded={refetch}
            />
          ) : (
            <SessionPhaseView
              session={session}
              sessionId={id}
              onVote={handleVote}
              refetch={refetch}
            />
          )}

          <InviteModal
            joinCode={session.session.joinCode}
            open={inviteOpen}
            onClose={() => setInviteOpen(false)}
          />
        </>
      )}
    </main>
  );
}

'use client';

import { type Participant } from '@/types/api';

interface ParticipantRosterProps {
  participants: Participant[];
  currentUserId: string;
}

export default function ParticipantRoster({
  participants,
  currentUserId,
}: ParticipantRosterProps) {
  return (
    <section className="mb-6 w-full max-w-3xl rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Participants
      </h2>
      <ul className="space-y-3">
        {participants.map((p) => {
          const progress =
            p.totalMediaCount > 0 ? p.swipedCount / p.totalMediaCount : 0;
          return (
            <li key={p.userId} className="flex items-center gap-3">
              <div className="flex flex-1 flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    {p.displayName}
                    {p.userId === currentUserId && ' (You)'}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {p.swipedCount}/{p.totalMediaCount}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
              </div>
              {p.isHost && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-200">
                  Host
                </span>
              )}
              {p.isFinished && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200">
                  Done
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

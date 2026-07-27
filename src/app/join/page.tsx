'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type JoinResponse = {
  sessionId: string;
  userId: string;
  title: string;
  status: string;
  deadlineAt: string;
  participantCount: number;
};

function JoinPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialCode = searchParams.get('code') ?? '';

  const [code, setCode] = useState(initialCode.toUpperCase());
  const [displayName, setDisplayName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const normalizedCode = code.trim().toUpperCase();
    if (normalizedCode.length !== 6) {
      setError('Please enter a 6-character room code.');
      return;
    }

    if (!displayName.trim()) {
      setError('Display name is required.');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/sessions/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: normalizedCode,
          displayName: displayName.trim(),
        }),
      });

      const data = (await response.json()) as JoinResponse | { error?: string };

      if (!response.ok) {
        const message =
          'error' in data && typeof data.error === 'string'
            ? data.error
            : 'Failed to join session';
        setError(message);
        return;
      }

      const joinData = data as JoinResponse;
      router.push(`/session/${joinData.sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-8 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Join a Room
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Enter the 6-character code and your name to start swiping.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label
              htmlFor="code"
              className="text-sm font-semibold text-zinc-700 dark:text-zinc-300"
            >
              Room code
            </label>
            <input
              id="code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="WATCH6"
              maxLength={6}
              required
              className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-center font-mono text-2xl tracking-widest text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="displayName"
              className="text-sm font-semibold text-zinc-700 dark:text-zinc-300"
            >
              Your display name
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Alex"
              maxLength={50}
              required
              className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-200">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="rounded-xl bg-emerald-500 px-6 py-3 text-base font-semibold text-white shadow-md shadow-emerald-500/30 transition hover:bg-emerald-600 disabled:opacity-60"
          >
            {isSubmitting ? 'Joining...' : 'Join Room'}
          </button>
        </form>
      </div>
    </main>
  );
}

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-full flex-1 items-center justify-center px-6">
          <p className="text-zinc-600 dark:text-zinc-400">Loading...</p>
        </main>
      }
    >
      <JoinPageContent />
    </Suspense>
  );
}

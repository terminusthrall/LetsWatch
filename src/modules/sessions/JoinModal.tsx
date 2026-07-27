'use client';

import { useState, type FormEvent } from 'react';

interface JoinModalProps {
  onJoin: (displayName: string) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

export default function JoinModal({ onJoin, isLoading, error }: JoinModalProps) {
  const [displayName, setDisplayName] = useState('');

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      await onJoin(displayName);
      setDisplayName('');
    } catch {
      // the parent handles and surfaces the error via the `error` prop
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2 className="mb-2 text-xl font-bold text-zinc-900 dark:text-zinc-50">
          Join session
        </h2>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          Enter a display name to start swiping.
        </p>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="joinDisplayName"
            className="text-sm font-semibold text-zinc-700 dark:text-zinc-300"
          >
            Display name
          </label>
          <input
            id="joinDisplayName"
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
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-200">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="mt-5 w-full rounded-xl bg-emerald-500 px-5 py-3 font-semibold text-white shadow-md shadow-emerald-500/30 transition hover:bg-emerald-600 disabled:opacity-60"
        >
          {isLoading ? 'Joining...' : 'Join Session'}
        </button>
      </form>
    </div>
  );
}

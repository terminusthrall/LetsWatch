'use client';

import { useEffect, useState } from 'react';

export default function InviteModal({
  joinCode,
  open,
  onClose,
}: {
  joinCode: string | null | undefined;
  open: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const appUrl =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://letswatch.app';
  const shareUrl = joinCode ? `${appUrl}/join?code=${joinCode}` : '';

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  const handleCopy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  if (!open || !joinCode) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-2 text-xl font-bold text-zinc-900 dark:text-zinc-50">
          Invite Group
        </h2>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          Share this code or link with your group.
        </p>

        <div className="mb-4 flex flex-col items-center gap-2 rounded-2xl bg-zinc-100 p-4 dark:bg-zinc-800">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Room Code
          </span>
          <span className="text-3xl font-bold tracking-widest text-zinc-900 dark:text-zinc-50">
            {joinCode}
          </span>
        </div>

        <div className="mb-5 flex items-center gap-2 rounded-xl border border-zinc-300 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-800">
          <span className="min-w-0 flex-1 truncate text-sm text-zinc-700 dark:text-zinc-300">
            {shareUrl}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl bg-zinc-900 px-5 py-3 font-semibold text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          Done
        </button>
      </div>
    </div>
  );
}

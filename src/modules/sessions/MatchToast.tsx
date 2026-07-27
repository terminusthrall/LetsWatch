'use client';

import { useEffect } from 'react';

interface MatchToastProps {
  title: string;
  onClose: () => void;
}

export default function MatchToast({ title, onClose }: MatchToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, 6000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed top-4 left-1/2 z-50 w-[90%] max-w-md -translate-x-1/2 animate-in fade-in slide-in-from-top-2">
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-emerald-500/30 bg-emerald-500 px-5 py-4 text-white shadow-lg shadow-emerald-500/30">
        <div>
          <p className="font-bold">It&apos;s a match!</p>
          <p className="text-sm opacity-90">Everyone liked {title}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 hover:bg-emerald-600"
          aria-label="Dismiss match"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { getPosterUrl } from '@/modules/tmdb';

export type SwipeDirection = 'LIKE' | 'PASS';

export interface SwipeMedia {
  id: string;
  title: string;
  releaseYear?: string;
  overview: string;
  posterPath: string | null;
  rating?: number;
}

export interface SwipeDeckProps {
  items: SwipeMedia[];
  onVote: (id: string, direction: SwipeDirection) => void;
  onEmpty?: () => void;
  emptyMessage?: string;
}

const SWIPE_THRESHOLD = 100;
const MAX_ROTATION = 18;

export function SwipeDeck({
  items,
  onVote,
  onEmpty,
  emptyMessage = "You're all caught up!",
}: SwipeDeckProps) {
  const [index, setIndex] = useState(0);
  const [deltaX, setDeltaX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const startXRef = useRef(0);
  const pendingVoteRef = useRef<{ id: string; direction: SwipeDirection } | null>(null);

  const currentItem = useMemo(() => items[index] ?? null, [items, index]);
  const nextItem = useMemo(() => items[index + 1] ?? null, [items, index]);

  const progress = Math.min(Math.abs(deltaX) / SWIPE_THRESHOLD, 1);
  const rotation = Math.max(-MAX_ROTATION, Math.min(MAX_ROTATION, deltaX / 12));

  const triggerSwipe = useCallback(
    (direction: SwipeDirection) => {
      if (isExiting || !currentItem) return;

      pendingVoteRef.current = { id: currentItem.id, direction };

      const exitDistance =
        typeof window !== 'undefined' ? window.innerWidth * 0.75 : 600;

      setIsExiting(true);
      setDeltaX(direction === 'LIKE' ? exitDistance : -exitDistance);
    },
    [currentItem, isExiting]
  );

  const advance = useCallback(() => {
    if (pendingVoteRef.current) {
      onVote(pendingVoteRef.current.id, pendingVoteRef.current.direction);
      pendingVoteRef.current = null;
    }

    setIndex((prev) => {
      const next = prev + 1;
      if (next >= items.length) {
        onEmpty?.();
      }
      return next;
    });

    setDeltaX(0);
    setIsExiting(false);
  }, [items.length, onEmpty, onVote]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isExiting || !currentItem) return;
    if (e.button !== 0) return;

    e.currentTarget.setPointerCapture(e.pointerId);
    startXRef.current = e.clientX;
    setIsDragging(true);
    setDeltaX(0);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !currentItem) return;
    setDeltaX(e.clientX - startXRef.current);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !currentItem) return;

    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    setIsDragging(false);

    const dx = e.clientX - startXRef.current;

    if (dx > SWIPE_THRESHOLD) {
      triggerSwipe('LIKE');
    } else if (dx < -SWIPE_THRESHOLD) {
      triggerSwipe('PASS');
    } else {
      setDeltaX(0);
      pendingVoteRef.current = null;
    }
  };

  const handleTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.propertyName === 'transform') {
      advance();
    }
  };

  if (!currentItem) {
    return (
      <div className="flex w-full max-w-md flex-col items-center justify-center rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-lg font-medium text-zinc-700 dark:text-zinc-200">
          {emptyMessage}
        </p>
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-6 p-4 select-none">
      <div className="relative w-full aspect-[2/3] max-h-[28rem]">
        {nextItem && (
          <div
            className="absolute inset-0 rounded-3xl bg-zinc-100 shadow-lg dark:bg-zinc-800"
            style={{
              transform: `scale(${0.92 + progress * 0.08})`,
              opacity: 0.5 + progress * 0.5,
            }}
          >
            <CardContent item={nextItem} interactive={false} />
          </div>
        )}

        <div
          key={currentItem.id}
          className={[
            'absolute inset-0 z-10 flex flex-col rounded-3xl border border-zinc-200 bg-white shadow-2xl will-change-transform dark:border-zinc-800 dark:bg-zinc-900',
            isDragging ? 'cursor-grabbing' : 'cursor-grab',
            isExiting ? 'pointer-events-none' : 'pointer-events-auto',
          ].join(' ')}
          style={{
            touchAction: 'pan-y',
            transform: `translateX(${deltaX}px) rotate(${rotation}deg)`,
            transition: isDragging
              ? 'none'
              : 'transform 300ms cubic-bezier(0.25, 1, 0.5, 1)',
          }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onTransitionEnd={handleTransitionEnd}
        >
          <CardContent item={currentItem} />

          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-between p-6">
            <span
              className="rounded-lg border-4 border-red-500/80 px-3 py-1 text-4xl font-black uppercase tracking-widest text-red-500/80 -rotate-12"
              style={{ opacity: deltaX < 0 ? progress : 0 }}
            >
              Pass
            </span>
            <span
              className="rounded-lg border-4 border-emerald-500/80 px-3 py-1 text-4xl font-black uppercase tracking-widest text-emerald-500/80 rotate-12"
              style={{ opacity: deltaX > 0 ? progress : 0 }}
            >
              Like
            </span>
          </div>
        </div>
      </div>

      <div className="flex w-full items-center justify-center gap-6">
        <button
          type="button"
          aria-label="Pass"
          disabled={isExiting}
          onClick={() => triggerSwipe('PASS')}
          className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-zinc-300 bg-white text-2xl font-bold text-zinc-700 shadow-md transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
        >
          ✕
        </button>

        <button
          type="button"
          aria-label="Like"
          disabled={isExiting}
          onClick={() => triggerSwipe('LIKE')}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-2xl font-bold text-white shadow-md shadow-emerald-500/30 transition-transform hover:scale-105 active:scale-95 disabled:opacity-50"
        >
          ♥
        </button>
      </div>
    </div>
  );
}

interface CardContentProps {
  item: SwipeMedia;
  interactive?: boolean;
}

function CardContent({ item, interactive = true }: CardContentProps) {
  const posterUrl = getPosterUrl(item.posterPath, 'w500');

  return (
    <div
      className={[
        'flex h-full flex-col overflow-hidden rounded-3xl',
        interactive ? '' : 'pointer-events-none',
      ].join(' ')}
    >
      <div className="relative h-[58%] w-full shrink-0 bg-zinc-200 dark:bg-zinc-800">
        {posterUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={posterUrl}
            alt={`${item.title} poster`}
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center p-6 text-center">
            <span className="text-lg font-semibold text-zinc-500 dark:text-zinc-400">
              {item.title}
            </span>
          </div>
        )}

        {item.rating !== undefined && item.rating > 0 && (
          <div className="absolute right-3 top-3 inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-sm font-bold text-amber-800 shadow-sm dark:bg-amber-900/40 dark:text-amber-200">
            ★ {item.rating.toFixed(1)}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col justify-between gap-3 p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold leading-tight text-zinc-900 dark:text-zinc-50">
            {item.title}
          </h2>

          {item.releaseYear && (
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              {item.releaseYear}
            </p>
          )}
        </div>

        <p className="text-sm leading-relaxed text-zinc-600 line-clamp-4 dark:text-zinc-300">
          {item.overview || 'No overview available.'}
        </p>
      </div>
    </div>
  );
}

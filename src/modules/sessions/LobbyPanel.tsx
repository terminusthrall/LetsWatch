'use client';

import { useEffect, useState } from 'react';
import { getPosterUrl } from '@/lib/poster';
import type { MediaSearchResponse, MediaSearchResult, SessionMedia } from '@/types/api';

interface LobbyPanelProps {
  sessionId: string;
  isHost: boolean;
  mediaPool: SessionMedia[];
  participantCount: number;
  joinCode: string | null;
  onStart: () => Promise<void>;
  onMediaAdded: () => Promise<void>;
}

export default function LobbyPanel({
  sessionId,
  isHost,
  mediaPool,
  participantCount,
  joinCode,
  onStart,
  onMediaAdded,
}: LobbyPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchMediaType, setSearchMediaType] = useState<'movie' | 'tv' | 'both'>('movie');
  const [searchResults, setSearchResults] = useState<MediaSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [addedKeys, setAddedKeys] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!query) return;

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(
          `/api/media/search?query=${encodeURIComponent(query)}&mediaType=${searchMediaType}`,
          { credentials: 'same-origin' }
        );
        const data = (await res.json()) as MediaSearchResponse;
        setSearchResults(data.results ?? []);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, searchMediaType]);

  const handleAdd = async (item: MediaSearchResult) => {
    const key = `${item.mediaType}-${item.tmdbId}`;
    setError(null);
    setAddingId(key);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(item),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error || 'Failed to add title');
      }

      setAddedKeys((current) => new Set(current).add(key));
      await onMediaAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add title');
    } finally {
      setAddingId(null);
    }
  };

  const handleStart = async () => {
    setError(null);
    setIsStarting(true);
    try {
      await onStart();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start session');
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <section className="flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-zinc-200 bg-white p-6 text-center shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Waiting Room
        </h2>
        {joinCode && (
          <div className="mx-auto flex w-fit flex-col items-center gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Join Code
            </span>
            <span className="rounded-lg bg-zinc-100 px-4 py-2 font-mono text-2xl font-bold tracking-[0.25em] text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50">
              {joinCode}
            </span>
          </div>
        )}
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          {participantCount} participant{participantCount === 1 ? '' : 's'} · {mediaPool.length} title{mediaPool.length === 1 ? '' : 's'} in the pool
        </p>
        {isHost ? (
          <button
            type="button"
            onClick={handleStart}
            disabled={isStarting || mediaPool.length === 0}
            className="rounded-xl bg-emerald-500 px-6 py-3 text-base font-semibold text-white shadow-md shadow-emerald-500/30 transition hover:bg-emerald-600 disabled:opacity-60"
          >
            {isStarting ? 'Starting…' : 'Start Session'}
          </button>
        ) : (
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            Waiting for the host to start…
          </p>
        )}
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Add movies or shows to the pool
          </span>
          <div className="flex gap-2">
            {(['movie', 'tv', 'both'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setSearchMediaType(type)}
                aria-pressed={searchMediaType === type}
                className={[
                  'rounded-lg border px-3 py-1.5 text-xs font-semibold transition',
                  searchMediaType === type
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
                ].join(' ')}
              >
                {type === 'both' ? 'Both' : type === 'movie' ? 'Movies' : 'TV'}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search titles, genres, providers…"
            className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
        </div>

        {isSearching && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Searching…</p>
        )}

        {searchQuery.trim().length > 0 && searchResults.length > 0 && (
          <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
            {searchResults.map((item) => {
              const key = `${item.mediaType}-${item.tmdbId}`;
              const isAdding = addingId === key;
              const isAdded =
                addedKeys.has(key) ||
                mediaPool.some(
                  (media) =>
                    media.mediaType === item.mediaType &&
                    media.tmdbId === item.tmdbId
                );

              return (
                <div
                  key={key}
                  className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-800"
                >
                  {item.posterPath ? (
                    <img
                      src={getPosterUrl(item.posterPath, 'w92') ?? undefined}
                      alt={item.title}
                      className="h-16 w-11 rounded-md object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-11 items-center justify-center rounded-md bg-zinc-200 text-xs text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">
                      N/A
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      {item.title}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {item.releaseYear} · {item.mediaType === 'tv' ? 'TV' : 'Movie'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAdd(item)}
                    disabled={isAdding || isAdded}
                    className="rounded-lg bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
                  >
                    {isAdding ? 'Adding…' : isAdded ? '✓ Added' : 'Add'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {mediaPool.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Pool ({mediaPool.length})
            </span>
            <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
              {mediaPool.map((item) => (
                <div
                  key={`pool-${item.id}`}
                  className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-2"
                >
                  {item.posterPath ? (
                    <img
                      src={getPosterUrl(item.posterPath, 'w92') ?? undefined}
                      alt={item.title}
                      className="h-16 w-11 rounded-md object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-11 items-center justify-center rounded-md bg-zinc-200 text-xs text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">
                      N/A
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      {item.title}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {item.releaseYear ?? 'Unknown'} · {item.mediaType === 'tv' ? 'TV' : 'Movie'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-200">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}

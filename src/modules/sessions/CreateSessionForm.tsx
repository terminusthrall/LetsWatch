'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getPosterUrl } from '@/lib/poster';

type MediaType = 'movie' | 'tv';

type GenreOption = {
  id: number;
  name: string;
};

type SearchResult = {
  tmdbId: string;
  mediaType: 'movie' | 'tv';
  title: string;
  posterPath: string | null;
  releaseYear: string;
  overview: string;
  genreIds: number[];
  voteAverage: number;
};

type CreateSessionResponse = {
  sessionId: string;
  userId: string;
  title: string;
  status: string;
  deadlineAt: string;
  joinCode: string;
};

const GENRE_OPTIONS: Record<MediaType, GenreOption[]> = {
  movie: [
    { id: 28, name: 'Action' },
    { id: 12, name: 'Adventure' },
    { id: 16, name: 'Animation' },
    { id: 35, name: 'Comedy' },
    { id: 80, name: 'Crime' },
    { id: 99, name: 'Documentary' },
    { id: 18, name: 'Drama' },
    { id: 10751, name: 'Family' },
    { id: 14, name: 'Fantasy' },
    { id: 27, name: 'Horror' },
    { id: 10402, name: 'Music' },
    { id: 9648, name: 'Mystery' },
    { id: 10749, name: 'Romance' },
    { id: 878, name: 'Sci-Fi' },
    { id: 53, name: 'Thriller' },
    { id: 37, name: 'Western' },
  ],
  tv: [
    { id: 10759, name: 'Action & Adventure' },
    { id: 16, name: 'Animation' },
    { id: 35, name: 'Comedy' },
    { id: 80, name: 'Crime' },
    { id: 99, name: 'Documentary' },
    { id: 18, name: 'Drama' },
    { id: 10751, name: 'Family' },
    { id: 10762, name: 'Kids' },
    { id: 9648, name: 'Mystery' },
    { id: 10764, name: 'Reality' },
    { id: 10765, name: 'Sci-Fi & Fantasy' },
    { id: 10766, name: 'Soap' },
    { id: 10767, name: 'Talk' },
    { id: 10768, name: 'War & Politics' },
    { id: 37, name: 'Western' },
  ],
};

const POOL_TYPES = [
  { id: 'trending_movies', label: 'Trending Movies' },
  { id: 'top_tv', label: 'Top TV Shows' },
  { id: 'sci_fi_action', label: 'Sci-Fi / Action' },
  { id: 'custom', label: 'Custom Search List' },
  { id: 'host_titles', label: 'My Own Titles' },
];

const DEADLINE_OPTIONS: { id: string; label: string }[] = [
  { id: '1h', label: '1 Hour' },
  { id: '3h', label: '3 Hours' },
  { id: 'tonight9pm', label: 'Tonight at 9 PM' },
  { id: '24h', label: '24 Hours' },
  { id: 'custom', label: 'Custom' },
];

function computeDeadlineAt(deadlineOption: string, customDeadline: string): string {
  const now = new Date();
  switch (deadlineOption) {
    case '1h':
      return new Date(now.getTime() + 60 * 60 * 1000).toISOString();
    case '3h':
      return new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString();
    case '24h':
      return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    case 'tonight9pm': {
      const target = new Date();
      target.setHours(21, 0, 0, 0);
      if (target.getTime() <= now.getTime()) {
        target.setDate(target.getDate() + 1);
      }
      return target.toISOString();
    }
    case 'custom': {
      const d = new Date(customDeadline);
      if (isNaN(d.getTime()) || d.getTime() <= now.getTime()) {
        return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
      }
      return d.toISOString();
    }
    default:
      return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  }
}

export default function CreateSessionForm() {
  const router = useRouter();

  const [displayName, setDisplayName] = useState('');
  const [title, setTitle] = useState('');
  const [initialPoolType, setInitialPoolType] = useState<string>('trending_movies');
  const [searchMediaType, setSearchMediaType] = useState<'movie' | 'tv' | 'both'>('movie');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [customMedia, setCustomMedia] = useState<SearchResult[]>([]);
  const [manualTitles, setManualTitles] = useState<string[]>([]);
  const [manualInput, setManualInput] = useState('');
  const [deadlineOption, setDeadlineOption] = useState<string>('24h');
  const [customDeadline, setCustomDeadline] = useState<string>('');
  const [selectedGenres, setSelectedGenres] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeMediaType: MediaType =
    initialPoolType === 'top_tv' ? 'tv' : 'movie';

  useEffect(() => {
    setSelectedGenres([]);
  }, [initialPoolType]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(
          `/api/media/search?query=${encodeURIComponent(searchQuery)}&mediaType=${searchMediaType}`,
          { method: 'GET' }
        );
        const data = (await res.json()) as { results?: SearchResult[] };
        setSearchResults(data.results ?? []);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, searchMediaType]);

  const toggleGenre = (id: number) => {
    setSelectedGenres((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    );
  };

  const addCustomMedia = (item: SearchResult) => {
    setCustomMedia((prev) =>
      prev.some((m) => m.tmdbId === item.tmdbId && m.mediaType === item.mediaType)
        ? prev
        : [...prev, item]
    );
  };

  const removeCustomMedia = (item: SearchResult) => {
    setCustomMedia((prev) =>
      prev.filter(
        (m) => !(m.tmdbId === item.tmdbId && m.mediaType === item.mediaType)
      )
    );
  };

  const addManualTitle = () => {
    const trimmed = manualInput.trim();
    if (!trimmed) return;
    if (manualTitles.includes(trimmed)) return;
    setManualTitles((prev) => [...prev, trimmed]);
    setManualInput('');
  };

  const removeManualTitle = (index: number) => {
    setManualTitles((prev) => prev.filter((_, i) => i !== index));
  };

  const isCustomSearch = initialPoolType === 'custom';
  const isHostTitles = initialPoolType === 'host_titles';

  const canSubmit = useMemo(() => {
    if (!displayName.trim() || !title.trim()) return false;
    if (isCustomSearch && customMedia.length === 0) return false;
    if (isHostTitles && manualTitles.length === 0) return false;
    return true;
  }, [displayName, title, isCustomSearch, isHostTitles, customMedia.length, manualTitles.length]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!canSubmit) {
      setError('Please fill in all required fields and choose at least one title.');
      return;
    }

    setIsSubmitting(true);

    const deadlineAt = computeDeadlineAt(deadlineOption, customDeadline);

    const body: Record<string, unknown> = {
      displayName: displayName.trim(),
      title: title.trim(),
      deadlineAt,
      initialPoolType,
    };

    if (isCustomSearch) {
      body.customMedia = customMedia.map((m) => ({
        tmdbId: m.tmdbId,
        mediaType: m.mediaType,
        title: m.title,
        posterPath: m.posterPath,
        releaseYear: m.releaseYear,
        overview: m.overview,
      }));
    } else if (isHostTitles) {
      body.customMedia = manualTitles.map((manualTitle) => ({
        tmdbId: null,
        mediaType: 'manual',
        title: manualTitle,
        posterPath: null,
        releaseYear: '',
        overview: '',
      }));
    } else if (activeMediaType) {
      body.mediaType = activeMediaType;
      body.genreIds = selectedGenres;
    }

    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = (await response.json()) as
        | CreateSessionResponse
        | { error?: string };

      if (!response.ok) {
        const errorMessage =
          'error' in data && typeof data.error === 'string'
            ? data.error
            : 'Failed to create session';
        setError(errorMessage);
        return;
      }

      const sessionData = data as CreateSessionResponse;
      router.push(`/session/${sessionData.sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
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
          placeholder="e.g. Cameron"
          maxLength={50}
          required
          className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="title"
          className="text-sm font-semibold text-zinc-700 dark:text-zinc-300"
        >
          Session title
        </label>
        <input
          id="title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Friday Movie Night"
          maxLength={100}
          required
          className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Choose a starting pool
        </span>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {POOL_TYPES.map((pool) => (
            <button
              key={pool.id}
              type="button"
              onClick={() => setInitialPoolType(pool.id)}
              aria-pressed={initialPoolType === pool.id}
              className={[
                'rounded-xl border px-3 py-3 text-sm font-semibold transition',
                initialPoolType === pool.id
                  ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
              ].join(' ')}
            >
              {pool.label}
            </button>
          ))}
        </div>
      </div>

      {!isCustomSearch && !isHostTitles && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Genre filters
          </span>
          <div className="flex flex-wrap gap-2">
            {GENRE_OPTIONS[activeMediaType].map((genre) => {
              const selected = selectedGenres.includes(genre.id);
              return (
                <button
                  key={genre.id}
                  type="button"
                  onClick={() => toggleGenre(genre.id)}
                  aria-pressed={selected}
                  className={[
                    'rounded-full border px-3 py-1.5 text-xs font-medium transition',
                    selected
                      ? 'border-emerald-500 bg-emerald-500 text-white'
                      : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
                  ].join(' ')}
                >
                  {genre.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {isCustomSearch && (
        <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Search TMDB
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
              placeholder="Search titles, genres, providers..."
              className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            />
          </div>

          {isSearching && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Searching...</p>
          )}

          {searchResults.length > 0 && (
            <div className="grid max-h-64 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
              {searchResults.map((item) => (
                <div
                  key={`${item.mediaType}-${item.tmdbId}`}
                  className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900"
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
                    onClick={() => addCustomMedia(item)}
                    className="rounded-lg bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-600"
                  >
                    Add
                  </button>
                </div>
              ))}
            </div>
          )}

          {customMedia.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                Selected ({customMedia.length})
              </span>
              <div className="grid max-h-48 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
                {customMedia.map((item) => (
                  <div
                    key={`selected-${item.mediaType}-${item.tmdbId}`}
                    className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-2 dark:border-emerald-500/30"
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
                      onClick={() => removeCustomMedia(item)}
                      className="rounded-lg bg-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {isHostTitles && (
        <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Add your own titles
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addManualTitle();
                  }
                }}
                placeholder="Type a title and press Add"
                maxLength={255}
                className="flex-1 rounded-xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
              />
              <button
                type="button"
                onClick={addManualTitle}
                className="rounded-xl bg-emerald-500 px-4 py-2 font-semibold text-white hover:bg-emerald-600"
              >
                Add
              </button>
            </div>
          </div>

          {manualTitles.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                Selected ({manualTitles.length})
              </span>
              <div className="grid max-h-48 grid-cols-1 gap-2 overflow-y-auto">
                {manualTitles.map((title, index) => (
                  <div
                    key={`manual-${title}-${index}`}
                    className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 dark:border-emerald-500/30"
                  >
                    <span className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      {title}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeManualTitle(index)}
                      className="rounded-lg bg-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-300"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Deadline
        </span>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {DEADLINE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setDeadlineOption(option.id)}
              aria-pressed={deadlineOption === option.id}
              className={[
                'rounded-xl border px-3 py-3 text-sm font-semibold transition',
                deadlineOption === option.id
                  ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
              ].join(' ')}
            >
              {option.label}
            </button>
          ))}
        </div>
        {deadlineOption === 'custom' && (
          <input
            type="datetime-local"
            value={customDeadline}
            onChange={(e) => setCustomDeadline(e.target.value)}
            className="rounded-xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-200">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting || !canSubmit}
        className="rounded-xl bg-emerald-500 px-6 py-3 text-base font-semibold text-white shadow-md shadow-emerald-500/30 transition hover:bg-emerald-600 disabled:opacity-60"
      >
        {isSubmitting ? 'Creating session...' : 'Create Watch Session'}
      </button>
    </form>
  );
}

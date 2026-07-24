'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type MediaType = 'movie' | 'tv';

type GenreOption = {
  id: number;
  name: string;
};

type CreateSessionResponse = {
  sessionId: string;
  userId: string;
  title: string;
  status: string;
  deadlineAt: string;
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

export default function Home() {
  const router = useRouter();

  const [displayName, setDisplayName] = useState('');
  const [title, setTitle] = useState('');
  const [mediaType, setMediaType] = useState<MediaType>('movie');
  const [selectedGenres, setSelectedGenres] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedGenres([]);
  }, [mediaType]);

  const toggleGenre = (id: number) => {
    setSelectedGenres((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!displayName.trim() || !title.trim()) {
      setError('Display name and session title are required.');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: displayName.trim(),
          title: title.trim(),
          mediaType,
          genreIds: selectedGenres,
          deadlineHours: 24,
        }),
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
    <main className="flex min-h-full flex-1 flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-xl rounded-3xl border border-zinc-200 bg-white p-8 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            LetsWatch
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Create a watch session and find something everyone loves.
          </p>
        </div>

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
              Media type
            </span>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMediaType('movie')}
                aria-pressed={mediaType === 'movie'}
                className={[
                  'rounded-xl border px-4 py-3 text-sm font-semibold transition',
                  mediaType === 'movie'
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
                ].join(' ')}
              >
                Movies
              </button>
              <button
                type="button"
                onClick={() => setMediaType('tv')}
                aria-pressed={mediaType === 'tv'}
                className={[
                  'rounded-xl border px-4 py-3 text-sm font-semibold transition',
                  mediaType === 'tv'
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
                ].join(' ')}
              >
                TV Shows
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Genre filters
            </span>
            <div className="flex flex-wrap gap-2">
              {GENRE_OPTIONS[mediaType].map((genre) => {
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
            {isSubmitting ? 'Creating session...' : 'Create Watch Session'}
          </button>
        </form>
      </div>
    </main>
  );
}

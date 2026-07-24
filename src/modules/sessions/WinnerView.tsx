'use client';

import { getPosterUrl } from '@/modules/tmdb';

type WinningMedia = {
  id: string;
  tmdbId: string;
  mediaType: string;
  title: string;
  posterPath: string | null;
  releaseYear: string | null;
  overview: string | null;
  voteAverage: number | null;
  watchUrl?: string;
};

function JustWatchBadge({ title, watchUrl }: { title: string; watchUrl?: string }) {
  const url =
    watchUrl ??
    `https://www.justwatch.com/us/search?q=${encodeURIComponent(title)}`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-red-500 to-pink-500 px-4 py-2 text-sm font-semibold text-white shadow-md transition hover:from-red-600 hover:to-pink-600"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
      Watch on JustWatch
    </a>
  );
}

export default function WinnerView({ media }: { media: WinningMedia }) {
  const posterUrl = getPosterUrl(media.posterPath, 'w500');

  return (
    <div className="flex w-full max-w-3xl flex-col items-center rounded-3xl border border-zinc-200 bg-white p-6 text-center shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 md:p-10">
      <div className="mb-4 inline-flex items-center rounded-full bg-emerald-100 px-4 py-1 text-sm font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
        Winner
      </div>

      <h2 className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50 md:text-4xl">
        {media.title}
      </h2>

      <div className="mt-2 flex items-center justify-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
        {media.releaseYear && <span>{media.releaseYear}</span>}
        {media.releaseYear && <span>·</span>}
        <span className="capitalize">{media.mediaType}</span>
      </div>

      {media.posterPath && posterUrl && (
        <div className="mt-6 w-full max-w-xs overflow-hidden rounded-2xl shadow-xl">
          <img
            src={posterUrl}
            alt={media.title}
            className="h-auto w-full"
            loading="eager"
          />
        </div>
      )}

      {typeof media.voteAverage === 'number' && (
        <div className="mt-6 flex items-center justify-center gap-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          <span className="text-yellow-500">★</span>
          <span>{media.voteAverage.toFixed(1)}</span>
          <span className="text-sm font-normal text-zinc-500 dark:text-zinc-400">
            / 10
          </span>
        </div>
      )}

      <p className="mt-6 max-w-xl text-base leading-relaxed text-zinc-600 dark:text-zinc-300">
        {media.overview ?? 'No overview available.'}
      </p>

      <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row">
        <JustWatchBadge title={media.title} watchUrl={media.watchUrl} />
      </div>
    </div>
  );
}

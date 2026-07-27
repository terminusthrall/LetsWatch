const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

function getApiToken(): string {
  if (typeof window !== 'undefined') {
    throw new Error('@/modules/tmdb can only be used on the server');
  }

  const token = process.env.TMDB_API_KEY;
  if (!token) {
    throw new Error('TMDB_API_KEY environment variable is not set');
  }

  return token;
}

async function fetchFromTMDB<T>(
  path: string,
  params?: URLSearchParams
): Promise<T> {
  const token = getApiToken();
  const query = params ? `?${params.toString()}` : '';
  const url = `${TMDB_BASE_URL}${path}${query}`;

  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`TMDB API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export interface TMDBMovie {
  id: number;
  title: string;
  release_date: string;
  poster_path: string | null;
  overview: string;
  vote_average: number;
  genre_ids?: number[];
}

export interface TMDBTV {
  id: number;
  name: string;
  first_air_date: string;
  poster_path: string | null;
  overview: string;
  vote_average: number;
  genre_ids?: number[];
}

export interface TMDBResponse<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

export interface SessionMediaRecord {
  tmdbId: string;
  mediaType: 'movie' | 'tv';
  title: string;
  posterPath: string | null;
  releaseYear: string;
  overview: string;
  genreIds?: number[];
  voteAverage?: number;
}

export async function discoverMovies(options: {
  page?: number;
  language?: string;
  sort_by?: string;
  with_genres?: string;
  year?: number;
} = {}): Promise<TMDBResponse<TMDBMovie>> {
  const params = new URLSearchParams();
  if (options.page) params.append('page', options.page.toString());
  if (options.language) params.append('language', options.language);
  if (options.sort_by) params.append('sort_by', options.sort_by);
  if (options.with_genres) params.append('with_genres', options.with_genres);
  if (options.year) params.append('year', options.year.toString());

  return fetchFromTMDB('/discover/movie', params);
}

export async function discoverTV(options: {
  page?: number;
  language?: string;
  sort_by?: string;
  with_genres?: string;
  first_air_date_year?: number;
} = {}): Promise<TMDBResponse<TMDBTV>> {
  const params = new URLSearchParams();
  if (options.page) params.append('page', options.page.toString());
  if (options.language) params.append('language', options.language);
  if (options.sort_by) params.append('sort_by', options.sort_by);
  if (options.with_genres) params.append('with_genres', options.with_genres);
  if (options.first_air_date_year)
    params.append('first_air_date_year', options.first_air_date_year.toString());

  return fetchFromTMDB('/discover/tv', params);
}

export async function searchMovies(
  query: string,
  options: {
    page?: number;
    language?: string;
    include_adult?: boolean;
    year?: number;
  } = {}
): Promise<TMDBResponse<TMDBMovie>> {
  const params = new URLSearchParams();
  params.append('query', query);
  if (options.page) params.append('page', options.page.toString());
  if (options.language) params.append('language', options.language);
  if (typeof options.include_adult === 'boolean')
    params.append('include_adult', String(options.include_adult));
  if (options.year) params.append('year', options.year.toString());

  return fetchFromTMDB('/search/movie', params);
}

export async function searchTV(
  query: string,
  options: {
    page?: number;
    language?: string;
    include_adult?: boolean;
    first_air_date_year?: number;
  } = {}
): Promise<TMDBResponse<TMDBTV>> {
  const params = new URLSearchParams();
  params.append('query', query);
  if (options.page) params.append('page', options.page.toString());
  if (options.language) params.append('language', options.language);
  if (typeof options.include_adult === 'boolean')
    params.append('include_adult', String(options.include_adult));
  if (options.first_air_date_year)
    params.append('first_air_date_year', options.first_air_date_year.toString());

  return fetchFromTMDB('/search/tv', params);
}

export interface TMDBMovieDetails extends TMDBMovie {
  runtime?: number;
  genres?: Array<{ id: number; name: string }>;
  status?: string;
}

export interface TMDBTVDetails extends TMDBTV {
  number_of_seasons?: number;
  genres?: Array<{ id: number; name: string }>;
  status?: string;
}

export async function getMovieDetails(
  tmdbId: string
): Promise<TMDBMovieDetails> {
  return fetchFromTMDB(`/movie/${tmdbId}`);
}

export async function getTVDetails(tmdbId: string): Promise<TMDBTVDetails> {
  return fetchFromTMDB(`/tv/${tmdbId}`);
}

export function getMediaDetails(
  mediaType: string,
  tmdbId: string
): Promise<TMDBMovieDetails | TMDBTVDetails> {
  return mediaType === 'tv' ? getTVDetails(tmdbId) : getMovieDetails(tmdbId);
}

export function mapMovieToSessionMedia(
  movie: TMDBMovie,
  options?: { includeDetails?: boolean }
): SessionMediaRecord {
  const record: SessionMediaRecord = {
    tmdbId: movie.id.toString(),
    mediaType: 'movie',
    title: movie.title,
    posterPath: movie.poster_path,
    releaseYear: movie.release_date ? movie.release_date.substring(0, 4) : '',
    overview: movie.overview,
  };

  if (options?.includeDetails) {
    record.genreIds = movie.genre_ids ?? [];
    record.voteAverage = movie.vote_average ?? 0;
  }

  return record;
}

export function mapTVToSessionMedia(
  tv: TMDBTV,
  options?: { includeDetails?: boolean }
): SessionMediaRecord {
  const record: SessionMediaRecord = {
    tmdbId: tv.id.toString(),
    mediaType: 'tv',
    title: tv.name,
    posterPath: tv.poster_path,
    releaseYear: tv.first_air_date ? tv.first_air_date.substring(0, 4) : '',
    overview: tv.overview,
  };

  if (options?.includeDetails) {
    record.genreIds = tv.genre_ids ?? [];
    record.voteAverage = tv.vote_average ?? 0;
  }

  return record;
}

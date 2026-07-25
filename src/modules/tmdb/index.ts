const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

export interface TMDBMovie {
  id: number;
  title: string;
  release_date: string;
  poster_path: string | null;
  overview: string;
  vote_average: number;
}

export interface TMDBTV {
  id: number;
  name: string;
  first_air_date: string;
  poster_path: string | null;
  overview: string;
  vote_average: number;
}

export interface TMDBResponse<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

export interface SessionMediaRecord {
  tmdbId: string;
  mediaType: string;
  title: string;
  posterPath: string | null;
  releaseYear: string;
  overview: string;
}

function buildBaseParams(): URLSearchParams {
  if (typeof window !== 'undefined') {
    throw new Error('@/modules/tmdb can only be used on the server');
  }

  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    throw new Error('TMDB_API_KEY environment variable is not set');
  }

  const params = new URLSearchParams();
  params.append('api_key', apiKey);
  return params;
}

export async function discoverMovies(options: {
  page?: number;
  language?: string;
  sort_by?: string;
  with_genres?: string;
  year?: number;
} = {}): Promise<TMDBResponse<TMDBMovie>> {
  const params = buildBaseParams();
  
  if (options.page) params.append('page', options.page.toString());
  if (options.language) params.append('language', options.language);
  if (options.sort_by) params.append('sort_by', options.sort_by);
  if (options.with_genres) params.append('with_genres', options.with_genres);
  if (options.year) params.append('year', options.year.toString());

  const response = await fetch(`${TMDB_BASE_URL}/discover/movie?${params}`);
  
  if (!response.ok) {
    throw new Error(`TMDB API error: ${response.statusText}`);
  }

  return await response.json();
}

export async function discoverTV(options: {
  page?: number;
  language?: string;
  sort_by?: string;
  with_genres?: string;
  first_air_date_year?: number;
} = {}): Promise<TMDBResponse<TMDBTV>> {
  const params = buildBaseParams();
  
  if (options.page) params.append('page', options.page.toString());
  if (options.language) params.append('language', options.language);
  if (options.sort_by) params.append('sort_by', options.sort_by);
  if (options.with_genres) params.append('with_genres', options.with_genres);
  if (options.first_air_date_year) params.append('first_air_date_year', options.first_air_date_year.toString());

  const response = await fetch(`${TMDB_BASE_URL}/discover/tv?${params}`);
  
  if (!response.ok) {
    throw new Error(`TMDB API error: ${response.statusText}`);
  }

  return await response.json();
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

export async function getMovieDetails(tmdbId: string): Promise<TMDBMovieDetails> {
  const params = buildBaseParams();
  const response = await fetch(`${TMDB_BASE_URL}/movie/${tmdbId}?${params}`);

  if (!response.ok) {
    throw new Error(`TMDB API error: ${response.statusText}`);
  }

  return await response.json();
}

export async function getTVDetails(tmdbId: string): Promise<TMDBTVDetails> {
  const params = buildBaseParams();
  const response = await fetch(`${TMDB_BASE_URL}/tv/${tmdbId}?${params}`);

  if (!response.ok) {
    throw new Error(`TMDB API error: ${response.statusText}`);
  }

  return await response.json();
}

export function getMediaDetails(
  mediaType: string,
  tmdbId: string
): Promise<TMDBMovieDetails | TMDBTVDetails> {
  return mediaType === 'tv' ? getTVDetails(tmdbId) : getMovieDetails(tmdbId);
}

export function mapMovieToSessionMedia(movie: TMDBMovie): SessionMediaRecord {
  return {
    tmdbId: movie.id.toString(),
    mediaType: 'movie',
    title: movie.title,
    posterPath: movie.poster_path,
    releaseYear: movie.release_date ? movie.release_date.substring(0, 4) : '',
    overview: movie.overview,
  };
}

export function mapTVToSessionMedia(tv: TMDBTV): SessionMediaRecord {
  return {
    tmdbId: tv.id.toString(),
    mediaType: 'tv',
    title: tv.name,
    posterPath: tv.poster_path,
    releaseYear: tv.first_air_date ? tv.first_air_date.substring(0, 4) : '',
    overview: tv.overview,
  };
}

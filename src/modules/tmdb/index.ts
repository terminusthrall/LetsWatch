const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

const TMDB_API_KEY = process.env.TMDB_API_KEY;

if (!TMDB_API_KEY) {
  throw new Error('TMDB_API_KEY environment variable is required');
}

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
  const params = new URLSearchParams();
  params.append('api_key', TMDB_API_KEY!);
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

export function getPosterUrl(path: string | null, size: string = 'w342'): string | null {
  if (!path) return null;
  return `${TMDB_IMAGE_BASE_URL}/${size}${path}`;
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

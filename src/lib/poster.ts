const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p';

export function getPosterUrl(
  path: string | null,
  size: string = 'w342'
): string | null {
  if (!path) return null;
  return `${TMDB_IMAGE_BASE_URL}/${size}${path}`;
}

import { NextRequest, NextResponse } from 'next/server';
import {
  searchMovies,
  searchTV,
  mapMovieToSessionMedia,
  mapTVToSessionMedia,
  type TMDBTV,
} from '@/modules/tmdb';
import { type MediaSearchResult, type MediaSearchResponse } from '@/types/api';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query')?.trim() ?? '';
    const mediaType = searchParams.get('mediaType') ?? 'movie';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const genreIds = (searchParams.get('genreIds') ?? '')
      .split(',')
      .filter(Boolean)
      .map((n) => parseInt(n, 10))
      .filter((n) => !isNaN(n));

    if (!query) {
      return NextResponse.json<MediaSearchResponse>({ results: [] });
    }

    let results: MediaSearchResult[] = [];

    if (mediaType === 'tv') {
      const tv = await searchTV(query, { page });
      results = tv.results.map(
        (item) =>
          mapTVToSessionMedia(item, { includeDetails: true }) as MediaSearchResult
      );
    } else if (mediaType === 'movie' || mediaType === 'both') {
      const [movies, tv] = await Promise.all([
        searchMovies(query, { page }),
        mediaType === 'both' ? searchTV(query, { page }) : Promise.resolve({ results: [] as TMDBTV[] }),
      ]);
      results = [
        ...movies.results.map(
          (item) =>
            mapMovieToSessionMedia(item, { includeDetails: true }) as MediaSearchResult
        ),
        ...tv.results.map(
          (item) =>
            mapTVToSessionMedia(item, { includeDetails: true }) as MediaSearchResult
        ),
      ];
    } else {
      return NextResponse.json(
        { error: 'Invalid mediaType. Use movie, tv, or both.' },
        { status: 400 }
      );
    }

    if (genreIds.length > 0) {
      results = results.filter((item) =>
        item.genreIds.some((id) => genreIds.includes(id))
      );
    }

    return NextResponse.json<MediaSearchResponse>({ results });
  } catch (error) {
    console.error('Error searching media:', error);
    return NextResponse.json(
      { error: 'Failed to search media' },
      { status: 500 }
    );
  }
}

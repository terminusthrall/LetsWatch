import { describe, expect, it } from 'vitest';
import { addSessionMediaBodySchema } from './api';

describe('addSessionMediaBodySchema', () => {
  it('accepts TMDB metadata and preserves additional fields', () => {
    const result = addSessionMediaBodySchema.safeParse({
      tmdbId: '123',
      mediaType: 'movie',
      title: 'Test Movie',
      posterPath: '/poster.jpg',
      releaseYear: '2026',
      overview: 'Overview',
      genreIds: [28, 878],
      voteAverage: 8.2,
      popularity: 100,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.genreIds).toEqual([28, 878]);
      expect(result.data.voteAverage).toBe(8.2);
      expect(result.data.popularity).toBe(100);
    }
  });

  it('rejects invalid TMDB metadata types', () => {
    const result = addSessionMediaBodySchema.safeParse({
      tmdbId: '123',
      mediaType: 'movie',
      title: 'Test Movie',
      genreIds: ['28'],
      voteAverage: '8.2',
    });

    expect(result.success).toBe(false);
  });
});

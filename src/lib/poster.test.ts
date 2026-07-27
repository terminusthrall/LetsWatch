import { describe, it, expect } from 'vitest';
import { getPosterUrl } from './poster';

describe('getPosterUrl', () => {
  it('returns null for a null path', () => {
    expect(getPosterUrl(null)).toBeNull();
  });

  it('uses the default w342 size', () => {
    expect(getPosterUrl('/poster.jpg')).toBe(
      'https://image.tmdb.org/t/p/w342/poster.jpg'
    );
  });

  it('uses a custom size', () => {
    expect(getPosterUrl('/poster.jpg', 'w500')).toBe(
      'https://image.tmdb.org/t/p/w500/poster.jpg'
    );
  });
});

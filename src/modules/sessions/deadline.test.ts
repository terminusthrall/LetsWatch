import { describe, it, expect } from 'vitest';
import { computeDeadlineAt } from './deadline';

describe('computeDeadlineAt', () => {
  it('adds 1 hour for the 1h option', () => {
    const now = new Date(2026, 6, 26, 12, 0, 0);
    const result = computeDeadlineAt('1h', '', now);
    expect(new Date(result).getTime()).toBe(now.getTime() + 60 * 60 * 1000);
  });

  it('adds 24 hours for the 24h option', () => {
    const now = new Date(2026, 6, 26, 12, 0, 0);
    const result = computeDeadlineAt('24h', '', now);
    expect(new Date(result).getTime()).toBe(now.getTime() + 24 * 60 * 60 * 1000);
  });

  it('sets deadline to 9 PM today when now is before 9 PM', () => {
    const now = new Date(2026, 6, 26, 12, 0, 0);
    const result = computeDeadlineAt('tonight9pm', '', now);
    const expected = new Date(2026, 6, 26, 21, 0, 0);
    expect(new Date(result).getTime()).toBe(expected.getTime());
  });

  it('sets deadline to 9 PM tomorrow when now is after 9 PM', () => {
    const now = new Date(2026, 6, 26, 22, 0, 0);
    const result = computeDeadlineAt('tonight9pm', '', now);
    const expected = new Date(2026, 6, 27, 21, 0, 0);
    expect(new Date(result).getTime()).toBe(expected.getTime());
  });

  it('uses a valid custom deadline', () => {
    const now = new Date(2026, 6, 26, 12, 0, 0);
    const custom = '2026-08-01T18:00:00.000Z';
    const result = computeDeadlineAt('custom', custom, now);
    expect(result).toBe(new Date(custom).toISOString());
  });

  it('falls back to 24 hours for an invalid custom deadline', () => {
    const now = new Date(2026, 6, 26, 12, 0, 0);
    const result = computeDeadlineAt('custom', 'not-a-date', now);
    expect(new Date(result).getTime()).toBe(now.getTime() + 24 * 60 * 60 * 1000);
  });

  it('falls back to 24 hours for an unknown option', () => {
    const now = new Date(2026, 6, 26, 12, 0, 0);
    const result = computeDeadlineAt('unknown', '', now);
    expect(new Date(result).getTime()).toBe(now.getTime() + 24 * 60 * 60 * 1000);
  });
});

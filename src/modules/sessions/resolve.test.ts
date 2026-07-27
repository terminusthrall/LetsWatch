import { describe, it, expect } from 'vitest';
import { resolveEndSession } from './resolve';

describe('resolveEndSession', () => {
  it('completes with the single consensus pick', () => {
    const result = resolveEndSession(
      new Map([
        ['m1', 3],
        ['m2', 1],
        ['m3', 0],
      ]),
      3
    );
    expect(result.newStatus).toBe('COMPLETED');
    expect(result.winningMediaId).toBe('m1');
    expect(result.consensusIds).toEqual(['m1']);
    expect(result.candidateIds).toEqual(['m1']);
  });

  it('completes with the single top pick when no full consensus', () => {
    const result = resolveEndSession(
      new Map([
        ['m1', 2],
        ['m2', 1],
        ['m3', 0],
      ]),
      3
    );
    expect(result.newStatus).toBe('COMPLETED');
    expect(result.winningMediaId).toBe('m1');
    expect(result.topIds).toEqual(['m1']);
  });

  it('goes to head-to-head when two media tie for top likes', () => {
    const result = resolveEndSession(
      new Map([
        ['m1', 2],
        ['m2', 2],
        ['m3', 0],
      ]),
      3
    );
    expect(result.newStatus).toBe('HEAD_TO_HEAD_ACTIVE');
    expect(result.winningMediaId).toBeNull();
    expect(result.candidateIds).toEqual(['m1', 'm2']);
  });

  it('goes to head-to-head when consensus is split across multiple media', () => {
    const result = resolveEndSession(
      new Map([
        ['m1', 3],
        ['m2', 3],
        ['m3', 0],
      ]),
      3
    );
    expect(result.newStatus).toBe('HEAD_TO_HEAD_ACTIVE');
    expect(result.consensusIds).toEqual(['m1', 'm2']);
  });

  it('uses all zero-liked media as head-to-head candidates when no one has voted', () => {
    const result = resolveEndSession(
      new Map([
        ['m1', 0],
        ['m2', 0],
      ]),
      2
    );
    expect(result.newStatus).toBe('HEAD_TO_HEAD_ACTIVE');
    expect(result.topIds).toEqual(['m1', 'm2']);
    expect(result.candidateIds).toEqual(['m1', 'm2']);
  });
});

import { describe, it, expect } from 'vitest';
import { pairKey, generatePairs } from './pairs';

describe('pairKey', () => {
  it('orders ids lexicographically', () => {
    expect(pairKey('b', 'a')).toBe('a:b');
    expect(pairKey('a', 'b')).toBe('a:b');
    expect(pairKey('same', 'same')).toBe('same:same');
  });
});

describe('generatePairs', () => {
  it('generates all unique unordered pairs', () => {
    const items = ['a', 'b', 'c'];
    const pairs = generatePairs(items);
    expect(pairs).toHaveLength(3);
    expect(pairs).toEqual([
      ['a', 'b'],
      ['a', 'c'],
      ['b', 'c'],
    ]);
  });

  it('returns an empty array for fewer than two items', () => {
    expect(generatePairs(['a'])).toEqual([]);
    expect(generatePairs([])).toEqual([]);
  });

  it('works with objects', () => {
    const items = [{ id: '1' }, { id: '2' }, { id: '3' }];
    const pairs = generatePairs(items);
    expect(pairs).toEqual([
      [items[0], items[1]],
      [items[0], items[2]],
      [items[1], items[2]],
    ]);
  });
});

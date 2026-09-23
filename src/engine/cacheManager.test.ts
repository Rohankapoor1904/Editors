import { describe, it, expect } from 'vitest';
import { CacheManager } from './cacheManager';

describe('R26.4 — cache manager budget and LRU', () => {
  it('evicts LRU when budget exceeded and preserves MRU', () => {
    const cache = new CacheManager<string>(10);
    cache.put('a', 'A', 4);
    cache.put('b', 'B', 4);
    expect(cache.keys()).toEqual(['a', 'b']);
    expect(cache.sizeBytes).toBe(8);

    // Touch 'a' to make it MRU, then add 'c' (4 bytes) -> should evict 'b'
    expect(cache.get('a')).toBe('A');
    cache.put('c', 'C', 4);
    expect(cache.has('b')).toBe(false);
    expect(cache.has('a')).toBe(true);
    expect(cache.has('c')).toBe(true);
    expect(cache.keys()).toEqual(['a', 'c']);
    expect(cache.sizeBytes).toBe(8);
  });

  it('rejects oversized entries and validates inputs', () => {
    const cache = new CacheManager<string>(10);
    expect(() => cache.put('', 'x', 4)).toThrow();
    expect(() => cache.put('x', 'x', 20)).toThrow(/exceeds budget/);
    expect(() => new CacheManager(0)).toThrow();
    expect(cache.delete('ghost')).toBe(false);
    cache.put('a', 'A', 5);
    expect(cache.delete('a')).toBe(true);
    expect(cache.sizeBytes).toBe(0);
    cache.put('a', 'A', 4);
    cache.put('b', 'B', 4);
    cache.clear();
    expect(cache.count).toBe(0);
    expect(cache.sizeBytes).toBe(0);
  });
});

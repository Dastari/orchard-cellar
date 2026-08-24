import { describe, expect, it, vi } from 'vitest';
import { ChunkLruCache } from './ground-cache.js';

describe('chunked ground cache', () => {
  it('invalidates only the resource chunk', () => {
    const cache = new ChunkLruCache<number>(64);
    const build = vi.fn(() => 1);
    cache.getOrCreate(0, 0, build);
    cache.getOrCreate(1, 0, build);
    cache.invalidateResource(17, 3);
    cache.getOrCreate(0, 0, build);
    cache.getOrCreate(1, 0, build);
    expect(build).toHaveBeenCalledTimes(3);
  });

  it('evicts the least recently used chunk beyond capacity', () => {
    const cache = new ChunkLruCache<string>(2);
    cache.getOrCreate(0, 0, () => 'a');
    cache.getOrCreate(1, 0, () => 'b');
    cache.getOrCreate(0, 0, () => 'unused');
    cache.getOrCreate(2, 0, () => 'c');
    expect(cache.has(0, 0)).toBe(true);
    expect(cache.has(1, 0)).toBe(false);
    expect(cache.has(2, 0)).toBe(true);
  });
});

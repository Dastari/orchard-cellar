import { describe, expect, it, vi } from 'vitest';
import {
  ChunkLruCache,
  groundCacheCapacityForViewport,
  groundTileInsideTerrain,
} from './ground-cache.js';

describe('chunked ground cache', () => {
  it('leaves unused cells in a partial boundary chunk transparent', () => {
    const terrain = { width: 80, height: 56 };
    expect(groundTileInsideTerrain(terrain, 79, 55)).toBe(true);
    expect(groundTileInsideTerrain(terrain, 80, 55)).toBe(false);
    expect(groundTileInsideTerrain(terrain, 79, 56)).toBe(false);
  });

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

  it('34§6 keeps a 4K minimum-zoom frame resident without evict-then-rebake', () => {
    const viewportWidth = 4096;
    const viewportHeight = 2160;
    const minimumZoom = 1.5;
    const columns = Math.ceil(viewportWidth / minimumZoom / 256) + 1;
    const rows = Math.ceil(viewportHeight / minimumZoom / 256) + 1;
    const cache = new ChunkLruCache<number>(
      groundCacheCapacityForViewport(viewportWidth, viewportHeight, minimumZoom),
    );
    const build = vi.fn((value: number) => value);
    for (let y = 0; y < rows; y += 1) for (let x = 0; x < columns; x += 1) {
      cache.getOrCreate(x, y, () => build(y * columns + x));
    }
    const firstPassBuilds = build.mock.calls.length;
    for (let y = 0; y < rows; y += 1) for (let x = 0; x < columns; x += 1) {
      cache.getOrCreate(x, y, () => build(y * columns + x));
    }
    expect(cache.capacity).toBeGreaterThanOrEqual(columns * rows);
    expect(build).toHaveBeenCalledTimes(firstPassBuilds);
  });
});

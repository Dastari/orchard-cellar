import { describe, expect, it, vi } from 'vitest';
import { IncrementalMapOverviewCache } from './editor-overview-cache.js';
import type { MapEditorOverviewPixels } from './editor-terrain-derivatives.js';

function overview(value: number): MapEditorOverviewPixels {
  return {
    width: 1,
    height: 1,
    layers: {
      combined: Uint8ClampedArray.of(value, 0, 0, 255),
      generated_base: Uint8ClampedArray.of(0, value, 0, 255),
      terrain: Uint8ClampedArray.of(0, 0, value, 255),
    },
  };
}

describe('incremental map overview cache', () => {
  it('materializes one layer per task and rejects stale identities', () => {
    const tasks: (() => void)[] = [];
    const invalidated = vi.fn();
    const disposed: number[] = [];
    const cache = new IncrementalMapOverviewCache(
      (_width, _height, pixels) => pixels[0]! + pixels[1]! + pixels[2]!,
      (image) => disposed.push(image),
      invalidated,
      (task) => { tasks.push(task); return task; },
      () => undefined,
    );
    const first = {};
    const second = {};
    cache.accept(first, overview(1));
    expect(cache.image(first, 'combined')).toBeNull();

    tasks.shift()?.();
    expect(cache.image(first, 'combined')).toBe(1);
    expect(cache.image(first, 'generated_base')).toBeNull();
    expect(invalidated).toHaveBeenCalledTimes(1);

    cache.accept(second, overview(2));
    expect(disposed).toEqual([1]);
    expect(cache.image(first, 'combined')).toBeNull();
    // A callback queued by the old identity must not create stale artwork.
    tasks.shift()?.();
    expect(cache.image(second, 'combined')).toBeNull();
    tasks.shift()?.();
    expect(cache.image(second, 'combined')).toBe(2);
  });

  it('cancels pending work and disposes completed layers exactly once', () => {
    const tasks: (() => void)[] = [];
    const cancelled: unknown[] = [];
    const disposed: number[] = [];
    const cache = new IncrementalMapOverviewCache(
      (_width, _height, pixels) => pixels[0]! + pixels[1]! + pixels[2]!,
      (image) => disposed.push(image),
      () => undefined,
      (task) => { tasks.push(task); return task; },
      (handle) => cancelled.push(handle),
    );
    const identity = {};
    cache.accept(identity, overview(3));
    tasks.shift()?.();
    cache.dispose();
    cache.dispose();

    expect(disposed).toEqual([3]);
    expect(cancelled).toHaveLength(1);
    expect(cache.image(identity, 'combined')).toBeNull();
    tasks.shift()?.();
    expect(disposed).toEqual([3]);
  });
});

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
    expect(disposed).toEqual([]);
    expect(cache.image(first, 'combined')).toBeNull();
    // A callback queued by the old identity must not create stale artwork.
    tasks.shift()?.();
    expect(cache.image(second, 'combined')).toBe(1);
    tasks.shift()?.();
    expect(cache.image(second, 'combined')).toBe(2);
  });

  it('retains backing surfaces and finishes pending layers during a sparse update',()=>{
    const tasks:(()=>void)[]=[],dispose=vi.fn();
    const cache=new IncrementalMapOverviewCache((_w,_h,pixels)=>({value:pixels[0]!}),dispose,()=>{},task=>{tasks.push(task);return task;},()=>{});
    const first={},next={};cache.accept(first,overview(1));tasks.shift()?.();const original=cache.image(first,'combined');
    cache.adoptSparse(next,image=>{image.value=2;});
    expect(cache.image(next,'combined')).toBe(original);expect(original?.value).toBe(2);
    expect(cache.image(next,'terrain')).not.toBeNull();expect(dispose).not.toHaveBeenCalled();
    tasks.shift()?.();expect(cache.image(next,'combined')?.value).toBe(2);cache.dispose();expect(dispose).toHaveBeenCalledTimes(3);
  });

  it('preserves a pending full update before applying a subsequent sparse edit',()=>{
    const tasks:(()=>void)[]=[],dispose=vi.fn();
    const cache=new IncrementalMapOverviewCache((_w,_h,pixels)=>({pixels:pixels.slice()}),dispose,()=>{},task=>{tasks.push(task);return task;},()=>{});
    const first={},second={},third={};cache.accept(first,overview(1));while(tasks.length)tasks.shift()!();
    cache.accept(second,overview(7));
    cache.adoptSparse(third,image=>{image.pixels[3]=128;});
    expect(cache.image(third,'combined')?.pixels).toEqual(Uint8ClampedArray.of(7,0,0,128));
    expect(cache.image(third,'generated_base')?.pixels).toEqual(Uint8ClampedArray.of(0,7,0,128));
    expect(dispose).toHaveBeenCalledTimes(3);tasks.shift()?.();
    expect(cache.image(third,'combined')?.pixels[0]).toBe(7);cache.dispose();
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

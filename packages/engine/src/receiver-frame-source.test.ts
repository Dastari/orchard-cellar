import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReceiverFrameCache, RECEIVER_TINT_PAGE_BYTES, withWorldReceiverLight } from './receiver-frame-source.js';
import { worldAssetFrameSource } from './world-asset-presentation.js';
import type { AssetFrameSource, LoadedAsset } from '@orchard/ui';

afterEach(() => vi.unstubAllGlobals());
function canvasFactory() {
  const created: HTMLCanvasElement[] = [];
  const calls: string[] = [];
  let lost = false;
  vi.stubGlobal('document', { createElement: () => {
    const context = { setTransform: vi.fn(), clearRect: () => calls.push('clear'), drawImage: () => calls.push('draw'), fillRect: vi.fn(),
      save: () => calls.push('save'), restore: () => calls.push('restore'), beginPath: vi.fn(), rect: vi.fn(), clip: () => calls.push('clip'), isContextLost: () => lost };
    const canvas = { width: 0, height: 0, getContext: () => context } as unknown as HTMLCanvasElement;
    created.push(canvas); return canvas;
  } });
  return { created, calls, loseContext: () => { lost = true; } };
}
const source: AssetFrameSource = { image: {} as CanvasImageSource, x: 0, y: 0, width: 16, height: 16 };
const color = (i: number) => ({ r: i & 255, g: (i >> 8) & 255, b: 127 });

describe('bounded shelf-packed receiver tint pages', () => {
  it('shares a page while keeping emissive rectangles and clip scopes separate', () => {
    const { calls } = canvasFactory(); const cache = new ReceiverFrameCache();
    const dim = cache.source(source, color(1));
    const flame = { ...source, emissiveSpans: [2, 3, 4] };
    const bright = cache.source(flame, color(1));
    expect(bright.image).toBe(dim.image); expect(bright.x).toBe(16); expect(dim.x).toBe(0);
    expect(cache.source(flame, color(1))).toBe(bright); expect(cache.source(source, color(1))).toBe(dim);
    expect(calls).toEqual(['save', 'clip', 'clear', 'draw', 'draw', 'restore', 'save', 'clip', 'clear', 'draw', 'draw', 'draw', 'restore']);
    expect(cache.bytes).toBe(RECEIVER_TINT_PAGE_BYTES);
  });
  it('reuses one page across20,000 colours by evicting complete generations', () => {
    const { created } = canvasFactory(), cache = new ReceiverFrameCache();
    for (let i = 0; i < 20_000; i++) cache.source(source, color(i));
    expect(created).toHaveLength(1); expect(cache.allocations).toBe(1); expect(cache.surfaces).toBe(1);
    expect(cache.reuses).toBe(4); expect(cache.builds).toBe(20_000); expect(cache.bytes).toBe(RECEIVER_TINT_PAGE_BYTES);
    cache.reset(); expect(cache.bytes).toBe(0); expect(cache.surfaces).toBe(0);
    expect(created.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
  });
  it('allocates no surfaces or tint entries over600 repeated warm frames', () => {
    const { created } = canvasFactory(), cache = new ReceiverFrameCache();
    const warm = Array.from({ length: 4 }, (_, index) => cache.source(source, color(index)));
    for (let frame = 0; frame < 600; frame++) for (let index = 0; index < 4; index++) expect(cache.source(source, color(index))).toBe(warm[index]);
    expect(created).toHaveLength(1); expect(cache.builds).toBe(4); expect(cache.reuses).toBe(0);
  });
  it('rolls shelves and recycles the least recently used full page generation', () => {
    const { created } = canvasFactory(), cache = new ReceiverFrameCache(RECEIVER_TINT_PAGE_BYTES * 2, 2);
    const large = { ...source, width: 512, height: 2048 };
    const first = cache.source(large, color(1)), second = cache.source(large, color(2));
    expect(cache.source(large, color(1))).toBe(first);
    const third = cache.source(large, color(3));
    expect(third.image).toBe(second.image); expect(third.image).not.toBe(first.image);
    expect(created).toHaveLength(2); expect(cache.reuses).toBe(1);
    const builds = cache.builds;
    expect(cache.source(large, color(2))).not.toBe(second);
    expect(cache.builds).toBe(builds + 1);
    const shelves = new ReceiverFrameCache();
    const left = shelves.source({ ...source, width: 300, height: 10 }, color(1));
    const right = shelves.source({ ...source, width: 200, height: 20 }, color(2));
    const next = shelves.source({ ...source, width: 300, height: 10 }, color(3));
    expect([left.x, left.y, right.x, right.y, next.x, next.y]).toEqual([0, 0, 300, 0, 0, 20]);
  });
  it('rejects undersized budgets/oversized frames without allocating and preserves white passthrough', () => {
    const { created } = canvasFactory();
    for (const budget of [0, RECEIVER_TINT_PAGE_BYTES - 1]) {
      const cache = new ReceiverFrameCache(budget);
      expect(cache.source(source, { r: 255, g: 255, b: 255 })).toBe(source);
      expect(() => cache.source(source, color(1))).toThrow('receiver_frame_budget_exceeded');
    }
    const cache = new ReceiverFrameCache();
    for (const large of [{ ...source, width: 513 }, { ...source, height: 2049 }]) expect(() => cache.source(large, color(1))).toThrow('receiver_frame_budget_exceeded');
    expect(created).toHaveLength(0);
  });
  it('honours a page-count cap even when the byte budget permits more pages', () => {
    canvasFactory(); const cache = new ReceiverFrameCache(RECEIVER_TINT_PAGE_BYTES * 2, 1);
    for (let i = 0; i < 10; i++) cache.source({ ...source, width: 512, height: 2048 }, color(i));
    expect(cache.surfaces).toBe(1); expect(cache.allocations).toBe(1); expect(cache.reuses).toBe(9);
  });
  it('applies persistent palette transforms before mutable receiver tint sources', () => {
    canvasFactory(); const cache = new ReceiverFrameCache();
    const frame = { x: 0, y: 0, width: 16, height: 16, durationTicks: 0 };
    const asset = { image: source.image, metadata: { animations: { base: [frame] } } } as unknown as LoadedAsset;
    const context = {} as CanvasRenderingContext2D;
    const originals: CanvasImageSource[] = [];
    const transform = (input: AssetFrameSource) => { originals.push(input.image); return input; };
    for (let i = 0; i < 10; i++) withWorldReceiverLight(context, cache, color(i), () => worldAssetFrameSource(context, asset, frame, transform));
    expect(originals).toEqual(Array(10).fill(source.image));
  });
  it('rejects a lost page on cache hits and releases its backing before fallback', () => {
    const { loseContext, created } = canvasFactory(), cache = new ReceiverFrameCache();
    cache.source(source, color(1)); loseContext();
    expect(() => cache.source(source, color(1))).toThrow('receiver_frame_surface_unavailable');
    expect(cache.bytes).toBe(0); expect(cache.surfaces).toBe(0); expect(created[0]!.width).toBe(0);
  });
  it('rejects unavailable contexts without retaining a partially allocated page', () => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => null }) });
    const cache = new ReceiverFrameCache();
    expect(() => cache.source(source, color(1))).toThrow('receiver_frame_surface_unavailable');
    expect(cache.bytes).toBe(0); expect(cache.surfaces).toBe(0);
  });
});

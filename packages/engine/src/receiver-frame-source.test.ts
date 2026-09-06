import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReceiverFrameCache, withWorldReceiverLight } from './receiver-frame-source.js';
import { worldAssetFrameSource } from './world-asset-presentation.js';
import type { AssetFrameSource, LoadedAsset } from '@orchard/ui';

afterEach(() => vi.unstubAllGlobals());
function canvasFactory() {
  const created: HTMLCanvasElement[] = [];
  const calls: string[] = [];
  vi.stubGlobal('document', { createElement: () => {
    const context = { setTransform: vi.fn(), clearRect: () => calls.push('clear'), drawImage: () => calls.push('draw'), fillRect: vi.fn() };
    const canvas = { width: 0, height: 0, getContext: () => context } as unknown as HTMLCanvasElement;
    created.push(canvas); return canvas;
  } });
  return { created, calls };
}
const source: AssetFrameSource = { image: {} as CanvasImageSource, x: 0, y: 0, width: 16, height: 16 };
const color = (i: number) => ({ r: i & 255, g: (i >> 8) & 255, b: 127 });

describe('bounded receiver tint surface pool', () => {
  it('separates emissive and ordinary draws of the same atlas rectangle', () => {
    const { calls } = canvasFactory(); const cache = new ReceiverFrameCache();
    const dim = cache.source(source, color(1));
    const flame = { ...source, emissiveSpans: [2, 3, 4] };
    const bright = cache.source(flame, color(1));
    expect(bright.image).not.toBe(dim.image);
    expect(cache.source(flame, color(1))).toBe(bright);
    expect(cache.source(source, color(1))).toBe(dim);
    expect(calls).toEqual(['clear', 'draw', 'draw', 'clear', 'draw', 'draw', 'draw']);
  });
  it('reuses a fixed set across thousands of changing sky/local colours', () => {
    const { created } = canvasFactory();
    const cache = new ReceiverFrameCache();
    for (let i = 0; i < 20_000; i++) cache.source(source, color(i));
    expect(created).toHaveLength(256);
    expect(cache.allocations).toBe(256); expect(cache.surfaces).toBe(256);
    expect(cache.reuses).toBe(20_000 - 256); expect(cache.bytes).toBe(256 * 16 * 16 * 4);
    cache.reset(); expect(cache.bytes).toBe(0); expect(cache.surfaces).toBe(0);
    expect(created.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true);
  });
  it('reuses the least recently used slot and clears old alpha before drawing', () => {
    const { created, calls } = canvasFactory(); const cache = new ReceiverFrameCache(4096, 2);
    const first = cache.source(source,color(1)), second = cache.source(source,color(2));
    expect(cache.source(source,color(1))).toBe(first);
    const third = cache.source(source,color(3));
    expect(third.image).toBe(second.image); expect(third.image).not.toBe(first.image);
    expect(created).toHaveLength(2); expect(calls).toEqual(['clear','draw','draw','clear','draw','draw','clear','draw','draw']);
  });
  it('enforces bytes as well as count when frame sizes change', () => {
    const { created } = canvasFactory(); const cache = new ReceiverFrameCache(4096, 4);
    for (let i=0;i<40;i++) {
      cache.source({ ...source, width: i%5 === 0 ? 32 : 16, height: i%5 === 0 ? 32 : 16 },color(i));
      expect(cache.bytes).toBeLessThanOrEqual(4096); expect(cache.surfaces).toBeLessThanOrEqual(4);
    }
    expect(created.length).toBeLessThanOrEqual(4);
    expect(()=>cache.source({...source,width:64,height:64},color(1))).toThrow('receiver_frame_budget_exceeded');
  });
  it('applies persistent palette transforms before mutable receiver tint sources', () => {
    canvasFactory(); const cache = new ReceiverFrameCache(4096, 1);
    const frame = {x:0,y:0,width:16,height:16,durationTicks:0};
    const asset = { image:source.image, metadata:{animations:{base:[frame]}} } as unknown as LoadedAsset;
    const context = {} as CanvasRenderingContext2D;
    const originals: CanvasImageSource[] = [];
    const transform = (input: AssetFrameSource) => { originals.push(input.image); return input; };
    for (let i=0;i<10;i++) withWorldReceiverLight(context,cache,color(i),()=>worldAssetFrameSource(context,asset,frame,transform));
    expect(originals).toEqual(Array(10).fill(source.image));
  });
  it('rejects lost contexts so the caller can redraw the complete Basic frame', () => {
    vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>({isContextLost:()=>true})})});
    const cache = new ReceiverFrameCache();
    expect(()=>cache.source(source,color(1))).toThrow('receiver_frame_surface_unavailable');
    expect(cache.bytes).toBe(0); cache.reset(); expect(cache.surfaces).toBe(0);
  });
});

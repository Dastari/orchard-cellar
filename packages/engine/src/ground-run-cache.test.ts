import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderOperationCounters, resetRenderOperationCounters, type AssetFrameSource } from '@orchard/ui';
import { GroundRunCache } from './ground-run-cache.js';
import type { GroundRunLightPlane } from './ground-run-light-stamp.js';

function canvas(width = 64, height = 64) {
  const context = { save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(),
    clearRect: vi.fn(), drawImage: vi.fn(), isContextLost: vi.fn(() => false),
    globalCompositeOperation: 'source-over', imageSmoothingEnabled: false };
  const surface = { width, height, getContext: vi.fn(() => context) };
  return { surface: surface as unknown as HTMLCanvasElement, context };
}
function setup() {
  const pages: ReturnType<typeof canvas>[] = [];
  vi.stubGlobal('document', { createElement: () => { const page = canvas(); pages.push(page); return page.surface; } });
  resetRenderOperationCounters(); return pages;
}
function plane(left = 0): GroundRunLightPlane {
  const surface = canvas().surface;
  const pixels = new Uint8ClampedArray(64 * 64 * 4);
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const i = (y * 64 + x) * 4;
    pixels[i] = x * 4 + left; pixels[i + 1] = y * 4; pixels[i + 2] = 100; pixels[i + 3] = 255;
  }
  return { canvas: surface, pixels, revision: 1, left, top: 0, step: 4 };
}
const source = (): AssetFrameSource => ({ image: canvas().surface, x: 0, y: 0, width: 16, height: 16 });
afterEach(() => vi.unstubAllGlobals());

describe('retained ground run sources', () => {
  it('reuses both cap and flat-sprite slots for 600 unchanged frames with zero composites or new surfaces', () => {
    const pages = setup(), cache = new GroundRunCache(), light = plane(), a = source(), b = source();
    const first = cache.source(a, 48, 48, 0, light, true), second = cache.source(b, 64, 48, 0, light, false);
    expect(first.image).not.toBe(second.image); expect(first.x + second.x).toBe(0);
    expect(renderOperationCounters.groundSourceOperations).toBe(6);
    expect(renderOperationCounters.capRunComposites).toBe(1); expect(renderOperationCounters.flatSourceComposites).toBe(1);
    resetRenderOperationCounters(); const bytes = cache.bytes;
    for (let frame = 0; frame < 600; frame++) {
      expect(cache.source(a, 48, 48, 0, light, true)).toBe(first);
      expect(cache.source(b, 64, 48, 0, light, false)).toBe(second);
    }
    expect(pages).toHaveLength(2);
    expect(pages[0]!.context.drawImage).toHaveBeenCalledTimes(3); expect(pages[1]!.context.drawImage).toHaveBeenCalledTimes(3);
    expect(renderOperationCounters.groundSourceOperations).toBe(0);
    expect(renderOperationCounters.capRunComposites + renderOperationCounters.flatSourceComposites).toBe(0);
    expect(renderOperationCounters.groundSourceReuses).toBe(1200);
    expect(cache.bytes).toBe(bytes); expect(cache.bytes).toBeLessThanOrEqual(cache.budgetBytes);
  });

  it('compares local CPU texels after plane changes, including fringe, identity collisions and in-place updates', () => {
    const pages = setup(), cache = new GroundRunCache(), light = plane(), art = source();
    const first = cache.source(art, 48, 48, 0, light, true);
    light.pixels[(50 * 64 + 50) * 4] = 5;
    cache.source(art, 48, 48, 0, { ...light, revision: 2 }, true);
    expect(pages[0]!.context.drawImage).toHaveBeenCalledTimes(3); // changed outside the run's support
    light.pixels[(12 * 64 + 12) * 4] = 17;
    expect(cache.source(art, 48, 48, 0, { ...light, revision: 3 }, true)).toBe(first);
    expect(pages[0]!.context.drawImage).toHaveBeenCalledTimes(6);
    const different = { ...light, revision: 3, pixels: light.pixels.slice() };
    different.pixels[(11 * 64 + 11) * 4] = 23; // smoothing fringe, same revision on another raster
    cache.source(art, 48, 48, 0, different, true);
    expect(pages[0]!.context.drawImage).toHaveBeenCalledTimes(9);
    cache.source(art, 48, 48, 0, { ...different, pixels: different.pixels.slice() }, true);
    expect(pages[0]!.context.drawImage).toHaveBeenCalledTimes(9); // independent proof of equal contents
  });

  it('reuses equal world-aligned samples across raster windows but invalidates boundary and sampling-phase changes', () => {
    const pages = setup(), cache = new GroundRunCache(), art = source();
    cache.source(art, 48, 48, 0, plane(), true);
    cache.source(art, 48, 48, 0, plane(4), true);
    expect(pages[0]!.context.drawImage).toHaveBeenCalledTimes(3);
    cache.source(art, 0, 0, 0, plane(), true);
    cache.source(art, 0, 0, 0, plane(4), true);
    expect(pages.reduce((sum, page) => sum + page.context.drawImage.mock.calls.length, 0)).toBe(9);
    cache.source(art, 48, 48, 0, plane(2), true);
    expect(pages.reduce((sum, page) => sum + page.context.drawImage.mock.calls.length, 0)).toBe(12);
  });

  it('keys exact source rectangles, identity, world placement, level and scale', () => {
    setup(); const cache = new GroundRunCache(), art = source(), light = plane();
    const first = cache.source(art, 48, 48, 0, light, true);
    for (const item of [{ ...art, x: 1 }, { ...art, y: 1 }, source(), { ...art, width: 15 }]) {
      expect(cache.source(item, 48, 48, 0, light, true)).not.toBe(first);
    }
    expect(cache.source(art, 48.125, 48, 0, light, true)).not.toBe(first);
    expect(cache.source(art, 48, 48, 1, light, true)).not.toBe(first);
    expect(cache.source(art, 48, 48, 0, { ...light, step: 2 }, true)).not.toBe(first);
    expect(cache.source(art, 48, 48, 0, light, true)).toBe(first);
  });

  it('reuses an evicted surface, removes its old entry, bounds proof bytes and disposes every surface', () => {
    const pages = setup(), cache = new GroundRunCache(5 * 1024 * 1024), light = plane();
    const a = { ...source(), width: 512, height: 2048 }, b = { ...a, image: canvas().surface };
    const first = cache.source(a, 0, 0, 0, light, true);
    cache.source(b, 0, 0, 0, light, true);
    const again = cache.source(a, 0, 0, 0, light, true);
    expect(again).not.toBe(first); expect(again.image).toBe(first.image);
    expect(cache.diagnostics.evictions).toBe(2); expect(pages).toHaveLength(1);
    expect(cache.bytes).toBeLessThanOrEqual(cache.budgetBytes);
    cache.reset(); expect(cache.bytes).toBe(0); expect(cache.surfaces).toBe(0);
    expect(pages[0]!.surface.width + pages[0]!.surface.height).toBe(0);
  });

  it('releases surfaces on context loss and failed painting; rejects impossible budgets before allocation', () => {
    const pages = setup(), cache = new GroundRunCache(), art = source(), light = plane();
    expect(() => new GroundRunCache(0).source(art, 0, 0, 0, light, true)).toThrow('world_ground_cache_budget_exceeded');
    expect(pages).toHaveLength(0);
    cache.source(art, 0, 0, 0, light, true);
    pages[0]!.context.isContextLost.mockReturnValue(true);
    expect(() => cache.source(art, 0, 0, 0, light, true)).toThrow('world_ground_surface_unavailable');
    expect(cache.bytes).toBe(0);
    cache.source(art, 0, 0, 0, light, true);
    pages[1]!.context.drawImage.mockImplementation(() => { throw new Error('draw failed'); });
    expect(() => cache.source(art, 0, 0, 0, { ...light, left: 4 }, true)).toThrow('world_ground_surface_unavailable');
    expect(cache.bytes).toBe(0);
    expect(pages[1]!.surface.width + pages[1]!.surface.height).toBe(0);
  });
});

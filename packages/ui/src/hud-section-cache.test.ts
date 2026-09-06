import { afterEach, describe, expect, it, vi } from 'vitest';
import { HudCacheKey, HudSectionCache } from './hud-section-cache.js';

function canvasContext() {
  const matrix = { a: 1.25, b: 0, c: 0, d: 1.25, e: 0.375, f: 0.375 };
  const canvas = { width: 800, height: 450 };
  const context = { canvas, getTransform: () => matrix,
    globalAlpha: 1, globalCompositeOperation: 'source-over', filter: 'none',
    setTransform: vi.fn(), clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), drawImage: vi.fn() };
  return { context: context as unknown as CanvasRenderingContext2D, canvas, matrix };
}
function fixture() {
  const source = canvasContext(), target = canvasContext();
  const createElement = vi.fn(() => ({ ...source.canvas, getContext: () => source.context }));
  vi.stubGlobal('document', { createElement });
  const cache = new HudSectionCache(), paint = vi.fn();
  const bounds = { x: 4, y: 2, width: 220, height: 54 };
  const draw = (value: unknown = 'status') => { cache.key.begin(); cache.key.add(value); cache.draw(target.context, bounds, paint); };
  return { source, target, createElement, cache, paint, bounds, draw };
}
afterEach(() => vi.unstubAllGlobals());

describe('ordered HUD section cache', () => {
  it('compares scalar values rather than model identity and notices removed dependencies', () => {
    const key = new HudCacheKey();
    key.begin(); key.add('Orchard').add(4n); expect(key.consume()).toBe(true);
    key.begin(); key.add('Orchard').add(4n); expect(key.consume()).toBe(false);
    key.begin(); key.add('Orchard'); expect(key.consume()).toBe(true);
    key.begin(); key.add('Orchard'); expect(key.consume()).toBe(false);
    key.invalidate(); expect(key.consume()).toBe(true);
  });
  it('reuses 600 stationary frames without a new canvas or paint', () => {
    const f = fixture(); f.draw();
    for (let frame = 0; frame < 600; frame++) f.draw();
    expect(f.paint).toHaveBeenCalledTimes(1);
    expect(f.createElement).toHaveBeenCalledTimes(1);
    expect(f.cache.reuses).toBe(600); expect(f.cache.allocations).toBe(1);
    expect(f.cache.bytes).toBe(800 * 450 * 4);
    expect(f.source.context.setTransform).toHaveBeenCalledWith(1.25, 0, 0, 1.25, 0.375, 0.375);
    expect(f.target.context.drawImage).toHaveBeenLastCalledWith(expect.anything(), 5, 2, 276, 69, 5, 2, 276, 69);
  });
  it('rebuilds on visible state, viewport, transform, geometry and art changes', () => {
    const f = fixture(); f.draw(); f.draw('new zone');
    f.target.canvas.width = 1000; f.draw('new zone');
    f.target.matrix.e = 0.5; f.draw('new zone');
    f.bounds.x = 8; f.draw('new zone');
    f.cache.key.invalidate(); f.draw('new zone');
    expect(f.paint).toHaveBeenCalledTimes(6);
    expect(f.createElement).toHaveBeenCalledTimes(1);
    expect(f.cache.bytes).toBe(1000 * 450 * 4);
  });
  it('uses the direct reference for unsupported context effects, then rebuilds', () => {
    const f = fixture(); f.draw();
    f.target.context.globalAlpha = 0.5; f.draw();
    expect(f.paint).toHaveBeenLastCalledWith(f.target.context);
    f.target.context.globalAlpha = 1; f.draw();
    expect(f.cache.builds).toBe(2);
  });
  it('does not reuse a partial layer after a draw failure', () => {
    const f = fixture(); f.paint.mockImplementationOnce(() => { throw Error('draw failed'); });
    expect(() => f.draw()).toThrow('draw failed');
    f.draw(); expect(f.cache.builds).toBe(1); expect(f.cache.reuses).toBe(0);
    expect(f.source.context.restore).toHaveBeenCalledTimes(2);
  });
  it('releases both backing dimensions and retained keys; disposal is idempotent', () => {
    const f = fixture(); f.draw(); const canvas = f.createElement.mock.results[0]!.value;
    f.cache.dispose(); f.cache.dispose();
    expect(canvas.width).toBe(0); expect(canvas.height).toBe(0); expect(f.cache.bytes).toBe(0);
    f.draw(); expect(f.cache.allocations).toBe(2); expect(f.paint).toHaveBeenCalledTimes(2);
  });
});

describe('HUD artwork and allocation failures', () => {
  it('invalidates stable asset objects when their page identity or revision changes', () => {
    const key = new HudCacheKey();
    const asset = { image: {}, atlasRevision: 1 } as Parameters<HudCacheKey['asset']>[0] & { image: CanvasImageSource; atlasRevision: number };
    key.begin(); key.asset(asset); expect(key.consume()).toBe(true);
    key.begin(); key.asset(asset); expect(key.consume()).toBe(false);
    asset.image = {} as CanvasImageSource; key.begin(); key.asset(asset); expect(key.consume()).toBe(true);
    asset.atlasRevision++; key.begin(); key.asset(asset); expect(key.consume()).toBe(true);
    key.clear(); key.begin(); key.asset(asset); expect(key.consume()).toBe(true);
  });
  it('draws directly and releases a canvas whose context is unavailable', () => {
    const canvas = { width: 300, height: 150, getContext: () => null };
    vi.stubGlobal('document', { createElement: () => canvas });
    const cache = new HudSectionCache(), target = canvasContext(), paint = vi.fn();
    cache.key.begin(); cache.draw(target.context, { x: 0, y: 0, width: 30, height: 20 }, paint);
    expect(paint).toHaveBeenCalledWith(target.context); expect(cache.bytes).toBe(0);
    expect(canvas.width).toBe(0); expect(canvas.height).toBe(0);
  });
});

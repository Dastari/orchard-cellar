import { afterEach, describe, expect, it, vi } from 'vitest';
import { disposeHudDisplayCaches, hudDisplayCacheDiagnostics, registerHudDisplayCache, unregisterHudDisplayCache, type HudDisplayCache } from './hud-display-caches.js';
import { HudSectionCache } from './hud-section-cache.js';

function display(): HTMLCanvasElement { return { width: 1280, height: 720 } as HTMLCanvasElement; }
function disposable(bytes = 100): HudDisplayCache {
  return { bytes, builds: 2, reuses: 7, allocations: 1, dispose: vi.fn() };
}
function target(canvas = display()): CanvasRenderingContext2D {
  return { canvas, getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    globalAlpha: 1, globalCompositeOperation: 'source-over', filter: 'none',
    setTransform: vi.fn(), clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), drawImage: vi.fn() } as unknown as CanvasRenderingContext2D;
}
function draw(cache: HudSectionCache, context: CanvasRenderingContext2D): void {
  cache.key.begin(); cache.key.add('static'); cache.draw(context, { x: 0, y: 0, width: 80, height: 40 }, () => undefined);
}
function backingCanvases() {
  const canvases: HTMLCanvasElement[] = [];
  vi.stubGlobal('document', { createElement: () => {
    const canvas = display(); const context = target(canvas);
    canvas.getContext = vi.fn(() => context) as unknown as HTMLCanvasElement['getContext'];
    canvases.push(canvas); return canvas;
  } });
  return canvases;
}
afterEach(() => vi.unstubAllGlobals());

describe('HUD display cache ownership', () => {
  it('counts three concrete layers and releases all backing pixels on display disposal', () => {
    const canvases = backingCanvases(), context = target();
    const caches = [new HudSectionCache(), new HudSectionCache(), new HudSectionCache()];
    for (const cache of caches) { draw(cache, context); draw(cache, context); }
    expect(hudDisplayCacheDiagnostics(context.canvas)).toEqual({ caches: 3, bytes: 11_059_200, builds: 3, reuses: 3, allocations: 3 });
    disposeHudDisplayCaches(context.canvas); disposeHudDisplayCaches(context.canvas);
    expect(hudDisplayCacheDiagnostics(context.canvas)).toEqual({ caches: 0, bytes: 0, builds: 0, reuses: 0, allocations: 0 });
    expect(canvases.every(canvas => canvas.width === 0 && canvas.height === 0)).toBe(true);
    expect(caches.every(cache => cache.bytes === 0)).toBe(true);
    draw(caches[0]!, context);
    expect(hudDisplayCacheDiagnostics(context.canvas).caches).toBe(1);
  });
  it('transfers ownership when a section is drawn on another display', () => {
    backingCanvases(); const first = target(), second = target(), cache = new HudSectionCache();
    draw(cache, first); draw(cache, second);
    expect(hudDisplayCacheDiagnostics(first.canvas).caches).toBe(0);
    expect(hudDisplayCacheDiagnostics(second.canvas).caches).toBe(1);
    disposeHudDisplayCaches(first.canvas); expect(cache.bytes).toBe(1280 * 720 * 4);
    cache.dispose(); expect(hudDisplayCacheDiagnostics(second.canvas).bytes).toBe(0);
    expect(hudDisplayCacheDiagnostics(second.canvas).caches).toBe(0);
  });
  it('deduplicates registration and attempts every disposable if one fails', () => {
    const canvas = display(), first = disposable(), second = disposable(200);
    vi.mocked(first.dispose).mockImplementation(() => { throw Error('failed cache'); });
    registerHudDisplayCache(canvas, first); registerHudDisplayCache(canvas, first); registerHudDisplayCache(canvas, second);
    expect(hudDisplayCacheDiagnostics(canvas).caches).toBe(2);
    expect(() => disposeHudDisplayCaches(canvas)).toThrow('HUD cache disposal failed');
    expect(first.dispose).toHaveBeenCalledOnce(); expect(second.dispose).toHaveBeenCalledOnce();
    expect(hudDisplayCacheDiagnostics(canvas).caches).toBe(0);
  });
  it('prunes dead weak references at registration, diagnostics and disposal', () => {
    const refs: Array<{ value: HudDisplayCache | undefined; deref: ReturnType<typeof vi.fn> }> = [];
    vi.stubGlobal('WeakRef', class {
      value: HudDisplayCache | undefined;
      readonly deref = vi.fn(() => this.value);
      constructor(value: HudDisplayCache) { this.value = value; refs.push(this); }
    });
    const canvas = display(); registerHudDisplayCache(canvas, disposable());
    refs[0]!.value = undefined;
    const live = disposable(); registerHudDisplayCache(canvas, live);
    expect(refs[0]!.deref).toHaveBeenCalledOnce();
    hudDisplayCacheDiagnostics(canvas); hudDisplayCacheDiagnostics(canvas);
    expect(refs[0]!.deref).toHaveBeenCalledOnce();
    refs[1]!.value = undefined; expect(hudDisplayCacheDiagnostics(canvas).caches).toBe(0);
    const deadCalls = refs[1]!.deref.mock.calls.length;
    expect(hudDisplayCacheDiagnostics(canvas).caches).toBe(0);
    expect(refs[1]!.deref).toHaveBeenCalledTimes(deadCalls);
    registerHudDisplayCache(canvas, disposable()); refs[2]!.value = undefined;
    registerHudDisplayCache(canvas, live); unregisterHudDisplayCache(canvas, live);
    registerHudDisplayCache(canvas, disposable()); refs[4]!.value = undefined;
    disposeHudDisplayCaches(canvas); expect(hudDisplayCacheDiagnostics(canvas).caches).toBe(0);
  });
});

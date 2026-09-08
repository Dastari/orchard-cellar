import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReceiverFrameCache, receiverFrameSource, resetUnlitWorldEffects, setUnlitEffectPresentation, unlitWorldEffectDiagnostics, withWorldReceiverLight } from './receiver-frame-source.js';
import { withWorldFrameEffect, worldFrameEffect } from './world-frame-effect.js';
import { writeWorldEffectPixels } from './world-effect-pixels.js';
import type { AssetFrameSource } from '@orchard/ui';

const white = { r: 255, g: 255, b: 255 };
const original: AssetFrameSource = { image: {} as CanvasImageSource, x: 0, y: 0, width: 16, height: 16 };
function factory() {
  let lost = false, reads = 0, uploads = 0;
  const canvases: { width: number; height: number }[] = [];
  vi.stubGlobal('document', { createElement: () => {
    const canvas = { width: 0, height: 0, getContext: () => ({
      isContextLost: () => lost, setTransform() {}, clearRect() {}, drawImage() {},
      createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      getImageData: (_x: number, _y: number, w: number, h: number) => {
        reads++; return { data: new Uint8ClampedArray(w * h * 4).fill(255) };
      },
      putImageData: () => { uploads++; },
    }) };
    canvases.push(canvas); return canvas;
  } });
  return { canvases, get reads() { return reads; }, get uploads() { return uploads; }, lose: () => { lost = true; } };
}
afterEach(() => { resetUnlitWorldEffects(); vi.unstubAllGlobals(); });
describe('CPU world effect variants', () => {
  it('keeps nested override and throwing draw scopes isolated from other contexts', () => {
    const a = {} as CanvasRenderingContext2D, b = {} as CanvasRenderingContext2D;
    expect(() => withWorldFrameEffect(a, 'enemy-hit', () => {
      expect(worldFrameEffect(b)).toBeUndefined();
      withWorldFrameEffect(a, undefined, () => expect(worldFrameEffect(a)).toBe('enemy-hit'));
      withWorldFrameEffect(a, 'dim', () => expect(worldFrameEffect(a)).toBe('dim'));
      expect(worldFrameEffect(a)).toBe('enemy-hit'); throw new Error('draw');
    })).toThrow('draw');
    expect(worldFrameEffect(a)).toBeUndefined();
  });
  it('clamps brightness before saturation and bakes dim opacity without writing outside the active frame', () => {
    const output = new Uint8ClampedArray(16).fill(19);
    writeWorldEffectPixels(new Uint8ClampedArray([200, 100, 50, 255]), 1, 1, output, 4, white, 'dim');
    expect([...output.slice(0, 4)]).toEqual([68, 45, 34, 224]);
    expect([...output.slice(4)]).toEqual(Array(12).fill(19));
    writeWorldEffectPixels(new Uint8ClampedArray([255, 255, 255, 255]), 1, 1, output, 4, white, 'enemy-hit');
    expect([...output.slice(0, 4)]).toEqual([255, 255, 255, 255]);
  });
  it('reuses decoded original pixels across colours/effects and creates no warm surfaces or uploads', () => {
    const f = factory(), cache = new ReceiverFrameCache();
    const first = cache.source(original, white, 'dim');
    const other = cache.source(original, { r: 60, g: 80, b: 100 }, 'enemy-hit');
    expect(other.image).toBe(first.image); expect(other.x).not.toBe(first.x);
    for (let frame = 0; frame < 600; frame++) {
      expect(cache.source(original, white, 'dim')).toBe(first);
      expect(cache.source(original, { r: 60, g: 80, b: 100 }, 'enemy-hit')).toBe(other);
    }
    expect(f.reads).toBe(1); expect(f.uploads).toBe(2); expect(f.canvases).toHaveLength(2);
    expect(cache.bytes).toBe(12 * 1024 * 1024 + 16 * 16 * 4);
    cache.reset(); expect(cache.bytes).toBe(0); expect(cache.surfaces).toBe(0);
    expect(f.canvases.every(c => c.width === 0 && c.height === 0)).toBe(true);
  });
  it('bounds full-frame decoded source retention and evicts complete effect pages', () => {
    const f = factory(), cache = new ReceiverFrameCache();
    const full = { ...original, width: 512, height: 2048 };
    cache.source(full, white, 'dim');
    cache.source({ ...full, image: {} as CanvasImageSource }, white, 'enemy-hit');
    cache.source(full, white, 'dim');
    expect(f.reads).toBe(3); expect(cache.bytes).toBe(16 * 1024 * 1024);
    expect(f.canvases).toHaveLength(2); expect(cache.reuses).toBe(2);
    cache.reset();
  });
  it('releases omit-derived white effects on cohort/revision changes and accounts receiver effects separately', () => {
    factory(); const context = {} as CanvasRenderingContext2D, pages = {};
    setUnlitEffectPresentation(pages, 1);
    withWorldFrameEffect(context, 'dim', () => receiverFrameSource(context, original));
    expect(unlitWorldEffectDiagnostics().omitBytes).toBeGreaterThan(0);
    const bytes = unlitWorldEffectDiagnostics().bytes;
    setUnlitEffectPresentation(pages, 1); expect(unlitWorldEffectDiagnostics().bytes).toBe(bytes);
    setUnlitEffectPresentation(pages, 2); expect(unlitWorldEffectDiagnostics().bytes).toBe(0);
    const cache = new ReceiverFrameCache();
    withWorldReceiverLight(context, cache, white, () => withWorldFrameEffect(context, 'dim', () => receiverFrameSource(context, original)));
    expect(cache.bytes).toBeGreaterThan(0); expect(unlitWorldEffectDiagnostics().bytes).toBe(0); cache.reset();
    setUnlitEffectPresentation(undefined, 0);
    withWorldFrameEffect(context, 'dim', () => receiverFrameSource(context, original));
    expect(unlitWorldEffectDiagnostics().bytes).toBeGreaterThan(0); expect(unlitWorldEffectDiagnostics().omitBytes).toBe(0);
  });
  it('releases a failed immutable reader as well as its reserved effect page', () => {
    const f = factory(), cache = new ReceiverFrameCache();
    cache.source(original, white, 'dim'); f.lose();
    // A new source rejects the reader during preparation; no effect surface survives.
    expect(() => cache.source({ ...original, image: {} as CanvasImageSource }, white, 'dim')).toThrow('receiver_frame_surface_unavailable');
    expect(cache.bytes).toBe(0);
    expect(f.canvases.every(c => c.width === 0 && c.height === 0)).toBe(true);
  });
});

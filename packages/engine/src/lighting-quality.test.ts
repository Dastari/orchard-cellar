import { describe, expect, it, vi } from 'vitest';
import { compositeBasicLighting, LightingQualityState, readLightingQuality, LIGHTING_QUALITY_KEY, LEGACY_LIGHTING_DISABLED_KEY } from './lighting-quality.js';
import { TileLightmap } from './lighting.js';

describe('lighting quality', () => {
  it.each([
    [null, null, 'dynamic'], [null, 'true', 'basic'], ['invalid', 'true', 'basic'],
    ['dynamic', 'true', 'dynamic'], ['basic', 'false', 'basic'],
  ])('migrates quality %s / legacy %s to %s independently of solver', (value, legacy, expected) => {
    const data = new Map([[LIGHTING_QUALITY_KEY, value], [LEGACY_LIGHTING_DISABLED_KEY, legacy], ['orchard.video.lighting-model', 'unified']]);
    const storage = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
    expect(readLightingQuality(storage)).toBe(expected);
    expect(data.get(LIGHTING_QUALITY_KEY)).toBe(expected);
    expect(data.has(LEGACY_LIGHTING_DISABLED_KEY)).toBe(false);
    expect(data.get('orchard.video.lighting-model')).toBe('unified');
  });

  it('commits only a ready current generation and preserves requested choice on fallback', () => {
    const quality = new LightingQualityState('basic');
    const first = quality.request('dynamic');
    expect(quality.commit(first, false)).toBe(false);
    const second = quality.request('basic');
    expect(quality.commit(first, true)).toBe(false);
    expect(quality.commit(second, false)).toBe(true);
    const third = quality.request('dynamic');
    quality.fallback(third, 'budget-exceeded');
    expect(quality).toMatchObject({ requested: 'dynamic', effective: 'basic', reason: 'budget-exceeded' });
    expect(quality.commit(third, true)).toBe(true);
  });

  it('allocates no Canvas or solver at construction/reset for Basic startup', () => {
    const lightmap = new TileLightmap(); // Node has no document: any allocation fails.
    lightmap.reset();
    expect(lightmap.retainedSurfaceBytes).toBe(0);
    expect(lightmap.floodTexelsVisited).toBe(0);
    expect(lightmap.fieldRebuilds).toBe(0);
  });

  it('uses one bounded opaque multiply and restores state; white is a no-op', () => {
    const context = { save: vi.fn(), restore: vi.fn(), setTransform: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(), fillRect: vi.fn(), globalAlpha: 0.2, filter: 'blur(1px)', globalCompositeOperation: 'screen', fillStyle: '' };
    compositeBasicLighting(context as unknown as CanvasRenderingContext2D, 320, 180, { r: 80, g: 90, b: 120 });
    expect(context.fillRect).toHaveBeenCalledExactlyOnceWith(0, 0, 320, 180);
    expect(context.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
    expect(context.globalCompositeOperation).toBe('multiply');
    expect(context.globalAlpha).toBe(1);
    expect(context.restore).toHaveBeenCalledOnce();
    compositeBasicLighting(context as unknown as CanvasRenderingContext2D, 320, 180, { r: 255, g: 255, b: 255 });
    expect(context.fillRect).toHaveBeenCalledOnce();
  });
});

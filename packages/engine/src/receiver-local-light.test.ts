import { afterEach, describe, expect, it, vi } from 'vitest';
import { TileLightmap } from './lighting.js';
import type { TerrainArray } from './terrain.js';

afterEach(() => vi.unstubAllGlobals());
describe('receiver local RGB fields', () => {
  it('keeps planes and face colours separate and drops stale fields on resize/reset', () => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ({ putImageData: vi.fn() }) }) });
    vi.stubGlobal('ImageData', class { constructor(readonly data: Uint8ClampedArray, readonly width: number, readonly height: number) {} });
    const terrain = { width: 16, height: 16 } as TerrainArray;
    const map = new TileLightmap();
    const lights = [
      { worldX: 48, worldY: 48, receiverDirectionWorldY: 64, radiusTiles: 6, color: { r: 250, g: 100, b: 10 }, elevationLayer: 0 },
      { worldX: 48, worldY: 48, receiverDirectionWorldY: 64, radiusTiles: 6, color: { r: 10, g: 80, b: 240 }, elevationLayer: 1 },
    ];
    map.prepare(terrain, 0, 0, 1, 128, 128, { r: 0, g: 0, b: 0 }, lights, null, 'unified', true);
    const ground = map.sampleReceiverLight(48, 48, 0), upper = map.sampleReceiverLight(48, 48, 1);
    expect(ground.r).toBeGreaterThan(200); expect(ground.b).toBeLessThan(20);
    expect(upper.b).toBeGreaterThan(200); expect(upper.r).toBeLessThan(20);
    const face = map.sampleReceiverLight(48, 48, 0, 'south');
    expect(face.r).toBeGreaterThan(face.b * 10);
    expect(map.sampleReceiverLight(48, 48, 2)).toEqual({ r: 0, g: 0, b: 0 });
    map.prepare(terrain, 0, 0, 1, 192, 192, { r: 0, g: 0, b: 0 }, [lights[0]!], null, 'unified', true);
    expect(map.sampleReceiverLight(48, 48, 1)).toEqual({ r: 0, g: 0, b: 0 });
    map.reset();
    expect(map.sampleReceiverLight(48, 48, 0)).toEqual({ r: 0, g: 0, b: 0 });
  });
});

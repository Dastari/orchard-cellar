import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorldLightingRenderer } from './world-lighting-renderer.js';
import { TileLightmap } from './lighting.js';
import { celestialLightingAtCalendar } from './celestial-lighting.js';
import type { TerrainArray } from './terrain.js';
import type { ReceiverRgbDestination } from './receiver-rgb-sampling.js';

afterEach(() => vi.unstubAllGlobals());
describe('synchronous light-plane sampling', () => {
  it('keeps terrain contact coordinates exact and bounds projection work across 600 moving raster frames', () => {
    const context = { setTransform() {}, clearRect() {}, drawImage() {}, fillRect() {}, putImageData() {},
      save() {}, restore() {}, beginPath() {}, rect() {}, clip() {} };
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
    vi.stubGlobal('ImageData', class {
      readonly data: Uint8ClampedArray;
      constructor(readonly width: number, readonly height: number) { this.data = new Uint8ClampedArray(width * height * 4); }
    });
    const renderer = new WorldLightingRenderer({ width: 20, height: 20, baseDatum: -2 } as TerrainArray);
    const local = new TileLightmap(), levels = [1, 3];
    const offsets = new Map(levels.map(level => [level, renderer.mapper.projectionAtLevel(level)]));
    const projection = vi.spyOn(renderer.mapper, 'projectionAtLevel');
    const outputs = new Set<ReceiverRgbDestination>();
    let cameraX = 0, cameraY = 0, index = 0, total = 0;
    local.sampleReceiverLight = (x, y, level, face, destination) => {
      expect(destination).toBeDefined(); expect(face).toBe('flat');
      const offset = offsets.get(level)!;
      const left = Math.floor(cameraX / 4) * 4 - 4;
      const top = Math.floor((cameraY + offset) / 4) * 4 - 4;
      expect(x).toBe(left + (index % 6 + 0.5) * 4);
      expect(y).toBe(top + (Math.floor(index / 6) + 0.5) * 4 - offset);
      index++; total++; outputs.add(destination!);
      destination!.r = 10; destination!.g = 20; destination!.b = 30;
      return destination!;
    };
    const sky = celestialLightingAtCalendar({ clockHours: 12, continuousDay: 3.5, lunarProgress: 0, lunarIllumination: 1 });
    const source = { image: {} as CanvasImageSource, x: 0, y: 0, width: 8, height: 8 };
    for (let frame = 0; frame < 600; frame++) {
      cameraX = -2.5 + frame / 100; cameraY = 3.25 + frame / 100;
      local.reset(); renderer.begin(sky, [], [], local, cameraX, cameraY, 12, 12, 1);
      for (const level of levels) { index = 0; renderer.groundSource(source, 0, 0, level); expect(index).toBe(36); }
    }
    expect(total).toBe(43_200); expect(outputs.size).toBe(1);
    expect(projection.mock.calls.length).toBeLessThanOrEqual(2_400);
    renderer.reset(); expect(renderer.bytes).toBe(0);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalLightDamage } from './local-light-damage.js';
import { TileLightmap, type PointLight } from './lighting.js';
import type { TerrainArray } from './terrain.js';

const light = (worldX = 40): PointLight => ({ worldX, worldY: 60, radiusTiles: 1, color: { r: 240, g: 100, b: 50 } });
afterEach(() => vi.unstubAllGlobals());
describe('local-light world damage', () => {
  it('retains changed old/new radii, ignores unchanged distant lights, and bounds history and reset ownership', () => {
    const damage = new LocalLightDamage();
    expect(damage.bytes).toBe(0);
    const build = (revision: number, lights: PointLight[], full = false) => damage.rebuild(revision, lights, 0, 0, 256, 256, full);
    build(1, [light(), light(400)], true);
    expect(damage.since(0)).toEqual({ left: 20, top: 40, right: 420, bottom: 80 });
    build(2, [light(), light(400)]);
    expect(damage.since(1)).toEqual({ left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
    build(3, [light(48), light(400)]);
    expect(damage.since(2)).toEqual({ left: 20, top: 40, right: 68, bottom: 80 });
    build(4, [light(48.05), light(400)]);
    expect(damage.since(3)!.right).toBeCloseTo(68.05);
    build(5, [light(48.05)]);
    expect(damage.since(4)).toEqual({ left: 380, top: 40, right: 420, bottom: 80 });
    expect(damage.since(2)!.right).toBe(420);
    const bytes = damage.bytes;
    for (let revision = 6; revision < 600; revision++) build(revision, [light(48 + revision / 100)]);
    expect(damage.bytes).toBe(bytes); expect(damage.since(5)).toBeNull();
    expect(damage.since(599)).toEqual({ left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
    damage.reset(600); expect(damage.bytes).toBe(0); expect(damage.since(599)).toBeNull();
    build(601, Array.from({ length: 4097 }, () => light()));
    expect(damage.since(600)).toBeNull(); expect(damage.bytes).toBe(0);
  });

  it('covers every changed receiver sample for strength, facing, colour, radius, removal and clamped sources', () => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ({ putImageData() {} }) }) });
    vi.stubGlobal('ImageData', class { constructor(readonly data: Uint8ClampedArray, readonly width: number, readonly height: number) {} });
    const map = new TileLightmap(), terrain = { width: 64, height: 64 } as TerrainArray;
    const first = { ...light(96), worldY: 96, radiusTiles: 3, elevationLayer: -1 };
    const second = { ...light(240), worldY: 160, elevationLayer: 0 };
    const cases: PointLight[][] = [
      [first, second], [{ ...first, worldX: 96.25 }, second],
      [{ ...first, strengthPerMille: 1200, facing: 'right' }, second],
      [{ ...first, color: { r: 80, g: 240, b: 40 }, radiusTiles: 5 }, second],
      [second], [{ ...first, worldX: -100, worldY: -100 }, second],
      [{ ...first, worldX: -90, worldY: -90, facing: 'down' }, second], [],
    ];
    const samples = () => {
      const bytes = new Uint8Array(2 * 96 * 96 * 3); let offset = 0;
      for (const level of [-1, 0]) for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
        const color = map.sampleReceiverLight(x * 4 + 2, y * 4 + 2, level);
        bytes[offset++] = color.r; bytes[offset++] = color.g; bytes[offset++] = color.b;
      }
      return bytes;
    };
    let previous = samples(), revision = map.receiverRevision;
    for (const lights of cases) {
      map.prepare(terrain, 64, 64, 1, 256, 256, { r: 0, g: 0, b: 0 }, lights, null, 'unified', true);
      const next = samples(), bounds = map.receiverChangesSince(revision);
      for (let i = 0; i < next.length; i++) if (next[i] !== previous[i] && bounds !== null) {
        const pixel = Math.floor(i / 3) % (96 * 96), x = (pixel % 96) * 4 + 2, y = Math.floor(pixel / 96) * 4 + 2;
        expect(x).toBeGreaterThanOrEqual(bounds.left - 4); expect(x).toBeLessThanOrEqual(bounds.right + 4);
        expect(y).toBeGreaterThanOrEqual(bounds.top - 4); expect(y).toBeLessThanOrEqual(bounds.bottom + 4);
      }
      previous = next; revision = map.receiverRevision;
    }
    for (const [cameraX, viewportWidth] of [[80, 256], [80, 320], [96, 272], [64, 256]]) {
      const hardBlocked = new Uint8Array(64 * 64);
      if (viewportWidth === 320) hardBlocked[10 * 64 + 15] = 1;
      const occlusion = { width: 64, height: 64, hardBlocked, frontFaces: new Uint8Array(64 * 64),
        softObstacles: [], spriteOccluders: [], trunkOccluders: [] };
      map.prepare(terrain, cameraX!, 64, 1, viewportWidth!, 256, { r: 0, g: 0, b: 0 }, cases[0]!, occlusion, 'unified', true);
      const next = samples(), bounds = map.receiverChangesSince(revision);
      expect(bounds).not.toBeNull();
      for (let i = 0; i < next.length; i++) if (next[i] !== previous[i]) {
        const pixel = Math.floor(i / 3) % (96 * 96), x = (pixel % 96) * 4 + 2, y = Math.floor(pixel / 96) * 4 + 2;
        expect(x).toBeGreaterThanOrEqual(bounds!.left - 4); expect(x).toBeLessThanOrEqual(bounds!.right + 4);
        expect(y).toBeGreaterThanOrEqual(bounds!.top - 4); expect(y).toBeLessThanOrEqual(bounds!.bottom + 4);
      }
      previous = next; revision = map.receiverRevision;
    }
    map.reset(); expect(map.retainedSurfaceBytes).toBe(0);
  });
});

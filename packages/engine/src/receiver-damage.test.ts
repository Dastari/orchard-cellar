import { Buffer } from 'node:buffer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { celestialLightingAtCalendar } from './celestial-lighting.js';
import { CelestialReceiverScene, type ReceiverLightRaster } from './receiver-lighting.js';
import { ReceiverRasterMerge } from './receiver-raster-merge.js';
import { createReceiverCoverage } from './receiver-coverage.js';
import { LocalLightDamage } from './local-light-damage.js';
import { TileLightmap, type PointLight } from './lighting.js';
import type { TerrainArray } from './terrain.js';

const sky = celestialLightingAtCalendar({ continuousDay: 3.5, clockHours: 17, lunarProgress: .5, lunarIllumination: 1 });
afterEach(() => vi.unstubAllGlobals());
describe('incremental receiver RGB', () => {
  it('advances a plane local revision only on intersection and still merges distant moving-shadow texels', () => {
    const journal = new LocalLightDamage(); let revision = 1;
    const source = { get receiverRevision() { return revision; }, receiverChangesSince: (since: number) => journal.since(since) };
    const damage = { source, projection: 0 };
    const light = (x: number): PointLight => ({ worldX: x, worldY: 20, radiusTiles: 1, color: { r: 220, g: 80, b: 20 } });
    const raster: ReceiverLightRaster = { left: 0, top: 0, width: 100, height: 20, step: 4, pixels: new Uint8ClampedArray(8000), revision: 0 };
    const coverage = createReceiverCoverage(2000), merge = new ReceiverRasterMerge(2000);
    const sample = vi.fn<(x: number, y: number) => { r: number; g: number; b: number }>(() => ({ r: 0, g: 0, b: 0 }));
    journal.rebuild(revision, [light(600)], 0, 0, 256, 256, true);
    expect(merge.merge(raster, coverage, sky, 1, revision, sample, damage)).toBe(2000);
    const initial = merge.localRevision, uploadRevision = raster.revision;
    sample.mockClear(); revision++;
    journal.rebuild(revision, [light(601)], 0, 0, 256, 256, false);
    expect(merge.merge(raster, coverage, sky, 1, revision, sample, damage)).toBe(0);
    expect(sample).not.toHaveBeenCalled(); expect(merge.localRevision).toBe(initial); expect(raster.revision).toBe(uploadRevision);
    revision++; journal.rebuild(revision, [light(40)], 0, 0, 256, 256, false);
    merge.merge(raster, coverage, sky, 1, revision, sample, damage);
    expect(merge.localRevision).toBe(initial + 1);
    sample.mockClear(); revision++; journal.rebuild(revision, [light(41)], 0, 0, 256, 256, false);
    coverage.contact[90] = 180; // x362 is far outside the moving lamp's support.
    merge.merge(raster, coverage, sky, 1, revision, sample, damage);
    const outside = sample.mock.calls.filter(([x, y]) => x === 362 && y === 2);
    expect(outside).toHaveLength(1);
    expect(sample.mock.calls.length).toBeLessThan(200);
    expect(merge.localRevision).toBe(initial + 2);
    sample.mockClear();
    expect(merge.merge(raster, coverage, sky, 2, revision, sample, damage)).toBe(2000);
    expect(merge.localRevision).toBe(initial + 2); // Sky change is not local-light damage.
  });

  it('retains all four-height camera-route rasters inside the byte budget across 600 revisits', () => {
    const scene = new CelestialReceiverScene(4);
    scene.prepareSplit(sky, [], [], 1);
    let calls = 0; const color = { r: 200, g: 120, b: 80 };
    const local = () => { calls++; return color; };
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < (pass === 0 ? 80 : 600); i++) {
        const key = i % 80, level = key % 4, window = Math.floor(key / 4);
        const raster = scene.rasterizeCached(1, window * 4, 0, 96, 64, level * 4, 4, local);
        expect(raster.revision).toBe(1);
      }
      if (pass === 0) calls = 0;
    }
    expect(calls).toBe(0); expect(scene.diagnostics.rasterAllocations).toBe(80);
    expect(scene.retainedRasterBytes).toBeLessThanOrEqual(16 * 1024 * 1024);
    scene.reset(); expect(scene.retainedRasterBytes).toBe(0);
  });

  it('matches forced-full output across returning camera windows, signed levels, moving shadows and light changes', () => {
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ({ putImageData() {} }) }) });
    vi.stubGlobal('ImageData', class { constructor(readonly data: Uint8ClampedArray, readonly width: number, readonly height: number) {} });
    const terrain = { width: 64, height: 64 } as TerrainArray, map = new TileLightmap();
    const incremental = new CelestialReceiverScene(4), reference = new CelestialReceiverScene(4);
    const caster = { owner: 1, worldX: 280, worldY: 140, baseHeightSubunits: 0, heightSubunits: 8,
      footprint: { left: -6, right: 6, top: -3, bottom: 3 }, contact: true };
    for (let frame = 0; frame < 120; frame++) {
      const lights: PointLight[] = frame % 30 === 29 ? [] : [-1, 0, 1].map(level => ({ worldX: 70 + frame / 4, worldY: 90,
        radiusTiles: frame < 60 ? 2 : 3, color: { r: 220, g: 100 + frame % 10, b: 40 }, elevationLayer: level }));
      map.prepare(terrain, frame % 7 * 4, frame % 3 * 4, 1, 512 + frame % 2 * 16, 320, { r: 0, g: 0, b: 0 }, lights, null, 'unified', true);
      const moving = [{ ...caster, worldX: 280 + frame / 5 }];
      const currentSky = frame < 80 ? sky : { ...sky, diffuse: { ...sky.diffuse, r: sky.diffuse.r - 1 } };
      incremental.prepareSplit(currentSky, [], moving, 1); reference.prepareSplit(currentSky, [], moving, 1);
      for (const level of [-1, 0, 1]) {
        const projection = level * 16, left = (frame % 5) * 4;
        const local = (x: number, y: number) => map.sampleReceiverLight(x, y - projection, level);
        const actual = incremental.rasterizeCached(map.receiverRevision, left, projection, 96, 64, level * 4, 4, local, { source: map, projection });
        const expected = reference.rasterize(left, projection, 96, 64, level * 4, 4, local);
        // Compare all bytes directly; generic deep equality walks millions of
        // typed-array properties under full-suite coverage instrumentation.
        const actualBytes = Buffer.from(actual.pixels.buffer, actual.pixels.byteOffset, actual.pixels.byteLength);
        const expectedBytes = Buffer.from(expected.pixels.buffer, expected.pixels.byteOffset, expected.pixels.byteLength);
        expect(Buffer.compare(actualBytes, expectedBytes), `frame${frame} level${level}`).toBe(0);
      }
    }
    incremental.reset(); reference.reset(); map.reset();
    expect(incremental.retainedRasterBytes + incremental.retainedCoverageBytes + incremental.retainedMaskBytes + map.retainedSurfaceBytes).toBe(0);
  });
});

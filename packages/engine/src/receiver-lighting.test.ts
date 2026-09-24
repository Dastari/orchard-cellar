import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { renderOperationCounters } from '@orchard/ui';
import { celestialLightingAtCalendar } from './celestial-lighting.js';
import { DirectionalShadowCache, sampleDirectionalMask, type DirectionalCaster } from './directional-shadows.js';
import { contactCoverage } from './receiver-coverage.js';
import { CelestialReceiverScene, resolveReceiverLight } from './receiver-lighting.js';
import { LightingNumericKey } from './lighting-numeric-key.js';

const sky = celestialLightingAtCalendar({ continuousDay: 3.5, clockHours: 0, lunarProgress: 0, lunarIllumination: 1 });
const fixed: DirectionalCaster[] = [{ owner: 'tree', worldX: 100, worldY: 100, baseHeightSubunits: 0, heightSubunits: 8,
  footprint: { left: -3, top: -3, right: 3, bottom: 3 }, contact: true }];
const moving: DirectionalCaster = { ...fixed[0]!, owner: 'player', worldX: 120, heightSubunits: 5 };

describe('retained static and moving receiver coverage', () => {
  it('keeps the static plane and its bytes untouched over 600 walking frames inside one retained window', () => {
    const scene = new CelestialReceiverScene(4);
    const actor = [moving];
    scene.prepareSplit(sky, fixed, actor, 77);
    const raster = scene.rasterizeCached(1, 0, 0, 64, 64, 0, 4);
    const first = scene.coverageSnapshot()[0]!;
    const staticBytes = { sun: first.static.sun.slice(), moon: first.static.moon.slice(), contact: first.static.contact.slice() };
    const pixels = raster.pixels.slice(), revision = raster.revision, merges = scene.diagnostics.rgbMerges;
    const warmBuilds = scene.diagnostics.staticCoverageBuilds;
    const warmCounter = renderOperationCounters.coverageFieldRebuilds;
    for (let frame = 0; frame < 600; frame++) {
      actor[0] = { ...moving, worldX: 120 + Math.sin(frame / 60) * 32, worldY: 100 + Math.cos(frame / 60) * 32 };
      scene.prepareSplit(sky, fixed, actor, 77);
      expect(scene.rasterizeCached(1, 0, 0, 64, 64, 0, 4)).toBe(raster);
      expect(scene.actorShadowStamps(raster, 0).length).toBeGreaterThan(0);
    }
    expect(renderOperationCounters.coverageFieldRebuilds - warmCounter).toBe(0);
    expect(scene.diagnostics.staticCoverageBuilds - warmBuilds).toBe(0);
    expect(scene.diagnostics.rgbMerges).toBe(merges); expect(raster.revision).toBe(revision);
    expect(scene.diagnostics.movingCoverageBlits).toBe(0);
    const last = scene.coverageSnapshot()[0]!;
    expect(last.static).toBe(first.static); expect(last.static).toEqual(staticBytes);
    expect(raster.pixels).toEqual(pixels);
    const reference = new CelestialReceiverScene(4);
    reference.prepare(sky, fixed);
    expect(raster.pixels).toEqual(reference.rasterize(0, 0, 64, 64, 0, 4).pixels);
    // A real window change is a separate, legitimate static invalidation.
    scene.rasterizeCached(1, 128, 0, 64, 64, 0, 4);
    expect(scene.diagnostics.staticCoverageBuilds).toBe(warmBuilds + 1);
  });

  it('blits moving actors only into raw GPU fields and removes them when the cohort empties', () => {
    const scene = new CelestialReceiverScene(4);
    scene.prepareSplit(sky, fixed, [moving], 1);
    scene.rasterizeCached(1, 64, 64, 32, 32, 0, 4);
    expect(scene.diagnostics.movingCastersBlitted).toBe(0);
    scene.rawFieldCached(1, 64, 64, 32, 32, 0, 4);
    expect(scene.diagnostics.movingCastersBlitted).toBe(1);
    scene.prepareSplit(sky, fixed, [], 1);
    scene.rawFieldCached(1, 64, 64, 32, 32, 0, 4);
    const coverage = scene.coverageSnapshot()[0]!;
    expect(coverage.working).toEqual(coverage.static);
    expect(scene.diagnostics.staticCoverageBuilds).toBe(1);
    expect(scene.diagnostics.movingCastersBlitted).toBe(1);
  });

  it('reuses RGB storage and changes upload revision only for geometry, local light, or RGB sky changes', () => {
    const scene = new CelestialReceiverScene(4);
    scene.prepareSplit(sky, fixed, [], 1);
    const first = scene.rasterizeCached(1, 0, 0, 40, 40, 0, 4);
    const pixels = first.pixels, revision = first.revision;
    scene.prepareSplit({ ...sky }, fixed, [], 1);
    expect(scene.rasterizeCached(1, 0, 0, 40, 40, 0, 4).revision).toBe(revision);
    expect(scene.rasterizeCached(2, 0, 0, 40, 40, 0, 4, () => ({ r: 255, g: 255, b: 255 })).pixels).toBe(pixels);
    expect(first.revision).toBe(revision + 1);
    expect(first.pixels.every((value) => value === 255)).toBe(true);
    scene.prepareSplit({ ...sky, diffuse: { r: 9, g: 8, b: 7 } }, fixed, [], 1);
    scene.rasterizeCached(2, 0, 0, 40, 40, 0, 4);
    expect(first.revision).toBe(revision + 2);
    expect(scene.diagnostics.staticCoverageBuilds).toBe(1);
  });

  it('retains exact maximum and owner exclusion at fractional receiver and moving positions', () => {
    const scene = new CelestialReceiverScene(4), cache = new DirectionalShadowCache();
    const actor = { ...moving, worldX: 102.375, worldY: 101.25 };
    scene.prepareSplit(sky, fixed, [actor], 1); scene.rasterizeCached(1, 64, 64, 32, 32, 0, 4);
    const casters = [...fixed, actor];
    for (let y = 90; y < 108; y += 0.75) for (let x = 90; x < 108; x += 0.75) for (const owner of [undefined, 'tree', 'player']) {
      let sun = 0, moon = 0, contact = 0;
      for (const caster of casters) {
        if (caster.owner === owner) continue;
        sun = Math.max(sun, sampleDirectionalMask(cache.get(caster, sky.sun, 0, 4), caster, x, y));
        moon = Math.max(moon, sampleDirectionalMask(cache.get(caster, sky.moon, 0, 4), caster, x, y));
        contact = Math.max(contact, contactCoverage(caster, x, y, 0));
      }
      expect(scene.sample({ worldX: x, worldY: y, heightSubunits: 0, receiver: 'flat', owner })).toEqual(resolveReceiverLight(sky, 'flat', 1 - sun, 1 - moon, undefined, contact));
    }
  });

  it('prepares a new sun angle across frames, then crossfades it in quantized merges', () => {
    let now = 0;
    const scene = new CelestialReceiverScene(4, undefined, undefined, { budgetMs: 0, fadeMs: 800, fadeSteps: 4, clock: () => now });
    const trees = Array.from({ length: 6 }, (_, index) => ({ ...fixed[0]!, owner: index, worldX: 40 + index * 24, heightSubunits: 16 }));
    const morning = celestialLightingAtCalendar({ continuousDay: 3.5, clockHours: 9, lunarProgress: 0, lunarIllumination: 1 });
    const afternoon = celestialLightingAtCalendar({ continuousDay: 3.5, clockHours: 15, lunarProgress: 0, lunarIllumination: 1 });
    // Same RGB, different geometry: only the angle transition may change bytes.
    const moved = { ...morning, sun: { ...morning.sun, direction: afternoon.sun.direction, altitude: afternoon.sun.altitude } };
    scene.prepareSplit(morning, trees, [], 1);
    const before = scene.rasterizeCached(1, 0, 0, 64, 64, 0, 4).pixels.slice();
    const mergesBefore = scene.diagnostics.rgbMerges, buildsBefore = scene.diagnostics.staticCoverageBuilds;
    let frames = 0;
    while (scene.diagnostics.geometrySwaps === 0) {
      const builds = scene.cache.builds;
      scene.prepareSplit(moved, trees, [], 1);
      expect(scene.cache.builds - builds).toBeLessThanOrEqual(2);
      if (scene.diagnostics.geometrySwaps === 0) expect(scene.rasterizeCached(1, 0, 0, 64, 64, 0, 4).pixels).toEqual(before);
      expect(++frames).toBeLessThan(20);
    }
    // One caster per frame for masks, one clear, then one caster per frame blitted.
    expect(frames).toBe(trees.length * 2 + 1);
    expect(scene.diagnostics.geometryBlittedCasters).toBe(trees.length);
    // The swap flips buffers: no synchronous coverage build or RGB merge.
    expect(scene.rasterizeCached(1, 0, 0, 64, 64, 0, 4).pixels).toEqual(before);
    expect(scene.diagnostics.rgbMerges).toBe(mergesBefore);
    expect(scene.diagnostics.staticCoverageBuilds).toBe(buildsBefore);
    const reference = new CelestialReceiverScene(4);
    reference.prepare(moved, trees);
    const final = reference.rasterize(0, 0, 64, 64, 0, 4).pixels;
    expect(final).not.toEqual(before);
    const merges = scene.diagnostics.rgbMerges, seen: Uint8ClampedArray[] = [];
    for (let frame = 1; frame <= 40; frame++) {
      now += 25; scene.prepareSplit(moved, trees, [], 1);
      seen.push(scene.rasterizeCached(1, 0, 0, 64, 64, 0, 4).pixels.slice());
    }
    expect(scene.diagnostics.rgbMerges - merges).toBe(4);
    expect(scene.diagnostics.geometryFadeSteps).toBe(4);
    // The unchanged step-zero view plus four distinct blend steps.
    expect(new Set(seen.map((pixels) => pixels.reduce((sum, value, index) => sum + value * (index + 1), 0))).size).toBe(5);
    expect(seen.at(-1)).toEqual(final);
    // Target plus the recycled fade buffers are retained for the next angle.
    expect(scene.retainedCoverageBytes).toBe(64 * 64 * 3 * 3);
    // A new static set has nothing to fade from and is adopted immediately.
    scene.prepareSplit(morning, trees.slice(1), [], 2);
    expect(scene.diagnostics.geometrySwaps).toBe(1);
    const adopted = new CelestialReceiverScene(4);
    adopted.prepare(morning, trees.slice(1));
    expect(scene.rasterizeCached(1, 0, 0, 64, 64, 0, 4).pixels).toEqual(adopted.rasterize(0, 0, 64, 64, 0, 4).pixels);
  });

  it('cancels height preparation when a moving generation changes and releases every retained byte', async () => {
    const scene = new CelestialReceiverScene(4);
    scene.prepareSplit(sky, Array.from({ length: 12 }, (_, index) => ({ ...fixed[0]!, worldX: index * 16 })), [moving], 1);
    expect(await scene.prepareHeights([0, 4], async () => scene.prepareSplit(sky, fixed, [{ ...moving, worldX: 121 }], 1))).toBe(false);
    scene.reset();
    expect(scene.retainedMaskBytes + scene.retainedRasterBytes + scene.retainedCoverageBytes).toBe(0);
  });

  it('uses numeric lookup keys with no string formatting in the begin/sample or mask key paths', () => {
    let stringKeys = 0, numericKeys = 0;
    const scene = new CelestialReceiverScene(4, undefined, (key) => { if (typeof key === 'string') stringKeys++; else numericKeys++; });
    for (let frame = 0; frame < 20; frame++) {
      scene.prepareSplit(sky, fixed, [{ ...moving, worldX: 120 + frame / 16 }], 1);
      scene.rasterizeCached(1, 0, 0, 40, 40, 0, 4);
      scene.sample({ worldX: 100, worldY: 100, heightSubunits: 0, receiver: 'south', owner: 'tree' });
    }
    expect(stringKeys).toBe(0); expect(numericKeys).toBeGreaterThan(0);
    for (const filename of ['receiver-lighting.ts', 'directional-shadows.ts', 'lighting-numeric-key.ts']) {
      const source = readFileSync(new URL(filename, import.meta.url), 'utf8');
      expect(source).not.toMatch(/`|\.join\(|\bString\(|\.toString\(/);
    }
    const key = new LightingNumericKey().add(0.125).add(2);
    expect(key.matches([0.125, 2])).toBe(true); expect(key.matches([0.126, 2])).toBe(false);
    expect(key.matches([0.125])).toBe(false);
  });

  it('checks full numeric tuples when deliberately colliding every mask hash', () => {
    const add = LightingNumericKey.prototype.add;
    const collision = vi.spyOn(LightingNumericKey.prototype, 'add').mockImplementation(function (this: LightingNumericKey, value: number) {
      add.call(this, value); this.hash = 1; return this;
    });
    try {
      const cache = new DirectionalShadowCache();
      const first = cache.get(fixed[0]!, sky.moon, 0, 4);
      const other = { ...fixed[0]!, footprint: { left: -8, top: -3, right: 8, bottom: 3 } };
      const second = cache.get(other, sky.moon, 0, 4);
      expect(second).not.toBe(first);
      expect(cache.get(fixed[0]!, sky.moon, 0, 4)).toBe(first);
      expect(cache.get(other, sky.moon, 0, 4)).toBe(second);
      expect(cache.builds).toBe(2);
      const scene = new CelestialReceiverScene(4);
      scene.prepare(sky, fixed);
      const near = scene.rasterizeCached(1, 90, 90, 4, 4, 0);
      const far = scene.rasterizeCached(1, 190, 190, 4, 4, 0);
      expect(near).not.toBe(far);
      expect(scene.rasterizeCached(1, 90, 90, 4, 4, 0)).toBe(near);
      expect(scene.diagnostics.staticCoverageBuilds).toBe(2);
    } finally { collision.mockRestore(); }
  });

});

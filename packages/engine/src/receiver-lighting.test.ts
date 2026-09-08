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
  it('preserves static bytes and every backing array over 600 walking frames inside one retained window', () => {
    const scene = new CelestialReceiverScene(4);
    const actor = [moving];
    scene.prepareSplit(sky, fixed, actor, 77);
    const raster = scene.rasterizeCached(1, 0, 0, 64, 64, 0, 4);
    const first = scene.coverageSnapshot()[0]!;
    const staticBytes = { sun: first.static.sun.slice(), moon: first.static.moon.slice(), contact: first.static.contact.slice() };
    const reference = new CelestialReceiverScene(4);
    const warmBuilds = scene.diagnostics.staticCoverageBuilds;
    const warmCounter = renderOperationCounters.coverageFieldRebuilds;
    for (let frame = 0; frame < 600; frame++) {
      actor[0] = { ...moving, worldX: 120 + Math.sin(frame / 60) * 32, worldY: 100 + Math.cos(frame / 60) * 32 };
      scene.prepareSplit(sky, fixed, actor, 77);
      expect(scene.rasterizeCached(1, 0, 0, 64, 64, 0, 4)).toBe(raster);
    }
    expect(renderOperationCounters.coverageFieldRebuilds - warmCounter).toBe(0);
    expect(scene.diagnostics.staticCoverageBuilds - warmBuilds).toBe(0);
    expect(scene.diagnostics.movingCoverageBlits).toBe(601);
    expect(scene.diagnostics.movingCastersBlitted).toBe(601);
    const last = scene.coverageSnapshot()[0]!;
    expect(last.static).toBe(first.static); expect(last.working).toBe(first.working);
    expect(last.static).toEqual(staticBytes);
    reference.prepare(sky, [...fixed, ...actor]);
    expect(raster.pixels).toEqual(reference.rasterize(0, 0, 64, 64, 0, 4).pixels);
    // Viewport changes inside the padded static field reuse its exact texels.
    scene.rasterizeCached(1, 64, 0, 64, 64, 0, 4);
    expect(scene.diagnostics.staticCoverageBuilds).toBe(warmBuilds);
    scene.rasterizeCached(1, 128, 0, 64, 64, 0, 4);
    expect(scene.diagnostics.staticCoverageBuilds).toBe(warmBuilds + 1);
  });

  it('blits only moving actors and removes the previous moving contact/shadow when the cohort empties', () => {
    const scene = new CelestialReceiverScene(4);
    scene.prepareSplit(sky, fixed, [moving], 1);
    scene.rasterizeCached(1, 64, 64, 32, 32, 0, 4);
    expect(scene.diagnostics.movingCastersBlitted).toBe(1);
    scene.prepareSplit(sky, fixed, [], 1);
    scene.rasterizeCached(1, 64, 64, 32, 32, 0, 4);
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
      expect(scene.diagnostics.staticCoverageBuilds).toBe(1);
    } finally { collision.mockRestore(); }
  });

});

import { describe, expect, it } from 'vitest';
import { celestialLightingAtCalendar } from './celestial-lighting.js';
import { DirectionalShadowCache, type DirectionalCaster } from './directional-shadows.js';
import { blitReceiverCoverage, createReceiverCoverage, type ReceiverCoverageBounds } from './receiver-coverage.js';
import { PaddedStaticCoverage } from './receiver-static-coverage.js';
import { CelestialReceiverScene } from './receiver-lighting.js';

const sky = celestialLightingAtCalendar({ continuousDay: 3.5, clockHours: 0, lunarProgress: 0, lunarIllumination: 1 });
const casters: DirectionalCaster[] = Array.from({ length: 24 }, (_, i) => ({ owner: i,
  worldX: (i % 6) * 39 - 85.375, worldY: Math.floor(i / 6) * 29 - 40.75,
  baseHeightSubunits: i % 2 ? -4 : 0, heightSubunits: 8,
  footprint: { left: -7, right: 7, top: -3, bottom: 3 }, contact: true }));
const cache = new DirectionalShadowCache();
const prepared = (level: number) => casters.map(caster => ({ caster,
  sun: cache.get(caster, sky.sun, level, 4), moon: cache.get(caster, sky.moon, level, 4) }));

function direct(bounds: ReceiverCoverageBounds) {
  const channels = createReceiverCoverage(bounds.width * bounds.height);
  blitReceiverCoverage(channels, prepared(bounds.receiverHeight), bounds);
  return channels;
}

describe('padded static coverage windows', () => {
  it('copies exact direct-blit texels across 600 moving windows and rebuilds only on 64px bucket crossings', () => {
    const retained = new PaddedStaticCoverage(), target = createReceiverCoverage(32 * 24);
    let lastBuilds = 0, lastBucket = Number.NaN;
    const items = prepared(0);
    for (let frame = 0; frame < 600; frame++) {
      const left = -256 + (frame % 192) * 4;
      const bounds = { left, top: -64, width: 32, height: 24, step: 4, receiverHeight: 0 };
      expect(retained.copyInto(target, bounds, items)).toBe(true);
      expect(target).toEqual(direct(bounds));
      if (retained.builds !== lastBuilds) expect(Math.floor(left / 64)).not.toBe(lastBucket);
      lastBuilds = retained.builds; lastBucket = Math.floor(left / 64);
      expect(retained.bytes).toBeLessThanOrEqual(retained.budgetBytes);
    }
    expect(retained.builds).toBeLessThan(12);
    retained.reset(); expect(retained.bytes).toBe(0);
  });

  it('preserves signed heights and both axes and falls back for incompatible sample phases or oversized padding', () => {
    const retained = new PaddedStaticCoverage();
    for (const level of [-4, 0, 4]) for (const step of [1, 2, 4, 8]) {
      for (const [left, top] of [[-128, -192], [-64, -128], [0, 0], [64, 128], [192, 256]]) {
        const bounds = { left: left!, top: top!, width: 16, height: 12, step, receiverHeight: level };
        const target = createReceiverCoverage(16 * 12);
        expect(retained.copyInto(target, bounds, prepared(level))).toBe(true);
        expect(target).toEqual(direct(bounds));
      }
    }
    const target = createReceiverCoverage(4);
    expect(retained.copyInto(target, { left: .25, top: 0, width: 2, height: 2, step: 4, receiverHeight: 0 }, prepared(0))).toBe(false);
    expect(retained.copyInto(target, { left: 0, top: 0, width: 2, height: 2, step: 3, receiverHeight: 0 }, prepared(0))).toBe(false);
    expect(new PaddedStaticCoverage(1).copyInto(target, { left: 0, top: 0, width: 2, height: 2, step: 4, receiverHeight: 0 }, prepared(0))).toBe(false);
  });

  it('evicts padded fields within its byte budget without retaining stale crops', () => {
    const retained = new PaddedStaticCoverage(40_000), items = prepared(0);
    const target = createReceiverCoverage(16 * 12);
    for (let i = 0; i < 20; i++) {
      const bounds = { left: i * 1024, top: 0, width: 16, height: 12, step: 4, receiverHeight: 0 };
      expect(retained.copyInto(target, bounds, items)).toBe(true);
      expect(target).toEqual(direct(bounds));
      expect(retained.bytes).toBeLessThanOrEqual(40_000);
    }
    expect(retained.builds).toBe(20);
    const original = { left: 0, top: 0, width: 16, height: 12, step: 4, receiverHeight: 0 };
    expect(retained.copyInto(target, original, items)).toBe(true);
    expect(target).toEqual(direct(original)); expect(retained.builds).toBe(21);
  });

  it('invalidates for static identity and sky geometry, retains for moving/RGB changes, and resets all storage', () => {
    const scene = new CelestialReceiverScene(4);
    const raster = () => scene.rasterizeCached(1, 0, 0, 32, 24, 0, 4);
    scene.prepareSplit(sky, casters, [], 1); raster();
    const initial = scene.diagnostics.staticCoverageBuilds;
    scene.prepareSplit({ ...sky, diffuse: { r: 5, g: 10, b: 20 } }, casters, [casters[0]!], 1); raster();
    expect(scene.diagnostics.staticCoverageBuilds).toBe(initial);
    scene.prepareSplit(sky, casters, [], 2); raster();
    expect(scene.diagnostics.staticCoverageBuilds).toBe(initial + 1);
    const daytime = celestialLightingAtCalendar({ continuousDay: 3.5, clockHours: 12, lunarProgress: 0, lunarIllumination: 1 });
    scene.prepareSplit(daytime, casters, [], 2); raster();
    expect(scene.diagnostics.staticCoverageBuilds).toBe(initial + 2);
    expect(scene.retainedCoverageBytes).toBeGreaterThan(32 * 24 * 6);
    scene.reset(); expect(scene.retainedCoverageBytes + scene.retainedRasterBytes + scene.retainedMaskBytes).toBe(0);
  });
});

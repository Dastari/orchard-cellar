import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { celestialLightingAtCalendar } from './celestial-lighting.js';
import { DirectionalShadowCache, type DirectionalCaster } from './directional-shadows.js';
import { blitReceiverCoverage, createReceiverCoverage } from './receiver-coverage.js';
import { StaticMaskSamples } from './receiver-static-mask-samples.js';
import { PaddedStaticCoverage } from './receiver-static-coverage.js';

const sky = celestialLightingAtCalendar({ clockHours: 17, continuousDay: 3.5, lunarProgress: .5, lunarIllumination: 1 });
const caster = (x: number, y: number): DirectionalCaster => ({ owner: 1, worldX: x, worldY: y,
  baseHeightSubunits: 0, heightSubunits: 12, contact: true,
  footprint: { left: -7, right: 9, top: -4, bottom: 1 } });

describe('exact retained static mask samples', () => {
  it('matches direct area sampling across signed translations, half-pixel phases, steps, heights and viewport clipping', () => {
    const masks = new DirectionalShadowCache(), samples = new StaticMaskSamples(1024 * 1024);
    const opaque = Uint8Array.from({ length: 7 * 9 }, (_, i) => i % 4 === 0 ? 0 : 1);
    for (const x of [-10000.5, -29, -.5, 0, .5, 31, 10000.5]) for (const step of [1, 2, 4, 8]) {
      for (const height of [-4, 0, 4]) for (const silhouette of [undefined, { width: 7, height: 9, anchorX: 3.5, anchorY: 8, opaque }]) {
        const body = { ...caster(x, x + 12.5), silhouette };
        const items = [{ caster: body, sun: masks.get(body, sky.sun, height, 4), moon: masks.get(body, sky.moon, height, 4) }];
        const bounds = { left: Math.floor(x / step) * step - 8 * step, top: Math.floor((x + 12.5) / step) * step - 8 * step,
          width: 48, height: 48, step, receiverHeight: height };
        const before = createReceiverCoverage(48 * 48), after = createReceiverCoverage(48 * 48);
        before.sun.fill(17); after.sun.fill(17); // Preserve pre-existing max contributions.
        blitReceiverCoverage(before, items, bounds);
        blitReceiverCoverage(after, items, bounds, samples);
        for (const key of ['sun', 'moon', 'contact'] as const) {
          expect(Buffer.compare(Buffer.from(before[key]), Buffer.from(after[key])), `${x}/${step}/${height}/${key}`).toBe(0);
        }
      }
    }
    expect(samples.reuses).toBeGreaterThan(0);
    expect(samples.bytes).toBeLessThanOrEqual(samples.budgetBytes);
  });

  it('falls back for incompatible grids and keeps the byte budget and reset exact', () => {
    const masks = new DirectionalShadowCache(), body = caster(10, 20), mask = masks.get(body, sky.sun, 0, 4)!;
    const samples = new StaticMaskSamples(1), target = new Uint8Array(400);
    const bounds = { left: 0, top: 0, width: 20, height: 20, step: 4, receiverHeight: 0 };
    expect(samples.blit(target, body, mask, bounds)).toBe(false);
    expect(samples.bytes).toBe(0);
    const roomy = new StaticMaskSamples(4096);
    expect(roomy.blit(target, caster(10.1, 20), mask, bounds)).toBe(false);
    expect(roomy.blit(target, body, mask, { ...bounds, left: .25 })).toBe(false);
    for (let i = 0; i < 100; i++) {
      const fresh = masks.get({ ...body, heightSubunits: i + 1 }, sky.sun, 0, 4)!;
      roomy.blit(target, body, fresh, bounds);
      expect(roomy.bytes).toBeLessThanOrEqual(4096);
    }
    roomy.reset(); expect(roomy.bytes).toBe(0); expect(roomy.builds).toBe(0);
  });

  it('retains only bounded sampled bytes through field invalidation and releases all bytes on reset', () => {
    const masks = new DirectionalShadowCache(), body = caster(64, 64), cache = new PaddedStaticCoverage();
    const items = [{ caster: body, sun: masks.get(body, sky.sun, 0, 4), moon: masks.get(body, sky.moon, 0, 4) }];
    const target = createReceiverCoverage(32 * 32), bounds = { left: 0, top: 0, width: 32, height: 32, step: 4, receiverHeight: 0 };
    expect(cache.copyInto(target, bounds, items)).toBe(true);
    const full = cache.bytes; cache.clearFields();
    expect(cache.bytes).toBeGreaterThan(0); expect(cache.bytes).toBeLessThan(full);
    expect(cache.copyInto(target, bounds, items)).toBe(true); expect(cache.bytes).toBe(full);
    cache.reset(); expect(cache.bytes).toBe(0);
  });
});

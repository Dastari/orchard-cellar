import { describe, expect, it } from 'vitest';
import { celestialLightingAtCalendar } from './celestial-lighting.js';
import { DirectionalShadowCache, groundedSpriteCaster, projectDirectionalCaster, sampleDirectionalMask, type DirectionalCaster } from './directional-shadows.js';
import { CelestialReceiverScene, resolveReceiverLight } from './receiver-lighting.js';

const skyAt = (clockHours: number, lunarIllumination = 1) => celestialLightingAtCalendar({ clockHours, continuousDay: 3.5, lunarProgress: 0, lunarIllumination });
const column: DirectionalCaster = { owner: 'tree', worldX: 100, worldY: 100, baseHeightSubunits: 0, heightSubunits: 8,
  footprint: { left: -3, top: -3, right: 3, bottom: 3 }, contact: true };

describe('directional shadow geometry and receiver resolve', () => {
  it('moves coverage continuously within a world pixel and across a four-pixel light texel', () => {
    const width = 8, height = 8;
    const integral = new Uint32Array((width + 1) * (height + 1));
    for (let y = 0; y <= height; y++) for (let x = 0; x <= width; x++) integral[y * (width + 1) + x] = x * y * 255;
    const mask = { left: 0, top: 0, width, height, coverage: new Uint8Array(width * height).fill(255), integral };
    for (let i = 0; i <= 10; i++) {
      const caster = { ...column, worldX: 2 + i / 10, worldY: 0 };
      expect(sampleDirectionalMask(mask, caster, 2, 4, 4)).toBeCloseTo(0.5 - i / 40, 8);
      expect(sampleDirectionalMask(mask, caster, 2.5, 4)).toBeCloseTo(1 - i / 10, 8);
    }
    expect(sampleDirectionalMask(mask, column, -1000, -1000, 4)).toBe(0);
  });

  it('accounts for sampling integrals in the bounded geometry cache while reusing moving shapes', () => {
    const cache = new DirectionalShadowCache();
    const first = cache.get(column, skyAt(0).moon, 0, 4)!;
    expect(cache.bytes).toBe(first.coverage.byteLength + first.integral.byteLength);
    for (let i = 0; i < 100; i++) expect(cache.get({ ...column, worldX: 100 + i / 10 }, skyAt(0).moon, 0, 4)).toBe(first);
    expect(cache.builds).toBe(1);
    cache.reset(); expect(cache.bytes).toBe(0);
  });
  it('grounds contact and directional geometry on the body rather than transparent anchor padding', () => {
    const opaque = new Uint8Array(16); opaque.fill(1, 0, 8);
    const caster = groundedSpriteCaster({ owner: 'padded-tree', worldX: 20, worldY: 100, baseHeightSubunits: 4,
      pixelsPerHeightSubunit: 4, anchor: [1, 8], mask: { width: 2, height: 8, opaque }, footprint: column.footprint, contact: true });
    expect(caster).toMatchObject({ worldY: 96, heightSubunits: 1, baseHeightSubunits: 4, silhouette: { anchorY: 4 } });
  });

  it('caches unchanged receiver RGB and cancels stale bounded preparation', async () => {
    const scene = new CelestialReceiverScene(4);
    const casters = Array.from({ length: 12 }, (_, i) => ({ ...column, owner: `tree-${i}`, worldX: i * 16 }));
    scene.prepare(skyAt(0), casters);
    expect(await scene.prepareHeights([0], async () => {})).toBe(true);
    const first = scene.rasterizeCached(1, 0, 0, 40, 40, 0, 4);
    const builds = scene.cache.builds;
    scene.prepare(skyAt(0), casters);
    expect(scene.rasterizeCached(1, 0, 0, 40, 40, 0, 4)).toBe(first);
    expect(scene.cache.builds).toBe(builds);
    const revision = first.revision;
    expect(scene.rasterizeCached(2, 0, 0, 40, 40, 0, 4)).toBe(first);
    expect(first.revision).toBe(revision + 1);
    expect(await scene.prepareHeights([4], async () => scene.reset())).toBe(false);
    expect(scene.retainedMaskBytes).toBe(0); expect(scene.retainedRasterBytes).toBe(0);
  });

  it('moves shadows with the sun and moon, shortening them overhead', () => {
    const dawn = projectDirectionalCaster(column, skyAt(7).sun, 0, 4)!;
    const noon = projectDirectionalCaster(column, skyAt(12).sun, 0, 4)!;
    const dusk = projectDirectionalCaster(column, skyAt(17).sun, 0, 4)!;
    expect(dawn.left).toBeLessThan(-20);
    expect(dusk.left + dusk.width).toBeGreaterThan(20);
    expect(noon.width).toBeLessThan(dawn.width);
    const rise = projectDirectionalCaster(column, skyAt(20).moon, 0, 4)!;
    const set = projectDirectionalCaster(column, skyAt(4).moon, 0, 4)!;
    expect(rise.left).toBeLessThan(-10);
    expect(set.left + set.width).toBeGreaterThan(10);
    expect(projectDirectionalCaster(column, skyAt(12).moon, 0, 4)).toBeNull();
    expect(projectDirectionalCaster(column, skyAt(0, 0).moon, 0, 4)).toBeNull();
  });
  it('clips against receiver height and bounds near-horizon projection', () => {
    expect(projectDirectionalCaster(column, skyAt(7).sun, 8, 4)).toBeNull();
    const ground = projectDirectionalCaster(column, skyAt(7).sun, 0, 4)!;
    const high = projectDirectionalCaster(column, skyAt(7).sun, 6, 4)!;
    expect(high.width).toBeLessThan(ground.width);
    const horizon = projectDirectionalCaster(column, skyAt(6.001).sun, -400, 4)!;
    expect(horizon.width).toBeLessThanOrEqual(199);
    expect(horizon.height).toBeLessThanOrEqual(199);
  });
  it('shares geometry across moving instances and intensity changes, then releases it', () => {
    const cache = new DirectionalShadowCache();
    const moon = skyAt(0).moon;
    const first = cache.get(column, moon, 0, 4)!;
    const moved = { ...column, worldX: 120 };
    expect(cache.get(moved, { ...moon, intensity: moon.intensity / 2 }, 0, 4)).toBe(first);
    expect(cache.builds).toBe(1);
    const index = first.coverage.findIndex((value) => value > 0);
    const x = column.worldX + first.left + index % first.width + 0.5;
    const y = column.worldY + first.top + Math.floor(index / first.width) + 0.5;
    expect(sampleDirectionalMask(first, column, x, y)).toBeGreaterThan(0);
    expect(sampleDirectionalMask(first, moved, x + 20, y)).toBeGreaterThan(0);
    cache.reset(); expect(cache.bytes).toBe(0);
    expect(() => new DirectionalShadowCache(1).get(column, moon, 0, 4)).toThrow('budget_exceeded');
  });
  it('preserves holes in clean silhouettes and produces firm and soft bands', () => {
    const opaque = new Uint8Array(16 * 32);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) if (x < 4 || x >= 12) opaque[y * 16 + x] = 1;
    const body = { ...column, silhouette: { width: 16, height: 32, opaque, anchorX: 8, anchorY: 32 } };
    const mask = projectDirectionalCaster(body, skyAt(12).sun, 0, 4)!;
    expect(new Set(mask.coverage).size).toBeGreaterThan(4);
    expect(mask.coverage).toContain(0); expect(Math.max(...mask.coverage)).toBeGreaterThan(144);
    expect(sampleDirectionalMask(mask, body, 100, 90)).toBe(0);
    expect(sampleDirectionalMask(mask, body, 94, 90)).toBeGreaterThan(0);
  });
  it('casts visible full-moon shadows, exempts the owner and lets a warm lantern fill them', () => {
    const sky = skyAt(0);
    const scene = new CelestialReceiverScene(4);
    scene.prepare(sky, [column]);
    const mask = projectDirectionalCaster(column, sky.moon, 0, 4)!;
    const index = mask.coverage.findIndex((value) => value === 255);
    const receiver = { worldX: 100 + mask.left + index % mask.width + 0.5,
      worldY: 100 + mask.top + Math.floor(index / mask.width) + 0.5, heightSubunits: 0, receiver: 'flat' as const };
    const shadow = scene.sample(receiver);
    expect(shadow.moon).toEqual({ r: 0, g: 0, b: 0 });
    expect(shadow.combined.b).toBeLessThan(sky.combined.b - 50);
    expect(scene.sample({ ...receiver, owner: 'tree' }).combined).toEqual(sky.combined);
    expect(scene.sample(receiver, { r: 230, g: 150, b: 50 }).combined).toEqual({ r: 230, g: 150, b: Math.max(50, shadow.diffuse.b) });
    expect(scene.sample({ ...receiver, heightSubunits: 9 }).combined).toEqual(sky.combined);
  });
  it('merges overlaps by max and keeps a blocked sun separate from moon and local RGB', () => {
    const sky = skyAt(0);
    const scene = new CelestialReceiverScene(4);
    const receiver = { worldX: 100, worldY: 90, heightSubunits: 0, receiver: 'flat' as const };
    scene.prepare(sky, [column]); const one = scene.sample(receiver);
    scene.prepare(sky, [column, { ...column, owner: 'other' }]);
    expect(scene.sample(receiver)).toEqual(one);
    const mixed = { ...sky, sun: { ...sky.sun, illumination: { r: 255, g: 170, b: 100 }, intensity: 1 } };
    expect(resolveReceiverLight(mixed, 'flat', 0, 1).combined).toEqual(sky.combined);
    const raster = scene.rasterize(99, 89, 2, 2, 0);
    expect([...raster.pixels.slice(0, 3)]).toEqual(Object.values(scene.sample({ ...receiver, worldX: 99.5, worldY: 89.5 }).combined));
  });
});

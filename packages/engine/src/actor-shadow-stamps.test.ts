import { describe, expect, it } from 'vitest';
import { buildActorShadowStamps, type ActorShadowStamp } from './actor-shadow-stamps.js';
import { celestialLightingAtCalendar } from './celestial-lighting.js';
import { DirectionalShadowCache, type DirectionalCaster } from './directional-shadows.js';
import { createReceiverCoverage } from './receiver-coverage.js';
import { CelestialReceiverScene, resolveReceiverLight } from './receiver-lighting.js';

const noon = celestialLightingAtCalendar({ continuousDay: 3.5, clockHours: 12, lunarProgress: 0, lunarIllumination: 1 });
const actor: DirectionalCaster = { owner: 'player', worldX: 100.4, worldY: 100.3, baseHeightSubunits: 0, heightSubunits: 5,
  footprint: { left: -4, top: -2, right: 4, bottom: 1 }, contact: true };

function stampFactor(stamp: ActorShadowStamp, px: number, py: number, channel: number): number {
  const index = (py * stamp.width + px) * 4;
  return stamp.pixels[index + 3] === 0 ? 255 : stamp.pixels[index + channel]!;
}

describe('native-pixel actor shadow stamps', () => {
  it('matches the exact per-pixel maximum-light resolve of the actor at its rounded foot', () => {
    const scene = new CelestialReceiverScene(4);
    scene.prepareSplit(noon, [], [actor], 1);
    const raster = scene.rasterizeCached(1, 0, 0, 64, 64, 0, 4);
    const [stamp, extra] = scene.actorShadowStamps(raster, 0);
    expect(stamp).toBeDefined(); expect(extra).toBeUndefined();
    const reference = new CelestialReceiverScene(4);
    reference.prepare(noon, [{ ...actor, worldX: 100, worldY: 100 }]);
    const open = resolveReceiverLight(noon, 'flat', 1, 1).combined;
    let darkened = 0;
    for (let py = 0; py < stamp!.height; py++) for (let px = 0; px < stamp!.width; px++) {
      const worldX = Math.round(stamp!.anchorX) + stamp!.offsetX + px + 0.5, worldY = Math.round(stamp!.anchorY) + stamp!.offsetY + py + 0.5;
      const lit = reference.sample({ worldX, worldY, heightSubunits: 0, receiver: 'flat', owner: 'ground' }).combined;
      ['r', 'g', 'b'].forEach((key, channel) => {
        const color = key as 'r' | 'g' | 'b';
        const expected = Math.round(255 * Math.min(1, lit[color] / open[color]));
        expect(Math.abs(stampFactor(stamp!, px, py, channel) - expected)).toBeLessThanOrEqual(2);
      });
      if (stamp!.pixels[(py * stamp!.width + px) * 4 + 3] !== 0) darkened++;
    }
    expect(darkened).toBeGreaterThan(20);
  });

  it('keeps pixel bytes while an actor moves within a pixel and rebuilds when it crosses one', () => {
    const scene = new CelestialReceiverScene(4);
    scene.prepareSplit(noon, [], [actor], 1);
    const raster = scene.rasterizeCached(1, 0, 0, 64, 64, 0, 4);
    const [stamp] = scene.actorShadowStamps(raster, 0), revision = stamp!.revision;
    scene.prepareSplit(noon, [], [{ ...actor, worldX: 100.45, worldY: 100.2 }], 1);
    expect(scene.actorShadowStamps(raster, 0)[0]).toBe(stamp);
    expect(stamp!.revision).toBe(revision); expect(stamp!.anchorX).toBe(100.45);
    scene.prepareSplit(noon, [], [{ ...actor, worldX: 101.2 }], 1);
    expect(scene.actorShadowStamps(raster, 0)[0]).toBe(stamp);
    expect(stamp!.revision).not.toBe(revision);
    scene.prepareSplit(noon, [], [], 1);
    expect(scene.actorShadowStamps(raster, 0)).toHaveLength(0);
  });

  it('adds nothing where static shadow already blocks the sun or local light fills it', () => {
    const cache = new DirectionalShadowCache();
    const prepared = [{ caster: { ...actor, contact: false }, sun: cache.get(actor, noon.sun, 0, 4), moon: cache.get(actor, noon.moon, 0, 4) }];
    const bounds = { left: 64, top: 64, width: 16, height: 16, receiverHeight: 0, step: 4 };
    const shaded = createReceiverCoverage(256); shaded.sun.fill(255); shaded.moon.fill(255);
    const sky = { diffuse: noon.diffuse, sun: noon.sun.illumination, moon: noon.moon.illumination };
    const dark = buildActorShadowStamps({ casters: prepared, receiverHeight: 0, bounds, coverage: shaded,
      local: new Uint8ClampedArray(256 * 4), sky, context: [], pool: [] });
    expect(dark).toHaveLength(1);
    for (let i = 3; i < dark[0]!.width * dark[0]!.height * 4; i += 4) expect(dark[0]!.pixels[i]).toBe(0);
    const white = new Uint8ClampedArray(256 * 4).fill(255);
    const filled = buildActorShadowStamps({ casters: prepared, receiverHeight: 0, bounds, coverage: createReceiverCoverage(256),
      local: white, sky, context: [], pool: [] });
    for (let i = 3; i < filled[0]!.width * filled[0]!.height * 4; i += 4) expect(filled[0]!.pixels[i]).toBe(0);
  });

  it('merges overlapping bodies by maximum coverage instead of darkening twice', () => {
    const cache = new DirectionalShadowCache();
    const item = (caster: DirectionalCaster) => ({ caster, sun: cache.get(caster, noon.sun, 0, 4), moon: cache.get(caster, noon.moon, 0, 4) });
    const bounds = { left: 0, top: 0, width: 64, height: 64, receiverHeight: 0, step: 4 };
    const sky = { diffuse: noon.diffuse, sun: noon.sun.illumination, moon: noon.moon.illumination };
    const build = (casters: DirectionalCaster[]) => buildActorShadowStamps({ casters: casters.map(item), receiverHeight: 0, bounds,
      coverage: createReceiverCoverage(64 * 64), local: new Uint8ClampedArray(64 * 64 * 4), sky, context: [], pool: [] });
    const single = build([actor]), pair = build([actor, { ...actor, owner: 'companion' }]);
    expect(pair).toHaveLength(1);
    expect(pair[0]!.pixels.subarray(0, pair[0]!.width * pair[0]!.height * 4)).toEqual(single[0]!.pixels.subarray(0, single[0]!.width * single[0]!.height * 4));
    expect(build([actor, { ...actor, owner: 'far', worldX: 180 }])).toHaveLength(2);
  });
});

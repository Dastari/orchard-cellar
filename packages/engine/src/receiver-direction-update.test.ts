import { describe, expect, it } from 'vitest';
import { CelestialReceiverScene } from './receiver-lighting.js';
import { celestialLightingAtCalendar } from './celestial-lighting.js';

const sky = celestialLightingAtCalendar({ continuousDay: 10.5, clockHours: 15, lunarProgress: .5, lunarIllumination: 1 });
const casters = [{ owner: 'column', worldX: 128, worldY: 96, baseHeightSubunits: 0, heightSubunits: 8,
  footprint: { left: -4, top: -3, right: 4, bottom: 3 }, contact: true }];
const raster = (scene: CelestialReceiverScene) => scene.rasterizeCached(0, 0, 0, 80, 60, 0, 4);

describe('exact RGB reuse across shadow direction steps', () => {
  it('matches fresh full merges at every direction while touching only changed coverage', () => {
    const scene = new CelestialReceiverScene(4);
    for (let angle = 0; angle < 90; angle += 3) {
      const radians = angle * Math.PI / 180;
      const next = { ...sky, sun: { ...sky.sun, direction: [Math.cos(radians), Math.sin(radians), sky.sun.direction[2]] as const } };
      scene.prepareSplit(next, casters, [], 1);
      const fresh = new CelestialReceiverScene(4); fresh.prepareSplit(next, casters, [], 1);
      expect(raster(scene).pixels).toEqual(raster(fresh).pixels);
    }
    expect(scene.diagnostics.fullRgbMerges).toBe(1);
    expect(scene.diagnostics.rgbTexelsMerged).toBeLessThan(80 * 60 * 2);
  });

  it('preserves full invalidation for caster content and sky RGB', () => {
    const scene = new CelestialReceiverScene(4);
    scene.prepareSplit(sky, casters, [], 1);
    const first = raster(scene), revision = first.revision;
    scene.prepareSplit(sky, [...casters], [], 2);
    expect(raster(scene).revision).toBe(revision + 1);
    const next = { ...sky, diffuse: { r: 255, g: 255, b: 255 } };
    scene.prepareSplit(next, casters, [], 2);
    const before = scene.diagnostics.rgbTexelsMerged;
    const updated = raster(scene);
    expect(scene.diagnostics.rgbTexelsMerged - before).toBe(80 * 60);
    const fresh = new CelestialReceiverScene(4); fresh.prepareSplit(next, casters, [], 2);
    expect(updated.pixels).toEqual(raster(fresh).pixels);
    expect(updated.revision).toBe(revision + 2);
  });
});

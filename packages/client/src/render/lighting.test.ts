import { dayProgressAtClockTime } from '@orchard/sim';
import { describe, expect, it } from 'vitest';
import {
  ambientAtProgress,
  CAMPFIRE_LIGHT_RADIUS_TILES,
  FULL_MOON_NIGHT_AMBIENT,
  fillLightmap,
  LANTERN_LIGHT_RADIUS_TILES,
  LIGHTMAP_TEXELS_PER_TILE,
  lightmapCoordinate,
  NEW_MOON_NIGHT_AMBIENT,
  playerLightPosition,
  southFacingReceiverBrightness,
  stampPointLight,
  TORCH_LIGHT_RADIUS_TILES,
} from './lighting.js';

describe('overworld lighting', () => {
  it('pins dawn, day, dusk, and readable-night keyframes', () => {
    expect(ambientAtProgress(0)).toEqual({ r: 222, g: 174, b: 126 });
    expect(ambientAtProgress(dayProgressAtClockTime(8))).toEqual({ r: 255, g: 255, b: 255 });
    expect(ambientAtProgress(dayProgressAtClockTime(17))).toEqual({ r: 255, g: 255, b: 255 });
    expect(ambientAtProgress(dayProgressAtClockTime(19))).toEqual({ r: 166, g: 128, b: 157 });
    expect(ambientAtProgress(dayProgressAtClockTime(21))).toEqual(FULL_MOON_NIGHT_AMBIENT);
    expect(ambientAtProgress(dayProgressAtClockTime(4))).toEqual(FULL_MOON_NIGHT_AMBIENT);
    expect(ambientAtProgress(1)).toEqual({ r: 222, g: 174, b: 126 });
  });

  it('composes weather after moonlight without crossing the new-moon floor', () => {
    expect(ambientAtProgress(dayProgressAtClockTime(12), 0.12)).toEqual({ r: 224, g: 224, b: 224 });
    expect(ambientAtProgress(dayProgressAtClockTime(23), 0.12)).toEqual({ r: 78, g: 78, b: 92 });
    expect(ambientAtProgress(dayProgressAtClockTime(23), 0.18, 0)).toEqual(NEW_MOON_NIGHT_AMBIENT);
  });

  it('27§7 preserves Full Moon and makes New Moon deliberately dark only at night', () => {
    expect(ambientAtProgress(dayProgressAtClockTime(23), 0, 1000)).toEqual(FULL_MOON_NIGHT_AMBIENT);
    expect(ambientAtProgress(dayProgressAtClockTime(23), 0, 0)).toEqual(NEW_MOON_NIGHT_AMBIENT);
    expect(ambientAtProgress(dayProgressAtClockTime(12), 0, 0)).toEqual({ r: 255, g: 255, b: 255 });
    const preDawn = ambientAtProgress(dayProgressAtClockTime(5), 0, 0);
    expect(preDawn.r).toBeGreaterThan(NEW_MOON_NIGHT_AMBIENT.r);
    expect(preDawn.r).toBeLessThan(222);
  });

  it('stamps radial point light with a bright center and ambient edge', () => {
    const pixels = new Uint8ClampedArray(5 * 5 * 4);
    fillLightmap(pixels, { r: 90, g: 90, b: 90 });
    stampPointLight(pixels, 5, 5, 2, 2, 2, { r: 255, g: 200, b: 150 });
    expect([...pixels.slice((2 * 5 + 2) * 4, (2 * 5 + 2) * 4 + 3)]).toEqual([255, 200, 150]);
    expect([...pixels.slice(0, 3)]).toEqual([90, 90, 90]);
    const near = (2 * 5 + 3) * 4;
    expect(pixels[near]).toBeGreaterThan(90);
    expect(pixels[near]).toBeLessThan(255);
  });

  it('treats lightmap texels as tile centers', () => {
    expect(lightmapCoordinate(48 * 16 + 8, 40)).toBe(8);
    expect(lightmapCoordinate(49 * 16, 40)).toBe(8.5);
    expect(lightmapCoordinate(48 * 16 + 8, 40, LIGHTMAP_TEXELS_PER_TILE)).toBe(33.5);
    expect(lightmapCoordinate(49 * 16, 40, LIGHTMAP_TEXELS_PER_TILE)).toBe(35.5);
    expect(CAMPFIRE_LIGHT_RADIUS_TILES).toBeGreaterThanOrEqual(10);
    expect(TORCH_LIGHT_RADIUS_TILES).toBeCloseTo(CAMPFIRE_LIGHT_RADIUS_TILES * 0.3);
    expect(LANTERN_LIGHT_RADIUS_TILES).toBeCloseTo(CAMPFIRE_LIGHT_RADIUS_TILES * 0.75);
  });

  it('centers a carried light on the avatar torso rather than the movement foot', () => {
    expect(playerLightPosition(100, 200)).toEqual([100, 188]);
  });

  it('27§3 preserves front light and compensates direct light behind a south-facing sprite', () => {
    const ambient = { r: 20, g: 20, b: 32 };
    const common = {
      worldX: 100,
      worldY: 88,
      radiusTiles: 12,
      color: { r: 255, g: 205, b: 132 },
    };
    const behind = southFacingReceiverBrightness(100, 100, ambient, [{
      ...common,
      receiverDirectionWorldY: 84,
    }]);
    const front = southFacingReceiverBrightness(100, 100, ambient, [{
      ...common,
      receiverDirectionWorldY: 116,
    }]);
    expect(behind).toBeGreaterThan(0);
    expect(behind).toBeLessThan(0.2);
    expect(front).toBe(1);
  });

  it('27§3 softens side light and classifies carried emitters by their ground foot', () => {
    const ambient = { r: 20, g: 20, b: 32 };
    const side = southFacingReceiverBrightness(100, 100, ambient, [{
      worldX: 84,
      worldY: 88,
      receiverDirectionWorldY: 100,
      radiusTiles: 12,
      color: { r: 255, g: 205, b: 132 },
    }]);
    expect(side).toBeGreaterThan(0.4);
    expect(side).toBeLessThan(0.7);
  });

  it('does not let a light on another elevation pre-darken a receiver', () => {
    expect(southFacingReceiverBrightness(
      100,
      100,
      { r: 20, g: 20, b: 32 },
      [{
        worldX: 100,
        worldY: 84,
        receiverDirectionWorldY: 84,
        radiusTiles: 12,
        color: { r: 255, g: 205, b: 132 },
        elevationLayer: 1,
      }],
      0,
    )).toBe(1);
  });
});

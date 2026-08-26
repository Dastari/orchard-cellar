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
  stampPointLight,
  TORCH_LIGHT_RADIUS_TILES,
} from './lighting.js';

describe('overworld lighting', () => {
  it('pins dawn, day, dusk, and readable-night keyframes', () => {
    expect(ambientAtProgress(0)).toEqual({ r: 222, g: 174, b: 126 });
    expect(ambientAtProgress(0.1)).toEqual({ r: 255, g: 255, b: 255 });
    expect(ambientAtProgress(0.62)).toEqual({ r: 255, g: 255, b: 255 });
    expect(ambientAtProgress(0.72)).toEqual({ r: 166, g: 128, b: 157 });
    expect(ambientAtProgress(0.8)).toEqual({ r: 89, g: 89, b: 105 });
    expect(ambientAtProgress(1)).toEqual(FULL_MOON_NIGHT_AMBIENT);
  });

  it('composes weather after moonlight without crossing the new-moon floor', () => {
    expect(ambientAtProgress(0.1, 0.12)).toEqual({ r: 224, g: 224, b: 224 });
    expect(ambientAtProgress(0.9, 0.12)).toEqual({ r: 78, g: 78, b: 92 });
    expect(ambientAtProgress(0.9, 0.18, 0)).toEqual(NEW_MOON_NIGHT_AMBIENT);
  });

  it('27§7 preserves Full Moon and makes New Moon deliberately dark only at night', () => {
    expect(ambientAtProgress(0.9, 0, 1000)).toEqual(FULL_MOON_NIGHT_AMBIENT);
    expect(ambientAtProgress(0.9, 0, 0)).toEqual(NEW_MOON_NIGHT_AMBIENT);
    expect(ambientAtProgress(0.4, 0, 0)).toEqual({ r: 255, g: 255, b: 255 });
    expect(ambientAtProgress(0.76, 0, 0)).toEqual({ r: 74, g: 64, b: 81 });
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
});

import { describe, expect, it } from 'vitest';
import {
  ambientAtProgress,
  fillLightmap,
  lightmapCoordinate,
  playerLightPosition,
  stampPointLight,
} from './lighting.js';

describe('overworld lighting', () => {
  it('pins dawn, day, dusk, and readable-night keyframes', () => {
    expect(ambientAtProgress(0)).toEqual({ r: 222, g: 174, b: 126 });
    expect(ambientAtProgress(0.1)).toEqual({ r: 255, g: 255, b: 255 });
    expect(ambientAtProgress(0.62)).toEqual({ r: 255, g: 255, b: 255 });
    expect(ambientAtProgress(0.72)).toEqual({ r: 166, g: 128, b: 157 });
    expect(ambientAtProgress(0.8)).toEqual({ r: 89, g: 89, b: 105 });
    expect(Math.min(...Object.values(ambientAtProgress(1)))).toBeGreaterThanOrEqual(89);
  });

  it('darkens rain without crossing the readable-night floor', () => {
    expect(ambientAtProgress(0.1, 0.12)).toEqual({ r: 224, g: 224, b: 224 });
    expect(ambientAtProgress(0.9, 0.12)).toEqual({ r: 89, g: 89, b: 92 });
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
  });

  it('centers a carried light on the avatar torso rather than the movement foot', () => {
    expect(playerLightPosition(100, 200)).toEqual([100, 188]);
  });
});

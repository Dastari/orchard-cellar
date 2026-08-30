import { describe, expect, it } from 'vitest';
import { applyStonePalette, stonePalettePixel } from './stone-palette.js';

describe('offline avatar stone palette', () => {
  it('removes the source hue while preserving useful light-dark contrast', () => {
    const red = stonePalettePixel(220, 20, 20, 1, 1);
    const blue = stonePalettePixel(20, 20, 220, 1, 1);
    const white = stonePalettePixel(240, 240, 240, 1, 1);
    const black = stonePalettePixel(10, 10, 10, 1, 1);

    for (const color of [red, blue, white, black]) {
      expect(Math.max(...color) - Math.min(...color)).toBeLessThanOrEqual(11);
    }
    expect(white[0] - black[0]).toBeGreaterThan(100);
  });

  it('retains transparent pixels and only recolours visible sprite pixels', () => {
    const pixels = new Uint8ClampedArray([
      255, 0, 0, 255,
      12, 34, 56, 0,
    ]);

    applyStonePalette(pixels, 2, 1);

    expect([...pixels.slice(0, 4)]).not.toEqual([255, 0, 0, 255]);
    expect([...pixels.slice(4)]).toEqual([12, 34, 56, 0]);
  });
});

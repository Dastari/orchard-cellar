import { describe, expect, it } from 'vitest';
import { expandBlob47 } from '../build-atlas.js';
import { decodePng, encodePng } from './png.js';

describe('asset pipeline', () => {
  it('encodes and decodes exact RGBA PNG pixels', () => {
    const pixels = new Uint8Array([255, 0, 0, 255, 0, 128, 255, 64]);
    expect(decodePng(encodePng(2, 1, pixels))).toEqual({ width: 2, height: 1, rgba: pixels });
  });

  it('expands five templates to the canonical 47 blob variants', () => {
    const grid = Array.from({ length: 16 }, () => 'cccccccccccccccc');
    const variants = expandBlob47([grid, grid, grid, grid, grid]);
    expect(variants).toHaveLength(47);
    expect(variants.every((variant) => variant.length === 16 && variant.every((row) => row.length === 16))).toBe(true);
  });
});

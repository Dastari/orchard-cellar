import { describe, expect, it } from 'vitest';
import {
  LIGHT_BANDS,
  LIGHT_HARD_BLOCKER,
  LIGHT_SOFT_ATTENUATOR,
  QuantizedLightFlood,
} from './light-flood.js';

function redAt(pixels: Uint8ClampedArray, width: number, x: number, y: number): number {
  return pixels[(y * width + x) * 4] ?? 0;
}

function fixture(width = 9, height = 7): {
  readonly pixels: Uint8ClampedArray;
  readonly halo: Uint8ClampedArray;
  readonly mask: Uint8Array;
  readonly flood: QuantizedLightFlood;
} {
  return {
    pixels: new Uint8ClampedArray(width * height * 4),
    halo: new Uint8ClampedArray(width * height * 4),
    mask: new Uint8Array(width * height),
    flood: new QuantizedLightFlood(),
  };
}

describe('27§1/§3 quantized light flood', () => {
  it('emits at most sixteen deliberate light bands', () => {
    const width = 25;
    const setup = fixture(width, 1);
    setup.flood.apply(setup.pixels, null, width, 1, {
      centerX: 12, centerY: 0, radius: 12, color: { r: 250, g: 200, b: 150 },
    }, setup.mask);
    const bands = new Set<number>();
    for (let x = 0; x < width; x += 1) {
      const red = redAt(setup.pixels, width, x, 0);
      if (red > 0) bands.add(red);
    }
    expect(bands.size).toBeLessThanOrEqual(LIGHT_BANDS);
    expect(redAt(setup.pixels, width, 12, 0)).toBe(250);
  });

  it('27§1 shifts an open light field at quarter-texel source increments', () => {
    const width = 25;
    const left = fixture(width, 1);
    const shifted = fixture(width, 1);
    const base = { centerY: 0, radius: 12, color: { r: 250, g: 200, b: 150 } };
    left.flood.apply(left.pixels, null, width, 1, { ...base, centerX: 12 }, left.mask);
    shifted.flood.apply(shifted.pixels, null, width, 1, { ...base, centerX: 12.25 }, shifted.mask);
    expect([...shifted.pixels]).not.toEqual([...left.pixels]);
  });

  it('lights a hard wall face but does not propagate through it', () => {
    const width = 9;
    const setup = fixture(width, 7);
    for (let y = 0; y < 7; y += 1) setup.mask[y * width + 4] = LIGHT_HARD_BLOCKER;
    setup.flood.apply(setup.pixels, null, width, 7, {
      centerX: 1, centerY: 3, radius: 8, color: { r: 250, g: 200, b: 150 },
    }, setup.mask);
    expect(redAt(setup.pixels, width, 4, 3)).toBeGreaterThan(0);
    expect(redAt(setup.pixels, width, 5, 3)).toBe(0);
  });

  it('spills through a doorway and dims around its corners by path distance', () => {
    const width = 9;
    const setup = fixture(width, 7);
    for (let y = 0; y < 7; y += 1) if (y !== 3) setup.mask[y * width + 4] = LIGHT_HARD_BLOCKER;
    setup.flood.apply(setup.pixels, null, width, 7, {
      centerX: 1, centerY: 3, radius: 8, color: { r: 250, g: 200, b: 150 },
    }, setup.mask);
    expect(redAt(setup.pixels, width, 6, 3)).toBeGreaterThan(0);
    expect(redAt(setup.pixels, width, 6, 2)).toBeLessThan(redAt(setup.pixels, width, 6, 3));
  });

  it('casts a partial shadow through a soft object footprint', () => {
    const width = 9;
    const open = fixture(width, 7);
    const shadowed = fixture(width, 7);
    shadowed.mask[3 * width + 4] = LIGHT_SOFT_ATTENUATOR;
    const light = { centerX: 1, centerY: 3, radius: 8, color: { r: 250, g: 200, b: 150 } };
    open.flood.apply(open.pixels, null, width, 7, light, open.mask);
    shadowed.flood.apply(shadowed.pixels, null, width, 7, light, shadowed.mask);
    expect(redAt(shadowed.pixels, width, 5, 3)).toBeGreaterThan(0);
    expect(redAt(shadowed.pixels, width, 5, 3)).toBeLessThan(redAt(open.pixels, width, 5, 3));
  });

  it('biases a facing seed out of its wall and emits a quantized flame halo', () => {
    const width = 9;
    const setup = fixture(width, 7);
    for (let y = 0; y < 7; y += 1) setup.mask[y * width + 4] = LIGHT_HARD_BLOCKER;
    setup.flood.apply(setup.pixels, setup.halo, width, 7, {
      centerX: 4, centerY: 3, radius: 5, color: { r: 250, g: 180, b: 100 },
      facing: 'right', profile: 'flame',
    }, setup.mask);
    expect(redAt(setup.pixels, width, 5, 3)).toBe(250);
    expect(setup.halo[(3 * width + 5) * 4 + 3]).toBe(32);
    expect(redAt(setup.pixels, width, 3, 3)).toBe(0);
  });
});

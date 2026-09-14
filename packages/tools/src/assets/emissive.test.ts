import { describe, expect, it } from 'vitest';
import { compileEmissiveFrames } from './emissive.js';
import type { AssetSource, PaletteSource } from './types.js';
const palette: PaletteSource = { name: 'test', colors: {}, markerDefaults: {} };
const asset: AssetSource = { name: 'fire', category: 'props', size: [4, 2], anchor: [2, 1],
  sourcePalette: { f: '#ffa214', w: '#91533b', n: '#ffa215' }, emissiveColors: ['#ffa214'],
  frames: { burn: [['.ffw', 'fn..']], off: [['.www', 'ww..']] } };
describe('authored flame emission', () => {
  it('selects only exact flame colours and keeps off frames non-emissive', () => {
    expect(compileEmissiveFrames(asset, palette)).toEqual({ burn: [[0, 1, 2, 1, 0, 1]], off: [[]] });
    const ordinary = { ...asset }; delete ordinary.emissiveColors;
    expect(compileEmissiveFrames(ordinary, palette)).toBeUndefined();
    expect(() => compileEmissiveFrames({ ...asset, emissiveColors: ['orange'] }, palette)).toThrow('emissiveColors');
  });
});

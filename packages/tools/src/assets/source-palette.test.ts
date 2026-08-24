import { describe, expect, it } from 'vitest';
import { allocateExactSourceCharacter, sourcePaletteErrors } from './source-palette.js';
import type { AssetSource } from './types.js';

const valid: AssetSource = {
  name: 'tile_cf_test', category: 'tiles', size: [1, 1], anchor: [0, 0],
  frames: { base: [['a']] }, approved: true,
  importedFrom: 'Test.png', sourcePath: 'references/Cute_Fantasy/Tiles/Test.png',
  sourcePalette: { a: '#ffffff' }, sourcePaletteMode: 'exact',
};

describe('licensed source palette provenance', () => {
  it('allocates a distinct stable grid key for every native RGB color', () => {
    const characterByColor = new Map<string, string>();
    const colorByCharacter = new Map<string, string>();
    expect(allocateExactSourceCharacter('#000000', characterByColor, colorByCharacter, ['a', 'b'])).toBe('a');
    expect(allocateExactSourceCharacter('#743f39', characterByColor, colorByCharacter, ['a', 'b'])).toBe('b');
    expect(allocateExactSourceCharacter('#000000', characterByColor, colorByCharacter, ['a', 'b'])).toBe('a');
    expect(Object.fromEntries(colorByCharacter)).toEqual({ a: '#000000', b: '#743f39' });
    expect(() => allocateExactSourceCharacter('#ffffff', characterByColor, colorByCharacter, ['a', 'b']))
      .toThrow('more than 2 opaque colors');
  });

  it('allows exact native colors, including source white, with matching provenance', () => {
    expect(sourcePaletteErrors(valid, new Set(['a']))).toEqual([]);
  });

  it('allows nonzero native alpha for licensed shadows', () => {
    expect(sourcePaletteErrors({ ...valid, sourcePalette: { a: '#091b1528' } }, new Set(['a']))).toEqual([]);
  });

  it('rejects arbitrary overrides and incomplete exact palettes', () => {
    expect(sourcePaletteErrors({
      ...valid,
      approved: false,
      frames: { base: [['ab']] },
      sourcePath: 'references/unlicensed/Test.png',
      sourcePalette: { a: '#123456' },
    }, new Set(['a', 'b']))).toEqual(expect.arrayContaining([
      expect.stringContaining('approved asset'),
      expect.stringContaining('not an approved Cute Fantasy input'),
      expect.stringContaining('missing used character b'),
    ]));
  });

  it.each([
    'references/Cute_Fantasy/../unlicensed/Test.png',
    'references/Cute_Fantasy_Evil/Test.png',
    'references/Cute_Fantasy/Tiles/../../unlicensed/Test.png',
  ])('rejects traversal and prefix-confusion provenance: %s', (sourcePath) => {
    expect(sourcePaletteErrors({ ...valid, sourcePath }, new Set(['a']))).toContainEqual(
      expect.stringContaining('not an approved Cute Fantasy input'),
    );
  });
});

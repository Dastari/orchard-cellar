import { describe, expect, it } from 'vitest';
import { allocateExactSourceCharacter, sourcePaletteErrors } from './source-palette.js';
import type { AssetSource } from './types.js';

const valid: AssetSource = {
  name: 'tile_cf_test', category: 'tiles', size: [1, 1], anchor: [0, 0],
  frames: { base: [['a']] }, approved: true,
  importedFrom: 'Test.png', sourcePath: 'references/art/kenmi/cute-fantasy/core/Tiles/Test.png',
  sourcePalette: { a: '#ffffff' }, sourcePaletteMode: 'exact',
};

describe('source palette provenance', () => {
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
    expect(sourcePaletteErrors({
      ...valid,
      sourcePath: 'references/art/kenmi/cute-fantasy/christmas/Characters/Santa_Claus.png',
      importedFrom: 'Santa_Claus.png',
    }, new Set(['a']))).toEqual([]);
    expect(sourcePaletteErrors({
      ...valid,
      sourcePath: 'references/art/clockwork-raven/equipment/armor-500/sheet-16.png',
      importedFrom: 'sheet-16.png',
    }, new Set(['a']))).toEqual([]);
  });

  it('allows nonzero native alpha for licensed shadows', () => {
    expect(sourcePaletteErrors({ ...valid, sourcePalette: { a: '#091b1528' } }, new Set(['a']))).toEqual([]);
  });

  it('allows approved project artwork with matching exact source provenance', () => {
    expect(sourcePaletteErrors({
      ...valid, sourcePath: 'art/custom/string.png', importedFrom: 'string.png',
    }, new Set(['a']))).toEqual([]);
  });

  it('allows the retained owner-authored original tool masters', () => {
    expect(sourcePaletteErrors({
      ...valid, sourcePath: 'references/art/orchard-originals/tools/Tool_Icons_Extra_NO_Outline.png',
      importedFrom: 'Tool_Icons_Extra_NO_Outline.png',
    }, new Set(['a']))).toEqual([]);
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
      expect.stringContaining('not an approved source input'),
      expect.stringContaining('missing used character b'),
    ]));
  });

  it.each([
    'art/custom-evil/Test.png',
    'references/art/orchard-originals/tools-evil/Test.png',
    'references/art/orchard-originals/tools/../Test.png',
    'references/art/orchard-originals/unreviewed/Test.png',
    'art/custom/../Test.png',
    'references/art/kenmi/cute-fantasy/core/../unlicensed/Test.png',
    'references/art/kenmi/cute-fantasy-evil/Test.png',
    'references/art/kenmi/cute-fantasy/core/Tiles/../../unlicensed/Test.png',
  ])('rejects traversal and prefix-confusion provenance: %s', (sourcePath) => {
    expect(sourcePaletteErrors({ ...valid, sourcePath }, new Set(['a']))).toContainEqual(
      expect.stringContaining('not an approved source input'),
    );
  });
});

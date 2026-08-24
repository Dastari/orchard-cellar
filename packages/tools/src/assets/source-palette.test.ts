import { describe, expect, it } from 'vitest';
import { sourcePaletteErrors } from './source-palette.js';
import type { AssetSource } from './types.js';

const valid: AssetSource = {
  name: 'tile_cf_test', category: 'tiles', size: [1, 1], anchor: [0, 0],
  frames: { base: [['a']] }, approved: true,
  importedFrom: 'Test.png', sourcePath: 'references/Cute_Fantasy/Tiles/Test.png',
  sourcePalette: { a: '#ffffff' }, sourcePaletteMode: 'exact',
};

describe('licensed source palette provenance', () => {
  it('allows exact native colors, including source white, with matching provenance', () => {
    expect(sourcePaletteErrors(valid, new Set(['a']))).toEqual([]);
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
});

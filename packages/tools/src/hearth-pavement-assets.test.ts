import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { decodePng, hexToRgba } from './assets/png.js';
import type { AssetSource, PaletteSource } from './assets/types.js';
import { importPavementVariants } from './import-pavement-variants.js';
it('retains all four native pavement variants with exact source provenance', async () => {
  const root = resolve(import.meta.dirname, '../../..');
  const asset = JSON.parse(await readFile(resolve(root, 'packages/assets/tiles/tile_cf_hearth_pavement.tile.json'), 'utf8')) as AssetSource;
  const source = decodePng(await readFile(resolve(root, asset.sourcePath!)));
  expect(asset.size).toEqual([16, 16]);
  expect(asset.sourcePaletteMode).toBe('exact');
  expect(asset.frameKinds?.base).toBe('variant');
  expect(asset.sourceRegions?.base).toEqual([[0, 0, 16, 16], [16, 0, 16, 16], [0, 16, 16, 16], [16, 16, 16, 16]]);
  expect(asset.frames.base).toHaveLength(4);
  for (const [index, frame] of asset.frames.base!.entries()) {
    const [sx, sy] = asset.sourceRegions!.base![index]!;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const at = ((sy + y) * source.width + sx + x) * 4;
      expect(source.rgba[at + 3]).toBe(255);
      const color = '#' + [...source.rgba.slice(at, at + 3)].map(v => v.toString(16).padStart(2, '0')).join('');
      expect(asset.sourcePalette?.[frame[y]![x]!], `${index}:${x},${y}`).toBe(color);
    }
  }
});

it('imports every nonempty native source cell and preserves exact RGBA/provenance', async () => {
  const root = resolve(import.meta.dirname, '../../..');
  const asset = JSON.parse(await readFile(resolve(root, 'packages/assets/tiles/tile_cf_hearth_pavement.tile.json'), 'utf8')) as AssetSource;
  const source = decodePng(await readFile(resolve(root, asset.sourcePath!)));
  const palette = JSON.parse(await readFile(resolve(root, 'packages/assets/palette.json'), 'utf8')) as PaletteSource;
  const result = importPavementVariants(asset, source, Object.keys(palette.colors));
  expect(result.asset).toEqual(asset); // Regeneration is deterministic and idempotent.
  expect(result.cells).toHaveLength(72);
  expect(result.cells.filter(cell => cell.classification === 'transparent')).toHaveLength(33);
  expect(Object.values(asset.frames).flat()).toHaveLength(38);
  expect(result.cells.filter(cell => cell.classification === 'duplicate-source-piece')).toEqual([
    { x: 16, y: 48, classification: 'duplicate-source-piece', group: 'source_row_1_column_4', frameIndex: 0 },
  ]);
  expect(result.cells.filter(cell => cell.classification === 'imported-corner').map(cell => cell.group)).toEqual([
    'curb_corner_top_left', 'curb_corner_top_right', 'curb_corner_bottom_left', 'curb_corner_bottom_right',
  ]);
  const importedPositions = new Set<string>();
  for (const [group, frames] of Object.entries(asset.frames)) for (const [index, frame] of frames.entries()) {
    expect(asset.frameKinds?.[group]).toBe('variant');
    const [sx, sy, width, height] = asset.sourceRegions![group]![index]!;
    expect([width, height]).toEqual([16, 16]);
    expect(importedPositions.has(`${sx},${sy}`)).toBe(false);
    importedPositions.add(`${sx},${sy}`);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const symbol = frame[y]![x]!;
      const actual = symbol === '.' ? [0, 0, 0, 0] : hexToRgba(asset.sourcePalette![symbol]!);
      const offset = ((sy + y) * source.width + sx + x) * 4;
      const expected = [...source.rgba.slice(offset, offset + 4)];
      expect(actual, `${group}:${index}:${x},${y}`).toEqual(expected);
    }
  }
  expect(importedPositions.size).toBe(38);
  // Even the omitted duplicate source region resolves to byte-identical art.
  for (const cell of result.cells) {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const symbol = cell.group === null ? '.' : asset.frames[cell.group]![cell.frameIndex!]![y]![x]!;
      const actual = symbol === '.' ? [0, 0, 0, 0] : hexToRgba(asset.sourcePalette![symbol]!);
      const at = ((cell.y + y) * source.width + cell.x + x) * 4;
      expect(actual).toEqual([...source.rgba.slice(at, at + 4)]);
    }
  }
  // The four weathered centres differ in source pixels; they are not aliases.
  expect(new Set(asset.frames.base!.map(frame => JSON.stringify(frame))).size).toBe(4);
});

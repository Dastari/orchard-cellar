import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { decodePng, hexToRgba } from './assets/png.js';
import type { AssetSource, PaletteSource } from './assets/types.js';
import { EMPTY_TERRAIN_REPAIRS, importPaintedTerrain } from './import-empty-terrain.js';

it.each(EMPTY_TERRAIN_REPAIRS)('repairs $name and accounts for every source cell without losing native pixels', async repair => {
  const root = resolve(import.meta.dirname, '../../..');
  const asset = JSON.parse(await readFile(resolve(root, `packages/assets/tiles/${repair.name}.tile.json`), 'utf8')) as AssetSource;
  const source = decodePng(await readFile(resolve(root, asset.sourcePath!)));
  const palette = JSON.parse(await readFile(resolve(root, 'packages/assets/palette.json'), 'utf8')) as PaletteSource;
  const imported = importPaintedTerrain(asset, source, Object.keys(palette.colors), repair.base);
  expect(imported.asset).toEqual(asset);
  expect(asset.frameKinds?.base).toBe('state'); // Preserve persisted state visual references.
  expect(asset.sourceRegions?.base).toEqual([[...repair.base, 16, 16]]);
  expect(asset.frames.base![0]!.some(row => /[^.]/u.test(row))).toBe(true);
  expect(imported.cells).toHaveLength(source.width * source.height / 256);
  expect(new Set(imported.cells.map(cell => `${cell.x},${cell.y}`)).size).toBe(imported.cells.length);
  for (const cell of imported.cells) for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const symbol = cell.group === null ? '.' : asset.frames[cell.group]![0]![y]![x]!;
    const actual = symbol === '.' ? [0, 0, 0, 0] : hexToRgba(asset.sourcePalette![symbol]!);
    const offset = ((cell.y + y) * source.width + cell.x + x) * 4;
    const expected = [...source.rgba.slice(offset, offset + 4)];
    // RGB underneath fully transparent pixels has no rendered meaning.
    if (expected[3] === 0) expected.fill(0);
    expect(actual, `${repair.name}:${cell.x + x},${cell.y + y}`).toEqual(expected);
  }
});

it('rejects an empty base instead of silently importing a gutter again', () => {
  const asset = { name: 'test', category: 'tiles', size: [16, 16], anchor: [8, 15], frames: {} } as const;
  expect(() => importPaintedTerrain(asset, { width: 16, height: 16, rgba: new Uint8Array(16 * 16 * 4) }, ['a'], [0, 0]))
    .toThrow('must contain visible pixels');
});

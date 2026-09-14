import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { decodePng } from './assets/png.js';
import type { AssetSource } from './assets/types.js';
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

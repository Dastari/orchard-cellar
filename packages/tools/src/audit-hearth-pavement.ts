/** Records exact native pavement variant provenance; never changes approval. */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { decodePng } from './assets/png.js';
import type { AssetSource } from './assets/types.js';
const root = resolve(import.meta.dirname, '../../..');
const file = resolve(root, 'packages/assets/tiles/tile_cf_hearth_pavement.tile.json');
const asset = JSON.parse(await readFile(file, 'utf8')) as AssetSource;
const source = decodePng(await readFile(resolve(root, asset.sourcePath!)));
const regions = asset.frames.base!.map((frame, index) => {
  const matches: [number, number, number, number][] = [];
  for (let sy = 0; sy + 16 <= source.height; sy += 16) {
    for (let sx = 0; sx + 16 <= source.width; sx += 16) {
      let identical = true;
      for (let y = 0; y < 16 && identical; y++) for (let x = 0; x < 16; x++) {
        const at = ((sy + y) * source.width + sx + x) * 4;
        const color = '#' + [...source.rgba.slice(at, at + (source.rgba[at + 3] === 255 ? 3 : 4))]
          .map(v => v.toString(16).padStart(2, '0')).join('');
        if (asset.sourcePalette?.[frame[y]![x]!] !== color) { identical = false; break; }
      }
      if (identical) matches.push([sx, sy, 16, 16]);
    }
  }
  if (matches.length !== 1) throw new Error(`Pavement variant ${index}: expected one exact source match, got ${matches.length}`);
  console.log(`Variant ${index}: ${matches[0]!.join(',')}`);
  return matches[0]!;
});
await writeFile(file, JSON.stringify({ ...asset, sourceRegions: { base: regions } }, null, 2) + '\n');

/** Complete native pavement sheet coverage; no synthetic tiles or inferred joins. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, type DecodedPng } from './assets/png.js';
import type { AssetSource, PaletteSource, PixelGrid } from './assets/types.js';

export interface PavementSourceCell {
  readonly x: number;
  readonly y: number;
  readonly classification: 'retained-base' | 'imported-corner' | 'imported-source-piece' | 'duplicate-source-piece' | 'transparent';
  readonly group: string | null;
  readonly frameIndex: number | null;
}

/** Native sheet grid. The smaller off-grid ring remains coordinate-labelled:
 * importing its pixels does not establish a reusable joining rule for it. */
export function importPavementVariants(asset: AssetSource, source: DecodedPng, characters: readonly string[]): {
  readonly asset: AssetSource;
  readonly cells: readonly PavementSourceCell[];
} {
  if (source.width !== 144 || source.height !== 128) throw new Error('Expected the reviewed 144×128 pavement source sheet');
  if (asset.size[0] !== 16 || asset.size[1] !== 16 || asset.frames.base?.length !== 4) throw new Error('Expected four stable 16×16 pavement base frames');
  const frames: Record<string, readonly PixelGrid[]> = { base: asset.frames.base };
  const sourceRegions: Record<string, readonly (readonly [number, number, number, number])[]> = {
    base: [[0, 0, 16, 16], [16, 0, 16, 16], [0, 16, 16, 16], [16, 16, 16, 16]],
  };
  const sourcePalette = { ...asset.sourcePalette };
  const byColor = new Map(Object.entries(sourcePalette).map(([character, color]) => [color, character]));
  const freeCharacters = characters.filter(character => character !== '.' && sourcePalette[character] === undefined);
  const cells: PavementSourceCell[] = [];
  const sourcePieces = new Map<string, string>();
  for (let y = 0; y < source.height; y += 16) for (let x = 0; x < source.width; x += 16) {
    const rows: string[] = [];
    let nonempty = false;
    for (let dy = 0; dy < 16; dy++) {
      let row = '';
      for (let dx = 0; dx < 16; dx++) {
        const at = ((y + dy) * source.width + x + dx) * 4;
        const alpha = source.rgba[at + 3]!;
        if (alpha === 0) { row += '.'; continue; }
        nonempty = true;
        const hex = '#' + [...source.rgba.slice(at, at + (alpha === 255 ? 3 : 4))]
          .map(value => value.toString(16).padStart(2, '0')).join('');
        let character = byColor.get(hex);
        if (character === undefined) {
          character = freeCharacters.shift();
          if (character === undefined) throw new Error('Pavement source palette exhausted');
          sourcePalette[character] = hex;
          byColor.set(hex, character);
        }
        row += character;
      }
      rows.push(row);
    }
    if (!nonempty) { cells.push({ x, y, classification: 'transparent', group: null, frameIndex: null }); continue; }
    if (x < 32 && y < 32) {
      const frameIndex = y / 16 * 2 + x / 16;
      if (JSON.stringify(rows) !== JSON.stringify(asset.frames.base[frameIndex])) throw new Error(`Stable pavement base ${frameIndex} no longer matches source`);
      cells.push({ x, y, classification: 'retained-base', group: 'base', frameIndex });
      continue;
    }
    const corner = x >= 80 && y < 32;
    // Only newly imported static source pieces share this alias namespace.
    // Never collapse established base variants, named corner roles, states,
    // seasons, animations, or another asset because its pixels happen to match.
    const pixels = JSON.stringify(rows);
    const duplicate = corner ? undefined : sourcePieces.get(pixels);
    if (duplicate !== undefined) {
      cells.push({ x, y, classification: 'duplicate-source-piece', group: duplicate, frameIndex: 0 });
      continue;
    }
    const group = corner ? `curb_corner_${y === 0 ? 'top' : 'bottom'}_${x === 80 ? 'left' : 'right'}`
      : `source_row_${y / 16 + 1}_column_${x / 16 + 1}`;
    if (!corner) sourcePieces.set(pixels, group);
    frames[group] = [rows];
    sourceRegions[group] = [[x, y, 16, 16]];
    cells.push({ x, y, classification: corner ? 'imported-corner' : 'imported-source-piece', group, frameIndex: 0 });
  }
  return { asset: { ...asset, frames, sourcePalette, sourceRegions,
    frameKinds: Object.fromEntries(Object.keys(frames).map(group => [group, 'variant' as const])) }, cells };
}

async function main(): Promise<void> {
  const root = resolve(import.meta.dirname, '../../..');
  const path = resolve(root, 'packages/assets/tiles/tile_cf_hearth_pavement.tile.json');
  const asset = JSON.parse(await readFile(path, 'utf8')) as AssetSource;
  const palette = JSON.parse(await readFile(resolve(root, 'packages/assets/palette.json'), 'utf8')) as PaletteSource;
  const result = importPavementVariants(asset, decodePng(await readFile(resolve(root, asset.sourcePath!))), Object.keys(palette.colors));
  await writeFile(path, JSON.stringify(result.asset, null, 2) + '\n');
  const directory = resolve(root, 'docs/atlas-audit/palette');
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'pavement-source-coverage.json'), JSON.stringify({ sourcePath: asset.sourcePath,
    width: 144, height: 128, cellSize: 16, expectedCells: 72, processedCells: result.cells.length,
    importedFrames: Object.values(result.asset.frames).flat().length, cells: result.cells }, null, 2) + '\n');
  console.log(`Pavement: ${result.cells.length} source cells accounted for; ${Object.values(result.asset.frames).flat().length} exact choices`);
}
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

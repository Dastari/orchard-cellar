/** Repair empty static imports and retain every painted native source cell. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, type DecodedPng } from './assets/png.js';
import type { AssetSource, PaletteSource, PixelGrid } from './assets/types.js';

export const EMPTY_TERRAIN_REPAIRS = [
  { name: 'tile_cf_desert_grass', size: [48, 80], base: [32, 48] },
  { name: 'tile_cf_interior_wall', size: [224, 96], base: [48, 48] },
] as const;

export function importPaintedTerrain(asset: AssetSource, source: DecodedPng,
  characters: readonly string[], base: readonly [number, number]) {
  if (source.width % 16 || source.height % 16) throw new Error('Expected a complete 16px source grid');
  const colors: Record<string, string> = {};
  const symbols = new Map<string, string>();
  const free = characters.filter(character => character !== '.');
  const frames: Record<string, readonly PixelGrid[]> = {};
  const regions: Record<string, readonly (readonly [number, number, number, number])[]> = {};
  const seen = new Map<string, string>();
  const cells: { x: number; y: number; group: string | null; classification: string }[] = [];
  const positions: (readonly [number, number])[] = [base];
  for (let y = 0; y < source.height; y += 16) for (let x = 0; x < source.width; x += 16) {
    if (x !== base[0] || y !== base[1]) positions.push([x, y]);
  }
  for (const [x, y] of positions) {
    if (x < 0 || y < 0 || x + 16 > source.width || y + 16 > source.height) throw new Error('Source crop outside image');
    let painted = false;
    const rows = Array.from({ length: 16 }, (_, dy) => Array.from({ length: 16 }, (_, dx) => {
      const at = ((y + dy) * source.width + x + dx) * 4;
      const alpha = source.rgba[at + 3]!;
      if (alpha === 0) return '.';
      painted = true;
      const color = '#' + [...source.rgba.slice(at, at + (alpha === 255 ? 3 : 4))]
        .map(value => value.toString(16).padStart(2, '0')).join('');
      let symbol = symbols.get(color);
      if (symbol === undefined) {
        symbol = free.shift();
        if (symbol === undefined) throw new Error('Source palette exhausted');
        symbols.set(color, symbol); colors[symbol] = color;
      }
      return symbol;
    }).join(''));
    const isBase = x === base[0] && y === base[1];
    if (!painted) {
      if (isBase) throw new Error('Reviewed base crop must contain visible pixels');
      cells.push({ x, y, group: null, classification: 'transparent' }); continue;
    }
    const key = JSON.stringify(rows);
    const duplicate = seen.get(key);
    const group = duplicate ?? (isBase ? 'base' : `source_row_${y / 16 + 1}_column_${x / 16 + 1}`);
    if (duplicate === undefined) {
      seen.set(key, group); frames[group] = [rows]; regions[group] = [[x, y, 16, 16]];
    }
    cells.push({ x, y, group, classification: duplicate ? 'duplicate-source-piece' : isBase ? 'repaired-base' : 'imported-source-piece' });
  }
  return { asset: { ...asset, frames, sourcePalette: colors, sourcePaletteMode: 'exact' as const,
    sourceRegions: regions, frameKinds: Object.fromEntries(Object.keys(frames).map(group => [group, group === 'base' ? 'state' as const : 'variant' as const])) },
  cells: cells.sort((a, b) => a.y - b.y || a.x - b.x) };
}

export async function repairEmptyTerrainImports(root: string): Promise<void> {
  const palette = JSON.parse(await readFile(resolve(root, 'packages/assets/palette.json'), 'utf8')) as PaletteSource;
  const ledgers = [];
  for (const repair of EMPTY_TERRAIN_REPAIRS) {
    const path = resolve(root, `packages/assets/tiles/${repair.name}.tile.json`);
    const asset = JSON.parse(await readFile(path, 'utf8')) as AssetSource;
    const source = decodePng(await readFile(resolve(root, asset.sourcePath!)));
    if (source.width !== repair.size[0] || source.height !== repair.size[1]) throw new Error(`Unexpected source dimensions: ${repair.name}`);
    const result = importPaintedTerrain(asset, source, Object.keys(palette.colors), repair.base);
    await writeFile(path, JSON.stringify(result.asset, null, 2) + '\n');
    ledgers.push({ name: repair.name, sourcePath: asset.sourcePath, width: source.width, height: source.height,
      expectedCells: source.width * source.height / 256, processedCells: result.cells.length,
      importedFrames: Object.keys(result.asset.frames).length, cells: result.cells });
  }
  const directory = resolve(root, 'docs/atlas-audit/palette');
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, 'repaired-source-coverage.json'), JSON.stringify(ledgers, null, 2) + '\n');
}
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await repairEmptyTerrainImports(resolve(import.meta.dirname, '../../..'));
}

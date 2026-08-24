import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { decodePng, type DecodedPng } from './assets/png.js';
import { loadAssets, loadPalette, readJson, workspaceRoot } from './assets/load.js';
import type { AssetSource, PixelGrid } from './assets/types.js';

interface CatalogSheet { readonly source: string }
interface Catalog { readonly sheets: readonly CatalogSheet[] }
interface PaletteLab { readonly character: string; readonly lab: readonly [number, number, number] }
interface SourceCrop { readonly x: number; readonly y: number }

function srgb(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

function oklab(red: number, green: number, blue: number): readonly [number, number, number] {
  const r = srgb(red); const g = srgb(green); const b = srgb(blue);
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const lr = Math.cbrt(l); const mr = Math.cbrt(m); const sr = Math.cbrt(s);
  return [
    0.2104542553 * lr + 0.793617785 * mr - 0.0040720468 * sr,
    1.9779984951 * lr - 2.428592205 * mr + 0.4505937099 * sr,
    0.0259040371 * lr + 0.7827717662 * mr - 0.808675766 * sr,
  ];
}

function distance(left: readonly number[], right: readonly number[]): number {
  return (left[0]! - right[0]!) ** 2 + (left[1]! - right[1]!) ** 2 + (left[2]! - right[2]!) ** 2;
}

function nearestCharacter(red: number, green: number, blue: number, palette: readonly PaletteLab[]): string {
  const lab = oklab(red, green, blue);
  let nearest = palette[0]!;
  for (const entry of palette) if (distance(lab, entry.lab) < distance(lab, nearest.lab)) nearest = entry;
  return nearest.character;
}

function cleanOrphans(rows: readonly string[]): string[] {
  const cleaned = rows.map((row) => [...row]);
  for (let y = 0; y < cleaned.length; y += 1) for (let x = 0; x < (cleaned[y]?.length ?? 0); x += 1) {
    const character = cleaned[y]?.[x] ?? '.';
    if (character === '.') continue;
    const neighbors = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const;
    if (neighbors.some(([nx, ny]) => cleaned[ny]?.[nx] === character)) continue;
    cleaned[y]![x] = neighbors.map(([nx, ny]) => cleaned[ny]?.[nx] ?? '.').find((candidate) => candidate !== '.') ?? '.';
  }
  return cleaned.map((row) => row.join(''));
}

function snappedCrop(
  decoded: DecodedPng,
  crop: SourceCrop,
  width: number,
  height: number,
  palette: readonly PaletteLab[],
): string[] {
  const rows: string[] = [];
  for (let y = 0; y < height; y += 1) {
    let row = '';
    for (let x = 0; x < width; x += 1) {
      const offset = ((crop.y + y) * decoded.width + crop.x + x) * 4;
      if ((decoded.rgba[offset + 3] ?? 0) < 128) row += '.';
      else row += nearestCharacter(decoded.rgba[offset] ?? 0, decoded.rgba[offset + 1] ?? 0, decoded.rgba[offset + 2] ?? 0, palette);
    }
    rows.push(row);
  }
  return cleanOrphans(rows);
}

function sameGrid(left: PixelGrid, right: PixelGrid): boolean {
  return left.length === right.length && left.every((row, index) => row === right[index]);
}

function candidateCrops(decoded: DecodedPng, width: number, height: number, exhaustive: boolean): SourceCrop[] {
  const crops: SourceCrop[] = [];
  const stepX = exhaustive ? 1 : width;
  const stepY = exhaustive ? 1 : height;
  for (let y = 0; y <= decoded.height - height; y += stepY) {
    for (let x = 0; x <= decoded.width - width; x += stepX) crops.push({ x, y });
  }
  return crops;
}

function locateFrames(
  decoded: DecodedPng,
  asset: AssetSource,
  palette: readonly PaletteLab[],
): Map<PixelGrid, SourceCrop> | null {
  const targets = Object.values(asset.frames).flatMap((frames) => [...frames]);
  for (const exhaustive of [false, true]) {
    const candidates = candidateCrops(decoded, asset.size[0], asset.size[1], exhaustive);
    const located = new Map<PixelGrid, SourceCrop>();
    for (const target of targets) {
      const match = candidates.find((crop) => asset.sourcePaletteMode === 'exact'
        ? exactCropMatches(decoded, crop, target, asset.sourcePalette ?? {})
        : sameGrid(target, snappedCrop(decoded, crop, asset.size[0], asset.size[1], palette)));
      if (!match) break;
      located.set(target, match);
    }
    if (located.size === targets.length) return located;
  }
  return null;
}

function exactCropMatches(
  decoded: DecodedPng,
  crop: SourceCrop,
  grid: PixelGrid,
  sourcePalette: Readonly<Record<string, string>>,
): boolean {
  for (let y = 0; y < grid.length; y += 1) for (let x = 0; x < (grid[y]?.length ?? 0); x += 1) {
    const character = grid[y]?.[x] ?? '.';
    const offset = ((crop.y + y) * decoded.width + crop.x + x) * 4;
    const alpha = decoded.rgba[offset + 3] ?? 0;
    if (character === '.') {
      if (alpha >= 128) return false;
      continue;
    }
    const expectedValue = sourcePalette[character]?.toLowerCase();
    const expected = expectedValue?.slice(0, 7);
    const actual = `#${(decoded.rgba[offset] ?? 0).toString(16).padStart(2, '0')}${(decoded.rgba[offset + 1] ?? 0).toString(16).padStart(2, '0')}${(decoded.rgba[offset + 2] ?? 0).toString(16).padStart(2, '0')}`;
    const expectedAlpha = expectedValue?.length === 9 ? Number.parseInt(expectedValue.slice(7), 16) : null;
    if ((expectedAlpha === null ? alpha < 128 : alpha !== expectedAlpha) || expected !== actual) return false;
  }
  return true;
}

function nativeHex(decoded: DecodedPng, x: number, y: number): string | null {
  const offset = (y * decoded.width + x) * 4;
  const alpha = decoded.rgba[offset + 3] ?? 0;
  if (alpha === 0) return null;
  const red = decoded.rgba[offset] ?? 0;
  const green = decoded.rgba[offset + 1] ?? 0;
  const blue = decoded.rgba[offset + 2] ?? 0;
  const rgb = `${red.toString(16).padStart(2, '0')}${green.toString(16).padStart(2, '0')}${blue.toString(16).padStart(2, '0')}`;
  return `#${rgb}${alpha === 255 ? '' : alpha.toString(16).padStart(2, '0')}`;
}

function exactFrames(
  decoded: DecodedPng,
  asset: AssetSource,
  locations: ReadonlyMap<PixelGrid, SourceCrop>,
  characters: readonly string[],
): { readonly frames: AssetSource['frames']; readonly sourcePalette: Record<string, string> } | null {
  const nativeColors = new Set<string>();
  for (const [grid, crop] of locations) for (let y = 0; y < grid.length; y += 1) for (let x = 0; x < (grid[y]?.length ?? 0); x += 1) {
    const hex = nativeHex(decoded, crop.x + x, crop.y + y);
    if (hex) nativeColors.add(hex);
  }
  const sortedColors = [...nativeColors].sort();
  if (sortedColors.length > characters.length) return null;
  const colorCharacters = new Map(sortedColors.map((hex, index) => [hex, characters[index]!]));
  const sourcePalette = Object.fromEntries(sortedColors.map((hex) => [colorCharacters.get(hex)!, hex]));
  const frames = Object.fromEntries(Object.entries(asset.frames).map(([name, grids]) => [name, grids.map((grid) => {
    const crop = locations.get(grid);
    if (!crop) throw new Error(`Missing located crop for ${asset.name}.${name}`);
    return Array.from({ length: asset.size[1] }, (_, y) => Array.from({ length: asset.size[0] }, (_, x) => {
      const hex = nativeHex(decoded, crop.x + x, crop.y + y);
      return hex ? colorCharacters.get(hex)! : '.';
    }).join(''));
  })]));
  return { frames, sourcePalette };
}

function exactRegionFrames(
  decoded: DecodedPng,
  asset: AssetSource,
  region: readonly [number, number, number, number],
  characters: readonly string[],
): { readonly frames: AssetSource['frames']; readonly sourcePalette: Record<string, string> } | null {
  const [sourceX, sourceY, width, height] = region;
  if (width > asset.size[0] || height > asset.size[1]
    || sourceX < 0 || sourceY < 0 || sourceX + width > decoded.width || sourceY + height > decoded.height) return null;
  const colors = new Set<string>();
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const hex = nativeHex(decoded, sourceX + x, sourceY + y);
    if (hex) colors.add(hex);
  }
  const sortedColors = [...colors].sort();
  if (sortedColors.length > characters.length) return null;
  const colorCharacters = new Map(sortedColors.map((hex, index) => [hex, characters[index]!]));
  const sourcePalette = Object.fromEntries(sortedColors.map((hex) => [colorCharacters.get(hex)!, hex]));
  const destinationX = Math.floor((asset.size[0] - width) / 2);
  const destinationY = asset.size[1] - height;
  const frame = Array.from({ length: asset.size[1] }, (_, y) => Array.from({ length: asset.size[0] }, (_, x) => {
    const regionX = x - destinationX;
    const regionY = y - destinationY;
    if (regionX < 0 || regionY < 0 || regionX >= width || regionY >= height) return '.';
    const hex = nativeHex(decoded, sourceX + regionX, sourceY + regionY);
    return hex ? colorCharacters.get(hex)! : '.';
  }).join(''));
  const groupName = Object.keys(asset.frames)[0] ?? 'base';
  return { frames: { [groupName]: [frame] }, sourcePalette };
}

function assetPath(asset: AssetSource): URL {
  const suffix = asset.category === 'tiles' ? 'tile' : 'sprite';
  return new URL(`packages/assets/${asset.category}/${asset.name}.${suffix}.json`, workspaceRoot);
}

const catalog = await readJson(new URL('build/cute-fantasy-catalog/catalog.json', workspaceRoot)) as Catalog;
const [assets, palette] = await Promise.all([loadAssets(), loadPalette()]);
const paletteLabs = Object.entries(palette.colors).map(([character, hex]) => {
  const value = Number.parseInt(hex.slice(1), 16);
  return { character, lab: oklab((value >>> 16) & 255, (value >>> 8) & 255, value & 255) };
});
const paletteCharacters = Object.keys(palette.colors);
const sourcesByName = new Map<string, string[]>();
for (const sheet of catalog.sheets) {
  const paths = sourcesByName.get(basename(sheet.source)) ?? [];
  paths.push(sheet.source);
  sourcesByName.set(basename(sheet.source), paths);
}

let exactCount = 0;
const unresolved: string[] = [];
for (const asset of assets) {
  if (!asset.importedFrom) continue;
  const candidates = sourcesByName.get(asset.importedFrom);
  if (!candidates?.length) continue;
  let restored: { readonly sourcePath: string; readonly frames: AssetSource['frames']; readonly sourcePalette: Record<string, string> } | null = null;
  const preferred = asset.sourcePath ? [asset.sourcePath, ...candidates.filter((candidate) => candidate !== asset.sourcePath)] : candidates;
  for (const sourcePath of preferred) {
    const decoded = decodePng(await readFile(new URL(sourcePath, workspaceRoot)));
    if (asset.sourceRegion) {
      const exact = exactRegionFrames(decoded, asset, asset.sourceRegion, paletteCharacters);
      if (exact) restored = { sourcePath, ...exact };
      if (restored) break;
    }
    const locations = locateFrames(decoded, asset, paletteLabs);
    if (!locations) continue;
    const exact = exactFrames(decoded, asset, locations, paletteCharacters);
    if (!exact) continue;
    restored = { sourcePath, ...exact };
    break;
  }
  if (!restored) {
    unresolved.push(asset.name);
    continue;
  }
  const path = assetPath(asset);
  const source = await readJson(path) as Record<string, unknown>;
  source['frames'] = restored.frames;
  source['sourcePalette'] = restored.sourcePalette;
  source['sourcePath'] = restored.sourcePath;
  source['sourcePaletteMode'] = 'exact';
  await writeFile(path, `${JSON.stringify(source, null, 2)}\n`);
  exactCount += 1;
  console.log(`${asset.name}: exact ${Object.keys(restored.sourcePalette).length}-color crop from ${restored.sourcePath}`);
}
if (unresolved.length) throw new Error(`Could not reconstruct exact source crops: ${unresolved.join(', ')}`);
console.log(`Restored exact native source pixels for ${exactCount} assets.`);

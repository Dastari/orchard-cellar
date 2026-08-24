import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { decodePng } from './assets/png.js';
import { loadAssets, loadPalette, readJson, workspaceRoot } from './assets/load.js';
import type { AssetSource } from './assets/types.js';

interface CatalogSheet { readonly source: string }
interface Catalog { readonly sheets: readonly CatalogSheet[] }

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

function usedCharacters(asset: AssetSource): ReadonlySet<string> {
  const used = new Set<string>();
  for (const groups of Object.values(asset.frames)) {
    for (const grid of groups) for (const row of grid) for (const character of row) if (character !== '.') used.add(character);
  }
  return used;
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
const sourcesByName = new Map<string, string[]>();
for (const sheet of catalog.sheets) {
  const paths = sourcesByName.get(basename(sheet.source)) ?? [];
  paths.push(sheet.source);
  sourcesByName.set(basename(sheet.source), paths);
}

let updated = 0;
for (const asset of assets) {
  if (!asset.importedFrom) continue;
  const candidates = sourcesByName.get(asset.importedFrom);
  if (!candidates?.length) continue;
  const used = usedCharacters(asset);
  let best: { source: string; sourcePalette: Record<string, string>; coverage: number } | undefined;
  for (const sourcePath of candidates.sort()) {
    const decoded = decodePng(await readFile(new URL(sourcePath, workspaceRoot)));
    const counts = new Map<string, Map<string, number>>();
    for (let offset = 0; offset < decoded.rgba.length; offset += 4) {
      if ((decoded.rgba[offset + 3] ?? 0) < 128) continue;
      const red = decoded.rgba[offset] ?? 0;
      const green = decoded.rgba[offset + 1] ?? 0;
      const blue = decoded.rgba[offset + 2] ?? 0;
      const lab = oklab(red, green, blue);
      let nearest = paletteLabs[0]!;
      for (const entry of paletteLabs) if (distance(lab, entry.lab) < distance(lab, nearest.lab)) nearest = entry;
      if (!used.has(nearest.character)) continue;
      const hex = `#${red.toString(16).padStart(2, '0')}${green.toString(16).padStart(2, '0')}${blue.toString(16).padStart(2, '0')}`;
      const colors = counts.get(nearest.character) ?? new Map<string, number>();
      colors.set(hex, (colors.get(hex) ?? 0) + 1);
      counts.set(nearest.character, colors);
    }
    const sourcePalette: Record<string, string> = {};
    for (const character of [...used].sort()) {
      const colors = counts.get(character);
      if (!colors?.size) continue;
      sourcePalette[character] = [...colors].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]![0];
    }
    const coverage = Object.keys(sourcePalette).length;
    if (!best || coverage > best.coverage) best = { source: sourcePath, sourcePalette, coverage };
  }
  if (!best || best.coverage === 0) continue;
  const path = assetPath(asset);
  const source = await readJson(path) as Record<string, unknown>;
  source['sourcePalette'] = best.sourcePalette;
  source['sourcePath'] = best.source;
  await writeFile(path, `${JSON.stringify(source, null, 2)}\n`);
  updated += 1;
  console.log(`${asset.name}: ${best.coverage}/${used.size} native colors from ${best.source}`);
}
console.log(`Restored native source ramps for ${updated} assets.`);

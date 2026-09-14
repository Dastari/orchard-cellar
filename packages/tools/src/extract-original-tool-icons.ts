import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { loadPalette, workspaceRoot } from './assets/load.js';
import { decodePng } from './assets/png.js';
import type { AssetSource } from './assets/types.js';

// Retained owner-authored masters: no resampling, palette remapping or cleanup.
const source = 'references/art/orchard-originals/tools/Tool_Icons_Extra_NO_Outline.png';
const image = decodePng(await readFile(new URL(source, workspaceRoot)));
const characters = Object.keys((await loadPalette()).colors);
for (const [name, x] of [['icon_cf_shovel', 0], ['icon_cf_hammer', 32]] as const) {
  if (x + 16 > image.width || image.height !== 16) throw new Error(`Invalid original tool sheet: ${source}`);
  const url = new URL(`packages/assets/ui/${name}.sprite.json`, workspaceRoot);
  const original = JSON.parse(await readFile(url, 'utf8')) as AssetSource;
  const pixels = Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, dx) => {
    const offset = (y * image.width + x + dx) * 4;
    const alpha = image.rgba[offset + 3]!;
    if (alpha === 0) return null;
    return `#${[...image.rgba.slice(offset, offset + (alpha === 255 ? 3 : 4))]
      .map((value) => value.toString(16).padStart(2, '0')).join('')}`;
  }));
  const colors = [...new Set(pixels.flat().filter((color): color is string => color !== null))].sort();
  if (colors.length > characters.length) throw new Error(`Too many native colors in ${name}`);
  const characterByColor = new Map(colors.map((color, index) => [color, characters[index]!]));
  const asset: AssetSource = {
    ...original,
    frames: { base: [pixels.map((row) => row.map((color) => color === null ? '.' : characterByColor.get(color)!).join(''))] },
    approved: true,
    sourcePath: source,
    importedFrom: basename(source),
    sourceRegion: [x, 0, 16, 16],
    sourcePaletteMode: 'exact',
    sourcePalette: Object.fromEntries(colors.map((color) => [characterByColor.get(color)!, color])),
  };
  await writeFile(url, `${JSON.stringify(asset, null, 2)}\n`);
}
console.log('Extracted 2 plain native Orchard original tool icons.');

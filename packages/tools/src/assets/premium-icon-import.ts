import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPalette, workspaceRoot } from './load.js';
import { decodePng, encodePng } from './png.js';
import type { AssetSource } from './types.js';

export const premiumToolSheet = 'references/art/kenmi/cute-fantasy/icons/Cute_Fantasy_Icons_Tools/16x16/Tools_all_16x16.png';
export const premiumFarmingSheet = 'references/art/kenmi/cute-fantasy/icons/Cute_Fantasy_Icons_Farming/16x16/Farming_all_16x16.png';

/** Import one native cell. Palette derivatives retain geometry, alpha and handles. */
export async function importPremiumIcon(name: string, source: string, column: number, row: number,
  tags: readonly string[], replacements?: Readonly<Record<string, string>>): Promise<void> {
  const image = decodePng(await readFile(new URL(source, workspaceRoot)));
  const x = column * 16;
  const y = row * 16;
  if (!Number.isInteger(column) || !Number.isInteger(row) || x < 0 || y < 0
    || x + 16 > image.width || y + 16 > image.height) throw new Error(`Invalid premium crop: ${name}`);
  const pixels: (string | null)[][] = [];
  const rgba = new Uint8Array(16 * 16 * 4);
  for (let dy = 0; dy < 16; dy++) {
    const line: (string | null)[] = [];
    for (let dx = 0; dx < 16; dx++) {
      const offset = ((y + dy) * image.width + x + dx) * 4;
      const color = image.rgba.subarray(offset, offset + 4);
      const hex = `#${[...color.subarray(0, color[3] === 255 ? 3 : 4)].map(v => v.toString(16).padStart(2, '0')).join('')}`;
      const replacement = replacements?.[hex] ?? hex;
      line.push(color[3] === 0 ? null : replacement);
      rgba.set(color, (dy * 16 + dx) * 4);
      if (replacement !== hex) {
        for (let c = 0; c < 3; c++) rgba[(dy * 16 + dx) * 4 + c] = parseInt(replacement.slice(1 + c * 2, 3 + c * 2), 16);
      }
    }
    pixels.push(line);
  }
  const colors = [...new Set(pixels.flat().filter((v): v is string => v !== null))].sort();
  const characters = Object.keys((await loadPalette()).colors);
  if (colors.length === 0 || colors.length > characters.length) throw new Error(`Invalid premium colors: ${name}`);
  const keys = new Map(colors.map((color, i) => [color, characters[i]!]));
  let sourcePath = source;
  let sourceRegion: readonly [number, number, number, number] = [x, y, 16, 16];
  if (replacements !== undefined) {
    sourcePath = `art/custom/tool-progression/${name}.png`;
    const url = new URL(sourcePath, workspaceRoot);
    await mkdir(dirname(fileURLToPath(url)), { recursive: true });
    await writeFile(url, encodePng(16, 16, rgba));
    sourceRegion = [0, 0, 16, 16];
  }
  const asset: AssetSource = {
    name, category: 'ui', size: [16, 16], anchor: [8, 15],
    frames: { base: [pixels.map(line => line.map(color => color === null ? '.' : keys.get(color)!).join(''))] },
    frameKinds: { base: 'state' }, sourcePath, sourceRegion,
    importedFrom: basename(sourcePath), sourcePaletteMode: 'exact',
    sourcePalette: Object.fromEntries(colors.map(color => [keys.get(color)!, color])),
    approved: true, tags: ['ui.icon', ...tags, replacements ? 'source.kenmi_derivative' : 'source.kenmi'],
    placement: { layer: 'ui', builderAvailable: false },
  };
  await writeFile(new URL(`packages/assets/ui/${name}.sprite.json`, workspaceRoot), `${JSON.stringify(asset, null, 2)}\n`);
}

export async function importPremiumTools(): Promise<void> {
  await importPremiumIcon('icon_cf_hammer', premiumToolSheet, 0, 35, ['item.tool', 'tool.hammer']);
  for (const [material, column] of [['wood', 2], ['stone', 1], ['copper', 2], ['iron', 1], ['silver', 0], ['gold', 3]] as const) {
    // Only blade colours change. None of these keys occur in the handle or outline.
    const replacements = material === 'wood'
      ? { '#743f39': '#593019', '#b86f50': '#895024', '#e4a672': '#b77a37', '#ead4aa': '#daa557' }
      : material === 'stone'
        ? { '#424c6e': '#424548', '#6c7c9d': '#606568', '#8e9ab4': '#80888a', '#c0cbdc': '#a0a6a5' }
        : undefined;
    await importPremiumIcon(`icon_tool_${material}_shovel`, premiumToolSheet, column, 8,
      ['item.tool', 'tool.shovel', `tool.material.${material}`], replacements);
  }
  // Keep the historical alias consistent for older consumers/import commands.
  await importPremiumIcon('icon_cf_shovel', premiumToolSheet, 1, 8, ['item.tool', 'tool.shovel']);
}

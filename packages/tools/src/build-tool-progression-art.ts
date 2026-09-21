import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { workspaceRoot } from './assets/load.js';
import { encodePng } from './assets/png.js';
import { importPremiumTools } from './assets/premium-icon-import.js';
import type { AssetSource } from './assets/types.js';

const root = fileURLToPath(workspaceRoot);
const ramps = {
  wood: ['#593019', '#895024', '#b77a37', '#daa557', '#f2ca84'],
  stone: ['#424548', '#606568', '#80888a', '#a0a6a5', '#c3c5ba'],
  copper: ['#713f2b', '#a45e36', '#ca814a', '#e7a76a', '#f6cf98'],
  gold: ['#795021', '#ad7829', '#d6a63d', '#f2cc62', '#fff0a4'],
  silver: ['#555e78', '#818da9', '#afbcd1', '#d9e1ec', '#f4f5f5'],
  iron: ['#3c4856', '#5a6c7b', '#8596a3', '#b2c0c7', '#dfe5e4'],
} as const;
type Material = keyof typeof ramps;
type Tool = 'axe' | 'hoe' | 'pickaxe';
const tools: readonly Tool[] = ['axe', 'hoe', 'pickaxe'];
const rgb = (hex: string): number[] => [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
const nearest = (color: readonly number[], ramp: readonly string[]): number => {
  const distances = ramp.map((hex) => rgb(hex).reduce((sum, value, index) => sum + (value - color[index]!) ** 2, 0));
  return distances.indexOf(Math.min(...distances));
};

// Native pixels approved at inventory scale. Keep animation/material ramps
// above independent: an inventory artwork revision must not recolor swings.
const icons = JSON.parse(await readFile(resolve(root,
  'art/custom/tool-progression/icons.source.json'), 'utf8')) as {
  geometry: Record<Tool, string[]>;
  materials: Record<Material, string[]>;
  handle: Record<string, string>;
};

async function bake(source: AssetSource): Promise<void> {
  const groups = Object.entries(source.frames);
  const [width, frameHeight] = source.size;
  const height = groups.reduce((sum, [, frames]) => sum + frames.length * frameHeight, 0);
  const pixels = new Uint8Array(width * height * 4);
  const regions: Record<string, [number, number, number, number][]> = {};
  const used = new Set<string>();
  let originY = 0;
  for (const [group, frames] of groups) {
    regions[group] = [];
    for (const rows of frames) {
      regions[group].push([0, originY, width, frameHeight]);
      rows.forEach((row, y) => [...row].forEach((character, x) => {
        if (character === '.') return;
        used.add(character);
        const hex = source.sourcePalette![character]!;
        pixels.set([...rgb(hex), hex.length === 9 ? parseInt(hex.slice(7), 16) : 255], ((originY + y) * width + x) * 4);
      }));
      originY += frameHeight;
    }
  }
  const file = `${source.name}.png`;
  const sourcePath = `art/custom/tool-progression/${file}`;
  await writeFile(resolve(root, sourcePath), encodePng(width, height, pixels));
  const { sourceRegion, ...base } = source;
  void sourceRegion;
  const asset: AssetSource = {
    ...base, approved: true, importedFrom: file, sourcePath,
    sourcePalette: Object.fromEntries(Object.entries(source.sourcePalette!).filter(([key]) => used.has(key))),
    sourcePaletteMode: 'exact', sourceRegions: regions,
  };
  await writeFile(resolve(root, `packages/assets/${asset.category}/${asset.name}.sprite.json`), `${JSON.stringify(asset, null, 2)}\n`);
}

await mkdir(resolve(root, 'art/custom/tool-progression'), { recursive: true });
for (const tool of tools) {
  const rows = icons.geometry[tool];
  if (rows.length !== 16 || rows.some(row => row.length !== 16 || /[^.ABCD012]/.test(row))) {
    throw new Error(`Invalid approved native tool geometry: ${tool}`);
  }
  for (const material of Object.keys(ramps) as Material[]) {
    await bake({
      name: `icon_tool_${material}_${tool}`, category: 'ui', size: [16, 16], anchor: [8, 15],
      frames: { base: [rows] }, frameKinds: { base: 'state' },
      sourcePalette: { ...icons.handle,
        ...Object.fromEntries(icons.materials[material].map((color, i) => ['ABCD'[i]!, color])) },
      tags: ['ui.icon', 'item.tool', 'source.orchard_derivative', `tool.material.${material}`],
      placement: { layer: 'ui', builderAvailable: false },
    });
    const original = JSON.parse(await readFile(resolve(root, `packages/assets/characters/tool_cf_iron_${tool}_action.sprite.json`), 'utf8')) as AssetSource;
    await bake({
      ...original, name: `tool_${material}_${tool}`,
      sourcePalette: Object.fromEntries(Object.entries(original.sourcePalette!).map(([key, hex]) => {
        const color = rgb(hex);
        const metal = hex.length === 7 && Math.max(...color) - Math.min(...color) < 65;
        return [key, metal ? ramps[material][nearest(color, ramps.iron)]! : hex];
      })),
      tags: [...(original.tags ?? []), `tool.material.${material}`, 'source.orchard_derivative'],
    });
  }
}
for (const [name, template] of [['item_silver_ore', 'item_cf_iron_ore'], ['item_silver_bar', 'item_cf_iron_bar']] as const) {
  const original = JSON.parse(await readFile(resolve(root, `packages/assets/props/${template}.sprite.json`), 'utf8')) as AssetSource;
  await bake({ ...original, name, sourcePalette: Object.fromEntries(Object.entries(original.sourcePalette!).map(([key, hex]) => {
    const color = rgb(hex);
    const metal = hex.length === 7 && Math.max(...color) - Math.min(...color) < 65;
    return [key, metal ? ramps.silver[nearest(color, ramps.iron)]! : hex];
  })), tags: [...(original.tags ?? []), 'source.orchard_derivative'] });
}
await importPremiumTools();
console.log('Baked tool icons, premium hammer/shovels, 18 material swing overlays, and 2 silver material icons.');

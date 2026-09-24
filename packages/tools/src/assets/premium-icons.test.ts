import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { loadAssets, workspaceRoot } from './load.js';
import { decodePng } from './png.js';
import type { AssetSource } from './types.js';

function pixels(asset: AssetSource): (string | null)[] {
  return asset.frames['base']![0]!.flatMap(row => [...row].map(c => c === '.' ? null : asset.sourcePalette![c]!));
}

describe('premium tool, skill and seed artwork', () => {
  it('distinguishes all six shovel tiers while preserving their shared silhouette and handle', async () => {
    const assets = new Map((await loadAssets()).map(a => [a.name, a]));
    const variants = ['wood', 'stone', 'copper', 'iron', 'silver', 'gold'].map(m => pixels(assets.get(`icon_tool_${m}_shovel`)!));
    expect(new Set(variants.map(p => JSON.stringify(p))).size).toBe(6);
    for (const variant of variants) {
      expect(variant.map(c => c !== null)).toEqual(variants[0]!.map(c => c !== null));
      // Handle is below the blade; recolouring only touches the blade's four colours.
      expect(variant.slice(9 * 16)).toEqual(variants[0]!.slice(9 * 16));
    }
  });

  it('gives each orchard seed its own packet and separates crop and orchard skill artwork', async () => {
    const assets = new Map((await loadAssets()).map(a => [a.name, a]));
    const items = JSON.parse(await readFile(new URL('packages/assets/content/items.json', workspaceRoot), 'utf8')) as { id: string; icon: { asset: string } }[];
    const packets = ['apple', 'cherry', 'peach', 'pear'].map(fruit => {
      const item = items.find(i => i.id === `item:${fruit}_seed`)!;
      expect(item.icon.asset).toBe(`icon_seed_${fruit}`);
      return pixels(assets.get(item.icon.asset)!);
    });
    expect(new Set(packets.map(p => JSON.stringify(p))).size).toBe(4);
    expect(pixels(assets.get('icon_skill_seed_saver')!)).not.toEqual(pixels(assets.get('icon_skill_orchard_seed_saver')!));
  });

  it.skipIf(process.env['ORCHARD_TEST_LICENSED_ART'] === '0')('preserves exact source pixels for every premium import and retained derivative', async () => {
    const assets = (await loadAssets()).filter(a => a.tags?.some(t => t === 'source.kenmi' || t === 'source.kenmi_derivative'));
    const gearImports = JSON.parse(await readFile(new URL('packages/tools/src/gear-icon-imports.json', workspaceRoot), 'utf8')) as {
      imports: { asset: string }[];
    };
    const gearNames = gearImports.imports.map(({ asset }) => asset).sort();
    const gearNameSet = new Set(gearNames);
    const materialImports = JSON.parse(await readFile(new URL('packages/tools/src/material-icon-imports.json', workspaceRoot), 'utf8')) as {
      imports: { asset: string; source: string }[];
    };
    // Only the Kenmi-sourced material crops carry source.kenmi; Clockwork Raven ones are tagged separately.
    const materialNames = materialImports.imports.filter(({ source }) => source.includes('/kenmi/')).map(({ asset }) => asset).sort();
    const materialNameSet = new Set(materialNames);
    const nonFoodAssets = assets.filter(asset => !asset.tags?.includes('feature.food_alchemy'));
    // The original 20 replacements plus legacy shovel alias remain intact.
    expect(nonFoodAssets.filter(asset => !gearNameSet.has(asset.name) && !materialNameSet.has(asset.name))).toHaveLength(21);
    // Approved weapon/component imports match the reviewed manifest exactly.
    expect(gearNames).toHaveLength(19);
    expect(nonFoodAssets.filter(asset => gearNameSet.has(asset.name)).map(asset => asset.name).sort()).toEqual(gearNames);
    // Approved crafting-material imports (Craft-D2 / Prog-D1) match their reviewed manifest exactly.
    expect(materialNames).toHaveLength(24);
    expect(nonFoodAssets.filter(asset => materialNameSet.has(asset.name)).map(asset => asset.name).sort()).toEqual(materialNames);
    // Retain source-pixel checks for every import, including food/alchemy and gear.
    for (const asset of assets) {
      const image = decodePng(await readFile(new URL(asset.sourcePath!, workspaceRoot)));
      const [x, y, width, height] = asset.sourceRegion!;
      expect([width, height]).toEqual([16, 16]);
      const expected: (string | null)[] = [];
      for (let dy = 0; dy < 16; dy++) for (let dx = 0; dx < 16; dx++) {
        const offset = ((y + dy) * image.width + x + dx) * 4;
        const rgba = image.rgba.slice(offset, offset + 4);
        expected.push(rgba[3] === 0 ? null : `#${[...rgba.slice(0, rgba[3] === 255 ? 3 : 4)].map(c => c.toString(16).padStart(2, '0')).join('')}`);
      }
      expect(pixels(asset), asset.name).toEqual(expected);
    }
  });
});

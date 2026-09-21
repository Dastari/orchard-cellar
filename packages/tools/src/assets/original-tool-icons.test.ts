import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { loadAssets, workspaceRoot } from './load.js';

describe('plain native tool icons', () => {
  it('uses premium tool provenance for the hammer and legacy shovel', async () => {
    const assets = await loadAssets();
    for (const [name, x, y] of [['icon_cf_hammer', 0, 560], ['icon_cf_shovel', 16, 128]] as const) {
      const asset = assets.find((candidate) => candidate.name === name)!;
      expect(asset.sourcePath).toBe('references/art/kenmi/cute-fantasy/icons/Cute_Fantasy_Icons_Tools/16x16/Tools_all_16x16.png');
      expect(asset.sourceRegion).toEqual([x, y, 16, 16]);
      expect(asset.sourcePaletteMode).toBe('exact');
      expect(Object.values(asset.sourcePalette!)).not.toContain('#f2e3c2');
    }
  });

  it('removes only the fishing rod sticker ring, preserving its body and fishing line', async () => {
    const asset = (await loadAssets()).find((candidate) => candidate.name === 'item_cf_fishing_rod')!;
    const oldRows = [
      '............JJ..', '...........J0J..', '..........J0J...', '.........J0J....',
      '........J0J.....', '.......J0J......', '......J0J.......', '.....J0J........',
      '....J0J.........', '...J0J..........', '..J0J.....x.....', '..J0J.....tx....',
      '...J.....t.x....', '.........t.x....', '..........tx....', '...........x....',
    ];
    expect(asset.frames.base).toEqual([oldRows.map((row) => row.replaceAll('J', '.'))]);
  });

  it('resolves every active item icon across all asset categories', async () => {
    const assets = new Set((await loadAssets()).map((asset) => asset.name));
    const items = JSON.parse(await readFile(new URL('packages/assets/content/items.json', workspaceRoot), 'utf8')) as readonly { readonly id: string; readonly retired?: boolean; readonly icon: { readonly asset: string } }[];
    for (const item of items.filter((definition) => !definition.retired)) {
      expect(assets.has(item.icon.asset), `${item.id} icon ${item.icon.asset}`).toBe(true);
    }
  });
});

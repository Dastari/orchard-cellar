import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadAssets, loadPalette, workspaceRoot } from './assets/load.js';
import type { AssetSource } from './assets/types.js';

// Neither content:validate nor assets:validate checks that an item's icon sprite exists or is
// distinct, so guard the crafting-material icons (Craft-D2 / Prog-D1 materials foundation) here.
const items = JSON.parse(readFileSync(new URL('packages/assets/content/items.json', workspaceRoot), 'utf8')) as
  { id: string; tags: string[]; icon: { asset: string } }[];
const manifest = JSON.parse(readFileSync(new URL('packages/tools/src/material-icon-imports.json', workspaceRoot), 'utf8')) as
  { imports: { item: string; asset: string }[] };

describe('material icons', async () => {
  const assets = await loadAssets();
  const byName = new Map(assets.map((asset) => [asset.name, asset]));
  const palette = (await loadPalette()).colors as Readonly<Record<string, string>>;
  // Resolved RGBA per pixel of the first base frame, so native-palette and palette-snapped sprites compare fairly.
  const pixels = (asset: AssetSource) => JSON.stringify((Object.values(asset.frames)[0]?.[0] ?? []).map((row) =>
    [...row].map((cell) => (cell === '.' ? null : (asset.sourcePalette ?? palette)[cell] ?? cell))));

  it('points every material at an existing sprite in any asset directory', () => {
    const missing = items.filter((item) => item.tags.some((tag) => tag.startsWith('material.')) && !byName.has(item.icon.asset))
      .map((item) => `${item.id} -> ${item.icon.asset}`);
    expect(missing).toEqual([]);
  });

  it('imports every icon listed in material-icon-imports.json and binds it to its item', () => {
    for (const entry of manifest.imports) {
      expect(byName.has(entry.asset), entry.asset).toBe(true);
      expect(items.find((item) => item.id === entry.item)?.icon.asset, entry.item).toBe(entry.asset);
    }
  });

  it('never imports a crop that is pixel-identical to another sprite (the BUG-035 class)', () => {
    const imported = new Set(manifest.imports.map((entry) => entry.asset));
    const others = new Map<string, string[]>();
    for (const asset of assets) {
      if (imported.has(asset.name)) continue;
      const key = pixels(asset);
      others.set(key, [...(others.get(key) ?? []), asset.name]);
    }
    const duplicates = [...imported].flatMap((name) => {
      const clash = others.get(pixels(byName.get(name)!));
      return clash ? [`${name} = ${clash.join(', ')}`] : [];
    });
    expect(duplicates).toEqual([]);
    const own = [...imported].map((name) => pixels(byName.get(name)!));
    expect(new Set(own).size).toBe(own.length);
  });
});

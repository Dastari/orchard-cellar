import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { workspaceRoot } from './assets/load.js';

// Neither content:validate nor assets:validate checks that an item's icon sprite exists,
// so guard the material icons (Craft-D2 / Prog-D1 materials foundation) here.
const items = JSON.parse(readFileSync(new URL('packages/assets/content/items.json', workspaceRoot), 'utf8')) as
  { id: string; tags: string[]; icon: { asset: string } }[];
const spriteExists = (asset: string) => ['ui', 'props'].some((dir) =>
  existsSync(new URL(`packages/assets/${dir}/${asset}.sprite.json`, workspaceRoot)));

describe('material icons', () => {
  it('points every material at an existing sprite', () => {
    const missing = items.filter((item) => item.tags.some((tag) => tag.startsWith('material.')) && !spriteExists(item.icon.asset))
      .map((item) => `${item.id} -> ${item.icon.asset}`);
    expect(missing).toEqual([]);
  });

  it('imports every icon listed in material-icon-imports.json', () => {
    const manifest = JSON.parse(readFileSync(new URL('packages/tools/src/material-icon-imports.json', workspaceRoot), 'utf8')) as
      { imports: { item: string; asset: string }[] };
    for (const entry of manifest.imports) {
      expect(spriteExists(entry.asset), entry.asset).toBe(true);
      expect(items.find((item) => item.id === entry.item)?.icon.asset, entry.item).toBe(entry.asset);
    }
  });
});

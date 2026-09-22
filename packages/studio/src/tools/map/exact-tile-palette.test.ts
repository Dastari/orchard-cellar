import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import type { AssetPaletteItem } from '../object/asset-palette.js';
import { mapObjectCatalog } from './map-object-catalog.js';
import { exactTilePaletteChoices } from './exact-tile-palette.js';

const items: AssetPaletteItem[] = ['tile_cf_path', 'tile_path'].flatMap((assetName, assetId) =>
  Array.from({ length: 47 }, (_, frameIndex) => ({
    key: `${assetId}:variant:base:${frameIndex}`, assetId, assetName, category: 'tiles',
    tags: ['kind.tiles', 'review.approved', 'topology.blob47', 'variant.base'],
    layer: 'ground', footprint: [1, 1], blocksMovement: false, builderAvailable: false,
    visual: { kind: 'variant', name: 'base', frameIndex },
    frame: { x: frameIndex * 16, y: 0, width: 16, height: 16, durationTicks: 0 }, animated: false,
  })));
const catalog = mapObjectCatalog(items, 'test');

it('shows each proven path mask once while preserving both saved catalogs and alias search', () => {
  const before = JSON.stringify(catalog);
  const choices = exactTilePaletteChoices(catalog);
  expect(choices).toHaveLength(47);
  expect(choices.map(prefab => prefab.placements[0]?.visual.frameIndex)).toEqual(Array.from({ length: 47 }, (_, index) => index));
  expect(choices.every(prefab => prefab.placements[0]?.assetName === 'tile_cf_path')).toBe(true);
  expect(exactTilePaletteChoices(catalog, 'tile_path')).toEqual(choices);
  expect(exactTilePaletteChoices(catalog, 'tile path')).toEqual(choices);
  expect(catalog).toHaveLength(94);
  expect(JSON.stringify(catalog)).toBe(before);
});

it('keeps fallback aliases, changed semantics and separately authored prefab identities', () => {
  const alias = catalog[47]!;
  expect(exactTilePaletteChoices([alias])).toEqual([alias]);
  for (const changed of [
    { ...alias, id: 'authored-path' },
    { ...alias, title: 'Special path' },
    { ...alias, cells: alias.cells.map(cell => ({ ...cell, collisionMask: 65535 })) },
    { ...alias, tags: [...alias.tags, 'special-purpose'] },
    { ...alias, placements: alias.placements.map(placement => ({ ...placement, elevation: 1 })) },
  ]) expect(exactTilePaletteChoices([catalog[0]!, changed])).toHaveLength(2);
});

it('guards the explicit alias against future art, topology or source divergence', async () => {
  const sources = await Promise.all(['tile_cf_path', 'tile_path'].map(async name => JSON.parse(await readFile(
    new URL(`../../../../assets/tiles/${name}.tile.json`, import.meta.url), 'utf8')) as Record<string, unknown>));
  for (const key of ['size', 'anchor', 'sourcePath', 'sourcePalette', 'frames', 'frameKinds', 'variantTopologies', 'placement', 'collision']) {
    expect(sources[0]![key], key).toEqual(sources[1]![key]);
  }
});

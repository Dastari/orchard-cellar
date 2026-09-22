import { describe, expect, it } from 'vitest';
import type { AssetPaletteItem } from '../object/asset-palette.js';
import {
  mapLayerForPaletteItem,
  mapObjectCatalog,
  mapObjectCatalogEntries,
  mapPaletteItemAvailable,
  mapPrefabForPaletteItem,
} from './map-object-catalog.js';

const tree: AssetPaletteItem = {
  key: '10:state:base:0',
  assetId: 10,
  assetName: 'tree_cf_apple',
  category: 'trees',
  tags: ['nature.tree', 'resource.wood'],
  layer: 'object',
  footprint: [2, 3],
  blocksMovement: true,
  builderAvailable: true,
  visual: { kind: 'state', name: 'base', frameIndex: 0 },
  frame: { x: 0, y: 0, width: 32, height: 48, durationTicks: 0 },
  animated: false,
};

describe('map object catalog', () => {
  it('adapts generated visuals into collision-preserving reusable prefabs', () => {
    const prefab = mapPrefabForPaletteItem(tree, 'assets-r4');
    expect(prefab).toMatchObject({
      kind: 'map_prefab',
      id: 'asset-10-state-base-0',
      width: 2,
      height: 3,
      pivot: { tileX: 0, tileY: 2 },
      collection: { id: 'trees', label: 'Trees', color: '#5f9f62' },
      behaviors: [{ kind: 'resource', archetype: 'resource.tree' }],
    });
    expect(prefab.cells).toHaveLength(6);
    expect(prefab.cells.every((cell) => cell.collisionMask === 0xffff)).toBe(true);
    expect(mapLayerForPaletteItem(tree)).toBe('canopy');
    expect(mapObjectCatalogEntries([tree], 'assets-r4')).toEqual([
      expect.objectContaining({ item: tree, layer: 'canopy',
        prefab: expect.objectContaining({ id: 'asset-10-state-base-0' }) }),
    ]);
  });

  it('exposes reviewed owner-editor assets independently from player builder flags', () => {
    const reviewed = { ...tree, builderAvailable: false, tags: [...tree.tags, 'review.approved'] };
    expect(mapPaletteItemAvailable(reviewed)).toBe(true);
    expect(mapObjectCatalog([reviewed], 'assets-r4')).toHaveLength(1);
    expect(mapPaletteItemAvailable({ ...reviewed, tags: ['review.pending'] })).toBe(false);
  });

  it('gives exact terrain groups searchable names without changing persisted IDs', () => {
    const pavement: AssetPaletteItem = { ...tree, assetId: 123, assetName: 'tile_cf_hearth_pavement',
      category: 'tiles', footprint: [1, 1], layer: 'ground', blocksMovement: false,
      visual: { kind: 'variant', name: 'curb_corner_top_left', frameIndex: 0 } };
    const prefab = mapPrefabForPaletteItem(pavement, 'assets-r4');
    expect(prefab.id).toBe('asset-123-variant-curb-corner-top-left-0');
    expect(prefab.title).toBe('Hearth Pavement · Curb Corner Top Left · 1');
    expect(prefab.placements[0]?.visual).toEqual(pavement.visual);
    const base = mapObjectCatalog([0, 1, 2, 3].map(frameIndex => ({ ...pavement,
      visual: { kind: 'variant', name: 'base', frameIndex } })), 'assets-r4');
    expect(new Set(base.map(entry => entry.title)).size).toBe(4);
    expect(base.map(entry => entry.id)).toEqual([0, 1, 2, 3].map(index => `asset-123-variant-base-${index}`));
  });
});

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
    expect(mapLayerForPaletteItem(tree)).toBe('gameplay');
    expect(mapObjectCatalogEntries([tree], 'assets-r4')).toEqual([
      expect.objectContaining({ item: tree, layer: 'gameplay',
        prefab: expect.objectContaining({ id: 'asset-10-state-base-0' }) }),
    ]);
  });

  it('exposes reviewed owner-editor assets independently from player builder flags', () => {
    const reviewed = { ...tree, builderAvailable: false, tags: [...tree.tags, 'review.approved'] };
    expect(mapPaletteItemAvailable(reviewed)).toBe(true);
    expect(mapObjectCatalog([reviewed], 'assets-r4')).toHaveLength(1);
    expect(mapPaletteItemAvailable({ ...reviewed, tags: ['review.pending'] })).toBe(false);
  });
});

import { createMapPrefabDocument, normalizeMapPrefab, type MapPrefabDocumentV2 } from '@orchard/sim';
import { describe, expect, it } from 'vitest';
import {
  mapContextPaletteKind,
  mapAnchorPalette,
  mapAnchorToolPalette,
  mapContextPrefabPalette,
  mapPrefabSuggestedLayer,
  mapTerrainPalette,
} from './context-palette.js';

function prefab(id: string, layer: 'ground' | 'object' | 'canopy', behavior: MapPrefabDocumentV2['behaviors'][number]): MapPrefabDocumentV2 {
  const base = createMapPrefabDocument({ id, title: id.replaceAll('-', ' '), width: 1, height: 1 });
  return normalizeMapPrefab({ ...base, tags: ['orchard.test', id], behaviors: [behavior], placements: [{
    id: 'visual', assetId: 1, assetName: `asset-${id}`,
    visual: { kind: 'state', name: 'base', frameIndex: 0 },
    tileX: 0, tileY: 0, elevation: 0, layer, quarterTurns: 0, flipX: false,
  }] });
}

describe('active-layer map context palette', () => {
  it('routes Photoshop layers to terrain, object, or non-placeable palettes', () => {
    expect(mapContextPaletteKind('generated_base')).toBe('terrain');
    expect(mapContextPaletteKind('terrain')).toBe('terrain');
    expect(mapContextPaletteKind('objects')).toBe('objects');
    expect(mapContextPaletteKind('player_owned')).toBe('readonly');
    expect(mapContextPaletteKind('anchors')).toBe('anchors');
  });

  it('lists authored anchors read-only by id, kind, or optional label', () => {
    const anchors = [
      { id: 'north-spawn', kind: 'spawn' as const, tileX: 1, tileY: 2, elevation: 0 },
      { id: 'orchard-gate', kind: 'poi' as const, label: 'Old Orchard Gate', tileX: 3, tileY: 4, elevation: 1 },
    ];
    expect(mapAnchorPalette(anchors, '')).toBe(anchors);
    expect(mapAnchorPalette(anchors, 'spawn')).toEqual([anchors[0]]);
    expect(mapAnchorPalette(anchors, 'old gate')).toEqual([anchors[1]]);
  });

  it('offers annotation placement while retaining runtime kinds as disabled references', () => {
    expect(mapAnchorToolPalette()).toEqual([
      { kind: 'poi', title: 'Point of interest', authorable: true },
      { kind: 'label', title: 'Map label', authorable: true },
      { kind: 'spawn', title: 'Spawn reference', authorable: false },
      { kind: 'portal', title: 'Portal reference', authorable: false },
      { kind: 'npc', title: 'NPC reference', authorable: false },
      { kind: 'resource', title: 'Resource reference', authorable: false },
    ]);
    expect(mapAnchorToolPalette('point')).toEqual([
      { kind: 'poi', title: 'Point of interest', authorable: true },
    ]);
    expect(mapAnchorToolPalette('runtime')).toEqual([]);
  });

  it('searches terrain tools, materials, and thumbnail family names', () => {
    expect(mapTerrainPalette('water').map(({ tool }) => tool)).toEqual(['water']);
    expect(mapTerrainPalette('collision').map(({ tool }) => tool)).toEqual(['block', 'walk', 'inherit']);
    expect(mapTerrainPalette('stone cliff').map(({ tool }) => tool)).toContain('stone');
    expect(mapTerrainPalette('ladder crossing').map(({ tool }) => tool)).toEqual(['transition']);
    expect(mapTerrainPalette('dirt')).toContainEqual(expect.objectContaining({
      tool: 'dirt', assetName: 'tile_cf_path',
    }));
    expect(mapTerrainPalette('dirt')).not.toContainEqual(expect.objectContaining({
      assetName: 'tile_cf_farmland',
    }));
  });

  it('filters prefab thumbnails to the selected painter layer before text search', () => {
    const ground = prefab('stone-path', 'ground', { kind: 'surface', archetype: 'world.surface' });
    const object = prefab('wooden-sign', 'object', { kind: 'static' });
    const gameplay = prefab('apple-tree', 'object', { kind: 'resource', archetype: 'resource.tree' });
    const canopy = prefab('oak-canopy', 'canopy', { kind: 'static' });
    expect([ground, object, gameplay, canopy].map(mapPrefabSuggestedLayer))
      .toEqual(['ground', 'objects', 'canopy', 'canopy']);
    expect(mapContextPrefabPalette([ground, object, gameplay, canopy], 'objects', 'wood sign'))
      .toEqual([object]);
    expect(mapContextPrefabPalette([ground, object, gameplay, canopy], 'canopy', 'apple'))
      .toEqual([gameplay]);
    expect(mapContextPrefabPalette([ground], 'terrain')).toEqual([]);
  });
});

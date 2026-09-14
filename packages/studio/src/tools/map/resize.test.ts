import {
  createEmptyMapDocument,
  createMapPrefabDocument,
  mapDocumentV3Hash,
  migrateMapDocumentV2,
  normalizeMapDocumentV3,
  normalizeMapPrefab,
  type MapDocumentV3,
  type MapLandmarkInstance,
  type MapObjectInstance,
  type TerrainTransition,
} from '@orchard/sim';
import { describe, expect, it } from 'vitest';
import {
  applyStudioMapResize,
  mapResizeImpactLossCount,
  planStudioMapResize,
  type MapResizeEdge,
} from './resize.js';

const EDGE_POINT = {
  west: { tileX: 0, tileY: 1 },
  east: { tileX: 3, tileY: 1 },
  north: { tileX: 1, tileY: 0 },
  south: { tileX: 1, tileY: 3 },
} as const satisfies Readonly<Record<MapResizeEdge, { readonly tileX: number; readonly tileY: number }>>;

const TRANSITION_BY_EDGE: Readonly<Record<MapResizeEdge, TerrainTransition>> = {
  west: {
    contourLevel: 1, kind: 'slope', direction: 'right',
    lowerTileX: 0, lowerTileY: 1, upperTileX: 1, upperTileY: 1,
  },
  east: {
    contourLevel: 1, kind: 'slope', direction: 'right',
    lowerTileX: 2, lowerTileY: 1, upperTileX: 3, upperTileY: 1,
  },
  north: {
    contourLevel: 1, kind: 'slope', direction: 'down',
    lowerTileX: 1, lowerTileY: 0, upperTileX: 1, upperTileY: 1,
  },
  south: {
    contourLevel: 1, kind: 'slope', direction: 'down',
    lowerTileX: 1, lowerTileY: 2, upperTileX: 1, upperTileY: 3,
  },
};

function object(id: string, tileX: number, tileY: number): MapObjectInstance {
  return {
    id, prefabId: 'resize-marker', prefabRevision: 0, tileX, tileY, elevation: 0,
    layer: 'objects', quarterTurns: 0, flipX: false, enabled: true,
  };
}

function landmark(id: string, tileX: number, tileY: number): MapLandmarkInstance {
  return {
    id, sourceDecorationId: id === 'edge-landmark' ? 1 : 2,
    groupId: 'marlow_camp', groupLabel: "Marlow's Camp", kind: 'camp_tent',
    tileX, tileY, elevation: 0, layer: 'objects', variant: 0, animationOffset: 0,
    quarterTurns: 0, flipX: false, enabled: true,
  };
}

function fixture(edge?: MapResizeEdge): MapDocumentV3 {
  const base = migrateMapDocumentV2(createEmptyMapDocument({
    id: 'resize-fixture', title: 'Resize Fixture', width: 4, height: 4,
  }));
  const prefab = normalizeMapPrefab({
    ...createMapPrefabDocument({ id: 'resize-marker', title: 'Resize Marker' }),
    cells: [{ id: 'marker', tileX: 0, tileY: 0, elevation: 0, collisionMask: 0xffff }],
  });
  const edgePoint = edge === undefined ? { tileX: 1, tileY: 1 } : EDGE_POINT[edge];
  return normalizeMapDocumentV3({
    ...base,
    cells: {
      [`${edgePoint.tileX},${edgePoint.tileY}`]: { surface: 'dirt', biome: 'forest' },
      '2,2': { surface: 'stone', biome: 'highland' },
    },
    prefabs: [prefab],
    objects: [object('edge-object', edgePoint.tileX, edgePoint.tileY), object('kept-object', 2, 2)],
    landmarks: [landmark('edge-landmark', edgePoint.tileX, edgePoint.tileY), landmark('kept-landmark', 2, 2)],
    transitions: edge === undefined ? [] : [TRANSITION_BY_EDGE[edge]],
    stairRuns: [{
      x: edgePoint.tileX, y: edgePoint.tileY, direction: 'right', fromLevel: 0, toLevel: 1,
    }],
    scenery: [{ id: 'edge-scenery', assetId: 'marker', ...edgePoint, elevation: 0 }],
    anchors: [{ id: 'edge-anchor', kind: 'poi', ...edgePoint, elevation: 0 }],
  });
}

function expectedOffset(edge: MapResizeEdge, grow: boolean) {
  return {
    tileX: edge === 'west' ? (grow ? 1 : -1) : 0,
    tileY: edge === 'north' ? (grow ? 1 : -1) : 0,
  };
}

describe('Studio finite-map resize planning', () => {
  for (const edge of ['west', 'east', 'north', 'south'] as const) {
    it(`grows the ${edge} edge using the opposite pinned resize anchor`, () => {
      const document = fixture();
      const plan = planStudioMapResize(document, edge, true);
      const resized = applyStudioMapResize(document, plan.command);
      const offset = expectedOffset(edge, true);

      expect(plan).toMatchObject({ edge, grow: true, step: 1, offset, cropBounds: null, croppedTileCount: 0 });
      expect(plan.command).toMatchObject({
        width: document.width + (edge === 'west' || edge === 'east' ? 1 : 0),
        height: document.height + (edge === 'north' || edge === 'south' ? 1 : 0),
      });
      expect(mapResizeImpactLossCount(plan)).toBe(0);
      expect(resized.objects.find(({ id }) => id === 'kept-object')).toMatchObject({
        tileX: 2 + offset.tileX, tileY: 2 + offset.tileY,
      });
      expect(resized.cells[`${2 + offset.tileX},${2 + offset.tileY}`]).toMatchObject({
        surface: 'stone', biome: 'highland',
      });
    });

    it(`previews and removes every authored relationship cropped from the ${edge} edge`, () => {
      const document = fixture(edge);
      const plan = planStudioMapResize(document, edge, false);
      const resized = applyStudioMapResize(document, plan.command);
      const offset = expectedOffset(edge, false);

      expect(plan).toMatchObject({
        edge, grow: false, step: 1, offset, croppedTileCount: 4,
        removedCellOverrideKeys: [`${EDGE_POINT[edge].tileX},${EDGE_POINT[edge].tileY}`],
        removedObjectIds: ['edge-object'],
        removedLandmarkIds: ['edge-landmark'],
        removedTransitionCount: 1,
        removedStairRunCount: 1,
        removedSceneryIds: ['edge-scenery'],
        removedAnchorIds: ['edge-anchor'],
      });
      expect(plan.cropBounds).not.toBeNull();
      expect(resized).toMatchObject({
        width: document.width - (edge === 'west' || edge === 'east' ? 1 : 0),
        height: document.height - (edge === 'north' || edge === 'south' ? 1 : 0),
      });
      expect(resized.objects).toEqual([expect.objectContaining({
        id: 'kept-object', tileX: 2 + offset.tileX, tileY: 2 + offset.tileY,
      })]);
      expect(resized.landmarks).toEqual([expect.objectContaining({ id: 'kept-landmark' })]);
      expect(resized.transitions).toHaveLength(0);
      expect(resized.cells[`${2 + offset.tileX},${2 + offset.tileY}`]).toMatchObject({
        surface: 'stone', biome: 'highland',
      });
      expect(resized.revision).toBe(document.revision + 1);
      expect(mapDocumentV3Hash(resized)).not.toBe(plan.sourceHash);
    });
  }

  it('drops a whole multi-cell object when a crop would cut through its transformed footprint', () => {
    const base = fixture();
    const widePrefab = normalizeMapPrefab({
      ...createMapPrefabDocument({ id: 'wide-prefab', title: 'Wide', width: 2 }),
      pivot: { tileX: 0, tileY: 0 },
      cells: [
        { id: 'left', tileX: 0, tileY: 0, elevation: 0, collisionMask: 0xffff },
        { id: 'right', tileX: 1, tileY: 0, elevation: 0, collisionMask: 0xffff },
      ],
    });
    const document = normalizeMapDocumentV3({
      ...base,
      prefabs: [...base.prefabs, widePrefab],
      objects: [{ ...object('wide-object', 2, 1), prefabId: widePrefab.id }],
    });
    const plan = planStudioMapResize(document, 'east', false);
    expect(plan.removedObjectIds).toEqual(['wide-object']);
    expect(applyStudioMapResize(document, plan.command).objects).toHaveLength(0);
  });

  it('rejects invalid steps and shrinking past a positive map dimension', () => {
    const document = fixture();
    expect(() => planStudioMapResize(document, 'west', true, 0)).toThrow('map_resize_step_invalid');
    expect(() => planStudioMapResize(document, 'north', false, document.height)).toThrow(
      'map_resize_dimensions_invalid',
    );
  });
});

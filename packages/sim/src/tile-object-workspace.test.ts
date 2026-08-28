import { describe, expect, it } from 'vitest';
import type { MapStampPlacement } from './map-stamp.js';
import {
  TILE_OBJECT_COLLISION_MASK_FULL,
  createTileObjectWorkspace,
  explodeTileObject,
  groupTileObject,
  moveTileObject,
  parseTileObjectWorkspace,
  serializeTileObjectWorkspace,
  tileObjectToMapStamp,
  tileObjectWorkspaceFromMapStamp,
  upsertTileObjectCell,
  upsertTileObjectCollection,
  upsertTileObjectPlacement,
} from './tile-object-workspace.js';
import { createMapStampDocument, upsertMapStampPlacement } from './map-stamp.js';

const wall: MapStampPlacement = {
  id: 'wall-1',
  assetId: 42,
  assetName: 'tile_cf_house_wall',
  visual: { kind: 'variant', name: 'base', frameIndex: 2 },
  tileX: 10,
  tileY: 12,
  elevation: 0,
  layer: 'object',
  quarterTurns: 0,
  flipX: false,
};

describe('tile object workspaces', () => {
  it('round-trips collection frames, grouped objects, height, and fractional collision', () => {
    let workspace = createTileObjectWorkspace({ id: 'object-library', width: 64, height: 48 });
    workspace = upsertTileObjectPlacement(workspace, wall);
    workspace = upsertTileObjectCell(workspace, {
      id: 'wall-cell-1', tileX: 10, tileY: 12, elevation: 3, collisionMask: 0x0033,
    });
    workspace = upsertTileObjectCollection(workspace, {
      id: 'buildings', label: 'Buildings', color: '#d66a4a', tileX: 4, tileY: 5, width: 24, height: 20,
    });
    workspace = groupTileObject(workspace, {
      id: 'small_house', label: 'Small House', placementIds: ['wall-1'],
      cellIds: ['wall-cell-1'], collectionId: 'buildings',
    });

    const serialized = serializeTileObjectWorkspace(workspace);
    expect(serialized).toContain('"kind": "tile_object_workspace"');
    expect(parseTileObjectWorkspace(serialized)).toEqual(workspace);
  });

  it('moves a grouped object as a unit and preserves loose cells when exploded', () => {
    let workspace = createTileObjectWorkspace({ width: 32, height: 24 });
    workspace = upsertTileObjectPlacement(workspace, wall);
    workspace = upsertTileObjectCell(workspace, {
      id: 'wall-cell-1', tileX: 10, tileY: 12, elevation: 2,
      collisionMask: TILE_OBJECT_COLLISION_MASK_FULL,
    });
    workspace = groupTileObject(workspace, {
      id: 'wall_group', label: 'Wall Group', placementIds: ['wall-1'], cellIds: ['wall-cell-1'], collectionId: null,
    });
    workspace = moveTileObject(workspace, 'wall_group', 3, -2);
    expect(workspace.placements[0]).toMatchObject({ tileX: 13, tileY: 10 });
    expect(workspace.cells[0]).toMatchObject({ tileX: 13, tileY: 10, elevation: 2 });

    workspace = explodeTileObject(workspace, 'wall_group');
    expect(workspace.objects).toEqual([]);
    expect(workspace.placements).toHaveLength(1);
    expect(workspace.cells).toHaveLength(1);
  });

  it('exports one grouped object as a local reusable map stamp', () => {
    let workspace = createTileObjectWorkspace({ width: 64, height: 48 });
    workspace = upsertTileObjectPlacement(workspace, wall);
    workspace = upsertTileObjectPlacement(workspace, {
      ...wall, id: 'wall-2', tileX: 11, assetId: 43,
    });
    workspace = groupTileObject(workspace, {
      id: 'house_front', label: 'House Front', placementIds: ['wall-1', 'wall-2'], cellIds: [], collectionId: null,
    });
    const stamp = tileObjectToMapStamp(workspace, 'house_front');
    expect(stamp).toMatchObject({ kind: 'map_stamp', id: 'house-front', width: 2, height: 1 });
    expect(stamp.placements.map((entry) => [entry.tileX, entry.tileY])).toEqual([[0, 0], [1, 0]]);
  });

  it('imports an existing map stamp as loose workspace pieces without treating it as terrain', () => {
    const stamp = upsertMapStampPlacement(createMapStampDocument({ id: 'old-stamp' }), wall);
    const workspace = tileObjectWorkspaceFromMapStamp(stamp);
    expect(workspace).toMatchObject({ kind: 'tile_object_workspace', id: 'old-stamp' });
    expect(workspace.placements).toEqual(stamp.placements);
    expect(workspace.objects).toEqual([]);
    expect(workspace.collections).toEqual([]);
  });

  it('rejects relationships to missing placements and invalid collision masks', () => {
    const workspace = createTileObjectWorkspace({ width: 32, height: 24 });
    expect(() => groupTileObject(workspace, {
      id: 'ghost', label: 'Ghost', placementIds: ['missing'], cellIds: [], collectionId: null,
    })).toThrow('relationship is invalid');
    expect(() => upsertTileObjectCell(workspace, {
      id: 'bad-cell', tileX: 1, tileY: 1, elevation: 0, collisionMask: 0x1_0000,
    })).toThrow('metadata cell is invalid');
  });
});

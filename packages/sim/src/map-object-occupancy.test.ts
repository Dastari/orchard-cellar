import { describe, expect, it } from 'vitest';
import { createEmptyMapDocument, createMapPrefabDocument, migrateMapDocumentV2, type MapObjectInstance, type MapPrefabDocumentV2 } from './index.js';
import {
  mapObjectIsGroundDecal, mapObjectIsSolid, mapObjectOverlapAllowed, mapObjectPlacementConflict,
  mapObjectsAreExactDuplicates,
} from './map-object-occupancy.js';

const prefab = (id: string, collisionMask: number): MapPrefabDocumentV2 => ({
  ...createMapPrefabDocument({ id, title: id, width: 1, height: 1 }),
  pivot: { tileX: 0, tileY: 0 },
  cells: [{ id: 'cell', tileX: 0, tileY: 0, elevation: 0, collisionMask }],
  placements: [{ id: 'visual', assetId: 1, assetName: id, tileX: 0, tileY: 0, elevation: 0, layer: 'object',
    quarterTurns: 0, flipX: false, visual: { kind: 'variant', name: 'base', frameIndex: 0 } }],
});
const object = (id: string, prefabId: string, layer: MapObjectInstance['layer'] = 'ground'): MapObjectInstance => ({
  id, prefabId, prefabRevision: 0, tileX: 2, tileY: 2, elevation: 0, layer, enabled: true, quarterTurns: 0, flipX: false,
});
const paving = prefab('paving', 0);
const mat = prefab('door_mat', 0);
const crate = prefab('crate', 0xffff);
const barrel = prefab('barrel', 0x0660);
const base = { ...migrateMapDocumentV2(createEmptyMapDocument({ id: 'overlap', title: 'Overlap', width: 8, height: 8 })),
  prefabs: [paving, mat, crate, barrel] };

describe('map object overlap policy (doc 61 §2.3)', () => {
  it('derives solidity from authored collision cells', () => {
    expect(mapObjectIsSolid(base, object('a', 'paving'))).toBe(false);
    expect(mapObjectIsSolid(base, object('a', 'barrel'))).toBe(true);
    expect(mapObjectIsSolid(base, object('a', 'missing'))).toBe(true);
    expect(mapObjectIsGroundDecal(base, object('a', 'door_mat'))).toBe(true);
    expect(mapObjectIsGroundDecal(base, object('a', 'door_mat', 'objects'))).toBe(false);
  });

  it('lets a non-solid ground decal overlap paving and solid ground objects', () => {
    const document = { ...base, objects: [object('pave', 'paving')] };
    expect(mapObjectPlacementConflict(document, object('mat', 'door_mat'))).toBeNull();
    const withCrate = { ...base, objects: [object('crate', 'crate')] };
    expect(mapObjectPlacementConflict(withCrate, object('mat', 'door_mat'))).toBeNull();
    expect(mapObjectPlacementConflict({ ...base, objects: [object('mat', 'door_mat')] },
      object('crate', 'crate'))).toBeNull();
  });

  it('still rejects two solid objects on one cell', () => {
    const document = { ...base, objects: [object('crate', 'crate')] };
    expect(mapObjectPlacementConflict(document, object('barrel', 'barrel'))).toBe('crate');
  });

  it('rejects an exact duplicate even when it is a decal', () => {
    const document = { ...base, objects: [object('mat-a', 'door_mat')] };
    expect(mapObjectsAreExactDuplicates(object('mat-a', 'door_mat'), object('mat-b', 'door_mat'))).toBe(true);
    expect(mapObjectOverlapAllowed(document, object('mat-b', 'door_mat'), object('mat-a', 'door_mat'))).toBe(false);
    expect(mapObjectPlacementConflict(document, object('mat-b', 'door_mat'))).toBe('mat-a');
    // A different transform is a different placement, so the decal may overlap.
    expect(mapObjectPlacementConflict(document, { ...object('mat-b', 'door_mat'), quarterTurns: 1 })).toBeNull();
  });

  it('keeps strict occupancy for non-solid objects outside the ground band', () => {
    const document = { ...base, objects: [object('a', 'paving', 'objects')] };
    expect(mapObjectPlacementConflict(document, object('b', 'door_mat', 'objects'))).toBe('a');
  });
});

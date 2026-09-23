import { describe, expect, it } from 'vitest';
import {
  createEmptyMapDocument, createMapPrefabDocument, migrateMapDocumentV2,
  type MapObjectInstance, type MapPrefabDocumentV2,
} from '@orchard/sim';
import { mapEditorObjectPlacementConflict } from './connected-object-footprint.js';

const prefab = (id: string, collisionMask: number): MapPrefabDocumentV2 => ({
  ...createMapPrefabDocument({ id, title: id, width: 1, height: 1 }),
  pivot: { tileX: 0, tileY: 0 },
  cells: [{ id: 'cell', tileX: 0, tileY: 0, elevation: 0, collisionMask }],
  placements: [{ id: 'visual', assetId: 1, assetName: id, tileX: 0, tileY: 0, elevation: 0, layer: 'object',
    quarterTurns: 0, flipX: false, visual: { kind: 'variant', name: 'base', frameIndex: 0 } }],
});
const object = (id: string, prefabId: string): MapObjectInstance => ({
  id, prefabId, prefabRevision: 0, tileX: 3, tileY: 3, elevation: 0, layer: 'ground',
  enabled: true, quarterTurns: 0, flipX: false,
});
const document = {
  ...migrateMapDocumentV2(createEmptyMapDocument({ id: 'decals', title: 'Decals', width: 8, height: 8 })),
  prefabs: [prefab('paving', 0), prefab('door_mat', 0), prefab('bollard', 0xffff), prefab('crate', 0xffff)],
};

describe('Studio placement overlap by solidity', () => {
  it('places a door mat on paving but rejects stacked duplicates and solid pairs', () => {
    const paved = { ...document, objects: [object('pave', 'paving')] };
    expect(mapEditorObjectPlacementConflict(paved, object('mat', 'door_mat'))).toBeNull();
    expect(mapEditorObjectPlacementConflict(paved, object('pave-2', 'paving'))).toBe('pave');
    const solid = { ...document, objects: [object('bollard', 'bollard')] };
    expect(mapEditorObjectPlacementConflict(solid, object('crate', 'crate'))).toBe('bollard');
  });
});

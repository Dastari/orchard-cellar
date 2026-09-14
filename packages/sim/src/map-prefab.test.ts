import { describe, expect, it } from 'vitest';
import {
  createMapPrefabDocument,
  mapPrefabToStamp,
  mapStampToPrefab,
  parseMapPrefabDocument,
  serializeMapPrefabDocument,
  type MapPrefabDocumentV2,
} from './map-prefab.js';
import { createMapStampDocument } from './map-stamp.js';

const prefab: MapPrefabDocumentV2 = {
  ...createMapPrefabDocument({
    id: 'orchard-gate', title: 'Orchard Gate', width: 2, height: 1,
    assetRegistryRevision: 'assets-r7', tags: ['fences', 'gates'],
    collection: { id: 'fences', label: 'Fences', color: '#c46c52' },
  }),
  behaviors: [{ kind: 'gate', archetype: 'orchard_gate' }],
  placements: [{
    id: 'gate-piece', assetId: 42, assetName: 'prop_cf_fence_gate',
    visual: { kind: 'state', name: 'closed', frameIndex: 0 },
    tileX: 0, tileY: 0, elevation: 0, layer: 'object', quarterTurns: 0, flipX: false,
  }],
  cells: [{ id: 'gate-cell', tileX: 0, tileY: 0, elevation: 0, collisionMask: 0xffff }],
};

describe('map prefab documents', () => {
  it('round-trips collision, collection tags, and behavior without atlas coordinates', () => {
    const serialized = serializeMapPrefabDocument(prefab);
    expect(serialized).not.toContain('atlasX');
    expect(parseMapPrefabDocument(serialized)).toEqual(prefab);
  });

  it('migrates legacy stamps and retains a compatibility export', () => {
    const stamp = createMapStampDocument({ id: 'legacy-stamp', width: 3, height: 2 });
    const migrated = mapStampToPrefab(stamp);
    expect(migrated).toMatchObject({ schemaVersion: 2, kind: 'map_prefab', cells: [] });
    expect(mapPrefabToStamp(migrated)).toEqual(stamp);
  });

  it('rejects non-static behaviors without an allowlisted archetype name', () => {
    const serialized = serializeMapPrefabDocument({
      ...prefab,
      behaviors: [{ kind: 'resource' }],
    });
    expect(() => parseMapPrefabDocument(serialized)).toThrow('metadata is invalid');
  });
});

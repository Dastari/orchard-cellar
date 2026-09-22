import { describe, expect, it } from 'vitest';
import {
  applyMapDocumentDelta, createMapDocumentDelta, parseMapDocumentDelta,
} from './map-document-delta.js';
import {
  createEmptyMapDocument, createMapPrefabDocument, migrateMapDocumentV2,
  normalizeMapDocumentV3, parseMapDocumentV3, serializeMapDocumentV3,
} from './index.js';

function fixture() {
  return normalizeMapDocumentV3({
    ...migrateMapDocumentV2(createEmptyMapDocument({ id: 'delta-test', title: 'Delta test', width: 832, height: 832 })),
    revision: 6,
    prefabs: [createMapPrefabDocument({ id: 'old-tree', title: 'Old tree', width: 1, height: 1 })],
    objects: [{ id: 'old-tree-386-373', prefabId: 'old-tree', prefabRevision: 0,
      tileX: 386, tileY: 373, elevation: 0, layer: 'objects' as const,
      quarterTurns: 0 as const, flipX: false, enabled: true }],
  });
}

describe('keyed map publication deltas', () => {
  it('removes the reported tree in under 1 KB even when the pretty map exceeds the server limit', () => {
    const base = normalizeMapDocumentV3({ ...fixture(), cells: Object.fromEntries(
      Array.from({ length: 70_000 }, (_, i) => [`${i % 832},${Math.floor(i / 832)}`, { elevation: 1, biome: 'forest' as const }]),
    ) });
    expect(serializeMapDocumentV3(base).length).toBeGreaterThan(4_000_000);
    const target = { ...base, objects: [], revision: 7 };
    const delta = createMapDocumentDelta(base, target);
    expect(JSON.stringify(delta).length).toBeLessThan(1_000);
    expect(delta.collections).toEqual({ objects: { 'old-tree-386-373': null } });
    expect(parseMapDocumentV3(applyMapDocumentDelta(base, delta))).toEqual({ ...target, revision: 6 });
  });

  it('round-trips cells, generated neighbors, placements, metadata, layers, anchors and suppressions', () => {
    const base = fixture();
    const target = normalizeMapDocumentV3({ ...base, title: 'Changed',
      cells: { '385,373': { elevation: 1, biome: 'forest' }, '386,373': { elevation: 1, biome: 'forest' } },
      objects: [{ ...base.objects[0]!, tileX: 388 }],
      layers: base.layers.map(layer => layer.id === 'objects' ? { ...layer, label: 'Trees' } : layer),
      generatedSuppressions: ['resource-123'],
      anchors: [{ id: 'label-1', kind: 'label', label: 'Orchard', tileX: 386, tileY: 373, elevation: 1 }],
      scenery: [{ id: 'flower', assetId: 'flower', tileX: 387, tileY: 373, elevation: 1 }],
      transitions: [{ contourLevel: 1, kind: 'stairs', direction: 'up', lowerTileX: 386, lowerTileY: 374, upperTileX: 386, upperTileY: 373 }],
      stairRuns: [{ x: 386, y: 374, direction: 'up', fromLevel: 0, toLevel: 1, width: 2 }],
    });
    const delta = createMapDocumentDelta(base, target);
    expect(parseMapDocumentV3(applyMapDocumentDelta(base, delta))).toEqual(target);
    expect(parseMapDocumentV3(applyMapDocumentDelta(target, createMapDocumentDelta(target, base)))).toEqual(base);
    expect(createMapDocumentDelta(base, { ...base, revision: 90 })).toMatchObject({ baseHash: delta.baseHash, targetHash: delta.baseHash });
    expect(createMapDocumentDelta(base, base).collections).toBeUndefined();
  });

  it('rejects stale bases, missing removals, key mismatches, forbidden fields and malformed envelopes', () => {
    const base = fixture();
    const delta = createMapDocumentDelta(base, { ...base, objects: [] });
    expect(() => applyMapDocumentDelta({ ...base, title: 'New head' }, delta)).toThrow('base_mismatch');
    expect(() => applyMapDocumentDelta(base, { ...delta, collections: { objects: { missing: null } } })).toThrow('missing_key');
    const bad: unknown[] = [null, [], { ...delta, mapDeltaVersion: 2 }, { ...delta, baseHash: '' },
      { ...delta, revision: 7 }, { ...delta, metadata: { id: 'another-map' } },
      { ...delta, collections: { nonexistent: {} } }, { ...delta, collections: [] },
      { ...delta, collections: { objects: [] } },
      { ...delta, collections: { cells: { '-1,2': {} } } },
      { ...delta, collections: { cells: { '1,2': 5 } } },
      { ...delta, collections: { objects: { wrong: base.objects[0] } } },
      { ...delta, collections: { objects: { wrong: 'bad' } } },
      JSON.parse('{"mapDeltaVersion":1,"baseHash":"12345678","targetHash":"12345678","collections":{"objects":{"__proto__":null}}}'),
    ];
    for (const value of bad) expect(() => parseMapDocumentDelta(value)).toThrow();
    expect(() => createMapDocumentDelta(base, { ...base, id: 'wrong-map' })).toThrow('identity_mismatch');
    expect(() => createMapDocumentDelta(base, { ...base, objects: [...base.objects, ...base.objects] })).toThrow('duplicate');
  });

  it('carries empty/new combat policy explicitly and never clears existing policy by omission', () => {
    const base = fixture();
    const empty = { ...base, combatRegions: [] };
    expect(parseMapDocumentV3(applyMapDocumentDelta(base, createMapDocumentDelta(base, empty)))).toEqual(empty);
    const target = normalizeMapDocumentV3({ ...base, combatRegions: [
      { id: 'orchard', spaceId: 0, policy: 'sanctuary', minX: 380, minY: 370, maxX: 390, maxY: 380 },
    ] });
    expect(parseMapDocumentV3(applyMapDocumentDelta(base, createMapDocumentDelta(base, target)))).toEqual(target);
    expect(parseMapDocumentV3(applyMapDocumentDelta(target, createMapDocumentDelta(target, empty)))).toEqual(empty);
    expect(() => createMapDocumentDelta(target, base)).toThrow('explicit_empty_array');
  });
});

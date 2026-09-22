import { describe, expect, it, vi } from 'vitest';
import {
  createEmptyMapDocument, createMapDocumentDelta, createMapPrefabDocument,
  migrateMapDocumentV2, normalizeMapDocumentV3, parseMapDocumentV3,
  serializeMapDocumentV3ForTransport,
} from '@orchard/sim';
import { prepareLiveMapPublication, LIVE_MAP_MAX_DOCUMENT_CHARACTERS } from './live-map-publication.js';

function fixture() {
  const base = normalizeMapDocumentV3({
    ...migrateMapDocumentV2(createEmptyMapDocument({ id: 'delta-test', title: 'Base', width: 16, height: 16 })),
    revision: 6,
    prefabs: [createMapPrefabDocument({ id: 'tree', title: 'Tree', width: 1, height: 1 })],
    objects: [{ id: 'old-tree', prefabId: 'tree', prefabRevision: 0, tileX: 3, tileY: 3,
      elevation: 0, layer: 'objects' as const, quarterTurns: 0 as const, flipX: false, enabled: true }],
  });
  const target = { ...base, objects: [] };
  const delta = createMapDocumentDelta(base, target);
  return { base, target, delta, payload: JSON.stringify(delta), head: { revision: 6, clientMutationId: 'previous', document: base } };
}

describe('authority map delta preparation', () => {
  it('applies a deletion through full validation and leaves the source head untouched', () => {
    const { target, payload, head } = fixture();
    const validate = vi.fn(parseMapDocumentV3);
    expect(prepareLiveMapPublication(payload, 6, 'delete-tree', () => head, validate)).toEqual(target);
    expect(validate).toHaveBeenCalledOnce();
    expect(head.document.objects).toHaveLength(1);
  });

  it('rejects stale/missing bases and reused mutation IDs, but acknowledges the same committed retry', () => {
    const { target, payload, head } = fixture();
    const validate = vi.fn(parseMapDocumentV3);
    expect(() => prepareLiveMapPublication(payload, 5, 'new', () => head, validate)).toThrow('revision_conflict');
    expect(() => prepareLiveMapPublication(payload, 6, 'new', () => null, validate)).toThrow('base_unavailable');
    expect(() => prepareLiveMapPublication(payload, 6, 'previous', () => head, validate)).toThrow('mutation_id_reused');
    expect(() => prepareLiveMapPublication(payload, 6, '', () => head, validate)).toThrow('mutation_id');
    expect(prepareLiveMapPublication(payload, 6, 'delete-tree', () => ({ ...head, document: { ...target, revision: 7 }, revision: 7, clientMutationId: 'delete-tree' }), validate)).toBeNull();
    expect(validate).not.toHaveBeenCalled();
  });

  it('propagates blocking terrain/behavior validation and rejects a mismatched result hash', () => {
    const { payload, head, base } = fixture();
    expect(() => prepareLiveMapPublication(payload, 6, 'new', () => head, () => { throw new Error('invalid_live_map_terrain'); })).toThrow('invalid_live_map_terrain');
    expect(() => prepareLiveMapPublication(payload, 6, 'new', () => head, () => base)).toThrow('target_mismatch');
    expect(head.document.objects).toHaveLength(1);
  });

  it('retains authority-derived landmark roles when the editor catalog differs', () => {
    const { base, head } = fixture();
    const landmark = { id: 'landmark-1', sourceDecorationId: 1, groupId: 'orchard', groupLabel: 'Orchard',
      kind: 'camp_flowers', tileX: 4, tileY: 4, elevation: 0, layer: 'ground' as const,
      variant: 0, animationOffset: 0, quarterTurns: 0 as const, flipX: false, enabled: true };
    const editor = { ...base, landmarks: [landmark] };
    const authority = { ...base, landmarks: [{ ...landmark, role: 'soil.watered' as const }] };
    const delta = createMapDocumentDelta(editor, { ...editor, objects: [] });
    const result = prepareLiveMapPublication(JSON.stringify(delta), 6, 'delete-tree',
      () => ({ ...head, document: authority }), parseMapDocumentV3);
    expect(result?.objects).toEqual([]);
    expect(result?.landmarks[0]?.role).toBe('soil.watered');
  });

  it('rejects oversized input and oversized reconstructed state while retaining snapshot compatibility', () => {
    const { base, payload, head } = fixture();
    const validate = vi.fn(parseMapDocumentV3);
    expect(() => prepareLiveMapPublication('x'.repeat(LIVE_MAP_MAX_DOCUMENT_CHARACTERS + 1), 6, 'new', () => head, validate)).toThrow('invalid_live_map_size');
    const hugeBase = { ...base, title: 'x'.repeat(LIVE_MAP_MAX_DOCUMENT_CHARACTERS) };
    const delta = createMapDocumentDelta(hugeBase, { ...hugeBase, objects: [] });
    expect(() => prepareLiveMapPublication(JSON.stringify(delta), 6, 'new', () => ({ ...head, document: hugeBase }), validate)).toThrow('invalid_live_map_size');
    expect(() => prepareLiveMapPublication('{bad', 6, 'new', () => head, validate)).toThrow('invalid_live_map_document');
    expect(prepareLiveMapPublication(serializeMapDocumentV3ForTransport(base), 6, 'new', () => null, validate)).toEqual(base);
    expect(prepareLiveMapPublication(payload, 6, 'new', () => head, validate)?.objects).toEqual([]);
  });
});

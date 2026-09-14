import { describe, expect, it, vi } from 'vitest';
import type { AdminEntityMutation, AdminMutationPreview } from '../../../../world/src/admin/contracts.js';
import type { AdminObjectMutationResult, AdminObjectsApi } from '../../admin/objects-api.js';
import type { MapEditorLiveMarker } from './editor-controller.js';
import {
  MapRuntimeObjectActionModel,
  mapRuntimeObjectAvailability,
  type MapRuntimeObjectOperation,
} from './runtime-object-actions.js';

const marker = Object.freeze({
  id: '41', entityKind: 'placeable', kind: 'fruit_press', label: 'Fruit Press',
  spaceId: 0, tileX: 12, tileY: 14, worldX: 400, worldY: 464, elevation: 0,
  footprint: { width: 1, height: 1 }, layer: 'player_owned', color: '#fff',
}) satisfies MapEditorLiveMarker;

function preview(operation: MapRuntimeObjectOperation): AdminMutationPreview {
  return Object.freeze({
    operation,
    target: { kind: 'entity' as const, entityId: marker.id },
    baseVersion: 'object:exact-before',
    preview: { changes: [{ path: '/entity', before: { present: true }, after: { present: true } }],
      truncated: false },
    warnings: operation === 'despawn_entity' ? ['Despawn can spill custody.'] : [],
    expiresAtMicros: '1780000060000000',
  });
}

function probe(): { readonly api: AdminObjectsApi; readonly calls: Array<{
  readonly mutation: AdminEntityMutation;
  readonly expectedBaseVersion: string;
  readonly previewFingerprint: string | null;
}> } {
  const calls: Array<{ mutation: AdminEntityMutation; expectedBaseVersion: string;
    previewFingerprint: string | null }> = [];
  const api: AdminObjectsApi = {
    source: 'live',
    listEntities: vi.fn(async () => ({ rows: [], nextCursor: null, worldVersion: '', rowsScanned: 0 })),
    container: vi.fn(async () => ({
      entityId: marker.id, definitionId: 'object:fruit_press', ownerIdentity: 'player-a',
      position: { spaceId: '0', tileX: marker.tileX, tileY: marker.tileY },
      state: {}, processor: null, slots: [null, null, null], version: '',
    })),
    mutate: vi.fn(async (mutation, expectedBaseVersion, previewFingerprint) => {
      calls.push({ mutation, expectedBaseVersion, previewFingerprint });
      const receipt = preview(mutation.operation as MapRuntimeObjectOperation);
      const result: AdminObjectMutationResult = {
        preview: receipt,
        previewFingerprint: 'preview:exact',
        committed: !mutation.dryRun,
        version: mutation.dryRun ? receipt.baseVersion : 'object:after',
        audit: mutation.dryRun ? null : {
          id: 'audit-1', actorIdentity: 'admin', operation: mutation.operation,
          target: receipt.target, occurredAtMicros: '1780000000000000',
          payload: { schemaVersion: 1 as const, clientMutationId: mutation.clientMutationId,
            target: receipt.target, reason: mutation.reason, changes: receipt.preview.changes,
            inverse: { operation: 'undo', args: {} } },
        },
        notice: mutation.dryRun ? null : 'The object was changed by an administrator.',
      };
      return result;
    }),
  };
  return { api, calls };
}

describe('Map runtime object authority bridge', () => {
  it.each([
    ['repair_entity', { operation: 'repair_entity' }],
    ['despawn_entity', { operation: 'despawn_entity' }],
    ['move_entity', { operation: 'move_entity', tileX: 20, tileY: 21 }],
  ] as const)('requires preview, confirmation, exact fingerprint, and audit for %s', async (operation, draft) => {
    const { api, calls } = probe();
    const model = new MapRuntimeObjectActionModel(api, () => `map-${operation}`);
    await model.preview(marker, draft, `${operation} Fruit Press from Map Editor`);
    expect(calls[0]).toMatchObject({
      mutation: { operation, entityId: marker.id, dryRun: true },
      expectedBaseVersion: '', previewFingerprint: null,
    });
    expect(model.pending()).toMatchObject({
      operation, entityId: marker.id, playerOwned: true,
      baseVersion: 'object:exact-before', previewFingerprint: 'preview:exact',
    });
    await expect(model.commit(false)).rejects.toThrow('map_live_confirmation_required');
    expect(calls).toHaveLength(1);
    const result = await model.commit(true);
    expect(calls[1]).toMatchObject({
      mutation: { operation, entityId: marker.id, dryRun: false },
      expectedBaseVersion: 'object:exact-before', previewFingerprint: 'preview:exact',
    });
    expect(result).toMatchObject({ committed: true, audit: { operation }, notice: expect.any(String) });
    await expect(model.commit(true)).rejects.toThrow('admin_preview_required');
  });

  it('fails closed when identity, kind, or projected position does not match authority', async () => {
    const { api, calls } = probe();
    vi.mocked(api.container).mockResolvedValueOnce({
      entityId: marker.id, definitionId: 'object:chest', ownerIdentity: 'player-a',
      position: { spaceId: '0', tileX: marker.tileX, tileY: marker.tileY },
      state: {}, processor: null, slots: [], version: '',
    });
    const model = new MapRuntimeObjectActionModel(api, () => 'map-stale');
    await expect(model.preview(marker, { operation: 'repair_entity' }, 'Repair selected object'))
      .rejects.toThrow('map_live_entity_stale');
    expect(calls).toHaveLength(0);
  });

  it('passes the authority-issued base and fingerprint unchanged so stale commits fail closed', async () => {
    const { api, calls } = probe();
    vi.mocked(api.mutate).mockImplementation(async (mutation, expectedBaseVersion, previewFingerprint) => {
      calls.push({ mutation, expectedBaseVersion, previewFingerprint });
      if (!mutation.dryRun) throw new Error('admin_preview_stale');
      return { preview: preview('move_entity'), previewFingerprint: 'preview:exact', committed: false,
        version: 'object:exact-before', audit: null, notice: null };
    });
    const model = new MapRuntimeObjectActionModel(api, () => 'map-stale-fingerprint');
    await model.preview(marker, { operation: 'move_entity', tileX: 20, tileY: 21 }, 'Move selected object');
    await expect(model.commit(true)).rejects.toThrow('admin_preview_stale');
    expect(calls[1]).toMatchObject({ expectedBaseVersion: 'object:exact-before',
      previewFingerprint: 'preview:exact' });
  });

  it('guards anonymous, non-admin, non-live, generated, and immutable selections', () => {
    const base = { mapId: 'live-island', routeAccess: 'write' as const, connected: true,
      role: 'admin', hasLiveApi: true, marker };
    expect(mapRuntimeObjectAvailability(base)).toEqual({ allowed: true, authority: 'admin' });
    expect(mapRuntimeObjectAvailability({ ...base, connected: false })).toMatchObject({ allowed: false });
    expect(mapRuntimeObjectAvailability({ ...base, role: 'content_editor' })).toMatchObject({ allowed: false });
    expect(mapRuntimeObjectAvailability({ ...base, mapId: 'terrain-lab' })).toMatchObject({ allowed: false });
    expect(mapRuntimeObjectAvailability({ ...base,
      marker: { ...marker, entityKind: 'resource' } })).toMatchObject({
      allowed: false, reason: expect.stringContaining('suppression'),
    });
    expect(mapRuntimeObjectAvailability({ ...base,
      marker: { ...marker, entityKind: 'player' } })).toMatchObject({
      allowed: false, reason: expect.stringContaining('immutable'),
    });
  });
});

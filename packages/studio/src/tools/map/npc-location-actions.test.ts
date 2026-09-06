import { describe, expect, it, vi } from 'vitest';
import type {
  AdminAuditRow,
  AdminEntityMutation,
  AdminMutationPreview,
} from '../../../../world/src/admin/contracts.js';
import { normalizeAdminReason } from '../../admin/api.js';
import type { AdminObjectMutationResult, AdminObjectsApi } from '../../admin/objects-api.js';
import {
  MapNpcLocationActionModel,
  mapNpcLocationAvailability,
  type MapNpcLocationMarker,
} from './npc-location-actions.js';
import { mapEditorLiveMarkers } from './editor-controller.js';

const marker = Object.freeze({
  id: '7', entityKind: 'npc', kind: 'npc:fisherman_fin', label: 'Fisherman Fin',
  spaceId: 0, tileX: 22, tileY: 21, homeTileX: 20, homeTileY: 20,
  worldX: 360, worldY: 344, elevation: 0,
  footprint: { width: 1, height: 1 }, layer: 'gameplay', color: '#fff',
  playerControlled: false, systemControlled: false,
}) satisfies MapNpcLocationMarker;

function receipt(): AdminMutationPreview {
  return Object.freeze({
    operation: 'relocate_npc',
    target: { kind: 'entity' as const, entityId: marker.id },
    baseVersion: 'object:npc-exact-before',
    preview: Object.freeze({ changes: [
      { path: '/entities/0/tileX', before: { present: true, value: marker.tileX },
        after: { present: true, value: 40 } },
      { path: '/entities/0/tileY', before: { present: true, value: marker.tileY },
        after: { present: true, value: 41 } },
    ], truncated: false }),
    warnings: Object.freeze([]),
    expiresAtMicros: '1780000060000000',
  });
}

function audit(mutation: AdminEntityMutation): AdminAuditRow {
  return Object.freeze({
    id: 'audit-npc-1', actorIdentity: 'admin', operation: 'relocate_npc',
    target: { kind: 'entity' as const, entityId: marker.id }, occurredAtMicros: '1780000000000000',
    payload: {
      schemaVersion: 1 as const, clientMutationId: mutation.clientMutationId,
      target: { kind: 'entity' as const, entityId: marker.id }, reason: mutation.reason,
      changes: receipt().preview.changes,
      inverse: { operation: 'relocate_npc' as const, args: {
        npcId: marker.id, spaceId: '0', tileX: marker.tileX, tileY: marker.tileY,
      } },
    },
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
    container: vi.fn(async () => { throw new Error('NPC relocation must not use container authority'); }),
    mutate: vi.fn(async (mutation, expectedBaseVersion, previewFingerprint) => {
      calls.push({ mutation, expectedBaseVersion, previewFingerprint });
      const preview = receipt();
      return Object.freeze({
        preview,
        previewFingerprint: 'preview:npc-exact',
        committed: !mutation.dryRun,
        version: mutation.dryRun ? preview.baseVersion : 'object:npc-after',
        audit: mutation.dryRun ? null : audit(mutation),
        notice: null,
      }) satisfies AdminObjectMutationResult;
    }),
  };
  return { api, calls };
}

describe('Map NPC home/location authority bridge', () => {
  it('projects an empty world boat as simulation-controlled rather than an authored NPC', () => {
    const [boat] = mapEditorLiveMarkers({ placeables: [], homesteads: [], players: [], npcs: [{
      id: 81n, spaceId: 0, kind: 'boat', displayName: 'Wooden Boat',
      x: 10 * 256 + 128, y: 11 * 256 + 128, homeX: 9 * 256 + 128, homeY: 11 * 256 + 128,
    }] });
    expect(boat).toMatchObject({ entityKind: 'npc', kind: 'boat', systemControlled: true });
  });

  it('previews then explicitly confirms the exact NPC id, base, fingerprint, and inverse audit', async () => {
    const { api, calls } = probe();
    const model = new MapNpcLocationActionModel(api, () => 'map-npc-home-7');
    await model.preview(marker, 40, 41, 'Move Fisherman Fin home from Map Editor');
    expect(calls[0]).toMatchObject({
      mutation: {
        operation: 'relocate_npc', npcId: '7', spaceId: '0', tileX: 40, tileY: 41,
        dryRun: true, clientMutationId: 'map-npc-home-7',
      },
      expectedBaseVersion: '', previewFingerprint: null,
    });
    expect(model.pending()).toMatchObject({
      operation: 'relocate_npc', npcId: '7', displayName: 'Fisherman Fin',
      from: { tileX: 22, tileY: 21, homeTileX: 20, homeTileY: 20 },
      to: { tileX: 40, tileY: 41 }, baseVersion: 'object:npc-exact-before',
      previewFingerprint: 'preview:npc-exact',
    });
    await expect(model.commit(false)).rejects.toThrow('map_npc_location_confirmation_required');
    expect(calls).toHaveLength(1);
    const result = await model.commit(true);
    expect(calls[1]).toMatchObject({
      mutation: { operation: 'relocate_npc', npcId: '7', dryRun: false },
      expectedBaseVersion: 'object:npc-exact-before', previewFingerprint: 'preview:npc-exact',
    });
    expect(result.audit?.payload.inverse).toMatchObject({
      operation: 'relocate_npc', args: { npcId: '7', tileX: 22, tileY: 21 },
    });
    await expect(model.commit(true)).rejects.toThrow('admin_preview_required');
  });

  it('clears the retained receipt before a stale authority commit can reject', async () => {
    const { api, calls } = probe();
    vi.mocked(api.mutate).mockImplementation(async (mutation, expectedBaseVersion, previewFingerprint) => {
      calls.push({ mutation, expectedBaseVersion, previewFingerprint });
      if (!mutation.dryRun) throw new Error('admin_preview_stale');
      return { preview: receipt(), previewFingerprint: 'preview:npc-exact', committed: false,
        version: 'object:npc-exact-before', audit: null, notice: null };
    });
    const model = new MapNpcLocationActionModel(api, () => 'map-npc-stale');
    await model.preview(marker, 40, 41, 'Move Fisherman Fin home from Map Editor');
    await expect(model.commit(true)).rejects.toThrow('admin_preview_stale');
    expect(model.pending()).toBeNull();
    expect(calls[1]).toMatchObject({
      expectedBaseVersion: 'object:npc-exact-before', previewFingerprint: 'preview:npc-exact',
    });
  });

  it('cancels an in-flight preview without allowing its late receipt to reappear', async () => {
    const { api } = probe();
    let resolvePreview!: (result: AdminObjectMutationResult) => void;
    vi.mocked(api.mutate).mockReturnValueOnce(new Promise((resolve) => { resolvePreview = resolve; }));
    const model = new MapNpcLocationActionModel(api, () => 'map-npc-cancel');
    const pending = model.preview(marker, 40, 41, 'Move Fisherman Fin home from Map Editor');
    model.cancel();
    resolvePreview({ preview: receipt(), previewFingerprint: 'preview:npc-exact', committed: false,
      version: 'object:npc-exact-before', audit: null, notice: null });
    await pending;
    expect(model.pending()).toBeNull();
  });

  it('fails closed for player-owned, player-custody, simulation-controlled, and system-layer rows', () => {
    const base = { mapId: 'live-island', routeAccess: 'write' as const, connected: true,
      role: 'admin', hasLiveApi: true, marker };
    expect(mapNpcLocationAvailability(base)).toEqual({ allowed: true, authority: 'admin' });
    expect(mapNpcLocationAvailability({ ...base,
      marker: { ...marker, entityKind: 'player', layer: 'player_owned' } })).toMatchObject({
      allowed: false, reason: expect.stringContaining('Player-owned'),
    });
    expect(mapNpcLocationAvailability({ ...base,
      marker: { ...marker, playerControlled: true } })).toMatchObject({
      allowed: false, reason: expect.stringContaining('player custody'),
    });
    expect(mapNpcLocationAvailability({ ...base,
      marker: { ...marker, systemControlled: true, variant: 2 } })).toMatchObject({
      allowed: false, reason: expect.stringContaining('world authority'),
    });
    expect(mapNpcLocationAvailability({ ...base,
      marker: { ...marker, kind: 'boat' } })).toMatchObject({
      allowed: false, reason: expect.stringContaining('world authority'),
    });
    expect(mapNpcLocationAvailability({ ...base,
      marker: { ...marker, layer: 'generated_base' } })).toMatchObject({
      allowed: false, reason: expect.stringContaining('system-layer'),
    });
  });

  it('guards role, connection, route, destination, no-op, and model-level marker bypasses', async () => {
    const base = { mapId: 'live-island', routeAccess: 'write' as const, connected: true,
      role: 'owner', hasLiveApi: true, marker };
    expect(mapNpcLocationAvailability({ ...base, connected: false })).toMatchObject({ allowed: false });
    expect(mapNpcLocationAvailability({ ...base, role: 'content_editor' })).toMatchObject({ allowed: false });
    expect(mapNpcLocationAvailability({ ...base, routeAccess: 'read_only' })).toMatchObject({ allowed: false });
    expect(mapNpcLocationAvailability({ ...base, mapId: 'terrain-lab' })).toMatchObject({ allowed: false });
    const model = new MapNpcLocationActionModel(probe().api, () => 'map-npc-guard');
    await expect(model.preview(marker, 1.5, 2, 'Move Fisherman Fin home from Map Editor'))
      .rejects.toThrow('map_npc_location_target_invalid');
    await expect(model.preview({ ...marker, tileX: 20, tileY: 20 }, 20, 20,
      'Move Fisherman Fin home from Map Editor')).rejects.toThrow('admin_no_changes');
    await expect(model.preview({ ...marker, systemControlled: true }, 40, 41,
      'Move Fisherman Fin home from Map Editor')).rejects.toThrow('map_npc_location_immutable');
    await expect(model.preview({ ...marker, kind: 'boat' }, 40, 41,
      'Move a boat from Map Editor')).rejects.toThrow('map_npc_location_immutable');
  });

  it('rejects mismatched preview and audit identities instead of accepting a nearby NPC', async () => {
    const { api } = probe();
    vi.mocked(api.mutate).mockResolvedValueOnce({
      preview: { ...receipt(), target: { kind: 'entity', entityId: '8' } },
      previewFingerprint: 'preview:npc-exact', committed: false,
      version: 'object:npc-exact-before', audit: null, notice: null,
    });
    const model = new MapNpcLocationActionModel(api, () => 'map-npc-mismatch');
    await expect(model.preview(marker, 40, 41, 'Move Fisherman Fin home from Map Editor'))
      .rejects.toThrow('admin_preview_receipt_mismatch');
  });

  it('rejects a committed response whose inverse does not restore the exact retained origin', async () => {
    const { api } = probe();
    const mutation: AdminEntityMutation = {
      operation: 'relocate_npc', npcId: '7', spaceId: '0', tileX: 40, tileY: 41,
      reason: normalizeAdminReason('Move Fisherman Fin home from Map Editor'),
      clientMutationId: 'map-npc-inverse',
      dryRun: false,
    };
    vi.mocked(api.mutate)
      .mockResolvedValueOnce({ preview: receipt(), previewFingerprint: 'preview:npc-exact',
        committed: false, version: 'object:npc-exact-before', audit: null, notice: null })
      .mockResolvedValueOnce({ preview: receipt(), previewFingerprint: 'preview:npc-exact',
        committed: true, version: 'object:npc-after', notice: null,
        audit: { ...audit(mutation), payload: { ...audit(mutation).payload,
          inverse: { operation: 'relocate_npc', args: {
            npcId: '7', spaceId: '0', tileX: 999, tileY: 21,
          } } } } });
    const model = new MapNpcLocationActionModel(api, () => 'map-npc-inverse');
    await model.preview(marker, 40, 41, 'Move Fisherman Fin home from Map Editor');
    await expect(model.commit(true)).rejects.toThrow('commit_receipt_mismatch');
    expect(model.pending()).toBeNull();
  });
});

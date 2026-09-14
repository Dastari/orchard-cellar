import { describe, expect, it, vi } from 'vitest';
import type { AdminEntityMutation, AdminMutationPreview } from '../../../../world/src/admin/contracts.js';
import type { AdminObjectsApi } from '../../admin/objects-api.js';
import {
  MAP_FUNCTIONAL_LIVE_DEFINITION_IDS,
  MapSpawnHereModel,
  mapLiveSpawnAvailability,
} from './live-object-tools.js';

const preview: AdminMutationPreview = Object.freeze({
  operation: 'spawn_entity',
  target: { kind: 'space' as const, spaceId: '0' },
  baseVersion: 'objects:base-exact',
  preview: {
    changes: [{ path: '/entities/0', before: { present: false },
      after: { present: true, value: { definitionId: 'object:chest' } } }],
    truncated: false,
  },
  warnings: [],
  expiresAtMicros: '1780000060000000',
});

function apiProbe(): {
  readonly api: AdminObjectsApi;
  readonly calls: Array<{
    readonly mutation: AdminEntityMutation;
    readonly expectedBaseVersion: string;
    readonly previewFingerprint: string | null;
  }>;
} {
  const calls: Array<{
    readonly mutation: AdminEntityMutation;
    readonly expectedBaseVersion: string;
    readonly previewFingerprint: string | null;
  }> = [];
  const api: AdminObjectsApi = {
    source: 'live',
    listEntities: vi.fn(async () => ({ rows: [], nextCursor: null,
      worldVersion: 'unused', rowsScanned: 0 })),
    container: vi.fn(async () => { throw new Error('unused'); }),
    mutate: vi.fn(async (mutation, expectedBaseVersion, previewFingerprint) => {
      calls.push({ mutation, expectedBaseVersion, previewFingerprint });
      return {
        preview,
        previewFingerprint: 'preview:receipt-exact',
        committed: !mutation.dryRun,
        version: mutation.dryRun ? preview.baseVersion : 'objects:committed',
        audit: null,
        notice: null,
      };
    }),
  };
  return { api, calls };
}

describe('Map Editor functional live spawn bridge', () => {
  it.each(MAP_FUNCTIONAL_LIVE_DEFINITION_IDS)(
    'stages %s at the exact tile without committing before confirmation',
    async (definitionId) => {
      const { api, calls } = apiProbe();
      const model = new MapSpawnHereModel(api, () => `map-spawn-${definitionId.slice(7)}`);
      await model.preview({
        definitionId,
        displayName: definitionId.slice(7).replaceAll('_', ' '),
        spaceId: 0,
        tileX: 32,
        tileY: 41,
        reason: `Spawn ${definitionId} from Map Editor`,
        authority: 'admin',
        contentVersion: '27',
        contentFingerprint: 'content:exact',
      });

      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        mutation: { operation: 'spawn_entity', definitionId, spaceId: '0',
          tileX: 32, tileY: 41, dryRun: true },
        expectedBaseVersion: '',
        previewFingerprint: null,
      });
      expect(model.pending()).toMatchObject({
        definitionId,
        authority: 'admin',
        contentVersion: '27',
        contentFingerprint: 'content:exact',
        baseVersion: 'objects:base-exact',
        previewFingerprint: 'preview:receipt-exact',
        preview: { operation: 'spawn_entity' },
      });

      await model.commit();
      expect(calls).toHaveLength(2);
      expect(calls[1]).toMatchObject({
        mutation: { definitionId, dryRun: false },
        expectedBaseVersion: 'objects:base-exact',
        previewFingerprint: 'preview:receipt-exact',
      });
      await expect(model.commit()).rejects.toThrow('admin_preview_required');
    },
  );

  it('cancels an exact receipt and cannot commit it later', async () => {
    const { api, calls } = apiProbe();
    const model = new MapSpawnHereModel(api, () => 'map-spawn-cancel');
    await model.preview({
      definitionId: 'object:chest', displayName: 'Chest', spaceId: 0, tileX: 4, tileY: 5,
      reason: 'Spawn Chest from Map Editor', authority: 'owner',
      contentVersion: '28', contentFingerprint: 'content:cancel',
    });
    model.cancel();
    expect(model.pending()).toBeNull();
    await expect(model.commit()).rejects.toThrow('admin_preview_required');
    expect(calls).toHaveLength(1);
  });

  it.each([
    [{ connected: false, role: null, hasLiveApi: false }, 'Connect to the live world'],
    [{ connected: true, role: 'content_editor', hasLiveApi: true }, 'Only an owner or administrator'],
    [{ connected: true, role: 'admin', hasLiveApi: false }, 'Connect to the live world'],
  ] as const)('fails closed without live mutation authority: %j', (authority, reason) => {
    expect(mapLiveSpawnAvailability({
      mapId: 'live-island', routeAccess: 'write', contentVersion: '2',
      contentFingerprint: 'content:hash', definitionId: 'object:chest', ...authority,
    })).toEqual({ allowed: false, reason: expect.stringContaining(reason) });
  });

  it('requires the canonical live map, exact content head, and a supported semantic definition', () => {
    const base = {
      routeAccess: 'write' as const, connected: true, role: 'owner', hasLiveApi: true,
      contentVersion: '2', contentFingerprint: 'content:hash', definitionId: 'object:chest',
    };
    expect(mapLiveSpawnAvailability({ ...base, mapId: 'live-island' }))
      .toEqual({ allowed: true, authority: 'owner' });
    expect(mapLiveSpawnAvailability({ ...base, mapId: 'terrain-lab' }))
      .toMatchObject({ allowed: false });
    expect(mapLiveSpawnAvailability({ ...base, mapId: 'live-island', contentFingerprint: null }))
      .toMatchObject({ allowed: false });
    expect(mapLiveSpawnAvailability({ ...base, mapId: 'live-island', definitionId: 'object:standing_torch' }))
      .toMatchObject({ allowed: false });
  });
});

import { describe, expect, it } from 'vitest';
import {
  MockAdminApi,
  normalizeAdminReason,
  type AdminApi,
  type AdminPlayerMutation,
} from '../../admin/api.js';
import {
  PLAYER_MANAGER_OPERATIONS,
  PLAYER_MANAGER_TABS,
  PlayerManagerModel,
  playerOperationState,
} from './model.js';

function ids(): () => string {
  let value = 0; return () => `model-mutation-${++value}`;
}

describe('Player Manager model', () => {
  it('covers every player-facing tab and W0 player operation', () => {
    expect(PLAYER_MANAGER_TABS).toEqual([
      'position', 'inventory', 'wallet_stats', 'vitals_effects', 'skills', 'quests',
      'statistics', 'membership_connections', 'notices',
    ]);
    expect(PLAYER_MANAGER_OPERATIONS).toHaveLength(19);
    expect(new Set(PLAYER_MANAGER_OPERATIONS).size).toBe(19);
  });

  it('applies operation-level role restrictions instead of route-only authority', () => {
    expect(playerOperationState('support', 'unstick').enabled).toBe(true);
    expect(playerOperationState('support', 'set_wallet')).toMatchObject({ enabled: true });
    expect(playerOperationState('support', 'set_stats')).toMatchObject({ enabled: true });
    expect(playerOperationState('support', 'grant_skill_points')).toMatchObject({ enabled: true });
    expect(playerOperationState('support', 'give_items')).toMatchObject({ enabled: true });
    expect(playerOperationState('support', 'reset_skill_tree')).toMatchObject({ enabled: false });
    expect(playerOperationState('support', 'kick')).toMatchObject({ enabled: false });
    expect(playerOperationState('moderator', 'kick').enabled).toBe(true);
    expect(playerOperationState('moderator', 'give_items').enabled).toBe(false);
    expect(playerOperationState('content_editor', 'notify').enabled).toBe(false);
    expect(PLAYER_MANAGER_OPERATIONS.every((operation) => playerOperationState('admin', operation).enabled)).toBe(true);
  });

  it('searches/pages, loads complete snapshots, inventory, and connection history', async () => {
    const model = new PlayerManagerModel({ api: new MockAdminApi(1), role: 'admin', createMutationId: ids() });
    await model.search(''); expect(model.snapshot()).toMatchObject({ results: [{ displayName: 'Ada Orchard' }], nextCursor: '1' });
    await model.loadMore(); expect(model.snapshot().results).toHaveLength(2);
    await model.select('identity-ada');
    expect(model.snapshot()).toMatchObject({
      selectedIdentity: 'identity-ada', player: { displayName: 'Ada Orchard' },
      inventory: { identity: 'identity-ada' }, connections: [{ active: true }], connectionCursor: '1',
    });
    await model.loadMoreConnections(); expect(model.snapshot().connections).toHaveLength(2);
  });

  it('enforces normalized reasons, previews immutable diffs, commits, notifies, and undoes', async () => {
    const model = new PlayerManagerModel({ api: new MockAdminApi(), role: 'admin', createMutationId: ids() });
    await model.search('Ada'); await model.select('identity-ada');
    model.setReason('brief'); expect(model.snapshot().reasonError).not.toBeNull();
    await expect(model.preview({ operation: 'unstick' })).rejects.toMatchObject({ code: 'admin_invalid_reason' });
    model.setReason('  Support request 1042  '); expect(model.snapshot().reasonError).toBeNull();
    const preview = await model.preview({ operation: 'teleport_player', spaceId: 'cellar-1', tileX: 9, tileY: 10 });
    expect(preview).toMatchObject({ operation: 'teleport_player', baseVersion: 'player-v4' });
    expect(preview.preview.changes).not.toHaveLength(0);
    const committed = await model.commit();
    expect(committed).toMatchObject({ committed: true, notice: expect.stringContaining('teleport player') });
    expect(model.snapshot()).toMatchObject({ player: { version: 'player-v5' }, undoAuditId: 'mock-audit-1' });
    const undone = await model.undoLast();
    expect(undone.committed).toBe(true);
    expect(model.snapshot()).toMatchObject({ player: { position: { spaceId: 'topside', tileX: 18, tileY: 22 } }, undoAuditId: null });
  });

  it('surfaces a base-version conflict when the player changes after preview', async () => {
    const api = new MockAdminApi(); const model = new PlayerManagerModel({ api, role: 'admin', createMutationId: ids() });
    await model.search('Ada'); await model.select('identity-ada'); model.setReason('Support request 1042');
    await model.preview({ operation: 'set_wallet', deltaBronze: '5' });
    const reason = normalizeAdminReason('Concurrent support action');
    const concurrent: AdminPlayerMutation = { operation: 'set_vitals', targetIdentity: 'identity-ada', patch: { health: 91 }, reason, clientMutationId: 'concurrent-1', dryRun: true };
    await api.mutatePlayer(concurrent, 'player-v4');
    await api.mutatePlayer({ ...concurrent, dryRun: false }, 'player-v4');
    await expect(model.commit()).rejects.toMatchObject({ code: 'admin_preview_stale' });
    expect(model.snapshot().conflict).toContain('changed after preview');
  });

  it('undoes against the committed mutation slice instead of the refreshed aggregate snapshot', async () => {
    const backing = new MockAdminApi();
    let undoExpectedBaseVersion: string | null = null;
    const api: AdminApi = {
      source: 'live',
      findPlayers: (query, cursor) => backing.findPlayers(query, cursor),
      playerSnapshot: (identity) => backing.playerSnapshot(identity),
      playerInventory: (identity) => backing.playerInventory(identity),
      connections: (identity, cursor) => backing.connections(identity, cursor),
      mutatePlayer: async (mutation, expectedBaseVersion) => {
        const result = await backing.mutatePlayer(mutation, expectedBaseVersion);
        return result.committed ? { ...result, version: 'inventory:committed-slice' } : result;
      },
      undoPlayer: async (request) => {
        undoExpectedBaseVersion = request.expectedBaseVersion;
        const refreshed = await backing.playerSnapshot(request.targetIdentity);
        return backing.undoPlayer({ ...request, expectedBaseVersion: refreshed.version });
      },
    };
    const model = new PlayerManagerModel({ api, role: 'admin', createMutationId: ids() });
    await model.search('Ada');
    await model.select('identity-ada');
    model.setReason('Support request 1042');
    await model.preview({ operation: 'give_items', stacks: [{ itemKind: 'apple', quantity: 1 }] });
    await model.commit();
    expect(model.snapshot().player?.version).toBe('player-v5');
    await model.undoLast();
    expect(undoExpectedBaseVersion).toBe('inventory:committed-slice');
  });
});

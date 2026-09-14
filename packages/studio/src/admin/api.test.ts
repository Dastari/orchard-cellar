import { describe, expect, it } from 'vitest';
import { AdminApiError, MockAdminApi, decodeAdminTransportResult, normalizeAdminReason, type AdminPlayerMutation } from './api.js';

const reason = normalizeAdminReason('Support request 1042');

function playerMutations(): readonly AdminPlayerMutation[] {
  const common = { targetIdentity: 'identity-ada', dryRun: true, reason } as const;
  return [
    { ...common, clientMutationId: 'test-wallet', operation: 'set_wallet', deltaBronze: '25' },
    { ...common, clientMutationId: 'test-stats', operation: 'set_stats', patch: { farming: 9 } },
    { ...common, clientMutationId: 'test-vitals', operation: 'set_vitals', patch: { health: 80 } },
    { ...common, clientMutationId: 'test-grant-skill', operation: 'grant_skill_points', track: 'farming', points: 2 },
    { ...common, clientMutationId: 'test-reset-skill', operation: 'reset_skill_tree' },
    { ...common, clientMutationId: 'test-quest', operation: 'set_quest_state', questId: 'welcome', state: 'complete' },
    { ...common, clientMutationId: 'test-reset-quests', operation: 'reset_quests' },
    { ...common, clientMutationId: 'test-give', operation: 'give_items', stacks: [{ itemKind: 'apple', quantity: 2 }] },
    { ...common, clientMutationId: 'test-remove', operation: 'remove_items', stacks: [{ itemKind: 'wood', quantity: 1 }] },
    { ...common, clientMutationId: 'test-cursor', operation: 'clear_cursor' },
    { ...common, clientMutationId: 'test-overflow', operation: 'drain_overflow' },
    { ...common, clientMutationId: 'test-slot', operation: 'set_slot', slot: { area: 'backpack', index: 0 }, stack: { itemKind: 'apple', quantity: 3 } },
    { ...common, clientMutationId: 'test-spawn', operation: 'set_spawn', spaceId: 'topside', tileX: 3, tileY: 4 },
    { ...common, clientMutationId: 'test-respawn', operation: 'respawn' },
    { ...common, clientMutationId: 'test-unstick', operation: 'unstick' },
    { ...common, clientMutationId: 'test-teleport', operation: 'teleport_player', spaceId: 'cellar-1', tileX: 3, tileY: 4 },
    { ...common, clientMutationId: 'test-name', operation: 'set_display_name', displayName: 'Ada Apple' },
    { ...common, clientMutationId: 'test-kick', operation: 'kick', notice: 'Session refreshed by support.' },
    { ...common, clientMutationId: 'test-notify', operation: 'notify', body: 'Your request has been completed.' },
  ];
}

describe('AdminApi facade and deterministic mock', () => {
  it('normalizes audited reasons through the W0 contract', () => {
    expect(normalizeAdminReason('   Support request 1042   ')).toBe('Support request 1042');
    expect(() => normalizeAdminReason('short')).toThrow(AdminApiError);
  });

  it('keeps typed and JSON-string procedure decoding behind the facade', () => {
    const isPage = (value: unknown): value is { readonly rows: readonly unknown[]; readonly nextCursor: string | null } => (
      value !== null && typeof value === 'object' && 'rows' in value && Array.isArray(value.rows)
      && 'nextCursor' in value && (value.nextCursor === null || typeof value.nextCursor === 'string')
    );
    expect(decodeAdminTransportResult({ rows: [], nextCursor: null }, isPage)).toEqual({ rows: [], nextCursor: null });
    expect(decodeAdminTransportResult('{"rows":[],"nextCursor":"next"}', isPage)).toEqual({ rows: [], nextCursor: 'next' });
    expect(() => decodeAdminTransportResult('{bad', isPage)).toThrow(AdminApiError);
  });

  it('searches and pages stable player summaries', async () => {
    const api = new MockAdminApi(2);
    const first = await api.findPlayers('', null);
    expect(first.rows.map(({ displayName }) => displayName)).toEqual(['Ada Orchard', 'Bea Bramble']);
    expect(first.nextCursor).toBe('2');
    const second = await api.findPlayers('', first.nextCursor);
    expect(second.rows.map(({ displayName }) => displayName)).toEqual(['Cy Moss', 'Dee Reed']);
    expect(second.nextCursor).toBeNull();
    expect((await api.findPlayers('identity-bea', null)).rows).toHaveLength(1);
  });

  it('produces immutable W0 previews for every player operation', async () => {
    for (const mutation of playerMutations()) {
      const api = new MockAdminApi();
      const snapshot = await api.playerSnapshot(mutation.targetIdentity === 'all' ? 'identity-ada' : mutation.targetIdentity);
      const result = await api.mutatePlayer(mutation, snapshot.version);
      expect(result.committed, mutation.operation).toBe(false);
      expect(result.preview.operation).toBe(mutation.operation);
      expect(result.preview.preview.changes.length, mutation.operation).toBeGreaterThan(0);
      expect(Object.isFrozen(result.preview)).toBe(true);
      expect(Object.isFrozen(result.preview.preview.changes)).toBe(true);
    }
  });

  it('requires dry-run before commit, rejects stale base versions, and supports audited undo', async () => {
    const api = new MockAdminApi();
    const base = await api.playerSnapshot('identity-ada');
    const mutation = playerMutations()[0]!;
    if (mutation.operation !== 'set_wallet') throw new Error('wallet fixture required');
    await expect(api.mutatePlayer({ ...mutation, dryRun: false }, base.version))
      .rejects.toMatchObject({ code: 'admin_preview_required' });
    await api.mutatePlayer(mutation, base.version);
    await expect(api.mutatePlayer({ ...mutation, dryRun: false, deltaBronze: '250' }, base.version))
      .rejects.toMatchObject({ code: 'admin_preview_required' });
    const committed = await api.mutatePlayer({ ...mutation, dryRun: false }, base.version);
    expect(committed).toMatchObject({ committed: true, undoAuditId: 'mock-audit-1' });
    expect((await api.playerSnapshot('identity-ada')).walletBronze).toBe('245');

    const stale = { ...playerMutations()[2]!, clientMutationId: 'test-stale' };
    await expect(api.mutatePlayer(stale, base.version)).rejects.toMatchObject({ code: 'admin_preview_stale' });

    const undone = await api.undoPlayer({
      auditId: committed.undoAuditId!, targetIdentity: 'identity-ada', reason,
      clientMutationId: 'test-undo', expectedBaseVersion: committed.version,
    });
    expect(undone.committed).toBe(true);
    expect((await api.playerSnapshot('identity-ada')).walletBronze).toBe('220');
  });
});

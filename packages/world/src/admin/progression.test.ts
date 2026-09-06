import { describe, expect, it } from 'vitest';
import { parseAdminReason, type AdminPlayerMutation } from './contracts.js';
import {
  AdminProgressionError,
  adminProgressionDocument,
  adminProgressionVersion,
  planAdminProgressionMutation,
  requireAdminProgressionAuthority,
  supportMutationCountInRollingHour,
  type AdminProgressionMutation,
  type AdminProgressionState,
} from './progression.js';
import { DEFAULT_SUPPORT_CAPS } from './support-caps.js';

const parsedReason = parseAdminReason('Resolve player support incident 9001');
if (!parsedReason.ok) throw new Error('invalid test reason');
const reason = parsedReason.value;
const quests = new Map<string, readonly string[]>([
  ['farmer_bob_fast_strawberries', ['grow_strawberries']],
  ['marlow_book', ['recover_book']],
]);

function state(overrides: Partial<AdminProgressionState> = {}): AdminProgressionState {
  return {
    walletBronze: 1_000n,
    stats: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    vitals: { healthCenti: 10_000, manaCenti: 10_000, vigourCenti: 10_000, hungerCenti: 10_000 },
    skillTracks: [
      { track: 'combat', experience: 0n, spentPoints: 1, bonusPoints: 0, respecCount: 0 },
      { track: 'explorer', experience: 0n, spentPoints: 0, bonusPoints: 0, respecCount: 0 },
      { track: 'farming', experience: 100n, spentPoints: 2, bonusPoints: 1, respecCount: 1 },
    ],
    skillNodes: [
      { track: 'combat', nodeId: 'combat_test', rank: 1 },
      { track: 'farming', nodeId: 'farming_test', rank: 2 },
    ],
    quests: [{ questId: 'marlow_book', state: 'active', acceptedTick: 2n,
      completedTick: null, turnedInTick: null, pinned: true }],
    questBaselines: [{ questId: 'marlow_book', objectiveId: 'recover_book', value: 3n }],
    questWorldItems: [{ questId: 'marlow_book', objectiveId: 'recover_book', surfaceId: 1n,
      slot: 0, itemKind: 'marlow_book' }],
    ...overrides,
  };
}

function mutation<T extends AdminProgressionMutation>(
  value: { readonly operation: AdminProgressionMutation['operation']; readonly dryRun: boolean }
    & Record<string, unknown>,
): T {
  return {
    reason,
    clientMutationId: `progression-${value.operation}`,
    targetIdentity: 'target-player',
    ...value,
  } as T;
}

function plan(input: AdminProgressionState, operation: AdminProgressionMutation) {
  return planAdminProgressionMutation(input, {
    mutation: operation,
    expectedBaseVersion: adminProgressionVersion(input),
    previewFingerprint: null,
    nowMicros: 4_000_000_000n,
    authorityTick: 500n,
    questObjectiveIds: quests,
  });
}

describe('W2b administration economy and progression kernel', () => {
  it('plans wallet, attribute, vital and skill grants without mutating input', () => {
    const input = state();
    expect(plan(input, mutation({ operation: 'set_wallet', dryRun: true, deltaBronze: '-250' }))
      .after.walletBronze).toBe(750n);
    expect(plan(input, mutation({ operation: 'set_stats', dryRun: true, patch: { str: 15, wis: 12 } }))
      .after.stats).toMatchObject({ str: 15, wis: 12 });
    expect(plan(input, mutation({ operation: 'set_vitals', dryRun: true,
      patch: { healthCenti: 8_500, hungerCenti: 9_000 } })).after.vitals)
      .toMatchObject({ healthCenti: 8_500, hungerCenti: 9_000 });
    expect(plan(input, mutation({ operation: 'grant_skill_points', dryRun: true,
      track: 'farming', points: 3 })).after.skillTracks.find(({ track }) => track === 'farming')?.bonusPoints)
      .toBe(4);
    expect(input.walletBronze).toBe(1_000n);
    expect(input.stats.str).toBe(10);
  });

  it('resets one skill tree or all skill trees without charging the player', () => {
    const input = state();
    const farming = plan(input, mutation({ operation: 'reset_skill_tree', dryRun: true, track: 'farming' }));
    expect(farming.after.skillNodes).toEqual([{ track: 'combat', nodeId: 'combat_test', rank: 1 }]);
    expect(farming.after.skillTracks.find(({ track }) => track === 'farming')).toMatchObject({
      spentPoints: 0, bonusPoints: 1, respecCount: 1,
    });
    expect(farming.after.walletBronze).toBe(1_000n);
    expect(plan(input, mutation({ operation: 'reset_skill_tree', dryRun: true }))
      .after.skillNodes).toEqual([]);
  });

  it('creates, transitions, clears and globally resets quest custody rows', () => {
    const created = plan(state(), mutation({
      operation: 'set_quest_state', dryRun: true,
      questId: 'farmer_bob_fast_strawberries', state: 'complete',
    }));
    expect(created.after.quests.find(({ questId }) => questId === 'farmer_bob_fast_strawberries'))
      .toEqual({ questId: 'farmer_bob_fast_strawberries', state: 'complete', acceptedTick: 500n,
        completedTick: 500n, turnedInTick: null, pinned: true });
    expect(created.after.questBaselines).toContainEqual({
      questId: 'farmer_bob_fast_strawberries', objectiveId: 'grow_strawberries', value: 0n,
    });
    const available = plan(state(), mutation({
      operation: 'set_quest_state', dryRun: true, questId: 'marlow_book', state: 'available',
    }));
    expect(available.after.quests).toEqual([]);
    expect(available.after.questBaselines).toEqual([]);
    expect(available.after.questWorldItems).toEqual([]);
    expect(plan(state(), mutation({ operation: 'reset_quests', dryRun: true })).after)
      .toMatchObject({ quests: [], questBaselines: [], questWorldItems: [] });
  });

  it('requires the exact dry-run fingerprint and unchanged base version at commit', () => {
    const input = state();
    const dryRun = mutation<AdminProgressionMutation>({
      operation: 'set_wallet', dryRun: true, deltaBronze: '25',
    });
    const preview = plan(input, dryRun);
    const commit = { ...dryRun, dryRun: false } as AdminProgressionMutation;
    const committed = planAdminProgressionMutation(input, {
      mutation: commit,
      expectedBaseVersion: preview.baseVersion,
      previewFingerprint: preview.previewFingerprint,
      nowMicros: 4_000_000_001n,
      authorityTick: 500n,
      questObjectiveIds: quests,
    });
    expect(adminProgressionDocument(committed.after)).toEqual(adminProgressionDocument(preview.after));
    expect(committed.audit.inverse).toEqual({
      operation: 'undo', args: { progression: adminProgressionDocument(input) },
    });
    expect(committed.audit.notice).toContain('set wallet');
    expect(committed.committedVersion).not.toBe(committed.baseVersion);
    expect(() => planAdminProgressionMutation(input, {
      mutation: commit, expectedBaseVersion: preview.baseVersion, previewFingerprint: 'preview:wrong',
      nowMicros: 4_000_000_001n, authorityTick: 500n, questObjectiveIds: quests,
    })).toThrowError(new AdminProgressionError('admin_preview_required'));
    expect(() => planAdminProgressionMutation(input, {
      mutation: commit, expectedBaseVersion: 'progression:stale', previewFingerprint: preview.previewFingerprint,
      nowMicros: 4_000_000_001n, authorityTick: 500n, questObjectiveIds: quests,
    })).toThrowError(new AdminProgressionError('admin_preview_stale'));
  });

  it('rejects malformed fields, impossible balances, tracks and quest states', () => {
    const input = state();
    for (const invalid of [
      mutation({ operation: 'set_wallet', dryRun: true, deltaBronze: '-1001' }),
      mutation({ operation: 'set_stats', dryRun: true, patch: { farming: 10 } }),
      mutation({ operation: 'set_stats', dryRun: true, patch: { str: 31 } }),
      mutation({ operation: 'set_vitals', dryRun: true, patch: { hungerCenti: 10_001 } }),
      mutation({ operation: 'grant_skill_points', dryRun: true, track: 'magic', points: 1 }),
      mutation({ operation: 'set_quest_state', dryRun: true, questId: 'missing', state: 'active' }),
      mutation({ operation: 'set_quest_state', dryRun: true, questId: 'marlow_book', state: 'done' }),
    ] as AdminProgressionMutation[]) {
      expect(() => plan(input, invalid)).toThrow(AdminProgressionError);
    }
  });

  it('enforces authored support caps and a true rolling-hour count', () => {
    const input = state();
    const context = { mutationsInLastHour: 29 };
    const stats = mutation<AdminProgressionMutation>({
      operation: 'set_stats', dryRun: true, patch: { str: 15 },
    });
    expect(() => requireAdminProgressionAuthority('owner', stats, input, DEFAULT_SUPPORT_CAPS, context)).not.toThrow();
    expect(() => requireAdminProgressionAuthority('admin', stats, input, DEFAULT_SUPPORT_CAPS, context)).not.toThrow();
    expect(() => requireAdminProgressionAuthority('support', stats, input, DEFAULT_SUPPORT_CAPS, context)).not.toThrow();
    expect(() => requireAdminProgressionAuthority('support', { ...stats, patch: { str: 16 } } as AdminProgressionMutation,
      input, DEFAULT_SUPPORT_CAPS, context)).toThrowError(new AdminProgressionError('admin_support_cap_exceeded'));
    expect(() => requireAdminProgressionAuthority('support', stats, input, DEFAULT_SUPPORT_CAPS,
      { mutationsInLastHour: 30 })).toThrowError(new AdminProgressionError('admin_rate_limited'));
    expect(() => requireAdminProgressionAuthority('friend', stats, input, DEFAULT_SUPPORT_CAPS, context))
      .toThrowError(new AdminProgressionError('admin_role_forbidden'));
    expect(() => requireAdminProgressionAuthority('moderator', stats, input, DEFAULT_SUPPORT_CAPS, context))
      .toThrowError(new AdminProgressionError('admin_role_forbidden'));

    const hour = 3_600_000_000n;
    expect(supportMutationCountInRollingHour([0n, 1n, hour, hour + 1n, hour * 2n], hour + 1n)).toBe(3);
  });

  it('keeps all seven reducer operations statically representable', () => {
    const operations: readonly AdminPlayerMutation['operation'][] = [
      'set_wallet', 'set_stats', 'set_vitals', 'grant_skill_points',
      'reset_skill_tree', 'set_quest_state', 'reset_quests',
    ];
    expect(operations).toHaveLength(7);
  });

  it('registers all reducers with authored caps, typed audit and online notice writes', () => {
    const source = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
    for (const name of [
      'adminSetWallet', 'adminSetStats', 'adminSetVitals', 'adminGrantSkillPoints',
      'adminResetSkillTree', 'adminSetQuestState', 'adminResetQuests',
    ]) expect(source).toContain(`export const ${name} = spacetimedb.reducer(`);
    expect(source).toContain('resolveSupportCaps(contentRegistry(ctx).balances.values())');
    expect(source).toContain('writeAdminProgressionState(ctx, target, plan.after, mutation)');
    expect(source).toContain('payload: plan.audit');
    expect(source).toContain("insertSessionChatNotice(ctx, target, presence.connectionId, 'admin', plan.notice)");
    expect(source).toContain('existingPreview.fingerprint !== previewFingerprint');
  });
});
import { readFileSync } from 'node:fs';

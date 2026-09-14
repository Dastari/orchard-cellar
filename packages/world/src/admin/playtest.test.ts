import { describe, expect, it } from 'vitest';
import type { AdminReason } from './contracts.js';
import {
  AdminPlaytestError,
  adminPlaytestVersion,
  planAdminPlaytestMutation,
  requireAdminPlaytestAuthority,
  type AdminPlaytestMutation,
  type AdminPlaytestState,
} from './playtest.js';

const reason = 'World table playtest' as AdminReason;
const envelope = { reason, clientMutationId: 'world.playtest.1' } as const;
const plan = (state: AdminPlaytestState, mutation: AdminPlaytestMutation, fingerprint: string | null = null) =>
  planAdminPlaytestMutation(state, { mutation, expectedBaseVersion: adminPlaytestVersion(state),
    previewFingerprint: fingerprint, nowMicros: 1_780_000_000_000_000n });

describe('admin World Tables playtest authority', () => {
  it('plans deterministic spawn preview/commit parity with an inverse', () => {
    const state: AdminPlaytestState = { kind: 'spawn', authorityTick: 90n, entityId: 9_500_000_000_123n,
      definition: { definitionId: 'creature:goose', species: 'goose', variants: 6,
        habitat: 'grassland', maximumHealth: 50 }, existingEntity: null };
    const dry = plan(state, { ...envelope, dryRun: true, operation: 'playtest_spawn',
      definitionId: 'creature:goose', spaceId: '0', tileX: 12, tileY: 13 });
    const commit = plan(state, { ...envelope, dryRun: false, operation: 'playtest_spawn',
      definitionId: 'creature:goose', spaceId: '0', tileX: 12, tileY: 13 }, dry.previewFingerprint);
    expect(commit.action).toEqual(dry.action);
    expect(commit.audit.inverse).toEqual({ operation: 'despawn_entity',
      args: { entityId: '9500000000123', spillContents: false } });
    expect(commit.committedVersion).toBe(dry.committedVersion);
  });

  it('refreshes an authored effect and requires the exact receipt', () => {
    const state: AdminPlaytestState = { kind: 'effect', authorityTick: 100n, targetExists: true,
      definitionId: 'effect:well_rested', effectKind: 'well_rested', maximumStacks: 2, durationTicks: 600,
      existingEffect: { id: '7', stacks: 1, appliedTick: '80', expiresTick: '120' } };
    const mutation: AdminPlaytestMutation = { ...envelope, dryRun: true, operation: 'playtest_apply_effect',
      definitionId: state.definitionId, targetIdentity: 'player-a' };
    const dry = plan(state, mutation);
    expect(dry.action).toMatchObject({ kind: 'upsert_effect', previousId: '7', stacks: 2,
      appliedTick: '100', expiresTick: '700' });
    expect(() => plan(state, { ...mutation, dryRun: false })).toThrowError(AdminPlaytestError);
    expect(() => planAdminPlaytestMutation(state, { mutation: { ...mutation, dryRun: false },
      expectedBaseVersion: '', previewFingerprint: dry.previewFingerprint, nowMicros: 1n }))
      .toThrow('admin_preview_stale');
    expect(() => planAdminPlaytestMutation(state, { mutation, expectedBaseVersion: 'playtest:stale',
      previewFingerprint: null, nowMicros: 1n })).toThrow('admin_preview_stale');
  });

  it('sets an authored homestead upgrade rank within its maximum', () => {
    const state: AdminPlaytestState = { kind: 'upgrade', authorityTick: 100n, targetExists: true,
      definitionId: 'upgrade:rich_soil', upgradeKind: 'rich_soil', maximumRank: 3,
      homesteadSpaceId: '30000', existingUpgrade: null };
    const mutation: AdminPlaytestMutation = { ...envelope, dryRun: true, operation: 'playtest_grant_upgrade',
      definitionId: state.definitionId, targetIdentity: 'player-a', rank: 2 };
    expect(plan(state, mutation).action).toMatchObject({ kind: 'upsert_upgrade', rank: 2,
      homesteadSpaceId: '30000' });
    expect(() => plan(state, { ...mutation, rank: 4 })).toThrow('admin_payload_invalid');
  });

  it('is owner/admin-only and rejects occupied spawn ids', () => {
    const mutation: AdminPlaytestMutation = { ...envelope, dryRun: true, operation: 'playtest_spawn',
      definitionId: 'creature:goose', spaceId: '0', tileX: 1, tileY: 1 };
    expect(() => requireAdminPlaytestAuthority('content_editor', mutation)).toThrow('admin_role_forbidden');
    expect(() => requireAdminPlaytestAuthority('owner', mutation)).not.toThrow();
    const occupied: AdminPlaytestState = { kind: 'spawn', authorityTick: 1n, entityId: 9_500_000_000_123n,
      definition: { definitionId: mutation.definitionId, species: 'goose', variants: 1,
        habitat: 'grassland', maximumHealth: 50 }, existingEntity: { id: '9500000000123' } };
    expect(() => plan(occupied, mutation)).toThrow('admin_payload_invalid');
  });
});

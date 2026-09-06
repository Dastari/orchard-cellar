import { describe, expect, it } from 'vitest';
import { parseAdminReason } from './contracts.js';
import {
  AdminPositionError,
  adminPositionDocument,
  adminPositionVersion,
  planAdminPositionMutation,
  requireAdminPositionAuthority,
  type AdminPositionMutation,
  type AdminPositionOperation,
  type AdminPositionPlanRequest,
  type AdminPositionPoint,
  type AdminPositionState,
} from './position.js';
import { DEFAULT_SUPPORT_CAPS } from './support-caps.js';

const parsedReason = parseAdminReason('Resolve support ticket 8291');
if (!parsedReason.ok) throw new Error('invalid test reason');
const reason = parsedReason.value;

const point = (spaceId: string, tileX: number, tileY: number): AdminPositionPoint => ({
  spaceId, tileX, tileY, x: tileX * 4_096 + 2_048, y: tileY * 4_096 + 2_048,
});

function state(overrides: Partial<AdminPositionState> = {}): AdminPositionState {
  return {
    identity: 'target-identity',
    displayName: 'Old Farmer',
    nameChosen: true,
    position: point('0', 10, 10),
    spawn: point('0', 3, 4),
    moving: true,
    actionKind: 'fish_cast',
    mountedEntityId: 'horse:7',
    carriedEntityIds: ['chest:4', 'target:2'],
    connectionIds: ['connection-b', 'connection-a'],
    ...overrides,
  };
}

function mutation<T extends AdminPositionMutation>(
  value: { readonly operation: AdminPositionOperation; readonly dryRun: boolean } & Record<string, unknown>,
): T {
  return {
    targetIdentity: 'target-identity',
    reason,
    clientMutationId: 'position-test-1',
    ...value,
  } as T;
}

function request(
  input: AdminPositionState,
  operation: AdminPositionMutation,
  overrides: Partial<AdminPositionPlanRequest> = {},
): AdminPositionPlanRequest {
  return {
    mutation: operation,
    expectedBaseVersion: adminPositionVersion(input),
    previewFingerprint: null,
    nowMicros: 1_000_000n,
    pointAtTile: point,
    tileIsWalkable: () => true,
    ...overrides,
  };
}

describe('W2c position and session administration kernel', () => {
  it('sets a validated spawn while retaining the exact previous spawn inverse', () => {
    const input = state();
    const operation = mutation<AdminPositionMutation>({
      operation: 'set_spawn', dryRun: true, spaceId: '5', tileX: 8, tileY: 9,
    });
    const plan = planAdminPositionMutation(input, request(input, operation));
    expect(plan.after.spawn).toEqual(point('5', 8, 9));
    expect(plan.audit.inverse).toEqual({ operation: 'set_spawn', args: point('0', 3, 4) });
    expect(input.spawn).toEqual(point('0', 3, 4));
    expect(() => planAdminPositionMutation(input, request(input, operation, {
      tileIsWalkable: () => false,
    }))).toThrowError(new AdminPositionError('admin_position_blocked'));
  });

  it('respawns to the durable spawn and clears mount/carry at a settlement boundary', () => {
    const input = state();
    const operation = mutation<AdminPositionMutation>({ operation: 'respawn', dryRun: true });
    const plan = planAdminPositionMutation(input, request(input, operation));
    expect(plan.after).toMatchObject({
      position: input.spawn,
      moving: false,
      actionKind: 'none',
      mountedEntityId: null,
      carriedEntityIds: [],
    });
    expect(plan.effect).toMatchObject({
      settleMovement: true,
      clearInteractions: true,
      clearMount: true,
      clearCarry: true,
    });
    expect(plan.audit.inverse).toEqual({ operation: 'teleport_player', args: input.position });
  });

  it('unsticks to the deterministic nearest same-space walkable tile then falls back to spawn', () => {
    const input = state();
    const operation = mutation<AdminPositionMutation>({ operation: 'unstick', dryRun: true });
    const nearby = planAdminPositionMutation(input, request(input, operation, {
      tileIsWalkable: (candidate) => candidate.tileX === 9 && candidate.tileY === 10,
    }));
    expect(nearby.after.position).toEqual(point('0', 9, 10));
    expect(nearby.after.mountedEntityId).toBe('horse:7');
    expect(nearby.after.carriedEntityIds).toEqual(['chest:4', 'target:2']);

    const fallback = planAdminPositionMutation(input, request(input, operation, {
      tileIsWalkable: (candidate) => candidate.tileX === 3 && candidate.tileY === 4,
      unstickRadiusTiles: 2,
    }));
    expect(fallback.after.position).toEqual(input.spawn);
    expect(() => planAdminPositionMutation(input, request(input, operation, {
      tileIsWalkable: () => false,
    }))).toThrowError(new AdminPositionError('admin_position_blocked'));
  });

  it('teleports at an exact movement boundary and enforces support distance caps', () => {
    const input = state();
    const operation = mutation<AdminPositionMutation>({
      operation: 'teleport_player', dryRun: true, spaceId: '0', tileX: 15, tileY: 20,
    });
    const plan = planAdminPositionMutation(input, request(input, operation));
    expect(plan.after.position).toEqual(point('0', 15, 20));
    expect(plan.effect.settleMovement).toBe(true);
    expect(plan.after.mountedEntityId).toBe('horse:7');
    expect(plan.after.carriedEntityIds).toEqual(['chest:4', 'target:2']);
    expect(() => requireAdminPositionAuthority('support', operation, DEFAULT_SUPPORT_CAPS, {
      mutationsInLastHour: 0,
      fromTile: { spaceId: '0', tileX: 10, tileY: 10 },
    })).not.toThrow();
    expect(() => requireAdminPositionAuthority('support', {
      ...operation, tileX: 267,
    } as AdminPositionMutation, DEFAULT_SUPPORT_CAPS, {
      mutationsInLastHour: 0,
      fromTile: { spaceId: '0', tileX: 10, tileY: 10 },
    })).toThrowError(new AdminPositionError('admin_support_cap_exceeded'));
    expect(() => requireAdminPositionAuthority('support', {
      ...operation, spaceId: '1', tileX: 10, tileY: 10,
    } as AdminPositionMutation, DEFAULT_SUPPORT_CAPS, {
      mutationsInLastHour: 0,
      fromTile: { spaceId: '0', tileX: 10, tileY: 10 },
    })).toThrowError(new AdminPositionError('admin_support_cap_exceeded'));
  });

  it('normalizes display names, checks availability, and records an inverse', () => {
    const input = state();
    const operation = mutation<AdminPositionMutation>({
      operation: 'set_display_name', dryRun: true, displayName: '  New   Farmer  ',
    });
    const plan = planAdminPositionMutation(input, request(input, operation, {
      displayNameIsAvailable: () => true,
    }));
    expect(plan.after.displayName).toBe('New Farmer');
    expect(plan.audit.inverse).toEqual({
      operation: 'set_display_name', args: { displayName: 'Old Farmer' },
    });
    expect(() => planAdminPositionMutation(input, request(input, operation, {
      displayNameIsAvailable: () => false,
    }))).toThrowError(new AdminPositionError('admin_payload_invalid'));
  });

  it('kicks every target presence without membership revocation and notifies exact audiences', () => {
    const input = state();
    const kick = mutation<AdminPositionMutation>({
      operation: 'kick', dryRun: true, notice: '  Please reconnect after support completes. ',
    });
    const kickPlan = planAdminPositionMutation(input, request(input, kick));
    expect(kickPlan.after.connectionIds).toEqual([]);
    expect(kickPlan.effect.kickConnectionIds).toEqual(['connection-a', 'connection-b']);
    expect(kickPlan.audit.inverse).toBeNull();

    const notify = mutation<AdminPositionMutation>({
      operation: 'notify', dryRun: true, targetIdentity: 'all', body: ' Maintenance soon ',
    });
    const notifyPlan = planAdminPositionMutation(input, request(input, notify, {
      noticeRecipients: [
        { identity: 'z', connectionId: '2' },
        { identity: 'a', connectionId: '1' },
        { identity: 'a', connectionId: '1' },
      ],
    }));
    expect(notifyPlan.effect.notices).toEqual([
      { identity: 'a', connectionId: '1', body: 'Maintenance soon' },
      { identity: 'z', connectionId: '2', body: 'Maintenance soon' },
    ]);
    expect(notifyPlan.preview.target).toEqual({ kind: 'world' });
    expect(notifyPlan.audit.inverse).toBeNull();
  });

  it('binds dry-run and commit to exact state, fingerprint, mutation and reason', () => {
    const input = state();
    const dryRun = mutation<AdminPositionMutation>({
      operation: 'teleport_player', dryRun: true, spaceId: '0', tileX: 12, tileY: 11,
    });
    const preview = planAdminPositionMutation(input, request(input, dryRun));
    const discovered = planAdminPositionMutation(input, request(input, dryRun, {
      expectedBaseVersion: 'progression:snapshot-version',
    }));
    expect(discovered.baseVersion).toBe(adminPositionVersion(input));
    const commit = { ...dryRun, dryRun: false } as AdminPositionMutation;
    const committed = planAdminPositionMutation(input, request(input, commit, {
      previewFingerprint: preview.previewFingerprint,
    }));
    expect(adminPositionDocument(committed.after)).toEqual(adminPositionDocument(preview.after));
    expect(committed.committedVersion).not.toBe(committed.baseVersion);
    expect(() => planAdminPositionMutation(input, request(input, commit, {
      previewFingerprint: 'preview:wrong',
    }))).toThrowError(new AdminPositionError('admin_preview_required'));
    expect(() => planAdminPositionMutation(input, request(input, commit, {
      expectedBaseVersion: 'position:stale',
      previewFingerprint: preview.previewFingerprint,
    }))).toThrowError(new AdminPositionError('admin_preview_stale'));
  });

  it('enforces the owner/admin/support/moderator matrix and hourly cap', () => {
    const notify = mutation<AdminPositionMutation>({
      operation: 'notify', dryRun: true, body: 'Please reconnect',
    });
    const kick = mutation<AdminPositionMutation>({
      operation: 'kick', dryRun: true, notice: 'Please reconnect',
    });
    const context = { mutationsInLastHour: 0 };
    expect(() => requireAdminPositionAuthority('owner', kick, DEFAULT_SUPPORT_CAPS, context)).not.toThrow();
    expect(() => requireAdminPositionAuthority('admin', kick, DEFAULT_SUPPORT_CAPS, context)).not.toThrow();
    expect(() => requireAdminPositionAuthority('moderator', kick, DEFAULT_SUPPORT_CAPS, context)).not.toThrow();
    expect(() => requireAdminPositionAuthority('support', kick, DEFAULT_SUPPORT_CAPS, context))
      .toThrowError(new AdminPositionError('admin_role_forbidden'));
    expect(() => requireAdminPositionAuthority('support', notify, DEFAULT_SUPPORT_CAPS, context)).not.toThrow();
    expect(() => requireAdminPositionAuthority('support', notify, DEFAULT_SUPPORT_CAPS, {
      mutationsInLastHour: DEFAULT_SUPPORT_CAPS.mutationsPerHour,
    })).toThrowError(new AdminPositionError('admin_rate_limited'));
    expect(() => requireAdminPositionAuthority('friend', notify, DEFAULT_SUPPORT_CAPS, context))
      .toThrowError(new AdminPositionError('admin_role_forbidden'));
  });
});

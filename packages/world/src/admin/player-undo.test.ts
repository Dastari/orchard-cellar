import { describe, expect, it } from 'vitest';
import type { ContainerSnapshot, ItemStack } from '@orchard/sim';
import { parseAdminReason, type AdminAuditPayloadV1 } from './contracts.js';
import { adminInventoryDocument, adminInventoryVersion, type AdminInventoryState } from './inventory.js';
import { adminProgressionDocument, type AdminProgressionState } from './progression.js';
import {
  AdminPlayerUndoError,
  adminPlayerUndoAction,
  assertAdminPlayerUndoVersion,
  parseAdminInventoryUndoState,
  parseAdminProgressionUndoState,
  planAdminPlayerUndoGuard,
  type AdminPlayerUndoGuardInput,
} from './player-undo.js';

const parsedReason = parseAdminReason('Undo support incident 4821');
if (!parsedReason.ok) throw new Error('invalid test reason');
const reason = parsedReason.value;

function container(id: string, slots: readonly (ItemStack | null)[]): ContainerSnapshot {
  return { id, capacity: slots.length, slots };
}

function inventory(overrides: Partial<AdminInventoryState> = {}): AdminInventoryState {
  return {
    containers: {
      hotbar: container('hotbar', [{ itemKind: 'axe', quantity: 1, durability: 91 }, null]),
      backpack: container('backpack', [{ itemKind: 'apple', quantity: 3 }, null]),
      equipment: container('equipment', [{ itemKind: 'lantern', quantity: 1, lit: true }]),
      crafting: container('crafting', [null]),
    },
    cursor: null,
    overflow: [],
    ...overrides,
  };
}

function progression(overrides: Partial<AdminProgressionState> = {}): AdminProgressionState {
  return {
    walletBronze: 900n,
    stats: { str: 11, dex: 12, con: 13, int: 14, wis: 15, cha: 16 },
    vitals: { healthCenti: 8_000, manaCenti: 7_000, vigourCenti: 6_000, hungerCenti: 5_000 },
    skillTracks: [{ track: 'farming', experience: 123n, spentPoints: 2, bonusPoints: 3, respecCount: 1 }],
    skillNodes: [{ track: 'farming', nodeId: 'farming_yield', rank: 2 }],
    quests: [{ questId: 'marlow_book', state: 'complete', acceptedTick: 10n,
      completedTick: 20n, turnedInTick: null, pinned: true }],
    questBaselines: [{ questId: 'marlow_book', objectiveId: 'recover_book', value: 4n }],
    questWorldItems: [{ questId: 'marlow_book', objectiveId: 'recover_book',
      surfaceId: 71n, slot: 2, itemKind: 'marlow_book' }],
    ...overrides,
  };
}

function audit(inverse: AdminAuditPayloadV1['inverse']): AdminAuditPayloadV1 {
  return {
    schemaVersion: 1,
    clientMutationId: 'source-mutation',
    target: { kind: 'player', identity: 'target-player' },
    reason,
    changes: [],
    inverse,
    notice: 'Original administration change.',
  };
}

function guard(overrides: Partial<AdminPlayerUndoGuardInput> = {}): AdminPlayerUndoGuardInput {
  return {
    role: 'admin',
    actorIdentity: 'actor',
    targetIdentity: 'target-player',
    sourceAuditId: '41',
    source: {
      actorIdentity: 'another-admin',
      operation: 'set_wallet',
      targetIdentity: 'target-player',
      hasInverse: true,
    },
    existingCommit: null,
    alreadyUndone: false,
    supportMutationsInLastHour: 0,
    supportMutationLimit: 30,
    ...overrides,
  };
}

describe('live audited player undo kernel', () => {
  it('restores the complete inventory snapshot including custody and stack metadata', () => {
    const current = inventory({
      cursor: { itemKind: 'wood', quantity: 2 },
      overflow: [{ itemKind: 'stone', quantity: 5 }],
    });
    const before = inventory({
      cursor: { itemKind: 'apple', quantity: 1 },
      overflow: [{ itemKind: 'coal', quantity: 4, durability: 7 }],
    });
    const action = adminPlayerUndoAction('give_items', audit({
      operation: 'undo', args: { inventory: adminInventoryDocument(before) },
    }), current);
    expect(action).toEqual({ kind: 'inventory_restore', state: before });
    expect(adminInventoryVersion(action.kind === 'inventory_restore' ? action.state : current))
      .toBe(adminInventoryVersion(before));
  });

  it('restores one slot, cursor, or overflow entry without changing other custody', () => {
    const current = inventory({
      cursor: { itemKind: 'wood', quantity: 2 },
      overflow: [{ itemKind: 'stone', quantity: 5 }],
    });
    const slot = adminPlayerUndoAction('set_slot', audit({
      operation: 'set_slot',
      args: { slot: { area: 'hotbar', index: 1 }, stack: { itemKind: 'torch', quantity: 1, lit: true } },
    }), current);
    expect(slot.kind === 'inventory_restore' && slot.state.containers.hotbar.slots[1])
      .toEqual({ itemKind: 'torch', quantity: 1, lit: true });
    expect(slot.kind === 'inventory_restore' && slot.state.cursor).toEqual(current.cursor);

    const overflow = adminPlayerUndoAction('set_slot', audit({
      operation: 'set_slot', args: { slot: { area: 'overflow', index: 0 }, stack: null },
    }), current);
    expect(overflow.kind === 'inventory_restore' && overflow.state.overflow).toEqual([]);
  });

  it('restores exact progression, quest timing, and quest-item custody snapshots', () => {
    const before = progression();
    const restored = parseAdminProgressionUndoState(adminProgressionDocument(before));
    expect(restored).toEqual(before);
    const action = adminPlayerUndoAction('reset_quests', audit({
      operation: 'undo', args: { progression: adminProgressionDocument(before) },
    }), inventory());
    expect(action).toEqual({ kind: 'progression_restore', state: before });
  });

  it('maps position, spawn, and display-name inverses while rejecting non-invertible actions', () => {
    expect(adminPlayerUndoAction('respawn', audit({ operation: 'teleport_player', args: {
      spaceId: '7', tileX: 12, tileY: 13, x: 51_200, y: 55_296,
    } }), inventory())).toMatchObject({ kind: 'position_mutation', operation: 'teleport_player' });
    expect(adminPlayerUndoAction('set_spawn', audit({ operation: 'set_spawn', args: {
      spaceId: '0', tileX: 3, tileY: 4, x: 14_336, y: 18_432,
    } }), inventory())).toMatchObject({ kind: 'position_mutation', operation: 'set_spawn' });
    expect(adminPlayerUndoAction('set_display_name', audit({ operation: 'set_display_name',
      args: { displayName: 'Original Farmer' } }), inventory())).toEqual({
      kind: 'position_mutation', operation: 'set_display_name', args: { displayName: 'Original Farmer' },
    });
    expect(() => adminPlayerUndoAction('kick', audit(null), inventory()))
      .toThrowError(new AdminPlayerUndoError('admin_no_changes'));
  });

  it('fails closed on malformed inventory and progression audit payloads', () => {
    expect(() => parseAdminInventoryUndoState({ slots: [], overflow: [] }, inventory()))
      .toThrowError(new AdminPlayerUndoError('admin_payload_invalid'));
    expect(() => parseAdminInventoryUndoState({
      slots: [
        { area: 'hotbar', index: 0, stack: null },
        { area: 'hotbar', index: 0, stack: null },
      ],
      overflow: [], cursor: null,
    }, inventory())).toThrowError(new AdminPlayerUndoError('admin_payload_invalid'));
    expect(() => parseAdminProgressionUndoState({
      ...adminProgressionDocument(progression()), walletBronze: '-1',
    })).toThrowError(new AdminPlayerUndoError('admin_payload_invalid'));
    const progressionDocument = adminProgressionDocument(progression());
    expect(() => parseAdminProgressionUndoState({
      ...progressionDocument,
      skillNodes: [
        { track: 'farming', nodeId: 'duplicate', rank: 1 },
        { track: 'farming', nodeId: 'duplicate', rank: 2 },
      ],
    })).toThrowError(new AdminPlayerUndoError('admin_payload_invalid'));
    expect(() => adminPlayerUndoAction('set_wallet', audit({
      operation: 'set_wallet', args: { deltaBronze: '10' },
    }), inventory())).toThrowError(new AdminPlayerUndoError('admin_payload_invalid'));
  });

  it('authorizes owner/admin and enforces support ownership, operation, and rolling cap', () => {
    expect(planAdminPlayerUndoGuard(guard({ role: 'owner' }))).toBe('apply');
    expect(planAdminPlayerUndoGuard(guard({ role: 'admin' }))).toBe('apply');
    expect(planAdminPlayerUndoGuard(guard({
      role: 'support', source: { actorIdentity: 'actor', operation: 'set_wallet',
        targetIdentity: 'target-player', hasInverse: true },
    }))).toBe('apply');
    expect(() => planAdminPlayerUndoGuard(guard({ role: 'moderator' })))
      .toThrowError(new AdminPlayerUndoError('admin_role_forbidden'));
    expect(() => planAdminPlayerUndoGuard(guard({
      role: 'support', source: { actorIdentity: 'another-admin', operation: 'set_wallet',
        targetIdentity: 'target-player', hasInverse: true },
    }))).toThrowError(new AdminPlayerUndoError('admin_role_forbidden'));
    expect(() => planAdminPlayerUndoGuard(guard({
      role: 'support', source: { actorIdentity: 'actor', operation: 'kick',
        targetIdentity: 'target-player', hasInverse: true },
    }))).toThrowError(new AdminPlayerUndoError('admin_role_forbidden'));
    expect(() => planAdminPlayerUndoGuard(guard({
      role: 'support', supportMutationsInLastHour: 30,
      source: { actorIdentity: 'actor', operation: 'set_wallet',
        targetIdentity: 'target-player', hasInverse: true },
    }))).toThrowError(new AdminPlayerUndoError('admin_rate_limited'));
  });

  it('makes the source audit single-use while treating only an exact same-id retry as success', () => {
    expect(planAdminPlayerUndoGuard(guard({
      source: null,
      existingCommit: { operation: 'undo', sourceAuditId: '41', targetIdentity: 'target-player' },
      alreadyUndone: true,
    }))).toBe('retry');
    expect(() => planAdminPlayerUndoGuard(guard({ alreadyUndone: true })))
      .toThrowError(new AdminPlayerUndoError('admin_no_changes'));
    expect(() => planAdminPlayerUndoGuard(guard({
      existingCommit: { operation: 'undo', sourceAuditId: '42', targetIdentity: 'target-player' },
    }))).toThrowError(new AdminPlayerUndoError('admin_invalid_mutation_id'));
    expect(() => planAdminPlayerUndoGuard(guard({
      existingCommit: { operation: 'undo', sourceAuditId: '41', targetIdentity: 'different-player' },
    }))).toThrowError(new AdminPlayerUndoError('admin_invalid_mutation_id'));
  });

  it('rejects missing, identity-mismatched, and inverse-free audit sources', () => {
    expect(() => planAdminPlayerUndoGuard(guard({ source: null })))
      .toThrowError(new AdminPlayerUndoError('admin_entity_not_found'));
    expect(() => planAdminPlayerUndoGuard(guard({ source: {
      actorIdentity: 'actor', operation: 'set_wallet', targetIdentity: 'different-player', hasInverse: true,
    } }))).toThrowError(new AdminPlayerUndoError('admin_no_changes'));
    expect(() => planAdminPlayerUndoGuard(guard({ source: {
      actorIdentity: 'actor', operation: 'set_wallet', targetIdentity: 'target-player', hasInverse: false,
    } }))).toThrowError(new AdminPlayerUndoError('admin_no_changes'));
  });

  it('requires the committed slice version and rejects both stale and no-op restores', () => {
    expect(assertAdminPlayerUndoVersion('inventory:after', 'inventory:after', 'inventory:before'))
      .toBe('inventory:before');
    expect(() => assertAdminPlayerUndoVersion('inventory:newer', 'inventory:after', 'inventory:before'))
      .toThrowError(new AdminPlayerUndoError('admin_world_revision_conflict'));
    expect(() => assertAdminPlayerUndoVersion('inventory:after', 'inventory:after', 'inventory:after'))
      .toThrowError(new AdminPlayerUndoError('admin_no_changes'));
  });
});

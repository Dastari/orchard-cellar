import { describe, expect, it } from 'vitest';
import type { ContainerSnapshot, ItemStack } from '@orchard/sim';
import { DEFAULT_SUPPORT_CAPS } from './support-caps.js';
import { parseAdminReason, type AdminPlayerMutation } from './contracts.js';
import {
  AdminInventoryError,
  adminInventoryDocument,
  adminInventoryVersion,
  planAdminInventoryMutation,
  requireAdminInventoryAuthority,
  type AdminInventoryOperation,
  type AdminInventoryMutation,
  type AdminInventoryState,
} from './inventory.js';

const reasonResult = parseAdminReason('Resolve support ticket 4821');
if (!reasonResult.ok) throw new Error('invalid test reason');
const reason = reasonResult.value;

function container(
  id: string,
  capacity: number,
  slots: readonly (ItemStack | null)[],
  restrictions?: ContainerSnapshot['restrictions'],
): ContainerSnapshot {
  return { id, capacity, slots, ...(restrictions === undefined ? {} : { restrictions }) };
}

function state(overrides: Partial<AdminInventoryState> = {}): AdminInventoryState {
  return {
    containers: {
      hotbar: container('hotbar', 2, [{ itemKind: 'apple', quantity: 31 }, null]),
      backpack: container('backpack', 2, [null, null]),
      equipment: container('equipment', 1, [null], { 0: { requiredTags: ['gear.hand'] } }),
      crafting: container('crafting', 1, [null]),
    },
    cursor: null,
    overflow: [],
    ...overrides,
  };
}

function mutation<T extends AdminInventoryMutation>(
  value: { readonly operation: AdminInventoryOperation; readonly targetIdentity: string; readonly dryRun: boolean } & Record<string, unknown>,
): T {
  return { reason, clientMutationId: 'inventory-test-1', ...value } as T;
}

function plan(input: AdminInventoryState, operation: AdminInventoryMutation) {
  return planAdminInventoryMutation(input, {
    mutation: operation,
    expectedBaseVersion: adminInventoryVersion(input),
    previewFingerprint: null,
    nowMicros: 1_000_000n,
  });
}

describe('W2a administration inventory kernel', () => {
  it('preflights complete gives across stack and capacity boundaries', () => {
    const input = state();
    const result = plan(input, mutation({
      operation: 'give_items', targetIdentity: 'target', dryRun: true,
      stacks: [{ itemKind: 'apple', quantity: 34 }],
    }));
    expect(result.after.containers.hotbar.slots).toEqual([
      { itemKind: 'apple', quantity: 32 },
      { itemKind: 'apple', quantity: 32 },
    ]);
    expect(result.after.containers.backpack.slots[0]).toEqual({ itemKind: 'apple', quantity: 1 });
    expect(result.audit.inverse).toMatchObject({ operation: 'undo', args: { inventory: expect.any(Object) } });
    expect(input.containers.hotbar.slots[0]).toEqual({ itemKind: 'apple', quantity: 31 });

    const full = state({
      containers: {
        ...state().containers,
        hotbar: container('hotbar', 1, [{ itemKind: 'wood', quantity: 99 }]),
        backpack: container('backpack', 1, [{ itemKind: 'wood', quantity: 99 }]),
      },
    });
    expect(() => plan(full, mutation({
      operation: 'give_items', targetIdentity: 'target', dryRun: true,
      stacks: [{ itemKind: 'apple', quantity: 1 }],
    }))).toThrowError(new AdminInventoryError('admin_capacity_exceeded'));
  });

  it('removes deterministically across every custody area without partial commits', () => {
    const input = state({
      cursor: { itemKind: 'wood', quantity: 2 },
      overflow: [{ itemKind: 'wood', quantity: 3 }],
      containers: {
        ...state().containers,
        hotbar: container('hotbar', 2, [{ itemKind: 'wood', quantity: 2 }, null]),
      },
    });
    const result = plan(input, mutation({
      operation: 'remove_items', targetIdentity: 'target', dryRun: true,
      stacks: [{ itemKind: 'wood', quantity: 6 }],
    }));
    expect(result.after.containers.hotbar.slots[0]).toBeNull();
    expect(result.after.cursor).toBeNull();
    expect(result.after.overflow).toEqual([{ itemKind: 'wood', quantity: 1 }]);
    expect(() => plan(input, mutation({
      operation: 'remove_items', targetIdentity: 'target', dryRun: true,
      stacks: [{ itemKind: 'wood', quantity: 99 }],
    }))).toThrowError(new AdminInventoryError('admin_stack_invalid'));
  });

  it('enforces stack, equipment, and quest-unique rules', () => {
    const base = state();
    expect(() => plan(base, mutation({
      operation: 'set_slot', targetIdentity: 'target', dryRun: true,
      slot: { area: 'equipment', index: 0 }, stack: { itemKind: 'apple', quantity: 1 },
    }))).toThrowError(new AdminInventoryError('admin_stack_invalid'));
    expect(() => plan(base, mutation({
      operation: 'give_items', targetIdentity: 'target', dryRun: true,
      stacks: [{ itemKind: 'apple', quantity: 0 }],
    }))).toThrowError(new AdminInventoryError('admin_stack_invalid'));

    const ownsUnique = state({
      containers: {
        ...base.containers,
        backpack: container('backpack', 2, [{ itemKind: 'marlow_book', quantity: 1 }, null]),
      },
    });
    expect(() => plan(ownsUnique, mutation({
      operation: 'give_items', targetIdentity: 'target', dryRun: true,
      stacks: [{ itemKind: 'marlow_book', quantity: 1 }],
    }))).toThrowError(new AdminInventoryError('admin_unique_item_conflict'));
    expect(() => plan(ownsUnique, mutation({
      operation: 'remove_items', targetIdentity: 'target', dryRun: true,
      stacks: [{ itemKind: 'marlow_book', quantity: 1 }],
    }))).toThrowError(new AdminInventoryError('admin_unique_item_conflict'));
    expect(() => plan(ownsUnique, mutation({
      operation: 'set_slot', targetIdentity: 'target', dryRun: true,
      slot: { area: 'backpack', index: 0 }, stack: null,
    }))).toThrowError(new AdminInventoryError('admin_unique_item_conflict'));
  });

  it('moves a cleared cursor into overflow custody and drains only what fits', () => {
    const full = state({
      containers: {
        ...state().containers,
        hotbar: container('hotbar', 1, [{ itemKind: 'wood', quantity: 99 }]),
        backpack: container('backpack', 1, [{ itemKind: 'wood', quantity: 99 }]),
      },
      cursor: { itemKind: 'apple', quantity: 4 },
    });
    const cleared = plan(full, mutation({ operation: 'clear_cursor', targetIdentity: 'target', dryRun: true }));
    expect(cleared.after.cursor).toBeNull();
    expect(cleared.after.overflow).toEqual([{ itemKind: 'apple', quantity: 4 }]);

    const room = state({ overflow: [{ itemKind: 'apple', quantity: 5 }, { itemKind: 'wood', quantity: 4 }] });
    const drained = plan(room, mutation({ operation: 'drain_overflow', targetIdentity: 'target', dryRun: true }));
    expect(drained.after.overflow).toEqual([]);
    expect(drained.after.containers.hotbar.slots).toEqual([
      { itemKind: 'apple', quantity: 32 },
      { itemKind: 'apple', quantity: 4 },
    ]);
  });

  it('requires an exact preview fingerprint and unchanged base version at commit', () => {
    const input = state();
    const previewMutation = mutation<AdminInventoryMutation>({
      operation: 'set_slot', targetIdentity: 'target', dryRun: true,
      slot: { area: 'hotbar', index: 1 }, stack: { itemKind: 'wood', quantity: 2 },
    });
    const preview = plan(input, previewMutation);
    const commitMutation = { ...previewMutation, dryRun: false } as AdminInventoryMutation;
    const committed = planAdminInventoryMutation(input, {
      mutation: commitMutation,
      expectedBaseVersion: preview.baseVersion,
      previewFingerprint: preview.previewFingerprint,
      nowMicros: 1_000_001n,
    });
    expect(adminInventoryDocument(committed.after)).toEqual(adminInventoryDocument(preview.after));
    expect(committed.audit.inverse).toEqual({
      operation: 'set_slot', args: { slot: { area: 'hotbar', index: 1 }, stack: null },
    });
    expect(committed.audit.notice).toContain('set slot');
    expect(committed.committedVersion).not.toBe(committed.baseVersion);
    expect(() => planAdminInventoryMutation(input, {
      mutation: commitMutation, expectedBaseVersion: preview.baseVersion,
      previewFingerprint: 'preview:wrong', nowMicros: 1_000_001n,
    })).toThrowError(new AdminInventoryError('admin_preview_required'));
    expect(() => planAdminInventoryMutation(input, {
      mutation: commitMutation, expectedBaseVersion: 'inventory:stale',
      previewFingerprint: preview.previewFingerprint, nowMicros: 1_000_001n,
    })).toThrowError(new AdminInventoryError('admin_preview_stale'));
  });

  it('authorizes owner/admin and cap-limited support while rejecting lesser roles', () => {
    const give = mutation<AdminInventoryMutation>({
      operation: 'give_items', targetIdentity: 'target', dryRun: true,
      stacks: [{ itemKind: 'apple', quantity: 20 }],
    });
    const context = { mutationsInLastHour: 0 };
    expect(() => requireAdminInventoryAuthority('owner', give, DEFAULT_SUPPORT_CAPS, context)).not.toThrow();
    expect(() => requireAdminInventoryAuthority('admin', give, DEFAULT_SUPPORT_CAPS, context)).not.toThrow();
    expect(() => requireAdminInventoryAuthority('support', give, DEFAULT_SUPPORT_CAPS, context)).not.toThrow();
    expect(() => requireAdminInventoryAuthority('friend', give, DEFAULT_SUPPORT_CAPS, context))
      .toThrowError(new AdminInventoryError('admin_role_forbidden'));
    expect(() => requireAdminInventoryAuthority('moderator', give, DEFAULT_SUPPORT_CAPS, context))
      .toThrowError(new AdminInventoryError('admin_role_forbidden'));
    const overCap = { ...give, stacks: [{ itemKind: 'apple', quantity: 21 }] } as AdminInventoryMutation;
    expect(() => requireAdminInventoryAuthority('support', overCap, DEFAULT_SUPPORT_CAPS, context))
      .toThrowError(new AdminInventoryError('admin_support_cap_exceeded'));
    const overCapSlot = mutation<AdminInventoryMutation>({
      operation: 'set_slot', targetIdentity: 'target', dryRun: true,
      slot: { area: 'hotbar', index: 0 }, stack: { itemKind: 'apple', quantity: 21 },
    });
    expect(() => requireAdminInventoryAuthority('support', overCapSlot, DEFAULT_SUPPORT_CAPS, context))
      .toThrowError(new AdminInventoryError('admin_support_cap_exceeded'));
  });

  it('keeps all five reducer operations statically representable', () => {
    const operations: readonly AdminPlayerMutation['operation'][] = [
      'give_items', 'remove_items', 'set_slot', 'clear_cursor', 'drain_overflow',
    ];
    expect(operations).toHaveLength(5);
  });
});

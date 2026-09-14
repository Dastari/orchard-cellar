import {
  adminPreviewHasChanges,
  diffAdminValues,
  insertItemStackPartial,
  isUniqueQuestItemKind,
  itemDefinition,
  slotAcceptsItem,
  type AdminJsonObject,
  type ContainerSnapshot,
  type ItemStack,
} from '@orchard/sim';
import { adminRoleCanMutate, type AdminEffectiveRole } from './auth-policy.js';
import {
  ADMIN_MUTATION_ID_PATTERN,
  parseAdminReason,
  type AdminAuditPayloadV1,
  type AdminErrorCode,
  type AdminMutationPreview,
  type AdminPlayerMutation,
  type AdminSlotRef,
} from './contracts.js';
import {
  requireSupportMutationWithinCaps,
  type SupportCaps,
  type SupportMutationContext,
} from './support-caps.js';

export type AdminInventoryOperation =
  | 'give_items'
  | 'remove_items'
  | 'set_slot'
  | 'clear_cursor'
  | 'drain_overflow';

export type AdminInventoryMutation = AdminPlayerMutation & {
  readonly operation: AdminInventoryOperation;
};

export const ADMIN_INVENTORY_CONTAINER_ORDER = [
  'hotbar', 'backpack', 'equipment', 'crafting',
] as const;
export type AdminInventoryContainerArea = typeof ADMIN_INVENTORY_CONTAINER_ORDER[number];

export interface AdminInventoryState {
  readonly containers: Readonly<Record<AdminInventoryContainerArea, ContainerSnapshot>>;
  readonly cursor: ItemStack | null;
  readonly overflow: readonly ItemStack[];
}

export interface AdminInventoryPlanRequest {
  readonly mutation: AdminInventoryMutation;
  readonly expectedBaseVersion: string;
  readonly previewFingerprint: string | null;
  readonly nowMicros: bigint;
}

export interface AdminInventoryPlan {
  readonly before: AdminInventoryState;
  readonly after: AdminInventoryState;
  readonly baseVersion: string;
  readonly committedVersion: string;
  readonly previewFingerprint: string;
  readonly preview: AdminMutationPreview;
  readonly audit: AdminAuditPayloadV1;
  readonly notice: string;
}

export class AdminInventoryError extends Error {
  constructor(readonly code: AdminErrorCode) {
    super(code);
    this.name = 'AdminInventoryError';
  }
}

function fail(code: AdminErrorCode): never {
  throw new AdminInventoryError(code);
}

function cloneStack(stack: ItemStack | null): ItemStack | null {
  return stack === null ? null : Object.freeze({ ...stack });
}

function cloneContainer(container: ContainerSnapshot): ContainerSnapshot {
  return Object.freeze({
    ...container,
    slots: Object.freeze(Array.from(
      { length: container.capacity },
      (_, index) => cloneStack(container.slots[index] ?? null),
    )),
  });
}

export function cloneAdminInventoryState(state: AdminInventoryState): AdminInventoryState {
  return Object.freeze({
    containers: Object.freeze(Object.fromEntries(ADMIN_INVENTORY_CONTAINER_ORDER.map((area) => (
      [area, cloneContainer(state.containers[area])]
    ))) as Record<AdminInventoryContainerArea, ContainerSnapshot>),
    cursor: cloneStack(state.cursor),
    overflow: Object.freeze(state.overflow.map((stack) => cloneStack(stack)!)),
  });
}

function stackJson(stack: ItemStack | null): AdminJsonObject | null {
  if (stack === null) return null;
  return {
    itemKind: stack.itemKind,
    quantity: stack.quantity,
    ...(stack.durability === undefined ? {} : { durability: stack.durability }),
    ...(stack.lit === undefined ? {} : { lit: stack.lit }),
  };
}

export function adminInventoryDocument(state: AdminInventoryState): AdminJsonObject {
  return {
    slots: ADMIN_INVENTORY_CONTAINER_ORDER.flatMap((area) => (
      state.containers[area].slots.map((stack, index) => ({ area, index, stack: stackJson(stack) }))
    )),
    cursor: stackJson(state.cursor),
    overflow: state.overflow.map(stackJson),
  };
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined)
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}`;
}

/** Portable FNV-1a fingerprint: deterministic in SpacetimeDB's JS runtime and
 * browsers without depending on Node crypto or randomized object key order. */
function fingerprint(value: unknown): string {
  let hash = 0x811c9dc5;
  for (const character of stableJson(value)) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function adminInventoryVersion(state: AdminInventoryState): string {
  return `inventory:${fingerprint(adminInventoryDocument(state))}`;
}

function validStack(stack: ItemStack, enforceSingleStackLimit = true): ItemStack {
  const definition = itemDefinition(stack.itemKind);
  if (definition === null
    || !Number.isSafeInteger(stack.quantity)
    || stack.quantity <= 0
    || (enforceSingleStackLimit && stack.quantity > definition.maxStack)
    || (stack.durability !== undefined
      && (!Number.isSafeInteger(stack.durability) || stack.durability < 0 || stack.durability > 65_535))) {
    fail('admin_stack_invalid');
  }
  if (isUniqueQuestItemKind(stack.itemKind) && stack.quantity !== 1) fail('admin_unique_item_conflict');
  return Object.freeze({ ...stack });
}

function allStacks(state: AdminInventoryState): readonly ItemStack[] {
  return [
    ...ADMIN_INVENTORY_CONTAINER_ORDER.flatMap((area) => state.containers[area].slots.filter((stack): stack is ItemStack => stack !== null)),
    ...(state.cursor === null ? [] : [state.cursor]),
    ...state.overflow,
  ];
}

function uniqueCounts(state: AdminInventoryState): Map<string, number> {
  const counts = new Map<string, number>();
  for (const stack of allStacks(state)) if (isUniqueQuestItemKind(stack.itemKind)) {
    counts.set(stack.itemKind, (counts.get(stack.itemKind) ?? 0) + stack.quantity);
  }
  return counts;
}

function requireUniquePolicy(before: AdminInventoryState, after: AdminInventoryState): void {
  const previous = uniqueCounts(before);
  const next = uniqueCounts(after);
  for (const itemKind of new Set([...previous.keys(), ...next.keys()])) {
    const count = next.get(itemKind) ?? 0;
    if (count > 1 && count > (previous.get(itemKind) ?? 0)) fail('admin_unique_item_conflict');
    if (count < (previous.get(itemKind) ?? 0)) fail('admin_unique_item_conflict');
  }
}

function withContainer(
  state: AdminInventoryState,
  area: AdminInventoryContainerArea,
  container: ContainerSnapshot,
): AdminInventoryState {
  return { ...state, containers: { ...state.containers, [area]: container } };
}

function give(state: AdminInventoryState, mutation: AdminInventoryMutation & { readonly operation: 'give_items' }): AdminInventoryState {
  let next = state;
  for (const requested of mutation.stacks) {
    const stack = validStack(requested, false);
    let remaining = stack.quantity;
    for (const area of ['hotbar', 'backpack'] as const) {
      if (remaining === 0) break;
      const inserted = insertItemStackPartial(next.containers[area], { ...stack, quantity: remaining });
      if (!inserted.ok) continue;
      next = withContainer(next, area, inserted.container);
      remaining = inserted.remainderQuantity;
    }
    if (remaining !== 0) fail('admin_capacity_exceeded');
  }
  requireUniquePolicy(state, next);
  return next;
}

function metadataMatches(candidate: ItemStack, requested: ItemStack): boolean {
  return candidate.itemKind === requested.itemKind
    && (requested.durability === undefined || candidate.durability === requested.durability);
}

function removeFromSlots(
  slots: readonly (ItemStack | null)[],
  requested: ItemStack,
  quantity: number,
): { readonly slots: readonly (ItemStack | null)[]; readonly remaining: number } {
  const next = [...slots];
  let remaining = quantity;
  for (let index = 0; index < next.length && remaining > 0; index += 1) {
    const stack = next[index]!;
    if (stack === null || !metadataMatches(stack, requested)) continue;
    const removed = Math.min(remaining, stack.quantity);
    next[index] = removed === stack.quantity ? null : { ...stack, quantity: stack.quantity - removed };
    remaining -= removed;
  }
  return { slots: next, remaining };
}

function remove(state: AdminInventoryState, mutation: AdminInventoryMutation & { readonly operation: 'remove_items' }): AdminInventoryState {
  let next = state;
  for (const raw of mutation.stacks) {
    const requested = validStack(raw, false);
    if (isUniqueQuestItemKind(requested.itemKind)) fail('admin_unique_item_conflict');
    let remaining = requested.quantity;
    for (const area of ADMIN_INVENTORY_CONTAINER_ORDER) {
      const result = removeFromSlots(next.containers[area].slots, requested, remaining);
      next = withContainer(next, area, { ...next.containers[area], slots: result.slots });
      remaining = result.remaining;
    }
    if (remaining > 0 && next.cursor !== null && metadataMatches(next.cursor, requested)) {
      const removed = Math.min(remaining, next.cursor.quantity);
      next = { ...next, cursor: removed === next.cursor.quantity ? null : { ...next.cursor, quantity: next.cursor.quantity - removed } };
      remaining -= removed;
    }
    if (remaining > 0) {
      const result = removeFromSlots(next.overflow, requested, remaining);
      next = { ...next, overflow: result.slots.filter((stack): stack is ItemStack => stack !== null) };
      remaining = result.remaining;
    }
    if (remaining !== 0) fail('admin_stack_invalid');
  }
  return next;
}

function slotStack(state: AdminInventoryState, slot: AdminSlotRef): ItemStack | null {
  if (slot.area === 'cursor') return slot.index === 0 ? state.cursor : fail('admin_stack_invalid');
  if (slot.area === 'overflow') return state.overflow[slot.index] ?? null;
  return state.containers[slot.area].slots[slot.index] ?? null;
}

function setSlot(state: AdminInventoryState, slot: AdminSlotRef, requested: ItemStack | null): AdminInventoryState {
  const stack = requested === null ? null : validStack(requested);
  let next: AdminInventoryState;
  if (slot.area === 'cursor') {
    if (slot.index !== 0) fail('admin_stack_invalid');
    next = { ...state, cursor: stack };
  } else if (slot.area === 'overflow') {
    if (!Number.isSafeInteger(slot.index) || slot.index < 0 || slot.index > state.overflow.length) fail('admin_stack_invalid');
    const overflow = [...state.overflow];
    if (stack === null) {
      if (slot.index >= overflow.length) fail('admin_stack_invalid');
      overflow.splice(slot.index, 1);
    } else if (slot.index === overflow.length) overflow.push(stack);
    else overflow[slot.index] = stack;
    next = { ...state, overflow };
  } else {
    const container = state.containers[slot.area];
    if (!Number.isSafeInteger(slot.index) || slot.index < 0 || slot.index >= container.capacity
      || (stack !== null && !slotAcceptsItem(container, slot.index, stack.itemKind))) fail('admin_stack_invalid');
    const slots = [...container.slots];
    slots[slot.index] = stack;
    next = withContainer(state, slot.area, { ...container, slots });
  }
  requireUniquePolicy(state, next);
  return next;
}

function insertIntoCarried(state: AdminInventoryState, stack: ItemStack): { readonly state: AdminInventoryState; readonly remainder: number } {
  let next = state;
  let remaining = stack.quantity;
  for (const area of ['hotbar', 'backpack'] as const) {
    if (remaining === 0) break;
    const inserted = insertItemStackPartial(next.containers[area], { ...stack, quantity: remaining });
    if (!inserted.ok) continue;
    next = withContainer(next, area, inserted.container);
    remaining = inserted.remainderQuantity;
  }
  return { state: next, remainder: remaining };
}

function clearCursor(state: AdminInventoryState): AdminInventoryState {
  if (state.cursor === null) return state;
  const inserted = insertIntoCarried(state, state.cursor);
  if (inserted.remainder === 0) return { ...inserted.state, cursor: null };
  return {
    ...inserted.state,
    cursor: null,
    overflow: [...inserted.state.overflow, { ...state.cursor, quantity: inserted.remainder }],
  };
}

function drainOverflow(state: AdminInventoryState): AdminInventoryState {
  let next: AdminInventoryState = { ...state, overflow: [] };
  const remainder: ItemStack[] = [];
  for (const stack of state.overflow) {
    const inserted = insertIntoCarried(next, stack);
    next = inserted.state;
    if (inserted.remainder > 0) remainder.push({ ...stack, quantity: inserted.remainder });
  }
  return { ...next, overflow: remainder };
}

function applyMutation(state: AdminInventoryState, mutation: AdminInventoryMutation): AdminInventoryState {
  switch (mutation.operation) {
    case 'give_items': return give(state, mutation as AdminInventoryMutation & { readonly operation: 'give_items' });
    case 'remove_items': return remove(state, mutation as AdminInventoryMutation & { readonly operation: 'remove_items' });
    case 'set_slot': return setSlot(state, mutation.slot, mutation.stack);
    case 'clear_cursor': return clearCursor(state);
    case 'drain_overflow': return drainOverflow(state);
  }
}

function mutationFingerprint(
  mutation: AdminInventoryMutation,
  baseVersion: string,
  after: AdminInventoryState,
): string {
  return `preview:${fingerprint({
    mutation: { ...mutation, dryRun: false, reason: String(mutation.reason).trim() },
    baseVersion,
    after: adminInventoryDocument(after),
  })}`;
}

export function requireAdminInventoryAuthority(
  role: AdminEffectiveRole,
  mutation: AdminInventoryMutation,
  caps: SupportCaps,
  context: SupportMutationContext,
): void {
  if (!adminRoleCanMutate(role, mutation.operation)) fail('admin_role_forbidden');
  if (role === 'support') {
    if (mutation.operation === 'set_slot'
      && (mutation.stack?.quantity ?? 0) > caps.itemsPerMutation) fail('admin_support_cap_exceeded');
    try { requireSupportMutationWithinCaps(mutation, caps, context); }
    catch (error) {
      if (error instanceof Error && (error.message === 'admin_support_cap_exceeded' || error.message === 'admin_rate_limited')) {
        fail(error.message);
      }
      throw error;
    }
  }
}

export function planAdminInventoryMutation(
  inputState: AdminInventoryState,
  request: AdminInventoryPlanRequest,
): AdminInventoryPlan {
  const reason = parseAdminReason(String(request.mutation.reason));
  if (!reason.ok) fail(reason.error);
  if (!ADMIN_MUTATION_ID_PATTERN.test(request.mutation.clientMutationId)) fail('admin_invalid_mutation_id');
  if (request.nowMicros < 0n) fail('admin_payload_invalid');
  const before = cloneAdminInventoryState(inputState);
  const baseVersion = adminInventoryVersion(before);
  if (request.expectedBaseVersion !== baseVersion) fail('admin_preview_stale');
  const after = cloneAdminInventoryState(applyMutation(before, request.mutation));
  const diff = diffAdminValues(adminInventoryDocument(before), adminInventoryDocument(after));
  if (!adminPreviewHasChanges(diff)) fail('admin_no_changes');
  const previewFingerprint = mutationFingerprint(request.mutation, baseVersion, after);
  if (!request.mutation.dryRun && request.previewFingerprint !== previewFingerprint) fail('admin_preview_required');
  const notice = `An administrator applied ${request.mutation.operation.replaceAll('_', ' ')}.`;
  const expiresAtMicros = request.nowMicros + 60_000_000n;
  const preview: AdminMutationPreview = Object.freeze({
    operation: request.mutation.operation,
    target: { kind: 'player' as const, identity: request.mutation.targetIdentity },
    baseVersion,
    preview: diff,
    warnings: Object.freeze(['The affected online player will receive a notice.']),
    expiresAtMicros: expiresAtMicros.toString(),
  });
  const previousSlot = request.mutation.operation === 'set_slot'
    ? slotStack(before, request.mutation.slot)
    : null;
  const audit: AdminAuditPayloadV1 = Object.freeze({
    schemaVersion: 1,
    clientMutationId: request.mutation.clientMutationId,
    target: { kind: 'player' as const, identity: request.mutation.targetIdentity },
    reason: reason.value,
    changes: diff.changes,
    inverse: request.mutation.operation === 'set_slot'
      ? {
          operation: 'set_slot' as const,
          args: {
            slot: { area: request.mutation.slot.area, index: request.mutation.slot.index },
            stack: stackJson(previousSlot),
          },
        }
      : { operation: 'undo' as const, args: { inventory: adminInventoryDocument(before) } },
    notice,
  });
  return Object.freeze({
    before,
    after,
    baseVersion,
    committedVersion: adminInventoryVersion(after),
    previewFingerprint,
    preview,
    audit,
    notice,
  });
}

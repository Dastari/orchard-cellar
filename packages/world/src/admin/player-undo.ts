import type { AdminJsonObject, ContainerSnapshot, ItemStack, SkillTrack } from '@orchard/sim';
import { isSkillTrack } from '@orchard/sim';
import type {
  AdminAuditPayloadV1,
  AdminInventoryArea,
  AdminPlayerMutation,
} from './contracts.js';
import type { AdminInventoryState } from './inventory.js';
import type { AdminProgressionState, AdminQuestStateValue } from './progression.js';
import { adminRoleCanMutate, type AdminEffectiveRole } from './auth-policy.js';

export type AdminPlayerUndoAction =
  | { readonly kind: 'inventory_restore'; readonly state: AdminInventoryState }
  | { readonly kind: 'progression_restore'; readonly state: AdminProgressionState }
  | { readonly kind: 'position_mutation'; readonly operation: 'set_spawn' | 'teleport_player' | 'set_display_name'; readonly args: AdminJsonObject };

export class AdminPlayerUndoError extends Error {
  constructor(readonly code:
    | 'admin_payload_invalid'
    | 'admin_no_changes'
    | 'admin_role_forbidden'
    | 'admin_entity_not_found'
    | 'admin_invalid_mutation_id'
    | 'admin_rate_limited'
    | 'admin_world_revision_conflict') {
    super(code);
    this.name = 'AdminPlayerUndoError';
  }
}

export interface AdminPlayerUndoGuardInput {
  readonly role: AdminEffectiveRole | null;
  readonly actorIdentity: string;
  readonly targetIdentity: string;
  readonly sourceAuditId: string;
  readonly source: null | {
    readonly actorIdentity: string;
    readonly operation: string;
    readonly targetIdentity: string | null;
    readonly hasInverse: boolean;
  };
  readonly existingCommit: null | {
    readonly operation: string;
    readonly sourceAuditId: string | null;
    readonly targetIdentity: string;
  };
  readonly alreadyUndone: boolean;
  readonly supportMutationsInLastHour: number;
  readonly supportMutationLimit: number;
}

export function planAdminPlayerUndoGuard(input: AdminPlayerUndoGuardInput): 'apply' | 'retry' {
  if (input.role === null || !adminRoleCanMutate(input.role, 'undo')) fail('admin_role_forbidden');
  if (input.existingCommit !== null) {
    if (input.existingCommit.operation === 'undo'
      && input.existingCommit.sourceAuditId === input.sourceAuditId
      && input.existingCommit.targetIdentity === input.targetIdentity) return 'retry';
    fail('admin_invalid_mutation_id');
  }
  if (input.alreadyUndone) fail('admin_no_changes');
  if (input.source === null || !isAdminPlayerUndoOperation(input.source.operation)) {
    fail('admin_entity_not_found');
  }
  if (input.source.targetIdentity !== input.targetIdentity || !input.source.hasInverse) {
    fail('admin_no_changes');
  }
  if (input.role === 'support') {
    if (input.source.actorIdentity !== input.actorIdentity
      || !adminRoleCanMutate('support', input.source.operation)) fail('admin_role_forbidden');
    if (!Number.isSafeInteger(input.supportMutationsInLastHour)
      || input.supportMutationsInLastHour < 0
      || input.supportMutationsInLastHour >= input.supportMutationLimit) fail('admin_rate_limited');
  }
  return 'apply';
}

export function assertAdminPlayerUndoVersion(
  currentVersion: string,
  expectedBaseVersion: string,
  restoredVersion: string,
): string {
  if (currentVersion !== expectedBaseVersion) fail('admin_world_revision_conflict');
  if (restoredVersion === currentVersion) fail('admin_no_changes');
  return restoredVersion;
}

function fail(code: AdminPlayerUndoError['code']): never {
  throw new AdminPlayerUndoError(code);
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('admin_payload_invalid');
  return value as Record<string, unknown>;
}

function integer(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail('admin_payload_invalid');
  }
  return value;
}

function unsigned(value: unknown): bigint {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)$/u.test(value)) fail('admin_payload_invalid');
  const result = BigInt(value);
  if (result > (1n << 64n) - 1n) fail('admin_payload_invalid');
  return result;
}

function optionalUnsigned(value: unknown): bigint | null {
  return value === null ? null : unsigned(value);
}

function stack(value: unknown): ItemStack | null {
  if (value === null) return null;
  const source = record(value);
  if (typeof source['itemKind'] !== 'string' || source['itemKind'].length === 0) fail('admin_payload_invalid');
  const durability = source['durability'];
  const lit = source['lit'];
  const parsedDurability = durability === undefined ? undefined : integer(durability, 0, 65_535);
  if (lit !== undefined && typeof lit !== 'boolean') fail('admin_payload_invalid');
  return Object.freeze({
    itemKind: source['itemKind'],
    quantity: integer(source['quantity'], 1, 65_535),
    ...(parsedDurability === undefined ? {} : { durability: parsedDurability }),
    ...(lit === undefined ? {} : { lit: lit as boolean }),
  });
}

const INVENTORY_AREAS = ['hotbar', 'backpack', 'equipment', 'crafting'] as const;
const ALL_INVENTORY_AREAS: ReadonlySet<AdminInventoryArea> = new Set([
  ...INVENTORY_AREAS, 'cursor', 'overflow',
]);

export function parseAdminInventoryUndoState(
  value: unknown,
  current: AdminInventoryState,
): AdminInventoryState {
  const source = record(value);
  if (!Array.isArray(source['slots']) || !Array.isArray(source['overflow'])) fail('admin_payload_invalid');
  const grouped = new Map<typeof INVENTORY_AREAS[number], Map<number, ItemStack | null>>(
    INVENTORY_AREAS.map((area) => [area, new Map()]),
  );
  for (const value of source['slots']) {
    const row = record(value);
    if (typeof row['area'] !== 'string' || !ALL_INVENTORY_AREAS.has(row['area'] as AdminInventoryArea)
      || row['area'] === 'cursor' || row['area'] === 'overflow') fail('admin_payload_invalid');
    const area = row['area'] as typeof INVENTORY_AREAS[number];
    const index = integer(row['index'], 0, 255);
    if (grouped.get(area)!.has(index)) fail('admin_payload_invalid');
    grouped.get(area)!.set(index, stack(row['stack']));
  }
  const containers = Object.fromEntries(INVENTORY_AREAS.map((area) => {
    const rows = grouped.get(area)!;
    const capacity = rows.size;
    if (capacity < 1 || [...rows.keys()].some((index) => index >= capacity)) fail('admin_payload_invalid');
    const template = current.containers[area];
    return [area, Object.freeze({
      ...template,
      capacity,
      slots: Object.freeze(Array.from({ length: capacity }, (_, index) => rows.get(index) ?? null)),
    } satisfies ContainerSnapshot)];
  })) as Record<typeof INVENTORY_AREAS[number], ContainerSnapshot>;
  return Object.freeze({
    containers: Object.freeze(containers),
    cursor: stack(source['cursor']),
    overflow: Object.freeze(source['overflow'].map(stack).map((item) => item ?? fail('admin_payload_invalid'))),
  });
}

function parseAdminSlotUndoState(value: unknown, current: AdminInventoryState): AdminInventoryState {
  const source = record(value);
  const slotSource = record(source['slot']);
  if (typeof slotSource['area'] !== 'string'
    || !ALL_INVENTORY_AREAS.has(slotSource['area'] as AdminInventoryArea)) fail('admin_payload_invalid');
  const area = slotSource['area'] as AdminInventoryArea;
  const index = integer(slotSource['index'], 0, 255);
  const restored = stack(source['stack']);
  if (area === 'cursor') {
    if (index !== 0) fail('admin_payload_invalid');
    return Object.freeze({ ...current, cursor: restored });
  }
  if (area === 'overflow') {
    if (index > current.overflow.length || (restored === null && index === current.overflow.length)) {
      fail('admin_payload_invalid');
    }
    const overflow = [...current.overflow];
    if (restored === null) overflow.splice(index, 1);
    else if (index === overflow.length) overflow.push(restored);
    else overflow[index] = restored;
    return Object.freeze({ ...current, overflow: Object.freeze(overflow) });
  }
  const container = current.containers[area];
  if (index >= container.capacity) fail('admin_payload_invalid');
  const slots = [...container.slots];
  slots[index] = restored;
  return Object.freeze({
    ...current,
    containers: Object.freeze({ ...current.containers,
      [area]: Object.freeze({ ...container, slots: Object.freeze(slots) }) }),
  });
}

function skillTrack(value: unknown): SkillTrack {
  if (typeof value !== 'string' || !isSkillTrack(value)) fail('admin_payload_invalid');
  return value;
}

function string(value: unknown): string {
  if (typeof value !== 'string') fail('admin_payload_invalid');
  return value;
}

function rows(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) fail('admin_payload_invalid');
  return value;
}

export function parseAdminProgressionUndoState(value: unknown): AdminProgressionState {
  const source = record(value);
  const stats = record(source['stats']);
  const vitals = record(source['vitals']);
  const attributes = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
  const vitalKeys = ['healthCenti', 'manaCenti', 'vigourCenti', 'hungerCenti'] as const;
  const result = Object.freeze({
    walletBronze: unsigned(source['walletBronze']),
    stats: Object.freeze(Object.fromEntries(attributes.map((key) => [key, integer(stats[key], 0, 255)])) as unknown as AdminProgressionState['stats']),
    vitals: Object.freeze(Object.fromEntries(vitalKeys.map((key) => [key, integer(vitals[key], 0, 4_294_967_295)])) as unknown as AdminProgressionState['vitals']),
    skillTracks: Object.freeze(rows(source['skillTracks']).map((value) => {
      const row = record(value);
      return Object.freeze({ track: skillTrack(row['track']), experience: unsigned(row['experience']),
        spentPoints: integer(row['spentPoints'], 0, 65_535), bonusPoints: integer(row['bonusPoints'], 0, 65_535),
        respecCount: integer(row['respecCount'], 0, 65_535) });
    })),
    skillNodes: Object.freeze(rows(source['skillNodes']).map((value) => {
      const row = record(value);
      return Object.freeze({ track: skillTrack(row['track']), nodeId: string(row['nodeId']), rank: integer(row['rank'], 0, 255) });
    })),
    quests: Object.freeze(rows(source['quests']).map((value) => {
      const row = record(value);
      const state = row['state'];
      if (state !== 'active' && state !== 'complete' && state !== 'turned_in') fail('admin_payload_invalid');
      if (typeof row['pinned'] !== 'boolean') fail('admin_payload_invalid');
      return Object.freeze({ questId: string(row['questId']), state: state as AdminQuestStateValue,
        acceptedTick: unsigned(row['acceptedTick']), completedTick: optionalUnsigned(row['completedTick']),
        turnedInTick: optionalUnsigned(row['turnedInTick']), pinned: row['pinned'] });
    })),
    questBaselines: Object.freeze(rows(source['questBaselines']).map((value) => {
      const row = record(value);
      return Object.freeze({ questId: string(row['questId']), objectiveId: string(row['objectiveId']), value: unsigned(row['value']) });
    })),
    questWorldItems: Object.freeze(rows(source['questWorldItems']).map((value) => {
      const row = record(value);
      return Object.freeze({ questId: string(row['questId']), objectiveId: string(row['objectiveId']),
        surfaceId: unsigned(row['surfaceId']), slot: integer(row['slot'], 0, 65_535), itemKind: string(row['itemKind']) });
    })),
  });
  const unique = <T>(values: readonly T[], key: (value: T) => string): void => {
    const keys = new Set<string>();
    for (const value of values) {
      const id = key(value);
      if (keys.has(id)) fail('admin_payload_invalid');
      keys.add(id);
    }
  };
  unique(result.skillTracks, ({ track }) => track);
  unique(result.skillNodes, ({ nodeId }) => nodeId);
  unique(result.quests, ({ questId }) => questId);
  unique(result.questBaselines, ({ questId, objectiveId }) => `${questId}:${objectiveId}`);
  unique(result.questWorldItems, ({ questId, objectiveId }) => `${questId}:${objectiveId}`);
  return result;
}

const INVENTORY_OPERATIONS = new Set<AdminPlayerMutation['operation']>([
  'give_items', 'remove_items', 'set_slot', 'clear_cursor', 'drain_overflow',
]);
const PROGRESSION_OPERATIONS = new Set<AdminPlayerMutation['operation']>([
  'set_wallet', 'set_stats', 'set_vitals', 'grant_skill_points', 'reset_skill_tree',
  'set_quest_state', 'reset_quests',
]);
const POSITION_OPERATIONS = new Set<AdminPlayerMutation['operation']>([
  'set_spawn', 'respawn', 'unstick', 'teleport_player', 'set_display_name', 'kick', 'notify',
]);

export function isAdminPlayerUndoOperation(value: string): value is AdminPlayerMutation['operation'] {
  return INVENTORY_OPERATIONS.has(value as AdminPlayerMutation['operation'])
    || PROGRESSION_OPERATIONS.has(value as AdminPlayerMutation['operation'])
    || POSITION_OPERATIONS.has(value as AdminPlayerMutation['operation']);
}

export function adminPlayerUndoAction(
  originalOperation: AdminPlayerMutation['operation'],
  audit: AdminAuditPayloadV1,
  currentInventory: AdminInventoryState,
): AdminPlayerUndoAction {
  if (audit.target.kind !== 'player' || audit.inverse === null) fail('admin_no_changes');
  const operation = audit.inverse.operation;
  const args = audit.inverse.args;
  if (INVENTORY_OPERATIONS.has(originalOperation)) {
    if (operation === 'set_slot') {
      return { kind: 'inventory_restore', state: parseAdminSlotUndoState(args, currentInventory) };
    }
    if (operation === 'undo' && 'inventory' in args) {
      return { kind: 'inventory_restore', state: parseAdminInventoryUndoState(args['inventory'], currentInventory) };
    }
  }
  if (PROGRESSION_OPERATIONS.has(originalOperation)) {
    if (operation === 'undo' && 'progression' in args) {
      return { kind: 'progression_restore', state: parseAdminProgressionUndoState(args['progression']) };
    }
  }
  if (POSITION_OPERATIONS.has(originalOperation)
    && (operation === 'set_spawn' || operation === 'teleport_player' || operation === 'set_display_name')) {
    return { kind: 'position_mutation', operation, args };
  }
  fail('admin_payload_invalid');
}

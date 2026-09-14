import type {
  AdminChangePreview,
  AdminFieldChange,
  AdminJsonObject,
  AdminJsonValue,
} from '@orchard/sim';

export const ADMIN_REASON_MIN_LENGTH = 8;
export const ADMIN_REASON_MAX_LENGTH = 500;

declare const adminReasonBrand: unique symbol;
export type AdminReason = string & { readonly [adminReasonBrand]: true };

export const ADMIN_ERROR_CODES = [
  'admin_auth_required',
  'admin_role_forbidden',
  'admin_target_not_found',
  'admin_entity_not_found',
  'admin_invalid_reason',
  'admin_invalid_mutation_id',
  'admin_invalid_cursor',
  'admin_invalid_patch',
  'admin_preview_required',
  'admin_preview_stale',
  'admin_no_changes',
  'admin_capacity_exceeded',
  'admin_stack_invalid',
  'admin_unique_item_conflict',
  'admin_support_cap_exceeded',
  'admin_rate_limited',
  'admin_last_owner_protected',
  'admin_position_blocked',
  'admin_world_revision_conflict',
  'admin_payload_invalid',
] as const;

export type AdminErrorCode = typeof ADMIN_ERROR_CODES[number];
export type AdminContractResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: AdminErrorCode };

export function parseAdminReason(input: string): AdminContractResult<AdminReason> {
  const value = input.trim();
  if (value.length < ADMIN_REASON_MIN_LENGTH || value.length > ADMIN_REASON_MAX_LENGTH) {
    return { ok: false, error: 'admin_invalid_reason' };
  }
  return { ok: true, value: value as AdminReason };
}

export const ADMIN_MUTATION_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,95}$/u;

export type AdminMembershipRole =
  | 'owner'
  | 'admin'
  | 'moderator'
  | 'friend';

/** Content editor and support permissions are revocable grants, not memberships. */
export type AdminCapabilityGrant = 'content_editor' | 'support';

export type AdminTarget =
  | { readonly kind: 'player'; readonly identity: string }
  | { readonly kind: 'entity'; readonly entityId: string }
  | { readonly kind: 'space'; readonly spaceId: string }
  | { readonly kind: 'world' };

export type AdminOperation =
  | 'legacy'
  | 'set_wallet'
  | 'set_stats'
  | 'set_vitals'
  | 'grant_skill_points'
  | 'reset_skill_tree'
  | 'set_quest_state'
  | 'reset_quests'
  | 'give_items'
  | 'remove_items'
  | 'clear_cursor'
  | 'drain_overflow'
  | 'set_slot'
  | 'set_spawn'
  | 'respawn'
  | 'unstick'
  | 'teleport_player'
  | 'set_display_name'
  | 'kick'
  | 'notify'
  | 'grant_content_editor'
  | 'revoke_content_editor'
  | 'grant_support'
  | 'revoke_support'
  | 'spawn_entity'
  | 'despawn_entity'
  | 'move_entity'
  | 'set_entity_state'
  | 'set_container_slot'
  | 'repair_entity'
  | 'replace_entity'
  | 'restore_missing_container'
  | 'relocate_npc'
  | 'respawn_resources'
  | 'set_space_flags'
  | 'repair_portal_pair'
  | 'run_world_repair'
  | 'set_time'
  | 'set_weather'
  | 'set_wind'
  | 'set_motd'
  | 'global_notice'
  | 'restore_map'
  | 'move_homestead'
  | 'playtest_spawn'
  | 'playtest_apply_effect'
  | 'playtest_grant_upgrade'
  | 'undo';

export interface AdminMutationEnvelope {
  readonly clientMutationId: string;
  readonly dryRun: boolean;
  readonly reason: AdminReason;
}

export interface AdminItemStack {
  readonly itemKind: string;
  readonly quantity: number;
  readonly durability?: number;
}

export type AdminInventoryArea =
  | 'hotbar'
  | 'backpack'
  | 'equipment'
  | 'crafting'
  | 'cursor'
  | 'overflow';

export interface AdminSlotRef {
  readonly area: AdminInventoryArea;
  readonly index: number;
}

export type AdminPlayerMutation = AdminMutationEnvelope & (
  | { readonly operation: 'set_wallet'; readonly targetIdentity: string; readonly deltaBronze: string }
  | { readonly operation: 'set_stats'; readonly targetIdentity: string; readonly patch: AdminJsonObject }
  | { readonly operation: 'set_vitals'; readonly targetIdentity: string; readonly patch: AdminJsonObject }
  | { readonly operation: 'grant_skill_points'; readonly targetIdentity: string; readonly track: string; readonly points: number }
  | { readonly operation: 'reset_skill_tree'; readonly targetIdentity: string; readonly track?: string }
  | { readonly operation: 'set_quest_state'; readonly targetIdentity: string; readonly questId: string; readonly state: string }
  | { readonly operation: 'reset_quests'; readonly targetIdentity: string }
  | { readonly operation: 'give_items' | 'remove_items'; readonly targetIdentity: string; readonly stacks: readonly AdminItemStack[] }
  | { readonly operation: 'clear_cursor' | 'drain_overflow' | 'respawn' | 'unstick'; readonly targetIdentity: string }
  | { readonly operation: 'set_slot'; readonly targetIdentity: string; readonly slot: AdminSlotRef; readonly stack: AdminItemStack | null }
  | { readonly operation: 'set_spawn' | 'teleport_player'; readonly targetIdentity: string; readonly spaceId: string; readonly tileX: number; readonly tileY: number }
  | { readonly operation: 'set_display_name'; readonly targetIdentity: string; readonly displayName: string }
  | { readonly operation: 'kick'; readonly targetIdentity: string; readonly notice: string }
  | { readonly operation: 'notify'; readonly targetIdentity: string | 'all'; readonly body: string }
);

export type AdminEntityMutation = AdminMutationEnvelope & (
  | { readonly operation: 'spawn_entity'; readonly definitionId: string; readonly spaceId: string; readonly tileX: number; readonly tileY: number; readonly state?: AdminJsonObject; readonly ownerIdentity?: string }
  | { readonly operation: 'despawn_entity'; readonly entityId: string; readonly spillContents: boolean; readonly destructionReason?: AdminReason }
  | { readonly operation: 'move_entity'; readonly entityId: string; readonly spaceId: string; readonly tileX: number; readonly tileY: number }
  | { readonly operation: 'set_entity_state'; readonly entityId: string; readonly patch: AdminJsonObject }
  | { readonly operation: 'set_container_slot'; readonly entityId: string; readonly slot: number; readonly stack: AdminItemStack | null }
  | { readonly operation: 'repair_entity'; readonly entityId: string }
  | { readonly operation: 'replace_entity'; readonly entityId: string; readonly definitionId: string }
  | { readonly operation: 'relocate_npc'; readonly npcId: string; readonly spaceId: string; readonly tileX: number; readonly tileY: number }
  | { readonly operation: 'respawn_resources'; readonly spaceId: string; readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number }
);

export type AdminWorldMutation = AdminMutationEnvelope & (
  | { readonly operation: 'set_space_flags'; readonly spaceId: string; readonly patch: AdminJsonObject }
  | { readonly operation: 'repair_portal_pair'; readonly portalId: string }
  | { readonly operation: 'run_world_repair'; readonly reportId: string }
  | { readonly operation: 'set_time'; readonly calendarTick: string }
  | { readonly operation: 'set_weather'; readonly weatherMode: string }
  | { readonly operation: 'set_wind'; readonly direction: string }
  | { readonly operation: 'set_motd' | 'global_notice'; readonly body: string }
  | { readonly operation: 'restore_map'; readonly revisionId: string }
  | { readonly operation: 'move_homestead'; readonly spaceId: string; readonly tileX: number; readonly tileY: number }
  | { readonly operation: 'undo'; readonly auditId: string }
);

export type AdminMutation = AdminPlayerMutation | AdminEntityMutation | AdminWorldMutation;

export interface AdminInverseAction {
  readonly operation: AdminOperation;
  readonly args: AdminJsonObject;
}

export interface AdminAuditPayloadV1 {
  readonly schemaVersion: 1;
  readonly clientMutationId: string;
  readonly target: AdminTarget;
  readonly reason: AdminReason;
  readonly changes: readonly AdminFieldChange[];
  readonly inverse: AdminInverseAction | null;
  readonly notice?: string;
}

export interface AdminMutationPreview {
  readonly operation: AdminOperation;
  readonly target: AdminTarget;
  readonly baseVersion: string;
  readonly preview: AdminChangePreview;
  readonly warnings: readonly string[];
  readonly expiresAtMicros: string;
}

export interface AdminPage<T> {
  readonly rows: readonly T[];
  readonly nextCursor: string | null;
}

export interface AdminPlayerSummary {
  readonly identity: string;
  readonly displayName: string;
  readonly role: AdminMembershipRole;
  readonly grants: readonly AdminCapabilityGrant[];
  readonly online: boolean;
  readonly spaceId: string | null;
  readonly tileX: number | null;
  readonly tileY: number | null;
  readonly lastSeenMicros: string;
}

export interface AdminPlayerSnapshot {
  readonly identity: string;
  readonly displayName: string;
  readonly membership: {
    readonly role: AdminMembershipRole;
    readonly grants: readonly AdminCapabilityGrant[];
    readonly blocked: boolean;
    readonly revoked: boolean;
  };
  readonly online: boolean;
  readonly position: AdminJsonObject | null;
  readonly spawn: AdminJsonObject | null;
  readonly walletBronze: string;
  readonly stats: AdminJsonObject;
  readonly vitals: AdminJsonObject;
  readonly effects: readonly AdminJsonObject[];
  readonly skillTracks: readonly AdminJsonObject[];
  readonly skillNodes: readonly AdminJsonObject[];
  readonly quests: readonly AdminJsonObject[];
  readonly statistics: readonly AdminJsonObject[];
  readonly homestead: AdminJsonObject | null;
  readonly dialogue: AdminJsonObject | null;
  readonly mount: AdminJsonObject | null;
  readonly version: string;
}

export interface AdminResolvedStack extends AdminItemStack {
  readonly displayName: string;
  readonly maxStack: number;
  readonly tags: readonly string[];
}

export interface AdminInventorySlot {
  readonly slot: AdminSlotRef;
  readonly stack: AdminResolvedStack | null;
}

export interface AdminPlayerInventory {
  readonly identity: string;
  readonly slots: readonly AdminInventorySlot[];
  readonly version: string;
}

export interface AdminContainerSnapshot {
  readonly entityId: string;
  readonly definitionId: string;
  readonly ownerIdentity: string | null;
  readonly position: AdminJsonObject;
  readonly state: AdminJsonObject;
  readonly processor: AdminJsonObject | null;
  readonly slots: readonly (AdminResolvedStack | null)[];
  readonly version: string;
}

export interface AdminMissingContainerInspection {
  readonly entityId: string;
  readonly targetIdentity: string;
  readonly recoverable: boolean;
  readonly auditId: string | null;
  readonly summary: string;
  readonly version: string;
}

export interface AdminEntitySummary {
  readonly entityId: string;
  readonly kind: 'placeable' | 'chest' | 'npc' | 'item' | 'resource' | 'surface';
  readonly definitionId: string;
  readonly spaceId: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly state: AdminJsonObject;
}

export interface AdminHomesteadSnapshot {
  readonly spaceId: string;
  readonly homestead: AdminJsonObject;
  readonly members: readonly AdminJsonObject[];
  readonly upgrades: readonly AdminJsonObject[];
  readonly portals: readonly AdminJsonObject[];
  readonly occupancy: readonly AdminJsonObject[];
  readonly version: string;
}

export interface AdminAuditRow {
  readonly id: string;
  readonly actorIdentity: string;
  readonly operation: AdminOperation;
  readonly target: AdminTarget;
  readonly occurredAtMicros: string;
  readonly payload: AdminAuditPayloadV1;
}

export interface AdminConnectionRow {
  readonly connectionId: string;
  readonly identity: string;
  readonly connectedAtMicros: string;
  readonly disconnectedAtMicros: string | null;
  readonly remoteAddress: string | null;
  readonly active: boolean;
}

export interface AdminTelemetrySnapshot {
  readonly sampledAtMicros: string;
  readonly tick: AdminJsonObject;
  readonly rowsTouched: AdminJsonObject;
  readonly rowsScanned: AdminJsonObject;
  readonly subscriptions: AdminJsonObject;
}

export interface AdminValidationIssue {
  readonly code: string;
  readonly severity: 'error' | 'warning';
  readonly target: AdminTarget;
  readonly message: string;
  readonly repairable: boolean;
}

export interface AdminWorldValidationReport {
  readonly reportId: string;
  readonly worldVersion: string;
  readonly fingerprint: string;
  readonly issues: readonly AdminValidationIssue[];
  readonly expiresAtMicros: string;
}

export interface AdminProcedureContract {
  readonly adminFindPlayers: {
    readonly args: { readonly query: string; readonly cursor: string | null };
    readonly result: AdminPage<AdminPlayerSummary>;
  };
  readonly adminPlayerSnapshot: {
    readonly args: { readonly identity: string };
    readonly result: AdminPlayerSnapshot;
  };
  readonly adminPlayerInventory: {
    readonly args: { readonly identity: string };
    readonly result: AdminPlayerInventory;
  };
  readonly adminPlayerMutationResult: {
    readonly args: { readonly clientMutationId: string };
    readonly result: { readonly audit: AdminAuditRow; readonly committedVersion: string };
  };
  readonly adminContainerContents: {
    readonly args: { readonly entityId: string };
    readonly result: AdminContainerSnapshot;
  };
  readonly adminMissingContainerRecovery: {
    readonly args: { readonly entityId: string; readonly targetIdentity: string };
    readonly result: AdminMissingContainerInspection;
  };
  readonly adminEntitiesInArea: {
    readonly args: { readonly spaceId: string; readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number };
    readonly result: readonly AdminEntitySummary[];
  };
  readonly adminHomestead: {
    readonly args: { readonly spaceId: string };
    readonly result: AdminHomesteadSnapshot;
  };
  readonly adminAuditPage: {
    readonly args: { readonly filter: AdminJsonObject; readonly cursor: string | null };
    readonly result: AdminPage<AdminAuditRow>;
  };
  readonly adminConnectionsPage: {
    readonly args: { readonly identity: string | null; readonly cursor: string | null };
    readonly result: AdminPage<AdminConnectionRow>;
  };
  readonly adminTelemetry: { readonly args: Record<never, never>; readonly result: AdminTelemetrySnapshot };
  readonly adminValidateWorld: { readonly args: Record<never, never>; readonly result: AdminWorldValidationReport };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isAdminJsonValue(value: unknown): value is AdminJsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isAdminJsonValue);
  return isRecord(value) && Object.values(value).every(isAdminJsonValue);
}

function isSnapshot(value: unknown): boolean {
  if (!isRecord(value) || typeof value.present !== 'boolean') return false;
  return value.present ? 'value' in value && isAdminJsonValue(value.value) : !('value' in value);
}

function isFieldChange(value: unknown): value is AdminFieldChange {
  return isRecord(value)
    && typeof value.path === 'string'
    && isSnapshot(value.before)
    && isSnapshot(value.after);
}

function isTarget(value: unknown): value is AdminTarget {
  if (!isRecord(value) || typeof value.kind !== 'string') return false;
  if (value.kind === 'world') return true;
  if (value.kind === 'player') return typeof value.identity === 'string';
  if (value.kind === 'entity') return typeof value.entityId === 'string';
  return value.kind === 'space' && typeof value.spaceId === 'string';
}

export function isAdminOperation(value: unknown): value is AdminOperation {
  return typeof value === 'string' && ADMIN_OPERATIONS.has(value as AdminOperation);
}

function isInverseAction(value: unknown): value is AdminInverseAction {
  return isRecord(value)
    && isAdminOperation(value.operation)
    && isRecord(value.args)
    && isAdminJsonValue(value.args);
}

const ADMIN_OPERATIONS: ReadonlySet<AdminOperation> = new Set<AdminOperation>([
  'legacy', 'set_wallet', 'set_stats', 'set_vitals', 'grant_skill_points', 'reset_skill_tree',
  'set_quest_state', 'reset_quests', 'give_items', 'remove_items', 'clear_cursor',
  'drain_overflow', 'set_slot', 'set_spawn', 'respawn', 'unstick', 'teleport_player',
  'set_display_name', 'kick', 'notify', 'spawn_entity', 'despawn_entity', 'move_entity',
  'set_entity_state', 'set_container_slot', 'repair_entity', 'replace_entity',
  'restore_missing_container',
  'relocate_npc', 'respawn_resources', 'set_space_flags', 'repair_portal_pair',
  'run_world_repair', 'set_time', 'set_weather', 'set_wind', 'set_motd',
  'global_notice', 'restore_map', 'move_homestead', 'undo',
  'playtest_spawn', 'playtest_apply_effect', 'playtest_grant_upgrade',
]);

export function parseAdminAuditPayload(json: string): AdminContractResult<AdminAuditPayloadV1> {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return { ok: false, error: 'admin_payload_invalid' };
  }
  if (!isRecord(value)
    || value.schemaVersion !== 1
    || typeof value.clientMutationId !== 'string'
    || !ADMIN_MUTATION_ID_PATTERN.test(value.clientMutationId)
    || typeof value.reason !== 'string'
    || !isTarget(value.target)
    || !Array.isArray(value.changes)
    || !value.changes.every(isFieldChange)
    || !(value.inverse === null || isInverseAction(value.inverse))
    || !('notice' in value ? typeof value.notice === 'string' : true)) {
    return { ok: false, error: 'admin_payload_invalid' };
  }
  const reason = parseAdminReason(value.reason);
  if (!reason.ok) return reason;
  return {
    ok: true,
    value: {
      schemaVersion: 1,
      clientMutationId: value.clientMutationId,
      target: value.target,
      reason: reason.value,
      changes: value.changes,
      inverse: value.inverse,
      ...('notice' in value ? { notice: value.notice as string } : {}),
    },
  };
}

export function serializeAdminAuditPayload(payload: AdminAuditPayloadV1): string {
  return JSON.stringify(payload);
}

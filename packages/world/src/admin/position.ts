import {
  adminPreviewHasChanges,
  diffAdminValues,
  normalizeCharacterName,
  type AdminJsonObject,
} from '@orchard/sim';
import { adminRoleCanMutate, type AdminEffectiveRole } from './auth-policy.js';
import {
  ADMIN_MUTATION_ID_PATTERN,
  parseAdminReason,
  type AdminAuditPayloadV1,
  type AdminErrorCode,
  type AdminMutationPreview,
  type AdminPlayerMutation,
} from './contracts.js';
import {
  requireSupportMutationWithinCaps,
  type SupportCaps,
  type SupportMutationContext,
} from './support-caps.js';

export type AdminPositionOperation =
  | 'set_spawn'
  | 'respawn'
  | 'unstick'
  | 'teleport_player'
  | 'set_display_name'
  | 'kick'
  | 'notify';

export type AdminPositionMutation = AdminPlayerMutation & { readonly operation: AdminPositionOperation };

export interface AdminPositionPoint {
  readonly spaceId: string;
  readonly tileX: number;
  readonly tileY: number;
  /** Exact fixed-point coordinates are retained for inverse/audit fidelity. */
  readonly x: number;
  readonly y: number;
}

export interface AdminPositionState {
  readonly identity: string;
  readonly displayName: string;
  readonly nameChosen: boolean;
  readonly position: AdminPositionPoint | null;
  readonly spawn: AdminPositionPoint | null;
  readonly moving: boolean;
  readonly actionKind: string;
  readonly mountedEntityId: string | null;
  readonly carriedEntityIds: readonly string[];
  readonly connectionIds: readonly string[];
}

export interface AdminPositionEffect {
  readonly settleMovement: boolean;
  readonly clearInteractions: boolean;
  readonly clearMount: boolean;
  readonly clearCarry: boolean;
  readonly kickConnectionIds: readonly string[];
  readonly notices: readonly {
    readonly identity: string;
    readonly connectionId: string;
    readonly body: string;
  }[];
}

export interface AdminPositionPlanRequest {
  readonly mutation: AdminPositionMutation;
  readonly expectedBaseVersion: string;
  readonly previewFingerprint: string | null;
  readonly nowMicros: bigint;
  readonly pointAtTile: (spaceId: string, tileX: number, tileY: number) => AdminPositionPoint;
  readonly tileIsWalkable: (point: AdminPositionPoint) => boolean;
  readonly displayNameIsAvailable?: (normalizedName: string) => boolean;
  /** Required for notify-all; resolved from indexed live presences before planning. */
  readonly noticeRecipients?: readonly { readonly identity: string; readonly connectionId: string }[];
  readonly unstickRadiusTiles?: number;
}

export interface AdminPositionPlan {
  readonly before: AdminPositionState;
  readonly after: AdminPositionState;
  readonly effect: AdminPositionEffect;
  readonly baseVersion: string;
  readonly committedVersion: string;
  readonly previewFingerprint: string;
  readonly preview: AdminMutationPreview;
  readonly audit: AdminAuditPayloadV1;
  readonly notice: string | null;
}

export class AdminPositionError extends Error {
  constructor(readonly code: AdminErrorCode) {
    super(code);
    this.name = 'AdminPositionError';
  }
}

function fail(code: AdminErrorCode): never {
  throw new AdminPositionError(code);
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined)
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(',')}}`;
}

function fingerprint(value: unknown): string {
  let hash = 0x811c9dc5;
  for (const character of stableJson(value)) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function clonePoint(point: AdminPositionPoint | null): AdminPositionPoint | null {
  return point === null ? null : Object.freeze({ ...point });
}

export function cloneAdminPositionState(state: AdminPositionState): AdminPositionState {
  return Object.freeze({
    ...state,
    position: clonePoint(state.position),
    spawn: clonePoint(state.spawn),
    carriedEntityIds: Object.freeze([...state.carriedEntityIds].sort()),
    connectionIds: Object.freeze([...state.connectionIds].sort()),
  });
}

export function adminPositionDocument(state: AdminPositionState): AdminJsonObject {
  return {
    identity: state.identity,
    displayName: state.displayName,
    nameChosen: state.nameChosen,
    position: state.position === null ? null : { ...state.position },
    spawn: state.spawn === null ? null : { ...state.spawn },
    moving: state.moving,
    actionKind: state.actionKind,
    mountedEntityId: state.mountedEntityId,
    carriedEntityIds: [...state.carriedEntityIds].sort(),
    connectionIds: [...state.connectionIds].sort(),
  };
}

export function adminPositionVersion(state: AdminPositionState): string {
  return `position:${fingerprint(adminPositionDocument(state))}`;
}

function pointFromMutation(
  mutation: Extract<AdminPositionMutation, { readonly operation: 'set_spawn' | 'teleport_player' }>,
  pointAtTile: AdminPositionPlanRequest['pointAtTile'],
): AdminPositionPoint {
  if (!Number.isSafeInteger(mutation.tileX) || !Number.isSafeInteger(mutation.tileY)
    || mutation.tileX < 0 || mutation.tileY < 0 || mutation.spaceId.trim().length === 0) {
    fail('admin_payload_invalid');
  }
  return pointAtTile(mutation.spaceId, mutation.tileX, mutation.tileY);
}

function normalizedBody(value: string): string {
  const body = value.normalize('NFC').replace(/\s+/gu, ' ').trim();
  if (body.length === 0 || [...body].length > 500) fail('admin_payload_invalid');
  return body;
}

function nearestWalkable(
  current: AdminPositionPoint,
  spawn: AdminPositionPoint | null,
  pointAtTile: AdminPositionPlanRequest['pointAtTile'],
  tileIsWalkable: (point: AdminPositionPoint) => boolean,
  radius: number,
): AdminPositionPoint {
  if (!Number.isSafeInteger(radius) || radius < 1 || radius > 64) fail('admin_payload_invalid');
  for (let distance = 0; distance <= radius; distance += 1) {
    for (let offsetY = -distance; offsetY <= distance; offsetY += 1) {
      const offsetX = distance - Math.abs(offsetY);
      const xOffsets = offsetX === 0 ? [0] : [-offsetX, offsetX];
      for (const candidateOffsetX of xOffsets) {
        const point = pointAtTile(
          current.spaceId,
          current.tileX + candidateOffsetX,
          current.tileY + offsetY,
        );
        if (point.tileX >= 0 && point.tileY >= 0 && tileIsWalkable(point)) return point;
      }
    }
  }
  if (spawn !== null && tileIsWalkable(spawn)) return spawn;
  fail('admin_position_blocked');
}

function positionEffect(overrides: Partial<AdminPositionEffect> = {}): AdminPositionEffect {
  return Object.freeze({
    settleMovement: false,
    clearInteractions: false,
    clearMount: false,
    clearCarry: false,
    kickConnectionIds: Object.freeze([]),
    notices: Object.freeze([]),
    ...overrides,
  });
}

function relocated(
  state: AdminPositionState,
  point: AdminPositionPoint,
  options: { readonly clearMount: boolean; readonly clearCarry: boolean },
): { readonly after: AdminPositionState; readonly effect: AdminPositionEffect } {
  if (state.position === null) fail('admin_entity_not_found');
  return {
    after: {
      ...state,
      position: point,
      moving: false,
      actionKind: 'none',
      mountedEntityId: options.clearMount ? null : state.mountedEntityId,
      carriedEntityIds: options.clearCarry ? [] : state.carriedEntityIds,
    },
    effect: positionEffect({
      settleMovement: true,
      clearInteractions: true,
      clearMount: options.clearMount,
      clearCarry: options.clearCarry,
    }),
  };
}

function applyMutation(
  state: AdminPositionState,
  request: AdminPositionPlanRequest,
): { readonly after: AdminPositionState; readonly effect: AdminPositionEffect; readonly notice: string | null } {
  const mutation = request.mutation;
  switch (mutation.operation) {
    case 'set_spawn': {
      const point = pointFromMutation(mutation, request.pointAtTile);
      if (!request.tileIsWalkable(point)) fail('admin_position_blocked');
      return { after: { ...state, spawn: point }, effect: positionEffect(), notice: 'An administrator updated your spawn point.' };
    }
    case 'respawn': {
      if (state.spawn === null || !request.tileIsWalkable(state.spawn)) fail('admin_position_blocked');
      return { ...relocated(state, state.spawn, { clearMount: true, clearCarry: true }), notice: 'An administrator respawned your character.' };
    }
    case 'unstick': {
      if (state.position === null) fail('admin_entity_not_found');
      const destination = nearestWalkable(
        state.position,
        state.spawn,
        request.pointAtTile,
        request.tileIsWalkable,
        request.unstickRadiusTiles ?? 8,
      );
      return { ...relocated(state, destination, { clearMount: false, clearCarry: false }), notice: 'An administrator moved you to a safe nearby tile.' };
    }
    case 'teleport_player': {
      const point = pointFromMutation(mutation, request.pointAtTile);
      if (!request.tileIsWalkable(point)) fail('admin_position_blocked');
      return { ...relocated(state, point, { clearMount: false, clearCarry: false }), notice: 'An administrator teleported your character.' };
    }
    case 'set_display_name': {
      const displayName = normalizeCharacterName(mutation.displayName);
      if (displayName === null || request.displayNameIsAvailable?.(displayName) === false) fail('admin_payload_invalid');
      return { after: { ...state, displayName, nameChosen: true }, effect: positionEffect(), notice: `An administrator changed your display name to ${displayName}.` };
    }
    case 'kick': {
      const body = normalizedBody(mutation.notice);
      const connectionIds = [...state.connectionIds].sort();
      if (connectionIds.length === 0) fail('admin_no_changes');
      return {
        after: { ...state, connectionIds: [] },
        effect: positionEffect({ kickConnectionIds: Object.freeze(connectionIds) }),
        notice: body,
      };
    }
    case 'notify': {
      const body = normalizedBody(mutation.body);
      const recipients = mutation.targetIdentity === 'all'
        ? request.noticeRecipients ?? fail('admin_payload_invalid')
        : state.connectionIds.map((connectionId) => ({ identity: state.identity, connectionId }));
      const notices = [...new Map(recipients.map((recipient) => (
        [`${recipient.identity}:${recipient.connectionId}`, { ...recipient, body }]
      ))).values()].sort((left, right) => (
        left.identity.localeCompare(right.identity, 'en') || left.connectionId.localeCompare(right.connectionId, 'en')
      ));
      if (notices.length === 0) fail('admin_no_changes');
      return { after: state, effect: positionEffect({ notices: Object.freeze(notices) }), notice: body };
    }
  }
}

function previewDocument(state: AdminPositionState, effect: AdminPositionEffect): AdminJsonObject {
  return {
    ...adminPositionDocument(state),
    effects: {
      settleMovement: effect.settleMovement,
      clearInteractions: effect.clearInteractions,
      clearMount: effect.clearMount,
      clearCarry: effect.clearCarry,
      kickConnectionIds: [...effect.kickConnectionIds],
      notices: effect.notices.map((notice) => ({ identity: notice.identity, connectionId: notice.connectionId, body: notice.body })),
    },
  };
}

function inverseFor(
  before: AdminPositionState,
  mutation: AdminPositionMutation,
): AdminAuditPayloadV1['inverse'] {
  switch (mutation.operation) {
    case 'set_spawn': return before.spawn === null
      ? null
      : { operation: 'set_spawn', args: { ...before.spawn } };
    case 'respawn':
    case 'unstick':
    case 'teleport_player': return before.position === null
      ? null
      : { operation: 'teleport_player', args: { ...before.position } };
    case 'set_display_name': return { operation: 'set_display_name', args: { displayName: before.displayName } };
    case 'kick':
    case 'notify': return null;
  }
}

export function requireAdminPositionAuthority(
  role: AdminEffectiveRole,
  mutation: AdminPositionMutation,
  caps: SupportCaps,
  context: SupportMutationContext,
): void {
  if (!adminRoleCanMutate(role, mutation.operation)) fail('admin_role_forbidden');
  if (role !== 'support') return;
  try { requireSupportMutationWithinCaps(mutation, caps, context); }
  catch (error) {
    if (error instanceof Error && (error.message === 'admin_support_cap_exceeded' || error.message === 'admin_rate_limited')) {
      fail(error.message);
    }
    throw error;
  }
}

export function planAdminPositionMutation(
  inputState: AdminPositionState,
  request: AdminPositionPlanRequest,
): AdminPositionPlan {
  const reason = parseAdminReason(String(request.mutation.reason));
  if (!reason.ok) fail(reason.error);
  if (!ADMIN_MUTATION_ID_PATTERN.test(request.mutation.clientMutationId)) fail('admin_invalid_mutation_id');
  if (request.nowMicros < 0n) fail('admin_payload_invalid');
  const before = cloneAdminPositionState(inputState);
  const baseVersion = adminPositionVersion(before);
  // The player snapshot's version belongs to the progression slice. A W2c
  // dry-run therefore discovers and returns this slice's exact version; the
  // receipt and commit must then present it unchanged.
  if (!request.mutation.dryRun && request.expectedBaseVersion !== baseVersion) {
    fail('admin_preview_stale');
  }
  const applied = applyMutation(before, request);
  const after = cloneAdminPositionState(applied.after);
  const effect = applied.effect;
  const diff = diffAdminValues(previewDocument(before, positionEffect()), previewDocument(after, effect));
  if (!adminPreviewHasChanges(diff)) fail('admin_no_changes');
  const previewFingerprint = `preview:${fingerprint({
    mutation: { ...request.mutation, dryRun: false, reason: String(reason.value) },
    baseVersion,
    after: previewDocument(after, effect),
  })}`;
  if (!request.mutation.dryRun && request.previewFingerprint !== previewFingerprint) fail('admin_preview_required');
  const target = request.mutation.operation === 'notify' && request.mutation.targetIdentity === 'all'
    ? { kind: 'world' as const }
    : { kind: 'player' as const, identity: before.identity };
  const preview: AdminMutationPreview = Object.freeze({
    operation: request.mutation.operation,
    target,
    baseVersion,
    preview: diff,
    warnings: Object.freeze([
      ...(effect.settleMovement ? ['Movement will be settled before relocation.'] : []),
      ...(applied.notice === null ? [] : ['Affected online players will receive a notice.']),
    ]),
    expiresAtMicros: (request.nowMicros + 60_000_000n).toString(),
  });
  const audit: AdminAuditPayloadV1 = Object.freeze({
    schemaVersion: 1,
    clientMutationId: request.mutation.clientMutationId,
    target,
    reason: reason.value,
    changes: diff.changes,
    inverse: inverseFor(before, request.mutation),
    ...(applied.notice === null ? {} : { notice: applied.notice }),
  });
  return Object.freeze({
    before,
    after,
    effect,
    baseVersion,
    committedVersion: adminPositionVersion(after),
    previewFingerprint,
    preview,
    audit,
    notice: applied.notice,
  });
}

import {
  AUTHORITY_TICKS_PER_DAY,
  DAYS_PER_SEASON,
  adminPreviewHasChanges,
  diffAdminValues,
  isWeatherMode,
  isWindDirectionMode,
  type AdminJsonObject,
} from '@orchard/sim';
import { normalizeMessageOfDay } from '../chat-policy.js';
import { adminRoleCanMutate, type AdminEffectiveRole } from './auth-policy.js';
import {
  ADMIN_MUTATION_ID_PATTERN,
  parseAdminReason,
  type AdminAuditPayloadV1,
  type AdminErrorCode,
  type AdminMutationPreview,
  type AdminWorldMutation,
} from './contracts.js';

export type AdminWorldControlOperation =
  | 'set_time'
  | 'set_weather'
  | 'set_wind'
  | 'set_motd'
  | 'global_notice'
  | 'restore_map'
  | 'move_homestead';

export type AdminWorldControlMutation = AdminWorldMutation & {
  readonly operation: AdminWorldControlOperation;
};

export interface AdminWorldControlMapRevision {
  readonly revisionId: string;
  readonly mapId: string;
  readonly revision: number;
  readonly contentHash: string;
  readonly documentJson: string;
}

export interface AdminWorldControlHomestead {
  readonly spaceId: string;
  readonly ownerIdentity: string;
  readonly ownerName: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly entrancePortalId: string;
  readonly entranceTileX: number;
  readonly entranceTileY: number;
  readonly exitPortalId: string;
  readonly exitTileX: number;
  readonly exitTileY: number;
}

/** The bounded, operation-relevant authority snapshot. The adapter must load
 * this inside the same reducer transaction that applies a successful plan. */
export interface AdminWorldControlState {
  readonly authorityTick: string;
  readonly calendarTick: string;
  readonly cropCalendarOffset: string;
  readonly weatherMode: string;
  readonly windDirection: string;
  readonly motd: string;
  readonly mapHead: AdminWorldControlMapRevision | null;
  readonly restoreRevision: AdminWorldControlMapRevision | null;
  readonly homestead: AdminWorldControlHomestead | null;
  readonly homesteadSiteAllowed: boolean;
  /** Changes on every global notice, including repeated identical bodies. */
  readonly globalNoticeSequence: string;
}

export type AdminWorldControlAction =
  | { readonly kind: 'set_environment'; readonly calendarTick: string; readonly cropCalendarOffset: string; readonly weatherMode: string }
  | { readonly kind: 'set_wind'; readonly direction: string }
  | { readonly kind: 'set_motd'; readonly body: string }
  | { readonly kind: 'global_notice'; readonly body: string; readonly sequence: string }
  | { readonly kind: 'restore_map'; readonly revision: AdminWorldControlMapRevision }
  | { readonly kind: 'move_homestead'; readonly spaceId: string; readonly tileX: number; readonly tileY: number;
      readonly entranceTileX: number; readonly entranceTileY: number; readonly exitTileX: number; readonly exitTileY: number };

export interface AdminWorldControlPlanRequest {
  readonly mutation: AdminWorldControlMutation;
  readonly expectedBaseVersion: string;
  readonly previewFingerprint: string | null;
  readonly nowMicros: bigint;
}

export interface AdminWorldControlPlan {
  readonly before: AdminWorldControlState;
  readonly after: AdminWorldControlState;
  readonly action: AdminWorldControlAction;
  readonly baseVersion: string;
  readonly committedVersion: string;
  readonly previewFingerprint: string;
  readonly preview: AdminMutationPreview;
  readonly audit: AdminAuditPayloadV1;
  readonly notice: string;
}

export class AdminWorldControlError extends Error {
  constructor(readonly code: AdminErrorCode) {
    super(code);
    this.name = 'AdminWorldControlError';
  }
}

function fail(code: AdminErrorCode): never { throw new AdminWorldControlError(code); }

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

function cloneRevision(value: AdminWorldControlMapRevision | null): AdminWorldControlMapRevision | null {
  return value === null ? null : Object.freeze({ ...value });
}

export function cloneAdminWorldControlState(state: AdminWorldControlState): AdminWorldControlState {
  return Object.freeze({
    ...state,
    mapHead: cloneRevision(state.mapHead),
    restoreRevision: cloneRevision(state.restoreRevision),
    homestead: state.homestead === null ? null : Object.freeze({ ...state.homestead }),
  });
}

export function adminWorldControlDocument(state: AdminWorldControlState): AdminJsonObject {
  return {
    authorityTick: state.authorityTick,
    calendarTick: state.calendarTick,
    cropCalendarOffset: state.cropCalendarOffset,
    weatherMode: state.weatherMode,
    windDirection: state.windDirection,
    motd: state.motd,
    mapHead: state.mapHead === null ? null : { ...state.mapHead },
    homestead: state.homestead === null ? null : { ...state.homestead },
    globalNoticeSequence: state.globalNoticeSequence,
  };
}

export function adminWorldControlVersion(state: AdminWorldControlState): string {
  return `world-control:${fingerprint(adminWorldControlDocument(state))}`;
}

function normalizedNotice(input: string): string {
  const body = input.normalize('NFC').replace(/\s+/gu, ' ').trim();
  if (body.length === 0 || [...body].length > 500) fail('admin_payload_invalid');
  return body;
}

const MAX_WORLD_CALENDAR_TICK = BigInt(AUTHORITY_TICKS_PER_DAY * DAYS_PER_SEASON * 4 * 999);

function applyMutation(before: AdminWorldControlState, mutation: AdminWorldControlMutation): {
  readonly after: AdminWorldControlState;
  readonly action: AdminWorldControlAction;
} {
  switch (mutation.operation) {
    case 'set_time': {
      let calendarTick: bigint;
      let authorityTick: bigint;
      try { calendarTick = BigInt(mutation.calendarTick); authorityTick = BigInt(before.authorityTick); }
      catch { return fail('admin_payload_invalid'); }
      if (calendarTick < 0n || calendarTick > MAX_WORLD_CALENDAR_TICK) fail('admin_payload_invalid');
      const cropCalendarOffset = (calendarTick - authorityTick).toString();
      const action = { kind: 'set_environment' as const, calendarTick: calendarTick.toString(),
        cropCalendarOffset, weatherMode: before.weatherMode };
      return { after: { ...before, calendarTick: action.calendarTick, cropCalendarOffset }, action };
    }
    case 'set_weather': {
      if (!isWeatherMode(mutation.weatherMode)) fail('admin_payload_invalid');
      const action = { kind: 'set_environment' as const, calendarTick: before.calendarTick,
        cropCalendarOffset: before.cropCalendarOffset, weatherMode: mutation.weatherMode };
      return { after: { ...before, weatherMode: mutation.weatherMode }, action };
    }
    case 'set_wind': {
      if (!isWindDirectionMode(mutation.direction)) fail('admin_payload_invalid');
      const action = { kind: 'set_wind' as const, direction: mutation.direction };
      return { after: { ...before, windDirection: mutation.direction }, action };
    }
    case 'set_motd': {
      const body = normalizeMessageOfDay(mutation.body);
      if (body === null) fail('admin_payload_invalid');
      const action = { kind: 'set_motd' as const, body };
      return { after: { ...before, motd: body }, action };
    }
    case 'global_notice': {
      const body = normalizedNotice(mutation.body);
      const sequence = `${before.globalNoticeSequence}:${mutation.clientMutationId}`;
      const action = { kind: 'global_notice' as const, body, sequence };
      return { after: { ...before, globalNoticeSequence: sequence }, action };
    }
    case 'restore_map': {
      const revision = before.restoreRevision;
      if (revision === null || revision.revisionId !== mutation.revisionId) fail('admin_entity_not_found');
      if (before.mapHead !== null && before.mapHead.mapId !== revision.mapId) fail('admin_invalid_patch');
      const nextHead = { ...revision, revision: (before.mapHead?.revision ?? revision.revision) + 1 };
      return { after: { ...before, mapHead: nextHead }, action: { kind: 'restore_map', revision } };
    }
    case 'move_homestead': {
      const home = before.homestead;
      if (home === null || home.spaceId !== mutation.spaceId) fail('admin_entity_not_found');
      if (!Number.isSafeInteger(mutation.tileX) || !Number.isSafeInteger(mutation.tileY)
        || mutation.tileX < 0 || mutation.tileY < 0) fail('admin_payload_invalid');
      if (!before.homesteadSiteAllowed) fail('admin_position_blocked');
      const action = { kind: 'move_homestead' as const, spaceId: home.spaceId,
        tileX: mutation.tileX, tileY: mutation.tileY,
        entranceTileX: mutation.tileX, entranceTileY: mutation.tileY + 1,
        exitTileX: mutation.tileX, exitTileY: mutation.tileY + 2 };
      return { after: { ...before, homestead: { ...home, tileX: mutation.tileX, tileY: mutation.tileY,
        entranceTileX: action.entranceTileX, entranceTileY: action.entranceTileY,
        exitTileX: action.exitTileX, exitTileY: action.exitTileY } }, action };
    }
  }
}

function inverseFor(before: AdminWorldControlState, operation: AdminWorldControlOperation): AdminAuditPayloadV1['inverse'] {
  switch (operation) {
    case 'set_time': return { operation: 'set_time', args: { calendarTick: before.calendarTick } };
    case 'set_weather': return { operation: 'set_weather', args: { weatherMode: before.weatherMode } };
    case 'set_wind': return { operation: 'set_wind', args: { direction: before.windDirection } };
    case 'set_motd': return { operation: 'set_motd', args: { body: before.motd } };
    case 'global_notice': return null;
    case 'restore_map': return before.mapHead === null ? null : {
      operation: 'restore_map', args: { revisionId: before.mapHead.revisionId, mapId: before.mapHead.mapId,
        revision: before.mapHead.revision, contentHash: before.mapHead.contentHash,
        documentJson: before.mapHead.documentJson },
    };
    case 'move_homestead': return before.homestead === null ? null : {
      operation: 'move_homestead', args: { spaceId: before.homestead.spaceId,
        tileX: before.homestead.tileX, tileY: before.homestead.tileY },
    };
  }
}

export function requireAdminWorldControlAuthority(role: AdminEffectiveRole, mutation: AdminWorldControlMutation): void {
  if ((role !== 'owner' && role !== 'admin') || !adminRoleCanMutate(role, mutation.operation)) {
    fail('admin_role_forbidden');
  }
}

export function planAdminWorldControlMutation(
  input: AdminWorldControlState,
  request: AdminWorldControlPlanRequest,
): AdminWorldControlPlan {
  const reason = parseAdminReason(String(request.mutation.reason));
  if (!reason.ok) fail(reason.error);
  if (!ADMIN_MUTATION_ID_PATTERN.test(request.mutation.clientMutationId) || request.nowMicros < 0n) {
    fail('admin_invalid_mutation_id');
  }
  const before = cloneAdminWorldControlState(input);
  const baseVersion = adminWorldControlVersion(before);
  if (request.expectedBaseVersion !== baseVersion) fail('admin_world_revision_conflict');
  const applied = applyMutation(before, request.mutation);
  const after = cloneAdminWorldControlState(applied.after);
  const diff = diffAdminValues(adminWorldControlDocument(before), adminWorldControlDocument(after));
  if (!adminPreviewHasChanges(diff)) fail('admin_no_changes');
  const previewFingerprint = `preview:${fingerprint({ mutation: { ...request.mutation, dryRun: false,
    reason: String(reason.value) }, baseVersion, action: applied.action, after: adminWorldControlDocument(after) })}`;
  if (!request.mutation.dryRun && request.previewFingerprint !== previewFingerprint) fail('admin_preview_required');
  const target = request.mutation.operation === 'move_homestead'
    ? { kind: 'space' as const, spaceId: request.mutation.spaceId }
    : { kind: 'world' as const };
  const notice = `An administrator applied ${request.mutation.operation.replaceAll('_', ' ')}.`;
  return Object.freeze({
    before, after, action: Object.freeze(applied.action), baseVersion,
    committedVersion: adminWorldControlVersion(after), previewFingerprint,
    preview: Object.freeze({ operation: request.mutation.operation, target, baseVersion, preview: diff,
      warnings: Object.freeze([]), expiresAtMicros: (request.nowMicros + 60_000_000n).toString() }),
    audit: Object.freeze({ schemaVersion: 1, clientMutationId: request.mutation.clientMutationId,
      target, reason: reason.value, changes: diff.changes, inverse: inverseFor(before, request.mutation.operation), notice }),
    notice,
  });
}

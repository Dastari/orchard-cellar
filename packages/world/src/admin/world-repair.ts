import {
  adminPreviewHasChanges,
  diffAdminValues,
  type AdminJsonObject,
} from '@orchard/sim';
import { adminRoleCanMutate, type AdminEffectiveRole } from './auth-policy.js';
import { preserveOwnerOnlySpaceFlags, withoutOwnerOnlySpaceFlags } from '../chunk-authority-setting.js';
import {
  ADMIN_MUTATION_ID_PATTERN,
  parseAdminReason,
  type AdminAuditPayloadV1,
  type AdminErrorCode,
  type AdminMutationPreview,
  type AdminValidationIssue,
  type AdminWorldMutation,
  type AdminWorldValidationReport,
} from './contracts.js';

export const ADMIN_WORLD_SCAN_LIMIT = 4_096;
export const ADMIN_WORLD_ISSUE_LIMIT = 512;
export const ADMIN_WORLD_REPORT_TTL_MICROS = 60_000_000n;

export type AdminWorldRepairOperation = 'set_space_flags' | 'repair_portal_pair' | 'run_world_repair';
export type AdminWorldRepairMutation = AdminWorldMutation & { readonly operation: AdminWorldRepairOperation };

export interface AdminWorldSpace {
  readonly spaceId: string;
  readonly sizeTiles: number;
  readonly flags: AdminJsonObject;
}

export interface AdminWorldPortal {
  readonly portalId: string;
  readonly kind: string;
  readonly fromSpace: string;
  readonly fromTileX: number;
  readonly fromTileY: number;
  readonly toSpace: string;
  readonly toTileX: number;
  readonly toTileY: number;
}

export interface AdminWorldPlayerPosition {
  readonly identity: string;
  readonly spaceId: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly blocked: boolean;
  readonly repairPosition: {
    readonly spaceId: string;
    readonly tileX: number;
    readonly tileY: number;
  } | null;
}

export interface AdminWorldRowReference {
  readonly sourceKind: string;
  readonly sourceId: string;
  readonly targetKind: string;
  readonly targetId: string;
  readonly targetExists: boolean;
  readonly repair: 'none' | 'delete_source' | 'clear_reference';
}

export interface AdminWorldCustodyReference {
  readonly entityKind: 'chest' | 'combat_target' | 'placeable' | 'inventory' | 'cursor' | 'overflow' | 'trade_offer' | 'hearth_stash_slot';
  readonly entityId: string;
  readonly holderIdentity: string;
  readonly holderExists: boolean;
  readonly parentExists: boolean;
  readonly claims: number;
}

export interface AdminWorldContentReference {
  readonly sourceKind: string;
  readonly sourceId: string;
  readonly definitionId: string;
  readonly exists: boolean;
  readonly retired: boolean;
}

export interface AdminWorldState {
  /** Adapter-set when any bounded table/index scan had additional rows. */
  readonly sourceTruncated?: boolean;
  readonly spaces: readonly AdminWorldSpace[];
  readonly portals: readonly AdminWorldPortal[];
  readonly players: readonly AdminWorldPlayerPosition[];
  readonly rowReferences: readonly AdminWorldRowReference[];
  readonly custody: readonly AdminWorldCustodyReference[];
  readonly contentReferences: readonly AdminWorldContentReference[];
}

export type AdminWorldRepairAction =
  | { readonly kind: 'insert_portal'; readonly portal: AdminWorldPortal }
  | { readonly kind: 'relocate_player'; readonly identity: string; readonly spaceId: string; readonly tileX: number; readonly tileY: number }
  | { readonly kind: 'delete_orphan'; readonly rowKind: string; readonly rowId: string }
  | { readonly kind: 'clear_reference'; readonly rowKind: string; readonly rowId: string; readonly targetKind: string }
  | { readonly kind: 'clear_custody'; readonly entityKind: AdminWorldCustodyReference['entityKind']; readonly entityId: string }
  | { readonly kind: 'set_space_flags'; readonly spaceId: string; readonly flags: AdminJsonObject };

export interface AdminWorldValidationPlan extends AdminWorldValidationReport {
  readonly fingerprint: string;
  readonly rowsScanned: number;
  readonly repairs: readonly AdminWorldRepairAction[];
}

export interface AdminWorldMutationRequest {
  readonly mutation: AdminWorldRepairMutation;
  readonly expectedWorldVersion: string;
  readonly previewFingerprint: string | null;
  readonly report: AdminWorldValidationPlan | null;
  readonly reportFingerprint: string | null;
  readonly nowMicros: bigint;
}

export interface AdminWorldMutationPlan {
  readonly before: AdminWorldState;
  readonly after: AdminWorldState;
  readonly actions: readonly AdminWorldRepairAction[];
  readonly baseVersion: string;
  readonly committedVersion: string;
  readonly previewFingerprint: string;
  readonly preview: AdminMutationPreview;
  readonly audit: AdminAuditPayloadV1;
  readonly notice: string;
}

export class AdminWorldRepairError extends Error {
  constructor(readonly code: AdminErrorCode) {
    super(code);
    this.name = 'AdminWorldRepairError';
  }
}

function fail(code: AdminErrorCode): never {
  throw new AdminWorldRepairError(code);
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

function ordered<T>(rows: readonly T[], key: (row: T) => string): readonly T[] {
  return Object.freeze([...rows].sort((left, right) => key(left).localeCompare(key(right), 'en')));
}

export function cloneAdminWorldState(state: AdminWorldState): AdminWorldState {
  return Object.freeze({
    sourceTruncated: state.sourceTruncated === true,
    spaces: ordered(state.spaces.map((space) => Object.freeze({
      ...space, flags: Object.freeze({ ...space.flags }),
    })), (row) => row.spaceId),
    portals: ordered(state.portals.map((row) => Object.freeze({ ...row })), (row) => row.portalId),
    players: ordered(state.players.map((row) => Object.freeze({
      ...row,
      repairPosition: row.repairPosition === null ? null : Object.freeze({ ...row.repairPosition }),
    })), (row) => row.identity),
    rowReferences: ordered(state.rowReferences.map((row) => Object.freeze({ ...row })), (row) => `${row.sourceKind}:${row.sourceId}:${row.targetKind}:${row.targetId}`),
    custody: ordered(state.custody.map((row) => Object.freeze({ ...row })), (row) => `${row.entityKind}:${row.entityId}`),
    contentReferences: ordered(state.contentReferences.map((row) => Object.freeze({ ...row })), (row) => `${row.sourceKind}:${row.sourceId}:${row.definitionId}`),
  });
}

export function adminWorldDocument(state: AdminWorldState): AdminJsonObject {
  const normalized = cloneAdminWorldState(state);
  return {
    spaces: normalized.spaces.map((row) => ({ ...row, flags: { ...row.flags } })),
    portals: normalized.portals.map((row) => ({ ...row })),
    players: normalized.players.map((row) => ({ ...row, repairPosition: row.repairPosition === null ? null : { ...row.repairPosition } })),
    rowReferences: normalized.rowReferences.map((row) => ({ ...row })),
    custody: normalized.custody.map((row) => ({ ...row })),
    contentReferences: normalized.contentReferences.map((row) => ({ ...row })),
    sourceTruncated: normalized.sourceTruncated === true,
  };
}

export function adminWorldVersion(state: AdminWorldState): string {
  return `world:${fingerprint(adminWorldDocument(state))}`;
}

function portalEndpointKey(portal: Pick<AdminWorldPortal, 'fromSpace' | 'fromTileX' | 'fromTileY'>): string {
  return `${portal.fromSpace}:${portal.fromTileX}:${portal.fromTileY}`;
}

function pairedPortal(portal: AdminWorldPortal, portalId: string): AdminWorldPortal {
  return {
    portalId,
    kind: `repaired_pair:${portal.kind}`,
    fromSpace: portal.toSpace,
    fromTileX: portal.toTileX,
    fromTileY: portal.toTileY,
    toSpace: portal.fromSpace,
    toTileX: portal.fromTileX,
    toTileY: portal.fromTileY,
  };
}

function nextPortalId(portals: readonly AdminWorldPortal[]): string {
  const ids = new Set(portals.map(({ portalId }) => portalId));
  for (let candidate = 1; candidate <= 0xffff_ffff; candidate += 1) {
    const id = String(candidate);
    if (!ids.has(id)) return id;
  }
  fail('admin_capacity_exceeded');
}

function issueTarget(kind: string, id: string): AdminValidationIssue['target'] {
  if (kind === 'player') return { kind: 'player', identity: id };
  if (kind === 'space') return { kind: 'space', spaceId: id };
  return { kind: 'entity', entityId: `${kind}:${id}` };
}

interface IssueAndRepair {
  readonly issue: AdminValidationIssue;
  readonly repair: AdminWorldRepairAction | null;
}

function validateRows(state: AdminWorldState): readonly IssueAndRepair[] {
  const results: IssueAndRepair[] = [];
  const spaces = new Map(state.spaces.map((space) => [space.spaceId, space]));
  const portalsByEndpoint = new Map(state.portals.map((portal) => [portalEndpointKey(portal), portal]));
  const usedPortalIds = [...state.portals];
  for (const player of state.players) {
    if (!spaces.has(player.spaceId)) results.push({
      issue: { code: 'space_reference_missing', severity: 'error', target: issueTarget('player', player.identity), message: `Player references missing space ${player.spaceId}.`, repairable: player.repairPosition !== null },
      repair: player.repairPosition === null ? null : { kind: 'relocate_player', identity: player.identity, ...player.repairPosition },
    });
    else if (player.blocked) results.push({
      issue: { code: 'player_inside_collision', severity: 'error', target: issueTarget('player', player.identity), message: 'Player position overlaps authority collision.', repairable: player.repairPosition !== null },
      repair: player.repairPosition === null ? null : { kind: 'relocate_player', identity: player.identity, ...player.repairPosition },
    });
  }
  for (const portal of state.portals) {
    const source = spaces.get(portal.fromSpace);
    const destination = spaces.get(portal.toSpace);
    if (source === undefined || destination === undefined) results.push({
      issue: { code: 'portal_space_missing', severity: 'error', target: issueTarget('portal', portal.portalId), message: 'Portal references a missing source or destination space.', repairable: false }, repair: null,
    });
    else if (portal.fromTileX < 0 || portal.fromTileY < 0 || portal.toTileX < 0 || portal.toTileY < 0
      || portal.fromTileX >= source.sizeTiles || portal.fromTileY >= source.sizeTiles
      || portal.toTileX >= destination.sizeTiles || portal.toTileY >= destination.sizeTiles) results.push({
      issue: { code: 'portal_out_of_bounds', severity: 'error', target: issueTarget('portal', portal.portalId), message: 'Portal endpoint falls outside its authored space.', repairable: false }, repair: null,
    });
    const reverseKey = `${portal.toSpace}:${portal.toTileX}:${portal.toTileY}`;
    const reverse = portalsByEndpoint.get(reverseKey);
    if (reverse === undefined && source !== undefined && destination !== undefined) {
      const id = nextPortalId(usedPortalIds);
      const repair = pairedPortal(portal, id);
      usedPortalIds.push(repair);
      results.push({
        issue: { code: 'portal_pair_missing', severity: 'error', target: issueTarget('portal', portal.portalId), message: `Reverse portal at ${reverseKey} does not exist.`, repairable: true },
        repair: { kind: 'insert_portal', portal: repair },
      });
    } else if (reverse !== undefined && (reverse.toSpace !== portal.fromSpace
      || reverse.toTileX !== portal.fromTileX || reverse.toTileY !== portal.fromTileY)) {
      results.push({
        issue: { code: 'portal_pair_mismatch', severity: 'error', target: issueTarget('portal', portal.portalId), message: `Portal at ${reverseKey} does not return to the source endpoint.`, repairable: false }, repair: null,
      });
    }
  }
  for (const reference of state.rowReferences) if (!reference.targetExists) {
    const repair = reference.repair === 'delete_source'
      ? { kind: 'delete_orphan' as const, rowKind: reference.sourceKind, rowId: reference.sourceId }
      : reference.repair === 'clear_reference'
        ? { kind: 'clear_reference' as const, rowKind: reference.sourceKind, rowId: reference.sourceId, targetKind: reference.targetKind }
        : null;
    results.push({
      issue: { code: 'orphaned_row', severity: 'error', target: issueTarget(reference.sourceKind, reference.sourceId), message: `${reference.sourceKind} ${reference.sourceId} references missing ${reference.targetKind} ${reference.targetId}.`, repairable: repair !== null },
      repair,
    });
  }
  for (const custody of state.custody) {
    if (!custody.parentExists) results.push({
      issue: { code: 'custody_parent_missing', severity: 'error', target: issueTarget(custody.entityKind, custody.entityId), message: 'Custody row has no authoritative parent.', repairable: false },
      repair: null,
    });
    else if (!custody.holderExists) results.push({
      issue: { code: 'custody_holder_missing', severity: 'error', target: issueTarget(custody.entityKind, custody.entityId), message: `Custody holder ${custody.holderIdentity} does not exist.`, repairable: ['chest', 'combat_target', 'placeable'].includes(custody.entityKind) },
      repair: ['chest', 'combat_target', 'placeable'].includes(custody.entityKind)
        ? { kind: 'clear_custody', entityKind: custody.entityKind, entityId: custody.entityId }
        : null,
    });
    if (custody.claims !== 1) results.push({
      issue: { code: 'custody_claim_conflict', severity: 'error', target: issueTarget(custody.entityKind, custody.entityId), message: `Expected one custody claim; found ${custody.claims}.`, repairable: false }, repair: null,
    });
  }
  for (const reference of state.contentReferences) if (!reference.exists || reference.retired) results.push({
    issue: { code: reference.retired ? 'definition_retired' : 'definition_missing', severity: 'warning', target: issueTarget(reference.sourceKind, reference.sourceId), message: `Definition ${reference.definitionId} is ${reference.retired ? 'retired' : 'missing'}.`, repairable: false }, repair: null,
  });
  return results;
}

function boundedState(state: AdminWorldState): { readonly state: AdminWorldState; readonly rowsScanned: number; readonly truncated: boolean } {
  let remaining = ADMIN_WORLD_SCAN_LIMIT;
  let truncated = state.sourceTruncated === true;
  const take = <T>(rows: readonly T[]): readonly T[] => {
    const sorted = rows;
    const selected = sorted.slice(0, Math.max(0, remaining));
    remaining -= selected.length;
    if (selected.length < sorted.length) truncated = true;
    return selected;
  };
  const normalized = cloneAdminWorldState(state);
  const bounded = cloneAdminWorldState({
    spaces: take(normalized.spaces),
    portals: take(normalized.portals),
    players: take(normalized.players),
    rowReferences: take(normalized.rowReferences),
    custody: take(normalized.custody),
    contentReferences: take(normalized.contentReferences),
    sourceTruncated: truncated,
  });
  return { state: bounded, rowsScanned: ADMIN_WORLD_SCAN_LIMIT - remaining, truncated };
}

/** Returns the exact bounded snapshot used for both validation receipts and
 * mutation version checks. Keeping this shared prevents a report from being
 * accepted against a differently-scoped world snapshot. */
export function boundedAdminWorldState(state: AdminWorldState): AdminWorldState {
  return boundedState(state).state;
}

export function planAdminValidateWorld(
  input: AdminWorldState,
  reportId: string,
  nowMicros: bigint,
): AdminWorldValidationPlan {
  if (!ADMIN_MUTATION_ID_PATTERN.test(reportId) || nowMicros < 0n) fail('admin_payload_invalid');
  const bounded = boundedState(input);
  const found = [...validateRows(bounded.state)];
  if (bounded.truncated) found.push({
    issue: { code: 'validation_truncated', severity: 'warning', target: { kind: 'world' }, message: `Validation stopped at ${ADMIN_WORLD_SCAN_LIMIT} rows.`, repairable: false }, repair: null,
  });
  const issueTruncated = found.length > ADMIN_WORLD_ISSUE_LIMIT;
  const selected = found.slice(0, ADMIN_WORLD_ISSUE_LIMIT);
  if (issueTruncated) selected[ADMIN_WORLD_ISSUE_LIMIT - 1] = {
    issue: { code: 'issue_limit_reached', severity: 'warning', target: { kind: 'world' }, message: `Validation stopped at ${ADMIN_WORLD_ISSUE_LIMIT} issues.`, repairable: false }, repair: null,
  };
  const worldVersion = adminWorldVersion(bounded.state);
  const repairs = Object.freeze([...new Map(selected
    .flatMap(({ repair }) => repair === null ? [] : [[stableJson(repair), repair] as const])).values()]);
  const issues = Object.freeze(selected.map(({ issue }) => Object.freeze(issue)));
  const expiresAtMicros = (nowMicros + ADMIN_WORLD_REPORT_TTL_MICROS).toString();
  const reportFingerprint = `report:${fingerprint({ reportId, worldVersion, issues, repairs, expiresAtMicros })}`;
  return Object.freeze({
    reportId, worldVersion, fingerprint: reportFingerprint,
    issues, repairs, expiresAtMicros, rowsScanned: bounded.rowsScanned,
  });
}

const SPACE_FLAG_KEYS = new Set(['ownerOnly', 'weather', 'buildAllowed']);

function validatedSpaceFlags(patch: AdminJsonObject): AdminJsonObject {
  const entries = Object.entries(patch);
  if (entries.length === 0 || entries.some(([key, value]) => !SPACE_FLAG_KEYS.has(key) || typeof value !== 'boolean')) {
    fail('admin_invalid_patch');
  }
  return Object.freeze(Object.fromEntries(entries.sort(([left], [right]) => left.localeCompare(right, 'en'))));
}

function applyActions(state: AdminWorldState, actions: readonly AdminWorldRepairAction[]): AdminWorldState {
  let spaces = [...state.spaces];
  const portals = [...state.portals];
  let players = [...state.players];
  let rowReferences = [...state.rowReferences];
  let custody = [...state.custody];
  for (const action of actions) switch (action.kind) {
    case 'insert_portal': portals.push(action.portal); break;
    case 'relocate_player': players = players.map((player) => player.identity === action.identity ? {
      ...player, spaceId: action.spaceId, tileX: action.tileX, tileY: action.tileY,
      blocked: false, repairPosition: null,
    } : player); break;
    case 'delete_orphan':
      rowReferences = rowReferences.filter((row) => !(row.sourceKind === action.rowKind && row.sourceId === action.rowId));
      custody = custody.filter((row) => !(row.entityKind === action.rowKind && row.entityId === action.rowId));
      break;
    case 'clear_reference': rowReferences = rowReferences.filter((row) => !(row.sourceKind === action.rowKind && row.sourceId === action.rowId && row.targetKind === action.targetKind)); break;
    case 'clear_custody': custody = custody.map((row) => row.entityKind === action.entityKind && row.entityId === action.entityId ? { ...row, holderExists: true, holderIdentity: '', claims: 1 } : row); break;
    case 'set_space_flags': spaces = spaces.map((space) => space.spaceId === action.spaceId
      ? { ...space, flags: preserveOwnerOnlySpaceFlags(action.flags, space.flags) } : space); break;
  }
  return cloneAdminWorldState({ ...state, spaces, portals, players, rowReferences, custody });
}

function actionsForMutation(state: AdminWorldState, request: AdminWorldMutationRequest): readonly AdminWorldRepairAction[] {
  const mutation = request.mutation;
  switch (mutation.operation) {
    case 'set_space_flags': {
      const space = state.spaces.find(({ spaceId }) => spaceId === mutation.spaceId);
      if (space === undefined) fail('admin_entity_not_found');
      return [{ kind: 'set_space_flags', spaceId: mutation.spaceId, flags: { ...space.flags, ...validatedSpaceFlags(mutation.patch) } }];
    }
    case 'repair_portal_pair': {
      const portal = state.portals.find(({ portalId }) => portalId === mutation.portalId);
      if (portal === undefined) fail('admin_entity_not_found');
      const reverseKey = `${portal.toSpace}:${portal.toTileX}:${portal.toTileY}`;
      const reverse = state.portals.find((candidate) => portalEndpointKey(candidate) === reverseKey);
      if (reverse !== undefined) {
        if (reverse.toSpace === portal.fromSpace && reverse.toTileX === portal.fromTileX
          && reverse.toTileY === portal.fromTileY) fail('admin_no_changes');
        fail('admin_invalid_patch');
      }
      return [{ kind: 'insert_portal', portal: pairedPortal(portal, nextPortalId(state.portals)) }];
    }
    case 'run_world_repair': {
      const report = request.report;
      if (report === null || report.reportId !== mutation.reportId || request.reportFingerprint !== report.fingerprint) {
        fail('admin_preview_required');
      }
      if (BigInt(report.expiresAtMicros) < request.nowMicros || report.worldVersion !== adminWorldVersion(state)) {
        fail('admin_world_revision_conflict');
      }
      if (report.repairs.length === 0) fail('admin_no_changes');
      return report.repairs;
    }
  }
}

export function requireAdminWorldAuthority(role: AdminEffectiveRole, mutation: AdminWorldRepairMutation): void {
  if (!adminRoleCanMutate(role, mutation.operation) || (role !== 'owner' && role !== 'admin')) {
    fail('admin_role_forbidden');
  }
}

export function planAdminWorldMutation(
  input: AdminWorldState,
  request: AdminWorldMutationRequest,
): AdminWorldMutationPlan {
  const reason = parseAdminReason(String(request.mutation.reason));
  if (!reason.ok) fail(reason.error);
  if (!ADMIN_MUTATION_ID_PATTERN.test(request.mutation.clientMutationId) || request.nowMicros < 0n) fail('admin_invalid_mutation_id');
  const before = cloneAdminWorldState(input);
  const baseVersion = adminWorldVersion(before);
  if (request.expectedWorldVersion !== baseVersion) fail('admin_world_revision_conflict');
  const actions = Object.freeze([...actionsForMutation(before, request)]);
  const after = applyActions(before, actions);
  const diff = diffAdminValues(adminWorldDocument(before), adminWorldDocument(after));
  if (!adminPreviewHasChanges(diff)) fail('admin_no_changes');
  const previewFingerprint = `preview:${fingerprint({
    mutation: { ...request.mutation, dryRun: false, reason: String(reason.value) },
    baseVersion,
    actions,
    after: adminWorldDocument(after),
  })}`;
  if (!request.mutation.dryRun && request.previewFingerprint !== previewFingerprint) fail('admin_preview_required');
  const notice = `An administrator applied ${request.mutation.operation.replaceAll('_', ' ')}.`;
  const target = request.mutation.operation === 'set_space_flags'
    ? { kind: 'space' as const, spaceId: request.mutation.spaceId }
    : request.mutation.operation === 'repair_portal_pair'
      ? { kind: 'entity' as const, entityId: request.mutation.portalId }
      : { kind: 'world' as const };
  const inverseActions = actions.map((action): AdminJsonObject => {
    if (action.kind === 'set_space_flags') {
      // Owner-only keys (chunkAuthority) are not part of an admin snapshot:
      // undo keeps whatever the owner has set at undo time.
      const previous = before.spaces.find(({ spaceId }) => spaceId === action.spaceId)?.flags ?? {};
      return { kind: 'set_space_flags', spaceId: action.spaceId, flags: withoutOwnerOnlySpaceFlags({ ...previous }) };
    }
    if (action.kind === 'insert_portal') return { kind: 'delete_portal', portalId: action.portal.portalId };
    if (action.kind === 'relocate_player') {
      const previous = before.players.find(({ identity }) => identity === action.identity);
      return previous === undefined
        ? { kind: 'restore_position', identity: action.identity, unavailable: true }
        : { kind: 'restore_position', identity: action.identity, spaceId: previous.spaceId,
          tileX: previous.tileX, tileY: previous.tileY };
    }
    if (action.kind === 'clear_custody') {
      const previous = before.custody.find(({ entityKind, entityId }) => (
        entityKind === action.entityKind && entityId === action.entityId
      ));
      return previous === undefined
        ? { kind: 'restore_custody', entityKind: action.entityKind, entityId: action.entityId,
          unavailable: true }
        : { kind: 'restore_custody', entityKind: action.entityKind, entityId: action.entityId,
          holderIdentity: previous.holderIdentity, claims: previous.claims };
    }
    const previous = before.rowReferences.find(({ sourceKind, sourceId }) => (
      sourceKind === action.rowKind && sourceId === action.rowId
    ));
    return { kind: 'restore_reference', rowKind: action.rowKind, rowId: action.rowId,
      ...(previous === undefined ? { unavailable: true } : { reference: { ...previous } }) };
  });
  const audit: AdminAuditPayloadV1 = Object.freeze({
    schemaVersion: 1,
    clientMutationId: request.mutation.clientMutationId,
    target,
    reason: reason.value,
    changes: diff.changes,
    inverse: { operation: 'undo' as const, args: { actions: inverseActions } },
    notice,
  });
  return Object.freeze({
    before, after, actions, baseVersion,
    committedVersion: adminWorldVersion(after), previewFingerprint,
    preview: Object.freeze({
      operation: request.mutation.operation,
      target,
      baseVersion,
      preview: diff,
      warnings: Object.freeze(['Only issues captured by the exact validation report will be changed.']),
      expiresAtMicros: (request.nowMicros + ADMIN_WORLD_REPORT_TTL_MICROS).toString(),
    }),
    audit,
    notice,
  });
}

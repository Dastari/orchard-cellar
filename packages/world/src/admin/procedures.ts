import type { AdminJsonObject } from '@orchard/sim';
import type {
  AdminAuditPayloadV1,
  AdminAuditRow,
  AdminConnectionRow,
  AdminContainerSnapshot,
  AdminEntitySummary,
  AdminHomesteadSnapshot,
  AdminInventoryArea,
  AdminInventorySlot,
  AdminMissingContainerInspection,
  AdminPage,
  AdminPlayerInventory,
  AdminPlayerSnapshot,
  AdminPlayerSummary,
  AdminResolvedStack,
  AdminTelemetrySnapshot,
  AdminValidationIssue,
  AdminWorldValidationReport,
} from './contracts.js';
import { isAdminOperation, parseAdminAuditPayload, parseAdminReason } from './contracts.js';
import { inspectMissingContainerRecovery, type MissingContainerAuditSource,
  type MissingContainerAuthority } from './container-recovery.js';

export type {
  AdminEntitySummary,
  AdminInventoryArea,
  AdminPlayerSummary,
  AdminResolvedStack,
} from './contracts.js';

export const ADMIN_PROCEDURE_PAGE_SIZE = 50;
export const ADMIN_PROCEDURE_SCAN_LIMIT = ADMIN_PROCEDURE_PAGE_SIZE + 1;

export const ADMIN_READ_PROCEDURES = [
  'adminFindPlayers', 'adminPlayerSnapshot', 'adminPlayerInventory',
  'adminContainerContents', 'adminEntitiesInArea', 'adminHomestead',
  'adminMissingContainerRecovery', 'adminEntitiesInAreaPage', 'adminSpaceRegistry',
  'adminAuditPage', 'adminConnectionsPage', 'adminTelemetry', 'adminValidateWorld',
] as const;
export type AdminReadProcedureName = typeof ADMIN_READ_PROCEDURES[number];
export type AdminRowsScannedName = `${AdminReadProcedureName}RowsScanned`;

export interface AdminProcedureExecution<T> {
  readonly result: T;
  readonly rowsScanned: Readonly<Record<AdminRowsScannedName, number>>;
}

export class AdminProcedureError extends Error {
  constructor(readonly code: 'admin_role_forbidden' | 'admin_target_not_found' | 'admin_entity_not_found' | 'admin_invalid_cursor' | 'admin_payload_invalid') {
    super(code); this.name = 'AdminProcedureError';
  }
}

export interface AdminMembershipReadRow {
  readonly role: string;
  readonly blocked: boolean;
  readonly revoked: boolean;
}

export function requireOwnerOrAdminRead(row: AdminMembershipReadRow | null): 'owner' | 'admin' {
  if (row === null || row.blocked || row.revoked || (row.role !== 'owner' && row.role !== 'admin')) {
    throw new AdminProcedureError('admin_role_forbidden');
  }
  return row.role;
}

function execution<T>(name: AdminReadProcedureName, result: T, scanned: number): AdminProcedureExecution<T> {
  return Object.freeze({
    result,
    rowsScanned: Object.freeze(Object.fromEntries(ADMIN_READ_PROCEDURES.map((procedure) => (
      [`${procedure}RowsScanned`, procedure === name ? scanned : 0]
    ))) as Record<AdminRowsScannedName, number>),
  });
}

interface CursorValue { readonly scope: string; readonly offset: number }

export function encodeAdminCursor(scope: string, offset: number): string {
  if (!/^[a-z][a-z0-9_-]{0,47}$/u.test(scope) || !Number.isSafeInteger(offset) || offset < 0) {
    throw new AdminProcedureError('admin_invalid_cursor');
  }
  return `v1:${scope}:${offset}`;
}

export function decodeAdminCursor(cursor: string | null, expectedScope: string): CursorValue {
  if (cursor === null) return { scope: expectedScope, offset: 0 };
  const match = /^v1:([a-z][a-z0-9_-]{0,47}):(0|[1-9][0-9]{0,14})$/u.exec(cursor);
  const offset = match === null ? Number.NaN : Number(match[2]);
  if (match?.[1] !== expectedScope || !Number.isSafeInteger(offset)) throw new AdminProcedureError('admin_invalid_cursor');
  return { scope: expectedScope, offset };
}

export function boundedAdminPage<T>(
  scope: string,
  rows: Iterable<T>,
  cursor: string | null,
  pageSize = ADMIN_PROCEDURE_PAGE_SIZE,
): { readonly page: AdminPage<T>; readonly rowsScanned: number } {
  const { offset } = decodeAdminCursor(cursor, scope);
  const boundedSize = Math.max(1, Math.min(ADMIN_PROCEDURE_PAGE_SIZE, Math.trunc(pageSize)));
  const collected: T[] = [];
  let skipped = 0; let scanned = 0;
  for (const row of rows) {
    if (skipped < offset) { skipped += 1; continue; }
    scanned += 1;
    if (collected.length === boundedSize) break;
    collected.push(row);
  }
  const hasMore = scanned > boundedSize;
  return {
    page: Object.freeze({ rows: Object.freeze(collected), nextCursor: hasMore ? encodeAdminCursor(scope, offset + boundedSize) : null }),
    rowsScanned: scanned,
  };
}

export type AdminPlayerIndexRow = AdminPlayerSummary;

export function buildAdminFindPlayers(
  indexedRows: Iterable<AdminPlayerIndexRow>, query: string, cursor: string | null,
): AdminProcedureExecution<AdminPage<AdminPlayerSummary>> {
  const normalized = query.trim().toLocaleLowerCase('en');
  if (normalized.length > 128) throw new AdminProcedureError('admin_payload_invalid');
  const filtered = function* (): Generator<AdminPlayerSummary> {
    for (const row of indexedRows) {
      if (normalized.length === 0
        || row.displayName.toLocaleLowerCase('en').startsWith(normalized)
        || row.identity.toLocaleLowerCase('en') === normalized) yield Object.freeze({ ...row });
    }
  };
  const { page, rowsScanned } = boundedAdminPage('players', filtered(), cursor);
  return execution('adminFindPlayers', page, rowsScanned);
}

export interface AdminPlayerSnapshotSource {
  readonly summary: AdminPlayerSummary | null;
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
  readonly blocked: boolean;
  readonly revoked: boolean;
  readonly version: string;
  readonly rowsScanned: number;
}

export function buildAdminPlayerSnapshot(source: AdminPlayerSnapshotSource): AdminProcedureExecution<AdminPlayerSnapshot> {
  const player = source.summary;
  if (player === null) throw new AdminProcedureError('admin_target_not_found');
  return execution('adminPlayerSnapshot', Object.freeze({
    identity: player.identity, displayName: player.displayName,
    membership: { role: player.role, grants: player.grants, blocked: source.blocked, revoked: source.revoked },
    online: player.online, position: source.position, spawn: source.spawn,
    walletBronze: source.walletBronze, stats: source.stats, vitals: source.vitals,
    effects: source.effects, skillTracks: source.skillTracks, skillNodes: source.skillNodes,
    quests: source.quests, statistics: source.statistics, homestead: source.homestead,
    dialogue: source.dialogue, mount: source.mount, version: source.version,
  }), source.rowsScanned);
}

export interface AdminInventoryStackRow {
  readonly area: AdminInventoryArea;
  readonly index: number;
  readonly itemKind: string;
  readonly quantity: number;
  readonly durability?: number;
}

export interface AdminItemDefinitionRow {
  readonly itemKind: string;
  readonly displayName: string;
  readonly maxStack: number;
  readonly tags: readonly string[];
}

function resolvedStack(row: AdminInventoryStackRow, definitions: ReadonlyMap<string, AdminItemDefinitionRow>): AdminResolvedStack {
  const definition = definitions.get(row.itemKind);
  return Object.freeze({
    itemKind: row.itemKind, quantity: row.quantity,
    ...(row.durability === undefined ? {} : { durability: row.durability }),
    displayName: definition?.displayName ?? row.itemKind,
    maxStack: definition?.maxStack ?? 1,
    tags: definition?.tags ?? Object.freeze([]),
  });
}

export function buildAdminPlayerInventory(
  identity: string,
  indexedRows: readonly AdminInventoryStackRow[],
  definitions: ReadonlyMap<string, AdminItemDefinitionRow>,
  version: string,
): AdminProcedureExecution<AdminPlayerInventory> {
  if (identity.length === 0) throw new AdminProcedureError('admin_target_not_found');
  const slots: readonly AdminInventorySlot[] = Object.freeze(indexedRows
    .map((row) => ({ slot: { area: row.area, index: row.index }, stack: resolvedStack(row, definitions) }))
    .sort((left, right) => left.slot.area.localeCompare(right.slot.area, 'en') || left.slot.index - right.slot.index));
  return execution('adminPlayerInventory', Object.freeze({ identity, slots, version }), indexedRows.length);
}

export interface AdminContainerSource {
  readonly entityId: string;
  readonly definitionId: string;
  readonly ownerIdentity: string | null;
  readonly position: AdminJsonObject;
  readonly state: AdminJsonObject;
  readonly processor: AdminJsonObject | null;
  readonly slots: readonly (AdminResolvedStack | null)[];
  readonly version: string;
  readonly rowsScanned: number;
}

export function buildAdminContainerContents(source: AdminContainerSource | null): AdminProcedureExecution<AdminContainerSnapshot> {
  if (source === null) throw new AdminProcedureError('admin_entity_not_found');
  return execution('adminContainerContents', Object.freeze({ ...source }), source.rowsScanned);
}

export function buildAdminMissingContainerRecovery(
  source: MissingContainerAuditSource | null,
  entityId: string,
  targetIdentity: string,
  authority: MissingContainerAuthority,
  rowsScanned: number,
): AdminProcedureExecution<AdminMissingContainerInspection> {
  return execution('adminMissingContainerRecovery',
    inspectMissingContainerRecovery(source, entityId, targetIdentity, authority), rowsScanned);
}

export function buildAdminEntitiesInArea(
  indexedRows: Iterable<AdminEntitySummary>,
  bounds: { readonly spaceId: string; readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number },
): AdminProcedureExecution<readonly AdminEntitySummary[]> {
  const width = Math.abs(bounds.x1 - bounds.x0) + 1; const height = Math.abs(bounds.y1 - bounds.y0) + 1;
  if (width * height > 16_384) throw new AdminProcedureError('admin_payload_invalid');
  const x0 = Math.min(bounds.x0, bounds.x1); const x1 = Math.max(bounds.x0, bounds.x1);
  const y0 = Math.min(bounds.y0, bounds.y1); const y1 = Math.max(bounds.y0, bounds.y1);
  const rows: AdminEntitySummary[] = []; let scanned = 0;
  for (const row of indexedRows) {
    scanned += 1;
    if (scanned > 2_048) break;
    if (row.spaceId === bounds.spaceId && row.tileX >= x0 && row.tileX <= x1 && row.tileY >= y0 && row.tileY <= y1) rows.push(row);
  }
  return execution('adminEntitiesInArea', Object.freeze(rows), scanned);
}

export function buildAdminHomestead(source: AdminHomesteadSnapshot | null, rowsScanned: number): AdminProcedureExecution<AdminHomesteadSnapshot> {
  if (source === null) throw new AdminProcedureError('admin_entity_not_found');
  return execution('adminHomestead', Object.freeze({ ...source }), rowsScanned);
}

export interface AdminAuditStorageRow {
  readonly id: string;
  readonly actorIdentity: string;
  readonly action: string;
  readonly value: string;
  readonly occurredAtMicros: string;
  readonly targetKey: string;
  readonly payload: string;
}

function legacyAuditPayload(row: AdminAuditStorageRow): AdminAuditPayloadV1 {
  const reason = parseAdminReason('Legacy administration action');
  if (!reason.ok) throw new AdminProcedureError('admin_payload_invalid');
  return Object.freeze({
    schemaVersion: 1, clientMutationId: `legacy-audit-${row.id}`,
    target: { kind: 'world' }, reason: reason.value,
    changes: [{ path: `/legacy/${row.action.replaceAll('~', '~0').replaceAll('/', '~1')}`, before: { present: false }, after: { present: true, value: row.value } }],
    inverse: null,
  } satisfies AdminAuditPayloadV1);
}

export function adminAuditRow(row: AdminAuditStorageRow): AdminAuditRow {
  const parsed = row.payload.length === 0 ? null : parseAdminAuditPayload(row.payload);
  const payload = parsed?.ok === true ? parsed.value : legacyAuditPayload(row);
  return Object.freeze({
    id: row.id, actorIdentity: row.actorIdentity,
    operation: parsed?.ok === true && isAdminOperation(row.action) ? row.action : 'legacy',
    target: payload.target, occurredAtMicros: row.occurredAtMicros, payload,
  });
}

export function buildAdminAuditPage(
  indexedRows: Iterable<AdminAuditStorageRow>, cursor: string | null,
): AdminProcedureExecution<AdminPage<AdminAuditRow>> {
  const { page, rowsScanned } = boundedAdminPage('audit', indexedRows, cursor);
  return execution('adminAuditPage', Object.freeze({
    rows: Object.freeze(page.rows.map(adminAuditRow)), nextCursor: page.nextCursor,
  }), rowsScanned);
}

export interface AdminConnectionEventRow {
  readonly connectionId: string;
  readonly identity: string;
  readonly eventKind: 'connect' | 'disconnect';
  readonly occurredAtMicros: string;
}

export function buildAdminConnectionsPage(
  indexedRows: Iterable<AdminConnectionEventRow>, identity: string | null, cursor: string | null,
): AdminProcedureExecution<AdminPage<AdminConnectionRow>> {
  const events = [...indexedRows].slice(0, ADMIN_PROCEDURE_SCAN_LIMIT * 2);
  const sessions = new Map<string, AdminConnectionRow>();
  for (const event of events) {
    if (identity !== null && event.identity !== identity) continue;
    const current = sessions.get(event.connectionId);
    if (event.eventKind === 'connect') sessions.set(event.connectionId, {
      connectionId: event.connectionId, identity: event.identity,
      connectedAtMicros: event.occurredAtMicros,
      disconnectedAtMicros: current?.disconnectedAtMicros ?? null,
      remoteAddress: null, active: current?.disconnectedAtMicros === null,
    });
    else sessions.set(event.connectionId, {
      connectionId: event.connectionId, identity: event.identity,
      connectedAtMicros: current?.connectedAtMicros ?? event.occurredAtMicros,
      disconnectedAtMicros: event.occurredAtMicros, remoteAddress: null, active: false,
    });
  }
  const ordered = [...sessions.values()].sort((left, right) => left.connectedAtMicros.localeCompare(right.connectedAtMicros));
  const { page, rowsScanned } = boundedAdminPage('connections', ordered, cursor);
  return execution('adminConnectionsPage', page, Math.min(events.length, rowsScanned * 2));
}

export function buildAdminTelemetry(snapshot: AdminTelemetrySnapshot): AdminProcedureExecution<AdminTelemetrySnapshot> {
  return execution('adminTelemetry', Object.freeze({ ...snapshot }), 0);
}

export interface AdminWorldValidationSource {
  readonly reportId: string;
  readonly worldVersion: string;
  readonly fingerprint?: string;
  readonly expiresAtMicros: string;
  readonly playerPositions: readonly { readonly identity: string; readonly blocked: boolean }[];
  readonly portalIds: ReadonlySet<string>;
  readonly portalPairs: readonly { readonly portalId: string; readonly pairedPortalId: string }[];
  readonly referencedDefinitions: readonly { readonly target: string; readonly definitionId: string }[];
  readonly knownDefinitions: ReadonlySet<string>;
}

export function buildAdminValidateWorld(source: AdminWorldValidationSource): AdminProcedureExecution<AdminWorldValidationReport> {
  const issues: AdminValidationIssue[] = [];
  for (const position of source.playerPositions) if (position.blocked) issues.push({
    code: 'player_inside_collision', severity: 'error', target: { kind: 'player', identity: position.identity },
    message: 'Player position overlaps authority collision.', repairable: true,
  });
  for (const pair of source.portalPairs) if (!source.portalIds.has(pair.pairedPortalId)) issues.push({
    code: 'portal_pair_missing', severity: 'error', target: { kind: 'entity', entityId: pair.portalId },
    message: `Paired portal ${pair.pairedPortalId} does not exist.`, repairable: true,
  });
  for (const reference of source.referencedDefinitions) if (!source.knownDefinitions.has(reference.definitionId)) issues.push({
    code: 'definition_retired', severity: 'warning', target: { kind: 'entity', entityId: reference.target },
    message: `Definition ${reference.definitionId} is absent or retired.`, repairable: false,
  });
  const scanned = source.playerPositions.length + source.portalPairs.length + source.referencedDefinitions.length;
  return execution('adminValidateWorld', Object.freeze({
    reportId: source.reportId, worldVersion: source.worldVersion,
    fingerprint: source.fingerprint ?? `legacy:${source.reportId}:${source.worldVersion}`,
    issues: Object.freeze(issues), expiresAtMicros: source.expiresAtMicros,
  }), scanned);
}

export function stringifyAdminProcedureResult(value: unknown): string {
  return JSON.stringify(value, (_key, candidate: unknown) => typeof candidate === 'bigint' ? candidate.toString() : candidate);
}

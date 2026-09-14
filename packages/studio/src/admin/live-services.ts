import { Identity } from 'spacetimedb';
import type { DbConnection } from '@orchard/world-bindings';
import { diffAdminValues, type AdminJsonObject, type AdminJsonValue } from '@orchard/sim';
import {
  decodeAdminTransportResult,
  type AdminApi,
  type AdminAuditRow,
  type AdminConnectionRow,
  type AdminPage,
  type AdminPlayerInventory,
  type AdminPlayerMutation,
  type AdminPlayerMutationResult,
  type AdminPlayerSnapshot,
  type AdminPlayerSummary,
  type AdminUndoRequest,
} from './api.js';
import type {
  AdminEntityPage,
  AdminEntityQuery,
  AdminEntityRecord,
  AdminObjectMutationResult,
  AdminObjectsApi,
} from './objects-api.js';
import type {
  AdminContainerSnapshot,
  AdminEntityMutation,
  AdminEntitySummary,
  AdminMutationPreview,
  AdminTelemetrySnapshot,
  AdminWorldValidationReport,
} from '../../../world/src/admin/contracts.js';
import type {
  MembershipAdminRow,
  MembershipApi,
  MembershipCommitResult,
  MembershipMutationDraft,
  MembershipPreview,
} from '../tools/membership/model.js';
import type {
  ObserveApi,
  ObserveClientErrorPage,
  ObservePresenceRow,
} from '../tools/observe/model.js';
import type {
  AdminWorldApi,
  AdminWorldControlMutation,
  AdminWorldControlPreview,
  AdminWorldControlResult,
  AdminWorldControlSnapshot,
} from './world-api.js';
import type {
  ChestDisappearedInput,
  MissingContainerInspection,
  MissingContainerPreview,
  MissingContainerRemedyApi,
  MissingContainerResult,
} from '../tools/playbooks/model.js';

type ConnectionProvider = () => DbConnection | null;

interface PreviewEnvelope {
  readonly preview: AdminMutationPreview;
  readonly previewFingerprint: string;
  readonly committedVersion: string;
}

interface CachedReceipt {
  readonly envelope: PreviewEnvelope;
  readonly targetKey: string;
}

interface PlayerMutationCommitResult {
  readonly audit: AdminAuditRow;
  readonly committedVersion: string;
}

interface ClientErrorPayload {
  readonly rows: readonly {
    readonly id: string;
    readonly actorIdentity: string;
    readonly clientMutationId: string;
    readonly kind: string;
    readonly message: string;
    readonly stack: string;
    readonly route: string;
    readonly buildId: string;
    readonly fingerprint: string;
    readonly clientObservedAtMs: string;
    readonly occurredAtMicros: string;
  }[];
  readonly next: { readonly afterMicros: string; readonly afterId: string } | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const isNullableString = (value: unknown): value is string | null => value === null || typeof value === 'string';
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const hasStrings = (value: Record<string, unknown>, keys: readonly string[]): boolean => keys.every((key) => isString(value[key]));
const isAdminJsonValue = (value: unknown): value is AdminJsonValue => value === null || isString(value)
  || isBoolean(value) || isNumber(value) || (Array.isArray(value) && value.every(isAdminJsonValue))
  || (isRecord(value) && Object.values(value).every(isAdminJsonValue));
const isAdminJsonObject = (value: unknown): value is AdminJsonObject => isRecord(value)
  && Object.values(value).every(isAdminJsonValue);
const isMembershipRole = (value: unknown): boolean => ['owner', 'admin', 'moderator', 'friend'].includes(String(value));
const isGrant = (value: unknown): boolean => value === 'content_editor' || value === 'support';
const isTarget = (value: unknown): boolean => isRecord(value) && (
  (value['kind'] === 'player' && isString(value['identity']))
  || (value['kind'] === 'entity' && isString(value['entityId']))
  || (value['kind'] === 'space' && isString(value['spaceId']))
  || value['kind'] === 'world'
);
const isChangePreview = (value: unknown): boolean => isRecord(value) && isBoolean(value['truncated'])
  && Array.isArray(value['changes']) && value['changes'].every((change) => isRecord(change)
    && isString(change['path']) && isAdminJsonValue(change['before']) && isAdminJsonValue(change['after']));
const isResolvedStack = (value: unknown): boolean => isRecord(value)
  && hasStrings(value, ['itemKind', 'displayName']) && isNumber(value['quantity']) && isNumber(value['maxStack'])
  && Array.isArray(value['tags']) && value['tags'].every(isString)
  && (value['durability'] === undefined || isNumber(value['durability']));

function isAdminPage<T>(row: (value: unknown) => value is T): (value: unknown) => value is AdminPage<T> {
  return (value): value is AdminPage<T> => isRecord(value) && Array.isArray(value['rows'])
    && value['rows'].every(row) && isNullableString(value['nextCursor']);
}

const isPlayerSummary = (value: unknown): value is AdminPlayerSummary => isRecord(value)
  && hasStrings(value, ['identity', 'displayName', 'role', 'lastSeenMicros'])
  && isMembershipRole(value['role']) && Array.isArray(value['grants']) && value['grants'].every(isGrant) && isBoolean(value['online'])
  && isNullableString(value['spaceId']) && (value['tileX'] === null || isNumber(value['tileX']))
  && (value['tileY'] === null || isNumber(value['tileY']));

const isPlayerSnapshot = (value: unknown): value is AdminPlayerSnapshot => isRecord(value)
  && hasStrings(value, ['identity', 'displayName', 'walletBronze', 'version'])
  && isRecord(value['membership']) && isMembershipRole(value['membership']['role'])
  && Array.isArray(value['membership']['grants']) && value['membership']['grants'].every(isGrant)
  && isBoolean(value['membership']['blocked']) && isBoolean(value['membership']['revoked']) && isBoolean(value['online'])
  && (value['position'] === null || isAdminJsonObject(value['position']))
  && (value['spawn'] === null || isAdminJsonObject(value['spawn']))
  && isAdminJsonObject(value['stats']) && isAdminJsonObject(value['vitals'])
  && ['effects', 'skillTracks', 'skillNodes', 'quests', 'statistics'].every((key) => Array.isArray(value[key])
    && value[key].every(isAdminJsonObject))
  && ['homestead', 'dialogue', 'mount'].every((key) => value[key] === null || isAdminJsonObject(value[key]));

const isInventory = (value: unknown): value is AdminPlayerInventory => isRecord(value)
  && hasStrings(value, ['identity', 'version']) && Array.isArray(value['slots'])
  && value['slots'].every((entry) => isRecord(entry) && isRecord(entry['slot'])
    && isString(entry['slot']['area']) && isNumber(entry['slot']['index'])
    && (entry['stack'] === null || isResolvedStack(entry['stack'])));

const isConnection = (value: unknown): value is AdminConnectionRow => isRecord(value)
  && hasStrings(value, ['connectionId', 'identity', 'connectedAtMicros'])
  && isNullableString(value['disconnectedAtMicros']) && isNullableString(value['remoteAddress'])
  && isBoolean(value['active']);

const isAudit = (value: unknown): value is AdminAuditRow => isRecord(value)
  && hasStrings(value, ['id', 'actorIdentity', 'operation', 'occurredAtMicros'])
  && isTarget(value['target']) && isRecord(value['payload']) && value['payload']['schemaVersion'] === 1
  && hasStrings(value['payload'], ['clientMutationId', 'reason']) && isTarget(value['payload']['target'])
  && Array.isArray(value['payload']['changes']) && isChangePreview({ changes: value['payload']['changes'], truncated: false });

const isPreview = (value: unknown): value is AdminMutationPreview => isRecord(value)
  && hasStrings(value, ['operation', 'baseVersion', 'expiresAtMicros'])
  && isTarget(value['target']) && isChangePreview(value['preview'])
  && Array.isArray(value['warnings']) && value['warnings'].every(isString);

const isPreviewEnvelope = (value: unknown): value is PreviewEnvelope => isRecord(value)
  && isPreview(value['preview']) && isString(value['previewFingerprint']) && isString(value['committedVersion']);

const isPlayerMutationCommitResult = (value: unknown): value is PlayerMutationCommitResult => isRecord(value)
  && isAudit(value['audit']) && isString(value['committedVersion']);

const isEntitySummary = (value: unknown): value is AdminEntitySummary => isRecord(value)
  && hasStrings(value, ['entityId', 'kind', 'definitionId', 'spaceId'])
  && ['placeable', 'chest', 'npc', 'item', 'resource', 'surface'].includes(String(value['kind']))
  && isNumber(value['tileX']) && isNumber(value['tileY']) && isAdminJsonObject(value['state']);

const isContainer = (value: unknown): value is AdminContainerSnapshot => isRecord(value)
  && hasStrings(value, ['entityId', 'definitionId', 'version'])
  && isNullableString(value['ownerIdentity']) && isAdminJsonObject(value['position']) && isAdminJsonObject(value['state'])
  && (value['processor'] === null || isAdminJsonObject(value['processor']))
  && Array.isArray(value['slots']) && value['slots'].every((stack) => stack === null || isResolvedStack(stack));

const isTelemetry = (value: unknown): value is AdminTelemetrySnapshot => isRecord(value)
  && isString(value['sampledAtMicros']) && isRecord(value['tick']) && isRecord(value['rowsTouched'])
  && isRecord(value['rowsScanned']) && isRecord(value['subscriptions']);

const isValidation = (value: unknown): value is AdminWorldValidationReport => isRecord(value)
  && hasStrings(value, ['reportId', 'worldVersion', 'fingerprint', 'expiresAtMicros']) && Array.isArray(value['issues'])
  && value['issues'].every((issue) => isRecord(issue) && hasStrings(issue, ['code', 'severity', 'message'])
    && (issue['severity'] === 'error' || issue['severity'] === 'warning') && isTarget(issue['target'])
    && isBoolean(issue['repairable']));

const isClientErrors = (value: unknown): value is ClientErrorPayload => isRecord(value)
  && Array.isArray(value['rows']) && value['rows'].every((row) => isRecord(row)
    && hasStrings(row, ['id', 'actorIdentity', 'clientMutationId', 'kind', 'message', 'stack', 'route', 'buildId', 'fingerprint', 'clientObservedAtMs', 'occurredAtMicros']))
  && (value['next'] === null || (isRecord(value['next']) && hasStrings(value['next'], ['afterMicros', 'afterId'])));

const isMissingContainerInspection = (value: unknown): value is MissingContainerInspection => isRecord(value)
  && hasStrings(value, ['entityId', 'targetIdentity', 'summary', 'version'])
  && isBoolean(value['recoverable']) && isNullableString(value['auditId']);

function asIdentity(value: string): Identity {
  try { return Identity.fromString(value); }
  catch { throw new Error('admin_payload_invalid'); }
}

function asInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error('admin_payload_invalid');
  return parsed;
}

function asUnsignedBigInt(value: string): bigint {
  try {
    const parsed = BigInt(value);
    if (parsed < 0n) throw new Error('admin_payload_invalid');
    return parsed;
  } catch {
    throw new Error('admin_payload_invalid');
  }
}

function requiredConnection(provider: ConnectionProvider): DbConnection {
  const connection = provider();
  if (connection === null) throw new Error('not_connected');
  return connection;
}

function commonArgs(mutation: AdminPlayerMutation | AdminEntityMutation, expectedBaseVersion: string, fingerprint: string | null) {
  return {
    reason: mutation.reason,
    clientMutationId: mutation.clientMutationId,
    dryRun: mutation.dryRun,
    expectedBaseVersion,
    previewFingerprint: fingerprint ?? undefined,
  };
}

function membershipVersion(snapshot: AdminPlayerSnapshot): string {
  const { role, grants, blocked, revoked } = snapshot.membership;
  return JSON.stringify([role, [...grants].sort(), blocked, revoked]);
}

function membershipRow(snapshot: AdminPlayerSnapshot): MembershipAdminRow {
  return Object.freeze({
    identity: snapshot.identity,
    displayName: snapshot.displayName,
    role: snapshot.membership.role,
    grants: Object.freeze([...snapshot.membership.grants]),
    blocked: snapshot.membership.blocked,
    revoked: snapshot.membership.revoked,
    // Authority enforces the actual invariant. Conservatively protect owners in
    // the UI because the bounded search procedure cannot prove another owner exists.
    lastActiveOwner: snapshot.membership.role === 'owner',
    version: membershipVersion(snapshot),
  });
}

/** All connected admin tools share this service and therefore the shell's one
 * DbConnection/subscription. It never constructs a connection or stores auth. */
export class StudioLiveAdminServices implements AdminApi, AdminObjectsApi, MembershipApi, ObserveApi,
  MissingContainerRemedyApi {
  readonly source = 'live' as const;
  readonly #receipts = new Map<string, CachedReceipt>();
  readonly #membershipPreviews = new Map<string, MembershipPreview>();
  readonly #missingContainerInspections = new Map<string, MissingContainerInspection>();

  constructor(private readonly connection: ConnectionProvider) {}

  async findPlayers(query: string, cursor: string | null): Promise<AdminPage<AdminPlayerSummary>> {
    const payload = await requiredConnection(this.connection).procedures.adminFindPlayers({ query, cursor: cursor ?? undefined });
    return decodeAdminTransportResult(payload, isAdminPage(isPlayerSummary));
  }

  async playerSnapshot(identity: string): Promise<AdminPlayerSnapshot> {
    const payload = await requiredConnection(this.connection).procedures.adminPlayerSnapshot({ identity });
    return decodeAdminTransportResult(payload, isPlayerSnapshot);
  }

  async playerInventory(identity: string): Promise<AdminPlayerInventory> {
    const payload = await requiredConnection(this.connection).procedures.adminPlayerInventory({ identity });
    return decodeAdminTransportResult(payload, isInventory);
  }

  async connections(identity: string, cursor: string | null): Promise<AdminPage<AdminConnectionRow>> {
    return this.connectionsPage(identity, cursor);
  }

  async mutatePlayer(mutation: AdminPlayerMutation, expectedBaseVersion: string): Promise<AdminPlayerMutationResult> {
    const connection = requiredConnection(this.connection);
    let baseVersion = expectedBaseVersion;
    if (mutation.dryRun && ['give_items', 'remove_items', 'set_slot', 'clear_cursor', 'drain_overflow'].includes(mutation.operation)) {
      baseVersion = (await this.playerInventory(mutation.targetIdentity)).version;
    }
    const cached = this.#receipts.get(mutation.clientMutationId);
    if (!mutation.dryRun && (expectedBaseVersion === '' || cached === undefined)) {
      throw new Error('admin_preview_required');
    }
    await this.callPlayerReducer(connection, mutation, baseVersion, mutation.dryRun ? null : cached?.envelope.previewFingerprint ?? null);
    if (mutation.dryRun) {
      const envelope = await this.readReceipt(mutation.clientMutationId);
      this.#receipts.set(mutation.clientMutationId, { envelope, targetKey: `player:${mutation.targetIdentity}` });
      return Object.freeze({ preview: envelope.preview, committed: false, version: envelope.committedVersion,
        audit: null, notice: null, undoAuditId: null });
    }
    if (cached === undefined) throw new Error('admin_preview_required');
    this.#receipts.delete(mutation.clientMutationId);
    const committed = await this.readPlayerMutationResult(mutation.clientMutationId);
    if (committed.committedVersion !== cached.envelope.committedVersion
      || committed.audit.payload.clientMutationId !== mutation.clientMutationId
      || committed.audit.target.kind !== 'player'
      || committed.audit.target.identity !== mutation.targetIdentity) throw new Error('commit_receipt_mismatch');
    const audit = committed.audit;
    return Object.freeze({ preview: cached.envelope.preview, committed: true,
      version: committed.committedVersion, audit, notice: audit.payload.notice ?? null,
      undoAuditId: audit.payload.inverse === null ? null : audit.id });
  }

  async undoPlayer(request: AdminUndoRequest): Promise<AdminPlayerMutationResult> {
    if (request.expectedBaseVersion === '') throw new Error('admin_world_revision_conflict');
    const connection = requiredConnection(this.connection);
    await connection.reducers.adminUndoPlayer({
      auditId: asUnsignedBigInt(request.auditId),
      identity: asIdentity(request.targetIdentity),
      reason: request.reason,
      clientMutationId: request.clientMutationId,
      expectedBaseVersion: request.expectedBaseVersion,
    });
    const committed = await this.readPlayerMutationResult(request.clientMutationId);
    const audit = committed.audit;
    if (audit.operation !== 'undo'
      || audit.payload.clientMutationId !== request.clientMutationId
      || audit.target.kind !== 'player'
      || audit.target.identity !== request.targetIdentity) throw new Error('commit_receipt_mismatch');
    const preview: AdminMutationPreview = Object.freeze({
      operation: 'undo',
      target: audit.target,
      baseVersion: request.expectedBaseVersion,
      preview: Object.freeze({ changes: audit.payload.changes, truncated: false }),
      warnings: Object.freeze(audit.payload.notice === undefined
        ? [] : ['The affected online player received a notice.']),
      expiresAtMicros: audit.occurredAtMicros,
    });
    return Object.freeze({ preview, committed: true, version: committed.committedVersion,
      audit, notice: audit.payload.notice ?? null, undoAuditId: null });
  }

  async listEntities(query: AdminEntityQuery): Promise<AdminEntityPage> {
    if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 100) throw new Error('admin_payload_invalid');
    const payload = await requiredConnection(this.connection).procedures.adminEntitiesInArea({
      spaceId: query.spaceId, x0: query.x0, y0: query.y0, x1: query.x1, y1: query.y1,
    });
    const rows = decodeAdminTransportResult(payload, (value): value is readonly AdminEntitySummary[] => Array.isArray(value) && value.every(isEntitySummary));
    const text = query.text.trim().toLocaleLowerCase('en-US');
    const matching = rows.filter((row) => query.kinds.includes(row.kind)
      && (text === '' || `${row.entityId} ${row.definitionId}`.toLocaleLowerCase('en-US').includes(text)))
      .sort((left, right) => left.entityId.localeCompare(right.entityId));
    const offset = query.cursor === null ? 0 : Number(query.cursor);
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('admin_invalid_cursor');
    const page = matching.slice(offset, offset + query.limit).map((row): AdminEntityRecord => Object.freeze({
      ...row, ownerIdentity: null, version: '',
    }));
    return Object.freeze({ rows: Object.freeze(page), nextCursor: offset + page.length < matching.length
      ? String(offset + page.length) : null, worldVersion: '', rowsScanned: rows.length });
  }

  async container(entityId: string): Promise<AdminContainerSnapshot> {
    const payload = await requiredConnection(this.connection).procedures.adminContainerContents({ entityId });
    const snapshot = decodeAdminTransportResult(payload, isContainer);
    // The object authority is the sole source of custody versions. Discovery
    // dry-runs intentionally start empty and return an exact receipt.
    return Object.freeze({ ...snapshot, version: '' });
  }

  async inspectMissingContainer(input: ChestDisappearedInput): Promise<MissingContainerInspection> {
    const inspection = decodeAdminTransportResult(
      await requiredConnection(this.connection).procedures.adminMissingContainerRecovery(input),
      isMissingContainerInspection,
    );
    this.#missingContainerInspections.set(`${input.targetIdentity}:${input.entityId}`, inspection);
    return inspection;
  }

  async previewRestoreMissingContainer(input: ChestDisappearedInput & {
    readonly reason: string; readonly clientMutationId: string;
  }): Promise<MissingContainerPreview> {
    const inspection = this.#missingContainerInspections.get(`${input.targetIdentity}:${input.entityId}`);
    if (inspection === undefined || !inspection.recoverable || inspection.auditId === null) {
      throw new Error('container_not_recoverable');
    }
    const connection = requiredConnection(this.connection);
    await connection.reducers.adminRestoreMissingContainer({ entityId: input.entityId,
      targetIdentity: asIdentity(input.targetIdentity), sourceAuditId: asUnsignedBigInt(inspection.auditId),
      reason: input.reason, clientMutationId: input.clientMutationId, dryRun: true,
      expectedBaseVersion: inspection.version, previewFingerprint: undefined });
    const envelope = await this.readReceipt(input.clientMutationId);
    this.#receipts.set(input.clientMutationId, { envelope, targetKey: `entity:${input.entityId}` });
    return Object.freeze({ token: input.clientMutationId, baseVersion: envelope.preview.baseVersion,
      preview: envelope.preview.preview, warnings: envelope.preview.warnings });
  }

  async commitRestoreMissingContainer(input: ChestDisappearedInput & {
    readonly reason: string; readonly clientMutationId: string; readonly token: string;
    readonly expectedBaseVersion: string;
  }): Promise<MissingContainerResult> {
    if (input.clientMutationId !== input.token) throw new Error('admin_preview_required');
    const inspection = this.#missingContainerInspections.get(`${input.targetIdentity}:${input.entityId}`);
    const receipt = this.#receipts.get(input.token);
    if (inspection === undefined || inspection.auditId === null || receipt === undefined
      || receipt.envelope.preview.baseVersion !== input.expectedBaseVersion) throw new Error('admin_preview_required');
    await requiredConnection(this.connection).reducers.adminRestoreMissingContainer({ entityId: input.entityId,
      targetIdentity: asIdentity(input.targetIdentity), sourceAuditId: asUnsignedBigInt(inspection.auditId),
      reason: input.reason, clientMutationId: input.clientMutationId, dryRun: false,
      expectedBaseVersion: input.expectedBaseVersion,
      previewFingerprint: receipt.envelope.previewFingerprint });
    this.#receipts.delete(input.token);
    const audit = await this.findAudit(`entity:${input.entityId}`, input.clientMutationId);
    if (audit === null || audit.operation !== 'restore_missing_container') throw new Error('commit_missing_audit');
    return Object.freeze({ committed: true, version: receipt.envelope.committedVersion,
      auditId: audit.id, notice: audit.payload.notice ?? 'Your missing container was restored.' });
  }

  async verifyRestoredContainer(entityId: string, expectedVersion: string): Promise<boolean> {
    const inspection = [...this.#missingContainerInspections.values()].find((candidate) => candidate.entityId === entityId);
    if (inspection === undefined) return false;
    const current = await this.inspectMissingContainer({ entityId, targetIdentity: inspection.targetIdentity });
    return !current.recoverable && current.summary === 'The container is already present with the exact audited state.'
      && current.version === expectedVersion;
  }

  async mutate(mutation: AdminEntityMutation, expectedBaseVersion: string, previewFingerprint: string | null): Promise<AdminObjectMutationResult> {
    const connection = requiredConnection(this.connection);
    const cached = this.#receipts.get(mutation.clientMutationId);
    if (!mutation.dryRun && (expectedBaseVersion === '' || previewFingerprint === null || cached === undefined)) {
      throw new Error('admin_preview_required');
    }
    await this.callObjectReducer(connection, mutation, expectedBaseVersion,
      mutation.dryRun ? null : previewFingerprint ?? cached?.envelope.previewFingerprint ?? null);
    if (mutation.dryRun) {
      const envelope = await this.readReceipt(mutation.clientMutationId);
      const targetKey = 'entityId' in mutation ? `entity:${mutation.entityId}`
        : 'npcId' in mutation ? `entity:${mutation.npcId}` : `space:${mutation.spaceId}`;
      this.#receipts.set(mutation.clientMutationId, { envelope, targetKey });
      return Object.freeze({ preview: envelope.preview, previewFingerprint: envelope.previewFingerprint,
        committed: false, version: envelope.committedVersion, audit: null, notice: null });
    }
    if (cached === undefined) throw new Error('admin_preview_required');
    this.#receipts.delete(mutation.clientMutationId);
    const audit = await this.findAudit(cached.targetKey, mutation.clientMutationId);
    return Object.freeze({ preview: cached.envelope.preview, previewFingerprint: cached.envelope.previewFingerprint,
      committed: true, version: cached.envelope.committedVersion, audit, notice: audit?.payload.notice ?? null });
  }

  async list(query: string): Promise<readonly MembershipAdminRow[]> {
    const page = await this.findPlayers(query, null);
    const snapshots = await Promise.all(page.rows.slice(0, 50).map(({ identity }) => this.playerSnapshot(identity)));
    return Object.freeze(snapshots.map(membershipRow));
  }

  async preview(targetIdentity: string, mutation: MembershipMutationDraft, reason: string,
    clientMutationId: string, expectedVersion: string): Promise<MembershipPreview> {
    if (reason.trim().length < 8) throw new Error('admin_invalid_reason');
    const before = membershipRow(await this.playerSnapshot(targetIdentity));
    if (before.version !== expectedVersion) throw new Error('admin_world_revision_conflict');
    const after = this.applyMembership(before, mutation);
    const changes = diffAdminValues(
      { role: before.role, grants: before.grants, blocked: before.blocked, revoked: before.revoked },
      { role: after.role, grants: after.grants, blocked: after.blocked, revoked: after.revoked },
    ).changes;
    const result = Object.freeze({ token: clientMutationId, targetIdentity, baseVersion: expectedVersion,
      mutation, preview: Object.freeze({ changes, truncated: false }),
      warnings: Object.freeze(before.lastActiveOwner ? ['Last-owner protection is active.'] : []) });
    this.#membershipPreviews.set(clientMutationId, result);
    return result;
  }

  async commit(preview: MembershipPreview, reason: string): Promise<MembershipCommitResult> {
    const staged = this.#membershipPreviews.get(preview.token);
    if (staged === undefined || JSON.stringify(staged) !== JSON.stringify(preview)) throw new Error('admin_preview_required');
    const current = membershipRow(await this.playerSnapshot(preview.targetIdentity));
    if (current.version !== preview.baseVersion) throw new Error('admin_preview_stale');
    const connection = requiredConnection(this.connection); const identity = asIdentity(preview.targetIdentity);
    const inverse = this.inverseMembership(current, preview.mutation);
    switch (preview.mutation.operation) {
      case 'approve': case 'set_role': await connection.reducers.approveMember({ identity, role: preview.mutation.role }); break;
      case 'revoke': await connection.reducers.revokeMember({ identity, blocked: false }); break;
      case 'set_blocked': {
        if (preview.mutation.blocked) await connection.reducers.revokeMember({ identity, blocked: true });
        else await connection.reducers.approveMember({ identity, role: current.role });
        break;
      }
      case 'grant_content_editor': await connection.reducers.adminGrantContentEditor({ identity, reason, clientMutationId: preview.token }); break;
      case 'revoke_content_editor': await connection.reducers.adminRevokeContentEditor({ identity, reason, clientMutationId: preview.token }); break;
      case 'grant_support': await connection.reducers.adminGrantSupport({ identity, reason, clientMutationId: preview.token }); break;
      case 'revoke_support': await connection.reducers.adminRevokeSupport({ identity, reason, clientMutationId: preview.token }); break;
    }
    this.#membershipPreviews.delete(preview.token);
    return Object.freeze({ row: membershipRow(await this.playerSnapshot(preview.targetIdentity)),
      auditId: `membership:${preview.token}`, inverse });
  }

  async auditPage(filter: Readonly<Record<string, string>>, cursor: string | null): Promise<AdminPage<AdminAuditRow>> {
    const payload = await requiredConnection(this.connection).procedures.adminAuditPage({ filter: JSON.stringify(filter), cursor: cursor ?? undefined });
    return decodeAdminTransportResult(payload, isAdminPage(isAudit));
  }

  async connectionsPage(identity: string | null, cursor: string | null): Promise<AdminPage<AdminConnectionRow>> {
    const payload = await requiredConnection(this.connection).procedures.adminConnectionsPage({ identity: identity ?? undefined, cursor: cursor ?? undefined });
    return decodeAdminTransportResult(payload, isAdminPage(isConnection));
  }

  async presence(): Promise<readonly ObservePresenceRow[]> {
    const connection = requiredConnection(this.connection);
    const positions = new Map([...connection.db.playerPosition.iter()].map((row) => [row.identity.toHexString(), row]));
    return Object.freeze([...connection.db.playerPublic.iter()].slice(0, 500).map((profile) => {
      const position = positions.get(profile.identity.toHexString());
      return Object.freeze({ identity: profile.identity.toHexString(), displayName: profile.displayName,
        spaceId: String(position?.spaceId ?? 0), chunkX: position?.chunkX ?? 0, chunkY: position?.chunkY ?? 0,
        online: profile.online });
    }));
  }

  async telemetry(): Promise<AdminTelemetrySnapshot> {
    return decodeAdminTransportResult(await requiredConnection(this.connection).procedures.adminTelemetry({}), isTelemetry);
  }

  async validateWorld(): Promise<AdminWorldValidationReport> {
    return decodeAdminTransportResult(await requiredConnection(this.connection).procedures.adminValidateWorld({}), isValidation);
  }

  async clientErrors(cursor: { readonly afterMicros: string; readonly afterId: string } | null,
    limit = 100): Promise<ObserveClientErrorPage> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('admin_payload_invalid');
    const payload = await requiredConnection(this.connection).procedures.adminClientErrors({
      afterMicros: BigInt(cursor?.afterMicros ?? '0'), afterId: cursor?.afterId ?? '', limit,
    });
    return decodeAdminTransportResult(payload, isClientErrors);
  }

  private async readReceipt(clientMutationId: string): Promise<PreviewEnvelope> {
    const connection = requiredConnection(this.connection);
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const row = [...connection.db.ownAdminMutationPreviews.iter()]
        .find((candidate) => candidate.clientMutationId === clientMutationId);
      if (row !== undefined) return decodeAdminTransportResult(row.previewJson, isPreviewEnvelope);
      await new Promise<void>((resolve) => { setTimeout(resolve, 25); });
    }
    throw new Error('admin_preview_receipt_unavailable');
  }

  private async findAudit(targetKey: string, clientMutationId: string): Promise<AdminAuditRow | null> {
    const page = await this.auditPage({ targetKey }, null);
    return page.rows.find((row) => row.payload.clientMutationId === clientMutationId) ?? null;
  }

  private async readPlayerMutationResult(clientMutationId: string): Promise<PlayerMutationCommitResult> {
    const payload = await requiredConnection(this.connection).procedures.adminPlayerMutationResult({
      clientMutationId,
    });
    return decodeAdminTransportResult(payload, isPlayerMutationCommitResult);
  }

  private async callPlayerReducer(connection: DbConnection, mutation: AdminPlayerMutation,
    expected: string, fingerprint: string | null): Promise<void> {
    const identity = mutation.targetIdentity === 'all' ? undefined : asIdentity(mutation.targetIdentity);
    const common = { ...commonArgs(mutation, expected, fingerprint), identity };
    switch (mutation.operation) {
      case 'set_wallet': await connection.reducers.adminSetWallet({ ...common, identity: identity!, deltaBronze: mutation.deltaBronze }); break;
      case 'set_stats': await connection.reducers.adminSetStats({ ...common, identity: identity!, patch: {
        str: typeof mutation.patch['str'] === 'number' ? mutation.patch['str'] : undefined,
        dex: typeof mutation.patch['dex'] === 'number' ? mutation.patch['dex'] : undefined,
        con: typeof mutation.patch['con'] === 'number' ? mutation.patch['con'] : undefined,
        int: typeof mutation.patch['int'] === 'number' ? mutation.patch['int'] : undefined,
        wis: typeof mutation.patch['wis'] === 'number' ? mutation.patch['wis'] : undefined,
        cha: typeof mutation.patch['cha'] === 'number' ? mutation.patch['cha'] : undefined,
      } }); break;
      case 'set_vitals': await connection.reducers.adminSetVitals({ ...common, identity: identity!, patch: {
        healthCenti: typeof mutation.patch['healthCenti'] === 'number' ? mutation.patch['healthCenti'] : undefined,
        manaCenti: typeof mutation.patch['manaCenti'] === 'number' ? mutation.patch['manaCenti'] : undefined,
        vigourCenti: typeof mutation.patch['vigourCenti'] === 'number' ? mutation.patch['vigourCenti'] : undefined,
        hungerCenti: typeof mutation.patch['hungerCenti'] === 'number' ? mutation.patch['hungerCenti'] : undefined,
      } }); break;
      case 'grant_skill_points': await connection.reducers.adminGrantSkillPoints({ ...common, identity: identity!, track: mutation.track, points: mutation.points }); break;
      case 'reset_skill_tree': await connection.reducers.adminResetSkillTree({ ...common, identity: identity!, track: mutation.track }); break;
      case 'set_quest_state': await connection.reducers.adminSetQuestState({ ...common, identity: identity!, questId: mutation.questId, state: mutation.state }); break;
      case 'reset_quests': await connection.reducers.adminResetQuests({ ...common, identity: identity! }); break;
      case 'give_items': await connection.reducers.adminGiveItems({ ...common, identity: identity!, stacks: mutation.stacks.map((stack) => ({
        itemKind: stack.itemKind, quantity: stack.quantity, durability: stack.durability,
      })) }); break;
      case 'remove_items': await connection.reducers.adminRemoveItems({ ...common, identity: identity!, stacks: mutation.stacks.map((stack) => ({
        itemKind: stack.itemKind, quantity: stack.quantity, durability: stack.durability,
      })) }); break;
      case 'clear_cursor': await connection.reducers.adminClearCursor({ ...common, identity: identity! }); break;
      case 'drain_overflow': await connection.reducers.adminDrainOverflow({ ...common, identity: identity! }); break;
      case 'set_slot': await connection.reducers.adminSetSlot({ ...common, identity: identity!, area: mutation.slot.area, index: mutation.slot.index,
        stack: mutation.stack === null ? undefined : { itemKind: mutation.stack.itemKind, quantity: mutation.stack.quantity,
          durability: mutation.stack.durability } }); break;
      case 'set_spawn': await connection.reducers.adminSetSpawn({ ...common, identity: identity!, spaceId: asInteger(mutation.spaceId), tileX: mutation.tileX, tileY: mutation.tileY }); break;
      case 'respawn': await connection.reducers.adminRespawn({ ...common, identity: identity! }); break;
      case 'unstick': await connection.reducers.adminUnstick({ ...common, identity: identity! }); break;
      case 'teleport_player': await connection.reducers.adminTeleportPlayer({ ...common, identity: identity!, spaceId: asInteger(mutation.spaceId), tileX: mutation.tileX, tileY: mutation.tileY }); break;
      case 'set_display_name': await connection.reducers.adminSetDisplayName({ ...common, identity: identity!, displayName: mutation.displayName }); break;
      case 'kick': await connection.reducers.adminKick({ ...common, identity: identity!, notice: mutation.notice }); break;
      case 'notify': await connection.reducers.adminNotify({ ...common, identity, notifyAll: mutation.targetIdentity === 'all', body: mutation.body }); break;
    }
  }

  private async callObjectReducer(connection: DbConnection, mutation: AdminEntityMutation,
    expected: string, fingerprint: string | null): Promise<void> {
    const common = commonArgs(mutation, expected, fingerprint);
    switch (mutation.operation) {
      case 'spawn_entity': await connection.reducers.adminSpawnEntity({ ...common, definitionId: mutation.definitionId,
        spaceId: asInteger(mutation.spaceId), tileX: mutation.tileX, tileY: mutation.tileY,
        stateJson: mutation.state === undefined ? undefined : JSON.stringify(mutation.state),
        owner: mutation.ownerIdentity === undefined ? undefined : asIdentity(mutation.ownerIdentity) }); break;
      case 'despawn_entity': await connection.reducers.adminDespawnEntity({ ...common, entityId: mutation.entityId,
        spillContents: mutation.spillContents, destructionReason: mutation.destructionReason }); break;
      case 'move_entity': await connection.reducers.adminMoveEntity({ ...common, entityId: mutation.entityId,
        spaceId: asInteger(mutation.spaceId), tileX: mutation.tileX, tileY: mutation.tileY }); break;
      case 'set_entity_state': await connection.reducers.adminSetEntityState({ ...common, entityId: mutation.entityId,
        patchJson: JSON.stringify(mutation.patch) }); break;
      case 'set_container_slot': await connection.reducers.adminSetContainerSlot({ ...common, entityId: mutation.entityId,
        slot: mutation.slot, stack: mutation.stack === null ? undefined : { itemKind: mutation.stack.itemKind,
          quantity: mutation.stack.quantity, durability: mutation.stack.durability, lit: undefined }, clear: mutation.stack === null }); break;
      case 'repair_entity': await connection.reducers.adminRepairEntity({ ...common, entityId: mutation.entityId }); break;
      case 'replace_entity': await connection.reducers.adminReplaceEntity({ ...common, entityId: mutation.entityId,
        definitionId: mutation.definitionId }); break;
      case 'relocate_npc': await connection.reducers.adminRelocateNpc({ ...common, npcId: mutation.npcId,
        spaceId: asInteger(mutation.spaceId), tileX: mutation.tileX, tileY: mutation.tileY }); break;
      case 'respawn_resources': await connection.reducers.adminRespawnResources({ ...common,
        spaceId: asInteger(mutation.spaceId), x0: mutation.x0, y0: mutation.y0, x1: mutation.x1, y1: mutation.y1 }); break;
    }
  }

  private applyMembership(row: MembershipAdminRow, mutation: MembershipMutationDraft): MembershipAdminRow {
    const grants = new Set(row.grants);
    if (mutation.operation === 'grant_content_editor') grants.add('content_editor');
    if (mutation.operation === 'revoke_content_editor') grants.delete('content_editor');
    if (mutation.operation === 'grant_support') grants.add('support');
    if (mutation.operation === 'revoke_support') grants.delete('support');
    return Object.freeze({ ...row,
      ...(mutation.operation === 'approve' || mutation.operation === 'set_role' ? { role: mutation.role, revoked: false, blocked: false } : {}),
      ...(mutation.operation === 'revoke' ? { revoked: true } : {}),
      ...(mutation.operation === 'set_blocked' ? { blocked: mutation.blocked } : {}),
      grants: Object.freeze([...grants].sort()) });
  }

  private inverseMembership(row: MembershipAdminRow, mutation: MembershipMutationDraft): MembershipMutationDraft | null {
    switch (mutation.operation) {
      case 'approve': case 'set_role': return { operation: 'set_role', role: row.role };
      case 'set_blocked': return { operation: 'set_blocked', blocked: row.blocked };
      case 'grant_content_editor': return { operation: 'revoke_content_editor' };
      case 'revoke_content_editor': return { operation: 'grant_content_editor' };
      case 'grant_support': return { operation: 'revoke_support' };
      case 'revoke_support': return { operation: 'grant_support' };
      case 'revoke': return null;
    }
  }
}

export const liveAdminServicesForTest = Object.freeze({
  isPlayerSummary, isPlayerSnapshot, isInventory, isConnection, isAudit,
  isPreviewEnvelope, isPlayerMutationCommitResult, isEntitySummary, isContainer, isTelemetry, isValidation, isClientErrors,
  isMissingContainerInspection,
});

/** W5 uses the same connection but has a distinct `mutate` interface from U4. */
export class StudioLiveAdminWorldService implements AdminWorldApi {
  readonly source = 'live' as const;
  readonly #receipts = new Map<string, PreviewEnvelope>();
  #validation: AdminWorldValidationReport | null = null;

  constructor(private readonly connection: ConnectionProvider, private readonly objects: AdminObjectsApi) {}

  async snapshot(): Promise<AdminWorldControlSnapshot> {
    const connection = requiredConnection(this.connection);
    const report = this.#validation ?? await this.validateWorld();
    const flags = new Map([...connection.db.spaceAdminFlag.iter()].map((row) => {
      let value: unknown;
      try { value = JSON.parse(row.flagsJson) as unknown; } catch { value = {}; }
      return [String(row.spaceId), isAdminJsonObject(value) ? value : {}] as const;
    }));
    const homes = [...connection.db.homestead.iter()].slice(0, 100);
    const spaceIds = new Set(['0', ...homes.map((home) => String(home.spaceId)), ...flags.keys()]);
    const portals = [...connection.db.spacePortal.iter()].slice(0, 100);
    const reverseKeys = new Set(portals.map((row) => `${row.fromSpace}:${row.fromTileX}:${row.fromTileY}:${row.toSpace}:${row.toTileX}:${row.toTileY}`));
    const environment = [...connection.db.worldEnvironment.iter()][0];
    const wind = [...connection.db.worldWind.iter()][0];
    const motd = [...connection.db.ownConnectionNotices.iter()].find((row) => row.kind === 'motd')?.body ?? '';
    const head = connection.db.liveMapDocument.mapId.find('live-island');
    return Object.freeze({
      worldVersion: report.worldVersion,
      spaces: Object.freeze([...spaceIds].slice(0, 100).map((spaceId) => Object.freeze({
        spaceId, label: spaceId === '0' ? 'Topside' : homes.find((home) => String(home.spaceId) === spaceId)?.ownerName ?? `Space ${spaceId}`,
        sizeTiles: spaceId === '0' ? 128 : 48, flags: flags.get(spaceId) ?? {},
      }))),
      portals: Object.freeze(portals.map((row) => Object.freeze({ portalId: String(row.id), fromSpace: String(row.fromSpace),
        toSpace: String(row.toSpace), paired: reverseKeys.has(`${row.toSpace}:${row.toTileX}:${row.toTileY}:${row.fromSpace}:${row.fromTileX}:${row.fromTileY}`) }))),
      environment: Object.freeze({ calendarTick: String(environment?.calendarTick ?? 0n), weatherMode: environment?.weatherMode ?? 'auto',
        windDirection: wind?.direction ?? 'auto', motd }),
      mapRevisions: Object.freeze(head === undefined || head === null ? [] : [{ revisionId: String(head.revision), revision: head.revision, label: 'Current' }]),
      homesteads: Object.freeze(homes.map((home) => Object.freeze({ spaceId: String(home.spaceId), ownerName: home.ownerName,
        tileX: home.overworldTileX, tileY: home.overworldTileY }))),
    });
  }

  async validateWorld(): Promise<AdminWorldValidationReport> {
    const report = decodeAdminTransportResult(
      await requiredConnection(this.connection).procedures.adminValidateWorld({}), isValidation,
    );
    this.#validation = report;
    return report;
  }

  async mutate(mutation: AdminWorldControlMutation, expectedWorldVersion: string,
    previewFingerprint: string | null, reportFingerprint: string | null): Promise<AdminWorldControlResult> {
    if (mutation.draft.operation === 'respawn_resources') {
      const draft = mutation.draft;
      const result = await this.objects.mutate({ operation: 'respawn_resources', spaceId: draft.spaceId,
        x0: draft.x0, y0: draft.y0, x1: draft.x1, y1: draft.y1, reason: mutation.reason,
        clientMutationId: mutation.clientMutationId, dryRun: mutation.dryRun },
      mutation.dryRun ? '' : expectedWorldVersion, previewFingerprint);
      const preview = Object.freeze({ ...result.preview, operation: 'respawn_resources' as const,
        fingerprint: result.previewFingerprint });
      if (result.committed) this.#validation = null;
      return Object.freeze({ preview, committed: result.committed, worldVersion: result.version,
        auditId: result.audit?.id ?? null, notice: result.notice });
    }
    if (!mutation.dryRun && (expectedWorldVersion === '' || previewFingerprint === null
      || !this.#receipts.has(mutation.clientMutationId))) throw new Error('admin_preview_required');
    const connection = requiredConnection(this.connection);
    const discoversWorldControlVersion = mutation.dryRun && (
      mutation.draft.operation === 'set_time' || mutation.draft.operation === 'set_weather'
      || mutation.draft.operation === 'set_wind' || mutation.draft.operation === 'set_motd'
      || mutation.draft.operation === 'global_notice' || mutation.draft.operation === 'restore_map'
      || mutation.draft.operation === 'move_homestead'
    );
    const common = { reason: mutation.reason, clientMutationId: mutation.clientMutationId, dryRun: mutation.dryRun,
      expectedWorldVersion: discoversWorldControlVersion ? '' : expectedWorldVersion,
      previewFingerprint: previewFingerprint ?? undefined };
    if (mutation.draft.operation === 'set_space_flags') await connection.reducers.adminSetSpaceFlags({ ...common,
      spaceId: asInteger(mutation.draft.spaceId), patchJson: JSON.stringify(mutation.draft.patch) });
    else if (mutation.draft.operation === 'repair_portal_pair') await connection.reducers.adminRepairPortalPair({ ...common,
      portalId: asInteger(mutation.draft.portalId) });
    else if (mutation.draft.operation === 'run_world_repair') await connection.reducers.adminRunWorldRepair({ ...common,
      reportId: mutation.draft.reportId, reportFingerprint: reportFingerprint ?? '' });
    else if (mutation.draft.operation === 'set_time') await connection.reducers.adminSetTime({ ...common,
      calendarTick: asUnsignedBigInt(mutation.draft.calendarTick) });
    else if (mutation.draft.operation === 'set_weather') await connection.reducers.adminSetWeather({ ...common,
      weatherMode: mutation.draft.weatherMode });
    else if (mutation.draft.operation === 'set_wind') await connection.reducers.adminSetWind({ ...common,
      direction: mutation.draft.direction });
    else if (mutation.draft.operation === 'set_motd') await connection.reducers.adminSetMotd({ ...common,
      body: mutation.draft.body });
    else if (mutation.draft.operation === 'global_notice') await connection.reducers.adminGlobalNotice({ ...common,
      body: mutation.draft.body });
    else if (mutation.draft.operation === 'restore_map') await connection.reducers.adminRestoreMap({ ...common,
      revisionId: asUnsignedBigInt(mutation.draft.revisionId) });
    else await connection.reducers.adminMoveHomesteadExact({ ...common,
      spaceId: asInteger(mutation.draft.spaceId), tileX: mutation.draft.tileX, tileY: mutation.draft.tileY });
    if (mutation.dryRun) {
      const envelope = await this.readReceipt(mutation.clientMutationId);
      this.#receipts.set(mutation.clientMutationId, envelope);
      return Object.freeze({ preview: this.worldPreview(envelope), committed: false,
        worldVersion: envelope.committedVersion, auditId: null, notice: null });
    }
    const envelope = this.#receipts.get(mutation.clientMutationId)!;
    this.#receipts.delete(mutation.clientMutationId); this.#validation = null;
    const targetKey = mutation.draft.operation === 'set_space_flags' || mutation.draft.operation === 'move_homestead'
      ? `space:${mutation.draft.spaceId}` : 'world';
    const audit = await this.findAudit(targetKey, mutation.clientMutationId);
    return Object.freeze({ preview: this.worldPreview(envelope), committed: true,
      worldVersion: envelope.committedVersion, auditId: audit?.id ?? null, notice: audit?.payload.notice ?? null });
  }

  private worldPreview(envelope: PreviewEnvelope): AdminWorldControlPreview {
    return Object.freeze({ ...envelope.preview,
      operation: envelope.preview.operation as AdminWorldControlPreview['operation'], fingerprint: envelope.previewFingerprint });
  }

  private async readReceipt(clientMutationId: string): Promise<PreviewEnvelope> {
    const connection = requiredConnection(this.connection);
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const row = [...connection.db.ownAdminMutationPreviews.iter()].find((candidate) => candidate.clientMutationId === clientMutationId);
      if (row !== undefined) return decodeAdminTransportResult(row.previewJson, isPreviewEnvelope);
      await new Promise<void>((resolve) => { setTimeout(resolve, 25); });
    }
    throw new Error('admin_preview_receipt_unavailable');
  }

  private async findAudit(targetKey: string, clientMutationId: string): Promise<AdminAuditRow | null> {
    const payload = await requiredConnection(this.connection).procedures.adminAuditPage({ filter: JSON.stringify({ targetKey }), cursor: undefined });
    const page = decodeAdminTransportResult(payload, isAdminPage(isAudit));
    return page.rows.find((row) => row.payload.clientMutationId === clientMutationId) ?? null;
  }
}

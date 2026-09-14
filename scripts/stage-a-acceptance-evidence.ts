import { createHash } from 'node:crypto';

export const STAGE_A_EVIDENCE_VERSION = 1 as const;

export interface StageAObservation {
  readonly label: string;
  readonly identity: string;
  readonly connectedAt: string;
  readonly subscriptionAppliedAt: string;
  readonly mapRows: readonly unknown[];
  readonly contentHeadRows: readonly unknown[];
  readonly contentDefinitionRows: readonly unknown[];
  readonly genericChestRows: readonly unknown[];
  readonly playerPublicRows: readonly unknown[];
  readonly playerPositionRows: readonly unknown[];
}

export interface StageAEvidenceInput {
  readonly database: string;
  readonly host: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly initial: readonly StageAObservation[];
  readonly reconnected: readonly StageAObservation[];
}

export interface StageARedactedClientEvidence {
  readonly client: string;
  readonly identityHash: string;
  readonly connectedAt: string;
  readonly subscriptionAppliedAt: string;
  readonly mapRevision: string;
  readonly mapContentHash: string;
  readonly mapRowsHash: string;
  readonly contentRevision: string;
  readonly contentHash: string;
  readonly contentDefinitionCount: number;
  readonly contentRowsHash: string;
  readonly genericChestCount: number;
  readonly genericChestRowsHash: string;
  readonly playerPublicRowsHash: string;
  readonly playerPositionRowsHash: string;
}

export interface StageAAcceptanceEvidence {
  readonly schemaVersion: typeof STAGE_A_EVIDENCE_VERSION;
  readonly status: 'read_only_preflight_passed';
  readonly startedAt: string;
  readonly completedAt: string;
  readonly databaseHash: string;
  readonly hostHash: string;
  readonly distinctIdentityCount: number;
  readonly requiredSurfaces: readonly string[];
  readonly initial: readonly StageARedactedClientEvidence[];
  readonly reconnected: readonly StageARedactedClientEvidence[];
  readonly assertions: {
    readonly distinctIdentities: true;
    readonly reconnectIdentityStable: true;
    readonly sameLiveMapHead: true;
    readonly sameLiveContentHead: true;
    readonly sameGenericChestVisibility: true;
    readonly reconnectParity: true;
    readonly legacyChestSurfaceSubscribed: false;
  };
  readonly externalScenarios: {
    readonly visualCanvasReview: { readonly status: 'not_run'; readonly evidence: null };
    readonly mutableAdminAndUndo: { readonly status: 'not_run'; readonly evidence: null };
    readonly contentPublishUseRollback: { readonly status: 'not_run'; readonly evidence: null };
    readonly twoClientGameplayInteraction: { readonly status: 'not_run'; readonly evidence: null };
  };
}

const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object'
  && !Array.isArray(value) ? value as Record<string, unknown> : null;

function identityHex(value: unknown): string | null {
  const method = record(value)?.['toHexString'];
  if (typeof method !== 'function') return null;
  const result = Reflect.apply(method, value, []) as unknown;
  return typeof result === 'string' ? result : null;
}

function normalized(value: unknown): unknown {
  if (typeof value === 'bigint') return { $bigint: value.toString() };
  if (value instanceof Uint8Array) return { $bytes: Buffer.from(value).toString('hex') };
  if (Array.isArray(value)) return value.map(normalized);
  const identity = identityHex(value);
  if (identity !== null) return { $identityHash: sha256(identity) };
  const source = record(value);
  if (source === null) return value;
  if (typeof source['microsSinceUnixEpoch'] === 'bigint') {
    return { $timestampMicros: source['microsSinceUnixEpoch'].toString() };
  }
  return Object.fromEntries(Object.entries(source).filter(([, child]) => child !== undefined
    && typeof child !== 'function').sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => [key, normalized(child)]));
}

function normalizedRows(rows: readonly unknown[], omit: readonly string[] = []): readonly unknown[] {
  return rows.map((row) => {
    const source = record(row);
    return source === null ? normalized(row) : normalized(Object.fromEntries(Object.entries(source)
      .filter(([key]) => !omit.includes(key))));
  }).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function rowsHash(rows: readonly unknown[], omit: readonly string[] = []): string {
  return sha256(JSON.stringify(normalizedRows(rows, omit)));
}

function exactRow(rows: readonly unknown[], name: string): Record<string, unknown> {
  if (rows.length !== 1 || record(rows[0]) === null) throw new Error(`stage_a_required_singleton:${name}`);
  return record(rows[0])!;
}

function rowIdentity(row: Record<string, unknown>): string | null {
  return typeof row['identity'] === 'string' ? row['identity'] : identityHex(row['identity']);
}

function revision(value: unknown, name: string): string {
  if (typeof value === 'bigint' || typeof value === 'number' || typeof value === 'string') return String(value);
  throw new Error(`stage_a_revision_missing:${name}`);
}

function redacted(observation: StageAObservation, client: string): StageARedactedClientEvidence {
  const map = exactRow(observation.mapRows, 'liveMapDocument');
  const head = exactRow(observation.contentHeadRows, 'contentHead');
  if (map['mapId'] !== 'live-island' || head['packId'] !== 'live') {
    throw new Error('stage_a_live_head_scope_mismatch');
  }
  const playerPublic = exactRow(observation.playerPublicRows, 'playerPublic');
  const playerPosition = exactRow(observation.playerPositionRows, 'playerPosition');
  if (rowIdentity(playerPublic) !== observation.identity || rowIdentity(playerPosition) !== observation.identity) {
    throw new Error('stage_a_player_identity_scope_mismatch');
  }
  if (observation.contentDefinitionRows.length < 1) throw new Error('stage_a_content_definitions_missing');
  if (observation.genericChestRows.length < 1) throw new Error('stage_a_generic_chest_missing');
  for (const row of observation.genericChestRows) {
    const source = record(row);
    if (source === null || (source['definitionId'] !== 'object:chest' && source['kind'] !== 'chest')) {
      throw new Error('stage_a_non_generic_chest_row');
    }
  }
  const declaredDefinitions = Number(head['definitionCount']);
  if (!Number.isSafeInteger(declaredDefinitions) || declaredDefinitions !== observation.contentDefinitionRows.length) {
    throw new Error('stage_a_content_definition_count_mismatch');
  }
  if (typeof map['contentHash'] !== 'string' || typeof head['contentHash'] !== 'string') {
    throw new Error('stage_a_head_hash_missing');
  }
  return Object.freeze({ client, identityHash: sha256(observation.identity), connectedAt: observation.connectedAt,
    subscriptionAppliedAt: observation.subscriptionAppliedAt, mapRevision: revision(map['revision'], 'map'),
    mapContentHash: map['contentHash'], mapRowsHash: rowsHash(observation.mapRows),
    contentRevision: revision(head['revision'], 'content'), contentHash: head['contentHash'],
    contentDefinitionCount: observation.contentDefinitionRows.length,
    contentRowsHash: rowsHash(observation.contentDefinitionRows),
    genericChestCount: observation.genericChestRows.length,
    genericChestRowsHash: rowsHash(observation.genericChestRows),
    playerPublicRowsHash: rowsHash(observation.playerPublicRows, ['online', 'lastActiveAtMicros']),
    playerPositionRowsHash: rowsHash(observation.playerPositionRows),
  });
}

function sharedKey(row: StageARedactedClientEvidence): string {
  return JSON.stringify([row.mapRevision, row.mapContentHash, row.mapRowsHash, row.contentRevision,
    row.contentHash, row.contentDefinitionCount, row.contentRowsHash, row.genericChestCount, row.genericChestRowsHash]);
}

function requireSame(rows: readonly StageARedactedClientEvidence[], error: string): void {
  if (new Set(rows.map(sharedKey)).size !== 1) throw new Error(error);
}

const SENSITIVE_KEY = /^(?:identity|token|accessToken|refreshToken|idToken|authorization)$/iu;
export function assertStageAEvidenceRedacted(value: unknown): void {
  if (Array.isArray(value)) { for (const child of value) assertStageAEvidenceRedacted(child); return; }
  const source = record(value); if (source === null) return;
  for (const [key, child] of Object.entries(source)) {
    if (SENSITIVE_KEY.test(key)) throw new Error(`stage_a_evidence_sensitive_field:${key}`);
    assertStageAEvidenceRedacted(child);
  }
}

export function buildStageAAcceptanceEvidence(input: StageAEvidenceInput): StageAAcceptanceEvidence {
  if (input.initial.length < 2 || input.reconnected.length !== input.initial.length) {
    throw new Error('stage_a_two_clients_required');
  }
  const labels = input.initial.map(({ label }) => label);
  if (new Set(labels).size !== labels.length || new Set(input.initial.map(({ identity }) => identity)).size !== input.initial.length) {
    throw new Error('stage_a_distinct_identities_required');
  }
  const reconnectByLabel = new Map(input.reconnected.map((row) => [row.label, row]));
  for (const first of input.initial) {
    const second = reconnectByLabel.get(first.label);
    if (second === undefined || second.identity !== first.identity) throw new Error('stage_a_reconnect_identity_drift');
  }
  const initial = Object.freeze(input.initial.map((row, index) => redacted(row, `client-${index + 1}`)));
  const reconnected = Object.freeze(labels.map((label, index) => redacted(reconnectByLabel.get(label)!, `client-${index + 1}`)));
  requireSame(initial, 'stage_a_initial_shared_surface_mismatch');
  requireSame(reconnected, 'stage_a_reconnected_shared_surface_mismatch');
  for (let index = 0; index < initial.length; index += 1) {
    const before = initial[index]!; const after = reconnected[index]!;
    if (before.identityHash !== after.identityHash || sharedKey(before) !== sharedKey(after)
      || before.playerPublicRowsHash !== after.playerPublicRowsHash
      || before.playerPositionRowsHash !== after.playerPositionRowsHash) throw new Error('stage_a_reconnect_parity_failed');
  }
  const evidence: StageAAcceptanceEvidence = Object.freeze({ schemaVersion: STAGE_A_EVIDENCE_VERSION,
    status: 'read_only_preflight_passed', startedAt: input.startedAt, completedAt: input.completedAt,
    databaseHash: sha256(input.database), hostHash: sha256(input.host), distinctIdentityCount: initial.length,
    requiredSurfaces: Object.freeze(['liveMapDocument', 'contentHead', 'contentDefinition', 'worldPlaceable:generic-chest',
      'playerPublic:self', 'playerPosition:self']), initial, reconnected,
    assertions: Object.freeze({ distinctIdentities: true, reconnectIdentityStable: true, sameLiveMapHead: true,
      sameLiveContentHead: true, sameGenericChestVisibility: true, reconnectParity: true,
      legacyChestSurfaceSubscribed: false }),
    externalScenarios: Object.freeze({
      visualCanvasReview: Object.freeze({ status: 'not_run' as const, evidence: null }),
      mutableAdminAndUndo: Object.freeze({ status: 'not_run' as const, evidence: null }),
      contentPublishUseRollback: Object.freeze({ status: 'not_run' as const, evidence: null }),
      twoClientGameplayInteraction: Object.freeze({ status: 'not_run' as const, evidence: null }),
    }),
  });
  assertStageAEvidenceRedacted(evidence);
  return evidence;
}

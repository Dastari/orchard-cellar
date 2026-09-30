import { open, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { decodeJwtClaims, validateIdTokenClaims, verifyIdTokenSignature } from '@orchard/auth/oidc-token';
import { DbConnection, tables } from '@orchard/world-bindings';
import { Identity, Timestamp } from 'spacetimedb';
import {
  REQUIRED_REJOIN_TABLES,
  WORLD_REJOIN_EXCLUSIONS,
  WORLD_REJOIN_SNAPSHOT_VERSION,
  assertGenericOnlyRejoinContract,
  assertNoCredentialMaterial,
  assertRejoinTableCoverage,
  compareWorldRejoinSnapshots,
  normalizeRejoinTables,
  parseWorldRejoinSnapshot,
  type WorldRejoinIdentitySnapshot,
  type WorldRejoinSnapshot,
} from './world-rejoin-snapshot.js';
import {
  refreshRejoinCredentialFile,
  type RejoinCredential,
  type StoredRejoinCredential,
} from './world-rejoin-credentials.js';

const HOST = process.env['SPACETIMEDB_HOST'] ?? 'http://127.0.0.1:3000';
const DATABASE = process.env['SPACETIMEDB_DATABASE'] ?? 'orchard-cellar-world';
const TIMEOUT_MS = 40_000;

interface ConnectedIdentity {
  readonly connection: DbConnection;
  readonly identity: Identity;
}

function timeout<T>(label: string, promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}_timeout`)), TIMEOUT_MS);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error: unknown) => { clearTimeout(timer); reject(error); },
    );
  });
}

async function refreshCredential(credential: Required<Pick<StoredRejoinCredential, 'clientId' | 'refreshToken'>>) {
  const issuer = process.env['OIDC_ISSUER'] ?? 'https://auth.orchard.dastari.net/realms/orchard';
  const endpoint = new URL(`${issuer.replace(/\/$/u, '')}/protocol/openid-connect/token`);
  if (endpoint.protocol !== 'https:'
    && !(process.env['ALLOW_LOOPBACK_REJOIN_OIDC'] === '1' && ['127.0.0.1', 'localhost'].includes(endpoint.hostname))) {
    throw new Error('rejoin_refresh_requires_https');
  }
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token', client_id: credential.clientId, refresh_token: credential.refreshToken,
    }),
  });
  if (!response.ok) throw new Error(`rejoin_refresh_failed:${response.status}`);
  const payload = await response.json() as Record<string, unknown>;
  if (typeof payload['id_token'] !== 'string') throw new Error('rejoin_refresh_invalid_response');
  return {
    token: payload['id_token'],
    refreshToken: typeof payload['refresh_token'] === 'string' ? payload['refresh_token'] : credential.refreshToken,
  };
}

/** Shared, locked rotation path for long-running release/history tools. */
export async function refreshRejoinCredentials(path: string): Promise<readonly RejoinCredential[]> {
  const resolved = await refreshRejoinCredentialFile({
    path,
    refresh: refreshCredential,
    validate: async (token, clientId) => {
      const issuer = (process.env['OIDC_ISSUER'] ?? 'https://auth.orchard.dastari.net/realms/orchard').replace(/\/$/u, '');
      await verifyIdTokenSignature(token, `${issuer}/protocol/openid-connect/certs`);
      validateIdTokenClaims(decodeJwtClaims(token), undefined, Date.now(), issuer, clientId);
    },
    requireRefresh: process.env['WORLD_REJOIN_REQUIRE_REFRESH'] === '1',
  });
  return resolved.credentials;
}

async function credentials(): Promise<readonly RejoinCredential[]> {
  const path = process.env['WORLD_REJOIN_TOKENS_FILE'];
  if (path !== undefined) return refreshRejoinCredentials(path);
  const token = process.env['WORLD_REJOIN_TOKEN'];
  if (token === undefined || token.length === 0) throw new Error('WORLD_REJOIN_TOKENS_FILE_required');
  return [{ label: process.env['WORLD_REJOIN_LABEL'] ?? 'operator', token }];
}

/** The generated bindings expose every table the continuity invariant requires (checked before any credential). */
export function assertCurrentBindings(): void {
  const querySurface = tables as unknown as Record<string, unknown>;
  assertRejoinTableCoverage(new Set(REQUIRED_REJOIN_TABLES
    .map(({ accessor }) => accessor)
    .filter((accessor) => querySurface[accessor === 'liveMapDocument' ? 'liveMapHead' : accessor] !== undefined)));
}

export type RejoinMapTransport = 'digest' | 'legacy-public';

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

/** V10 deployed schema decides transport; a failed/private new view never permits a legacy read. */
export function rejoinMapTransport(schema: unknown): RejoinMapTransport {
  const sections = object(schema)?.['sections'];
  if (!Array.isArray(sections)) throw new Error('rejoin_map_schema_invalid');
  const section = (name: string): unknown => {
    const matches = sections.filter(value => object(value)?.[name] !== undefined);
    if (matches.length > 1) throw new Error('rejoin_map_schema_invalid');
    return object(matches[0])?.[name];
  };
  const definitions = section('Tables');
  const viewDefinitions = section('Views') ?? [];
  const names = object(section('ExplicitNames'))?.['entries'];
  if (!Array.isArray(definitions) || !Array.isArray(viewDefinitions) || !Array.isArray(names)) throw new Error('rejoin_map_schema_invalid');
  const canonical = (kind: string, value: unknown): string => {
    const source = object(value)?.['source_name'];
    if (typeof source !== 'string') throw new Error('rejoin_map_schema_invalid');
    const aliases = names.map(entry => object(object(entry)?.[kind])).filter(entry => entry?.['source_name'] === source);
    if (aliases.length > 1) throw new Error('rejoin_map_schema_invalid');
    const name = aliases.length === 0 ? source : aliases[0]?.['canonical_name'];
    if (typeof name !== 'string') throw new Error('rejoin_map_schema_invalid');
    return name;
  };
  const digest = viewDefinitions.filter(value => canonical('Function', value) === 'live_map_head');
  if (digest.length > 0) {
    if (digest.length !== 1 || object(digest[0])?.['is_public'] !== true || object(digest[0])?.['is_anonymous'] !== true) {
      throw new Error('rejoin_map_digest_not_public');
    }
    return 'digest';
  }
  const legacy = definitions.filter(value => canonical('Table', value) === 'live_map_document');
  const access = object(object(legacy[0])?.['table_access']);
  if (legacy.length !== 1 || access === null || Object.keys(access).length !== 1 || !Array.isArray(access['Public']) || access['Public'].length !== 0) {
    throw new Error('rejoin_map_public_transport_missing');
  }
  return 'legacy-public';
}

const LEGACY_MAP_COLUMNS = ['map_id', 'revision', 'content_hash', 'document_json', 'asset_registry_revision', 'client_mutation_id', 'updated_by', 'updated_at'] as const;
export const LEGACY_MAP_SQL = `SELECT ${LEGACY_MAP_COLUMNS.join(', ')} FROM live_map_document`;

/** Fixed legacy public row wire contract; never a generic private-table SQL reader. */
export function legacyMapRowsFromSql(payload: unknown): readonly unknown[] {
  if (!Array.isArray(payload) || payload.length !== 1) throw new Error('rejoin_map_sql_invalid');
  const result = object(payload[0]);
  const elements = object(result?.['schema'])?.['elements'];
  const rows = result?.['rows'];
  if (!Array.isArray(elements) || elements.length !== LEGACY_MAP_COLUMNS.length || !Array.isArray(rows)) throw new Error('rejoin_map_sql_invalid');
  const scalar = (tag: string) => ({ [tag]: [] });
  const product = (name: string, tag: string) => ({ Product: { elements: [{ name: { some: name }, algebraic_type: scalar(tag) }] } });
  const types = [scalar('String'), scalar('U32'), scalar('String'), scalar('String'), scalar('String'), scalar('String'),
    product('__identity__', 'U256'), product('__timestamp_micros_since_unix_epoch__', 'I64')];
  for (const [index, element] of elements.entries()) {
    if (object(object(element)?.['name'])?.['some'] !== LEGACY_MAP_COLUMNS[index]
      || JSON.stringify(object(element)?.['algebraic_type']) !== JSON.stringify(types[index])) throw new Error('rejoin_map_sql_invalid');
  }
  return rows.map(value => {
    if (!Array.isArray(value) || value.length !== LEGACY_MAP_COLUMNS.length || ![0, 2, 3, 4, 5].every(index => typeof value[index] === 'string')
      || !Number.isInteger(value[1]) || value[1] < 0 || value[1] > 0xffff_ffff) throw new Error('rejoin_map_sql_invalid');
    const actor = value[6]; const time = value[7];
    if (!Array.isArray(actor) || actor.length !== 1 || typeof actor[0] !== 'string' || !/^0x[0-9a-f]{64}$/iu.test(actor[0])
      || !Array.isArray(time) || time.length !== 1 || !(typeof time[0] === 'number' && Number.isSafeInteger(time[0])
        || typeof time[0] === 'string' && /^-?\d+$/u.test(time[0]))) throw new Error('rejoin_map_sql_invalid');
    const micros = BigInt(time[0]);
    if (micros < -(1n << 63n) || micros >= 1n << 63n) throw new Error('rejoin_map_sql_invalid');
    return { mapId: value[0], revision: value[1], contentHash: value[2], documentJson: value[3], assetRegistryRevision: value[4],
      clientMutationId: value[5], updatedBy: Identity.fromString(actor[0]), updatedAt: new Timestamp(micros) };
  });
}

async function mapTransportJson(credential: RejoinCredential, kind: 'schema' | 'legacy'): Promise<unknown> {
  const response = await fetch(`${HOST}/v1/database/${encodeURIComponent(DATABASE)}/${kind === 'schema' ? 'schema?version=10' : 'sql'}`, {
    method: kind === 'schema' ? 'GET' : 'POST', headers: { Authorization: `Bearer ${credential.token}`, 'Content-Type': 'text/plain' },
    ...(kind === 'schema' ? {} : { body: LEGACY_MAP_SQL }), signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`rejoin_map_${kind}_rejected:${response.status}`);
  const reader = response.body?.getReader();
  if (reader === undefined) throw new Error(`rejoin_map_${kind}_invalid`);
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16 * 1024 * 1024) throw new Error(`rejoin_map_${kind}_too_large`);
      chunks.push(value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; }
    catch { throw new Error(`rejoin_map_${kind}_invalid`); }
  } finally { await reader.cancel(); }
}

function connect(credential: RejoinCredential): Promise<ConnectedIdentity> {
  return timeout(`connect:${credential.label}`, new Promise((resolve, reject) => {
    DbConnection.builder()
      .withUri(HOST)
      .withDatabaseName(DATABASE)
      .withToken(credential.token)
      .onConnect((connection, identity) => resolve({ connection, identity }))
      .onConnectError(() => reject(new Error(`connection_rejected:${credential.label}`)))
      .build();
  }));
}

function queryFor(accessor: string, identity: Identity): unknown {
  if (accessor === 'liveMapDocument') return tables.liveMapHead;
  if (accessor === 'playerPublic') return tables.playerPublic.where((row) => row.identity.eq(identity));
  if (accessor === 'playerAppearance') return tables.playerAppearance.where((row) => row.identity.eq(identity));
  if (accessor === 'playerPosition') return tables.playerPosition.where((row) => row.identity.eq(identity));
  if (accessor === 'worldPlaceable') return tables.worldPlaceable.where((row) => row.placedBy.eq(identity));
  return (tables as unknown as Record<string, unknown>)[accessor];
}

function subscribe(client: ConnectedIdentity, label: string, transport: RejoinMapTransport): Promise<void> {
  const queries = REQUIRED_REJOIN_TABLES.filter(({ accessor }) => transport === 'digest' || accessor !== 'liveMapDocument').map(({ accessor }) => queryFor(accessor, client.identity));
  if (queries.some((query) => query === undefined)) throw new Error('required_subscription_query_missing');
  type SubscriptionQuery = Parameters<ReturnType<DbConnection['subscriptionBuilder']>['subscribe']>[0];
  return timeout(`subscription:${label}`, new Promise((resolve, reject) => {
    client.connection.subscriptionBuilder()
      .onApplied(() => resolve())
      .onError(() => reject(new Error(`subscription_rejected:${label}`)))
      .subscribe(queries as unknown as SubscriptionQuery);
  }));
}

function captureIdentity(client: ConnectedIdentity, label: string, legacyRows?: readonly unknown[]): WorldRejoinIdentitySnapshot {
  const database = client.connection.db as unknown as Record<string, { iter(): Iterable<unknown> } | undefined>;
  const rawTables = Object.fromEntries(REQUIRED_REJOIN_TABLES.map(({ accessor }) => {
    if (accessor === 'liveMapDocument' && legacyRows !== undefined) return [accessor, legacyRows];
    const table = database[accessor === 'liveMapDocument' ? 'liveMapHead' : accessor];
    if (table === undefined) throw new Error(`required_cache_table_missing:${accessor}`);
    return [accessor, [...table.iter()]];
  }));
  const identity = client.identity.toHexString();
  return Object.freeze({ label, identity, tables: normalizeRejoinTables(rawTables, identity) });
}

export async function captureAll(savedCredentials: readonly RejoinCredential[]): Promise<WorldRejoinSnapshot> {
  const connected: ConnectedIdentity[] = [];
  try {
    const identities: WorldRejoinIdentitySnapshot[] = [];
    for (const credential of savedCredentials) {
      const transport = rejoinMapTransport(await mapTransportJson(credential, 'schema'));
      const client = await connect(credential);
      connected.push(client);
      await subscribe(client, credential.label, transport);
      const legacyRows = transport === 'legacy-public' ? legacyMapRowsFromSql(await mapTransportJson(credential, 'legacy')) : undefined;
      identities.push(captureIdentity(client, credential.label, legacyRows));
    }
    if (new Set(identities.map(({ identity }) => identity)).size !== identities.length) {
      throw new Error('rejoin_credentials_share_identity');
    }
    return Object.freeze({
      formatVersion: WORLD_REJOIN_SNAPSHOT_VERSION,
      database: DATABASE,
      capturedAt: new Date().toISOString(),
      exclusions: WORLD_REJOIN_EXCLUSIONS,
      identities: Object.freeze(identities),
    });
  } finally {
    for (const client of connected) client.connection.disconnect();
  }
}

async function writePrivateSnapshot(path: string, snapshot: WorldRejoinSnapshot): Promise<void> {
  assertNoCredentialMaterial(snapshot);
  const file = await open(path, 'wx', 0o600);
  try {
    await file.writeFile(`${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    await file.sync();
    await file.chmod(0o600);
  } finally {
    await file.close();
  }
}

async function main(): Promise<void> {
  const [mode, snapshotPath, afterSnapshotPath] = process.argv.slice(2);
  if (mode === 'refresh') {
    if (snapshotPath !== undefined) throw new Error('usage: world-rejoin-smoke refresh');
    const refreshed = await credentials();
    process.stdout.write(`${JSON.stringify({ ok: true, mode, identities: refreshed.length })}\n`);
    return;
  }
  if ((mode !== 'capture' && mode !== 'verify') || snapshotPath === undefined) {
    throw new Error('usage: world-rejoin-smoke <refresh|capture|verify> [snapshot.json] [post-verify-snapshot.json]');
  }
  if (process.env['WORLD_REJOIN_REQUIRE_GENERIC_ONLY'] === '1') assertGenericOnlyRejoinContract();
  // Binding coverage is checked before opening a connection, so a known schema
  // gap cannot mutate even connection lifecycle state and then claim success.
  assertCurrentBindings();
  const savedCredentials = await credentials();
  if (mode === 'capture') {
    const snapshot = await captureAll(savedCredentials);
    await writePrivateSnapshot(snapshotPath, snapshot);
    process.stdout.write(`${JSON.stringify({ ok: true, mode, identities: snapshot.identities.length, snapshot: snapshotPath })}\n`);
    return;
  }
  const expected = parseWorldRejoinSnapshot(JSON.parse(await readFile(snapshotPath, 'utf8')) as unknown);
  if (expected.database !== DATABASE) throw new Error('snapshot_database_mismatch');
  const labels = savedCredentials.map(({ label }) => label).sort();
  const expectedLabels = expected.identities.map(({ label }) => label).sort();
  if (JSON.stringify(labels) !== JSON.stringify(expectedLabels)) throw new Error('credential_labels_changed');
  const actual = await captureAll(savedCredentials);
  if (afterSnapshotPath !== undefined) await writePrivateSnapshot(afterSnapshotPath, actual);
  const issues = compareWorldRejoinSnapshots(expected, actual);
  if (issues.length > 0) {
    process.stderr.write(`${JSON.stringify({ ok: false, mode, issues }, null, 2)}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`${JSON.stringify({ ok: true, mode, identities: actual.identities.length,
    tablesPerIdentity: REQUIRED_REJOIN_TABLES.length, postSnapshot: afterSnapshotPath ?? null })}\n`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

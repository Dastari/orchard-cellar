import { open, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { decodeJwtClaims, validateIdTokenClaims, verifyIdTokenSignature } from '@orchard/auth/oidc-token';
import { DbConnection, tables } from '@orchard/world-bindings';
import type { Identity } from 'spacetimedb';
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

async function credentials(): Promise<readonly RejoinCredential[]> {
  const path = process.env['WORLD_REJOIN_TOKENS_FILE'];
  if (path !== undefined) {
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
  const token = process.env['WORLD_REJOIN_TOKEN'];
  if (token === undefined || token.length === 0) throw new Error('WORLD_REJOIN_TOKENS_FILE_required');
  return [{ label: process.env['WORLD_REJOIN_LABEL'] ?? 'operator', token }];
}

function assertCurrentBindings(): void {
  const querySurface = tables as unknown as Record<string, unknown>;
  assertRejoinTableCoverage(new Set(REQUIRED_REJOIN_TABLES
    .map(({ accessor }) => accessor)
    .filter((accessor) => querySurface[accessor] !== undefined)));
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
  if (accessor === 'playerPublic') return tables.playerPublic.where((row) => row.identity.eq(identity));
  if (accessor === 'playerAppearance') return tables.playerAppearance.where((row) => row.identity.eq(identity));
  if (accessor === 'playerPosition') return tables.playerPosition.where((row) => row.identity.eq(identity));
  if (accessor === 'worldPlaceable') return tables.worldPlaceable.where((row) => row.placedBy.eq(identity));
  return (tables as unknown as Record<string, unknown>)[accessor];
}

function subscribe(client: ConnectedIdentity, label: string): Promise<void> {
  const queries = REQUIRED_REJOIN_TABLES.map(({ accessor }) => queryFor(accessor, client.identity));
  if (queries.some((query) => query === undefined)) throw new Error('required_subscription_query_missing');
  type SubscriptionQuery = Parameters<ReturnType<DbConnection['subscriptionBuilder']>['subscribe']>[0];
  return timeout(`subscription:${label}`, new Promise((resolve, reject) => {
    client.connection.subscriptionBuilder()
      .onApplied(() => resolve())
      .onError(() => reject(new Error(`subscription_rejected:${label}`)))
      .subscribe(queries as unknown as SubscriptionQuery);
  }));
}

function captureIdentity(client: ConnectedIdentity, label: string): WorldRejoinIdentitySnapshot {
  const database = client.connection.db as unknown as Record<string, { iter(): Iterable<unknown> } | undefined>;
  const rawTables = Object.fromEntries(REQUIRED_REJOIN_TABLES.map(({ accessor }) => {
    const table = database[accessor];
    if (table === undefined) throw new Error(`required_cache_table_missing:${accessor}`);
    return [accessor, [...table.iter()]];
  }));
  const identity = client.identity.toHexString();
  return Object.freeze({ label, identity, tables: normalizeRejoinTables(rawTables, identity) });
}

async function captureAll(savedCredentials: readonly RejoinCredential[]): Promise<WorldRejoinSnapshot> {
  const connected: ConnectedIdentity[] = [];
  try {
    const identities: WorldRejoinIdentitySnapshot[] = [];
    for (const credential of savedCredentials) {
      const client = await connect(credential);
      connected.push(client);
      await subscribe(client, credential.label);
      identities.push(captureIdentity(client, credential.label));
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

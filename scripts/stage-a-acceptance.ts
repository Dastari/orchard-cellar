import { open } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { decodeJwtClaims, validateIdTokenClaims, verifyIdTokenSignature } from '@orchard/auth/oidc-token';
import { DbConnection, tables, type SubscriptionHandle } from '@orchard/world-bindings';
import type { Identity } from 'spacetimedb';
import { refreshRejoinCredentialFile, type RejoinCredential,
  type StoredRejoinCredential } from './world-rejoin-credentials.js';
import { assertStageAEvidenceRedacted, buildStageAAcceptanceEvidence,
  type StageAObservation } from './stage-a-acceptance-evidence.js';

const HOST = process.env['SPACETIMEDB_HOST'] ?? 'https://orchard.dastari.net';
const DATABASE = process.env['SPACETIMEDB_DATABASE'] ?? 'orchard-cellar-world';
const TIMEOUT_MS = 40_000;
const REQUIRED_ACCESSORS = Object.freeze([
  'liveMapDocument', 'contentHead', 'contentDefinition', 'worldPlaceable', 'playerPublic', 'playerPosition',
] as const);

interface ConnectedClient {
  readonly credential: RejoinCredential;
  readonly connection: DbConnection;
  readonly identity: Identity;
  readonly connectedAt: string;
  subscription: SubscriptionHandle | null;
}

function timeout<T>(label: string, promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}_timeout`)), TIMEOUT_MS);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error: unknown) => {
      clearTimeout(timer); reject(error);
    });
  });
}

async function refreshCredential(credential: Required<Pick<StoredRejoinCredential, 'clientId' | 'refreshToken'>>) {
  const issuer = (process.env['OIDC_ISSUER'] ?? 'https://auth.orchard.dastari.net/realms/orchard').replace(/\/$/u, '');
  const endpoint = new URL(`${issuer}/protocol/openid-connect/token`);
  if (endpoint.protocol !== 'https:'
    && !(process.env['ALLOW_LOOPBACK_STAGE_A_OIDC'] === '1' && ['127.0.0.1', 'localhost'].includes(endpoint.hostname))) {
    throw new Error('stage_a_refresh_requires_https');
  }
  const response = await fetch(endpoint, { method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: credential.clientId,
      refresh_token: credential.refreshToken }) });
  if (!response.ok) throw new Error(`stage_a_refresh_failed:${response.status}`);
  const payload = await response.json() as Record<string, unknown>;
  if (typeof payload['id_token'] !== 'string') throw new Error('stage_a_refresh_invalid_response');
  await verifyIdTokenSignature(payload['id_token'], `${issuer}/protocol/openid-connect/certs`);
  validateIdTokenClaims(decodeJwtClaims(payload['id_token']), undefined, Date.now(), issuer, credential.clientId);
  return { token: payload['id_token'],
    refreshToken: typeof payload['refresh_token'] === 'string' ? payload['refresh_token'] : credential.refreshToken };
}

async function loadCredentials(): Promise<readonly RejoinCredential[]> {
  const path = process.env['STAGE_A_CREDENTIALS_FILE'];
  if (path === undefined || path.length === 0) throw new Error('STAGE_A_CREDENTIALS_FILE_required');
  const resolved = await refreshRejoinCredentialFile({
    path,
    refresh: refreshCredential,
    requireRefresh: true,
    minimumCredentials: 2,
  });
  if (!resolved.rotated) throw new Error('stage_a_credentials_not_refreshed');
  return resolved.credentials;
}

function assertCurrentBindings(): void {
  const available = tables as unknown as Record<string, unknown>;
  const missing = REQUIRED_ACCESSORS.filter((accessor) => available[accessor] === undefined);
  if (missing.length > 0) throw new Error(`stage_a_required_table_missing:${missing.join(',')}`);
}

function connect(credential: RejoinCredential, phase: string): Promise<ConnectedClient> {
  return timeout(`${phase}_connect`, new Promise((resolve, reject) => {
    DbConnection.builder().withUri(HOST).withDatabaseName(DATABASE).withToken(credential.token)
      .onConnect((connection, identity) => resolve({ credential, connection, identity,
        connectedAt: new Date().toISOString(), subscription: null }))
      .onConnectError(() => reject(new Error(`stage_a_${phase}_connection_rejected`)))
      .build();
  }));
}

function targetedQueries(identity: Identity): readonly unknown[] {
  return [
    tables.liveMapDocument.where((row) => row.mapId.eq('live-island')),
    tables.contentHead.where((row) => row.packId.eq('live')),
    tables.contentDefinition,
    tables.worldPlaceable.where((row) => row.definitionId.eq('object:chest')),
    tables.playerPublic.where((row) => row.identity.eq(identity)),
    tables.playerPosition.where((row) => row.identity.eq(identity)),
  ];
}

function subscribe(client: ConnectedClient, phase: string): Promise<string> {
  type SubscriptionQuery = Parameters<ReturnType<DbConnection['subscriptionBuilder']>['subscribe']>[0];
  return timeout(`${phase}_subscription`, new Promise((resolve, reject) => {
    client.subscription = client.connection.subscriptionBuilder()
      .onApplied(() => resolve(new Date().toISOString()))
      .onError(() => reject(new Error(`stage_a_${phase}_subscription_rejected`)))
      .subscribe(targetedQueries(client.identity) as unknown as SubscriptionQuery);
  }));
}

function rows(connection: DbConnection, accessor: string): readonly unknown[] {
  const table = (connection.db as unknown as Record<string, { iter(): Iterable<unknown> } | undefined>)[accessor];
  if (table === undefined) throw new Error(`stage_a_cache_table_missing:${accessor}`);
  return [...table.iter()];
}

function capture(client: ConnectedClient, appliedAt: string): StageAObservation {
  return Object.freeze({ label: client.credential.label, identity: client.identity.toHexString(),
    connectedAt: client.connectedAt, subscriptionAppliedAt: appliedAt,
    mapRows: rows(client.connection, 'liveMapDocument'), contentHeadRows: rows(client.connection, 'contentHead'),
    contentDefinitionRows: rows(client.connection, 'contentDefinition'),
    genericChestRows: rows(client.connection, 'worldPlaceable'),
    playerPublicRows: rows(client.connection, 'playerPublic'),
    playerPositionRows: rows(client.connection, 'playerPosition') });
}

async function capturePhase(credentials: readonly RejoinCredential[], phase: string): Promise<readonly StageAObservation[]> {
  const clients: ConnectedClient[] = [];
  try {
    const connected = await Promise.all(credentials.map((credential) => connect(credential, phase)));
    clients.push(...connected);
    const applied = await Promise.all(clients.map((client) => subscribe(client, phase)));
    return Object.freeze(clients.map((client, index) => capture(client, applied[index]!)));
  } finally {
    for (const client of clients) { client.subscription?.unsubscribe(); client.connection.disconnect(); }
  }
}

async function writePrivateEvidence(path: string, evidence: unknown): Promise<void> {
  assertStageAEvidenceRedacted(evidence);
  const file = await open(path, 'wx', 0o600);
  try {
    await file.writeFile(`${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
    await file.sync(); await file.chmod(0o600);
  } finally { await file.close(); }
}

export async function main(): Promise<void> {
  const evidencePath = process.argv[2] ?? process.env['STAGE_A_EVIDENCE_FILE'];
  if (evidencePath === undefined || evidencePath.length === 0) {
    throw new Error('usage: stage-a-acceptance <new-private-evidence.json>');
  }
  assertCurrentBindings();
  const credentials = await loadCredentials();
  const startedAt = new Date().toISOString();
  const initial = await capturePhase(credentials, 'initial');
  const reconnected = await capturePhase(credentials, 'reconnect');
  const evidence = buildStageAAcceptanceEvidence({ database: DATABASE, host: HOST, startedAt,
    completedAt: new Date().toISOString(), initial, reconnected });
  await writePrivateEvidence(evidencePath, evidence);
  process.stdout.write(`${JSON.stringify({ ok: true, evidence: evidencePath,
    clients: evidence.distinctIdentityCount, status: evidence.status })}\n`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

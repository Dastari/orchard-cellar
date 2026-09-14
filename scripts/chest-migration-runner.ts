import { pathToFileURL } from 'node:url';
import { decodeJwtClaims, validateIdTokenClaims, verifyIdTokenSignature } from '@orchard/auth/oidc-token';
import { DbConnection } from '@orchard/world-bindings';
import {
  refreshRejoinCredentialFile,
  type StoredRejoinCredential,
} from './world-rejoin-credentials.js';

const HOST = process.env['SPACETIMEDB_HOST'] ?? 'http://127.0.0.1:3000';
const DATABASE = process.env['SPACETIMEDB_DATABASE'] ?? 'orchard-cellar-world';
const BATCH_LIMIT = 100;
const VERIFY_LIMIT = 4096;
const TIMEOUT_MS = 40_000;
const PHASES = ['legacy_reads', 'backfill', 'dual_write', 'placeable_reads', 'draining', 'drop_ready'] as const;
export type ChestMigrationPhase = typeof PHASES[number];
export type ChestMigrationStopAfter = 'placeable_reads' | 'drop_ready';

export interface ChestMigrationStatus {
  readonly schemaVersion: 1;
  readonly phase: ChestMigrationPhase;
  readonly cursor: string | null;
  readonly backfillComplete: boolean;
  readonly verificationFingerprint: string;
  readonly verificationChestCount: string;
  readonly verificationSlotCount: string;
  readonly verificationDamageCount: string;
  readonly drainFingerprint: string;
  readonly clientsUsePlaceables: boolean;
  readonly studioUsesPlaceables: boolean;
  readonly legacyChestCount: string;
  readonly legacySlotCount: string;
  readonly legacyDamageCount: string;
  readonly mappingCount: string;
  readonly activeLegacySessionCount: string;
  readonly activeGenericSessionCount: string;
}

interface MigrationConnection extends DbConnection {
  readonly procedures: DbConnection['procedures'] & {
    adminChestMigrationStatus(args: Record<string, never>): Promise<string>;
  };
  readonly reducers: DbConnection['reducers'] & {
    adminBackfillLegacyChests(args: { expectedPhase: string; limit: number }): Promise<void>;
    adminVerifyLegacyChests(args: { expectedPhase: string; maximumChests: number }): Promise<void>;
    adminSetChestMigrationPhase(args: {
      expectedPhase: string; nextPhase: string; verificationFingerprint: string; drainFingerprint: string;
      clientsUsePlaceables: boolean; studioUsesPlaceables: boolean;
    }): Promise<void>;
    adminDrainLegacyChests(args: {
      expectedPhase: string; limit: number; verificationFingerprint: string;
    }): Promise<void>;
  };
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string') throw new Error(`chest_migration_status_invalid:${key}`);
  return value;
}

function requiredBoolean(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  if (typeof value !== 'boolean') throw new Error(`chest_migration_status_invalid:${key}`);
  return value;
}

export function parseChestMigrationStatus(payload: string): ChestMigrationStatus {
  const value: unknown = JSON.parse(payload);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('chest_migration_status_invalid');
  }
  const record = value as Record<string, unknown>;
  const phase = requiredString(record, 'phase');
  if (!(PHASES as readonly string[]).includes(phase)) throw new Error('chest_migration_status_invalid:phase');
  const cursor = record['cursor'];
  if (cursor !== null && typeof cursor !== 'string') throw new Error('chest_migration_status_invalid:cursor');
  if (record['schemaVersion'] !== 1) throw new Error('chest_migration_status_invalid:schemaVersion');
  const status = {
    schemaVersion: 1 as const,
    phase: phase as ChestMigrationPhase,
    cursor,
    backfillComplete: requiredBoolean(record, 'backfillComplete'),
    verificationFingerprint: requiredString(record, 'verificationFingerprint'),
    verificationChestCount: requiredString(record, 'verificationChestCount'),
    verificationSlotCount: requiredString(record, 'verificationSlotCount'),
    verificationDamageCount: requiredString(record, 'verificationDamageCount'),
    drainFingerprint: requiredString(record, 'drainFingerprint'),
    clientsUsePlaceables: requiredBoolean(record, 'clientsUsePlaceables'),
    studioUsesPlaceables: requiredBoolean(record, 'studioUsesPlaceables'),
    legacyChestCount: requiredString(record, 'legacyChestCount'),
    legacySlotCount: requiredString(record, 'legacySlotCount'),
    legacyDamageCount: requiredString(record, 'legacyDamageCount'),
    mappingCount: requiredString(record, 'mappingCount'),
    activeLegacySessionCount: requiredString(record, 'activeLegacySessionCount'),
    activeGenericSessionCount: requiredString(record, 'activeGenericSessionCount'),
  };
  for (const key of ['verificationChestCount', 'verificationSlotCount', 'verificationDamageCount',
    'legacyChestCount', 'legacySlotCount', 'legacyDamageCount', 'mappingCount',
    'activeLegacySessionCount', 'activeGenericSessionCount'] as const) {
    if (!/^\d+$/u.test(status[key])) throw new Error(`chest_migration_status_invalid:${key}`);
  }
  return status;
}

export function assertChestMigrationDropReady(status: ChestMigrationStatus): void {
  if (status.phase !== 'drop_ready' || status.legacyChestCount !== '0'
    || status.legacySlotCount !== '0' || status.legacyDamageCount !== '0'
    || status.mappingCount !== '0' || status.activeLegacySessionCount !== '0'
    || status.activeGenericSessionCount !== '0'
    || status.verificationFingerprint === '' || status.drainFingerprint === ''
    || !status.clientsUsePlaceables || !status.studioUsesPlaceables) {
    throw new Error('chest_migration_drop_not_ready');
  }
}

export function assertChestMigrationPlaceableReadsReady(status: ChestMigrationStatus): void {
  if (status.phase !== 'placeable_reads' || !status.backfillComplete
    || status.verificationFingerprint === '' || status.drainFingerprint !== ''
    || !status.clientsUsePlaceables || !status.studioUsesPlaceables
    || status.activeLegacySessionCount !== '0' || status.activeGenericSessionCount !== '0'
    || status.mappingCount !== status.legacyChestCount
    || status.verificationChestCount !== status.legacyChestCount
    || status.verificationSlotCount !== status.legacySlotCount
    || status.verificationDamageCount !== status.legacyDamageCount) {
    throw new Error('chest_migration_placeable_reads_not_ready');
  }
}

async function refreshCredential(credential: Required<Pick<StoredRejoinCredential, 'clientId' | 'refreshToken'>>) {
  const issuer = process.env['OIDC_ISSUER'] ?? 'https://auth.orchard.dastari.net/realms/orchard';
  const endpoint = new URL(`${issuer.replace(/\/$/u, '')}/protocol/openid-connect/token`);
  if (endpoint.protocol !== 'https:'
    && !(process.env['ALLOW_LOOPBACK_REJOIN_OIDC'] === '1' && ['127.0.0.1', 'localhost'].includes(endpoint.hostname))) {
    throw new Error('chest_migration_refresh_requires_https');
  }
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: credential.clientId,
      refresh_token: credential.refreshToken }),
  });
  if (!response.ok) throw new Error(`chest_migration_refresh_failed:${response.status}`);
  const payload = await response.json() as Record<string, unknown>;
  if (typeof payload['id_token'] !== 'string') throw new Error('chest_migration_refresh_invalid_response');
  await verifyIdTokenSignature(payload['id_token'], `${issuer.replace(/\/$/u, '')}/protocol/openid-connect/certs`);
  validateIdTokenClaims(decodeJwtClaims(payload['id_token']), undefined, Date.now(),
    issuer.replace(/\/$/u, ''), credential.clientId);
  return { token: payload['id_token'], refreshToken: typeof payload['refresh_token'] === 'string'
    ? payload['refresh_token'] : credential.refreshToken };
}

async function ownerToken(): Promise<string> {
  const path = process.env['WORLD_REJOIN_TOKENS_FILE'];
  if (path === undefined) throw new Error('WORLD_REJOIN_TOKENS_FILE_required');
  const resolved = await refreshRejoinCredentialFile({
    path,
    refresh: refreshCredential,
    requireRefresh: true,
  });
  const label = process.env['CHEST_MIGRATION_OWNER_LABEL'];
  const selected = label === undefined ? resolved.credentials[0]
    : resolved.credentials.find((credential) => credential.label === label);
  if (selected === undefined) throw new Error('chest_migration_owner_credential_missing');
  return selected.token;
}

function timeout<T>(label: string, promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}_timeout`)), TIMEOUT_MS);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error: unknown) => {
      clearTimeout(timer); reject(error);
    });
  });
}

async function connect(token: string): Promise<MigrationConnection> {
  return timeout('chest_migration_connect', new Promise((resolve, reject) => {
    DbConnection.builder().withUri(HOST).withDatabaseName(DATABASE).withToken(token)
      .onConnect((connection) => resolve(connection as MigrationConnection))
      .onConnectError((_context, error) => reject(error))
      .build();
  }));
}

async function status(connection: MigrationConnection): Promise<ChestMigrationStatus> {
  const current = parseChestMigrationStatus(await timeout('chest_migration_status',
    connection.procedures.adminChestMigrationStatus({})));
  process.stdout.write(`${JSON.stringify({ event: 'chest_migration_status', database: DATABASE, ...current })}\n`);
  if (current.activeLegacySessionCount !== '0' || current.activeGenericSessionCount !== '0') {
    throw new Error('chest_migration_active_custody');
  }
  return current;
}

async function verify(connection: MigrationConnection, phase: ChestMigrationPhase): Promise<ChestMigrationStatus> {
  await timeout('chest_migration_verify', connection.reducers.adminVerifyLegacyChests({
    expectedPhase: phase, maximumChests: VERIFY_LIMIT,
  }));
  const verified = await status(connection);
  if (verified.phase !== phase || verified.verificationFingerprint === '') {
    throw new Error('chest_migration_verification_receipt_missing');
  }
  return verified;
}

async function setPhase(connection: MigrationConnection, current: ChestMigrationStatus,
  nextPhase: ChestMigrationPhase, clientsReady: boolean, studioReady: boolean): Promise<ChestMigrationStatus> {
  await timeout(`chest_migration_phase_${nextPhase}`, connection.reducers.adminSetChestMigrationPhase({
    expectedPhase: current.phase, nextPhase,
    verificationFingerprint: current.verificationFingerprint,
    drainFingerprint: current.drainFingerprint,
    clientsUsePlaceables: clientsReady,
    studioUsesPlaceables: studioReady,
  }));
  const next = await status(connection);
  if (next.phase !== nextPhase) throw new Error('chest_migration_phase_commit_missing');
  return next;
}

export async function runChestMigration(
  connection: MigrationConnection,
  stopAfter: ChestMigrationStopAfter = 'drop_ready',
  requirePlaceableReadsStart = false,
): Promise<ChestMigrationStatus> {
  const clientsReady = process.env['CHEST_MIGRATION_CLIENTS_READY'] === '1';
  const studioReady = process.env['CHEST_MIGRATION_STUDIO_READY'] === '1';
  let current = await status(connection);
  if (requirePlaceableReadsStart && current.phase !== 'placeable_reads') {
    throw new Error('chest_migration_placeable_reads_start_required');
  }
  if (stopAfter === 'placeable_reads'
    && (current.phase === 'draining' || current.phase === 'drop_ready')) {
    throw new Error('chest_migration_requested_stage_already_passed');
  }
  if (current.phase === 'legacy_reads') current = await setPhase(connection, current, 'backfill', false, false);
  if (current.phase === 'backfill') {
    while (!current.backfillComplete) {
      await timeout('chest_migration_backfill', connection.reducers.adminBackfillLegacyChests({
        expectedPhase: 'backfill', limit: BATCH_LIMIT,
      }));
      current = await status(connection);
    }
    current = await verify(connection, 'backfill');
    current = await setPhase(connection, current, 'dual_write', false, false);
  }
  if (current.phase === 'dual_write') {
    if (!clientsReady || !studioReady) throw new Error('chest_migration_consumer_ack_required');
    current = await verify(connection, 'dual_write');
    current = await setPhase(connection, current, 'placeable_reads', true, true);
  }
  if (current.phase === 'placeable_reads' && stopAfter === 'placeable_reads') {
    current = await verify(connection, 'placeable_reads');
    assertChestMigrationPlaceableReadsReady(current);
    return current;
  }
  if (current.phase === 'placeable_reads') {
    if (!clientsReady || !studioReady) throw new Error('chest_migration_consumer_ack_required');
    current = await verify(connection, 'placeable_reads');
    current = await setPhase(connection, current, 'draining', true, true);
  }
  if (current.phase === 'draining') {
    while (current.legacyChestCount !== '0' || current.drainFingerprint === '') {
      await timeout('chest_migration_drain', connection.reducers.adminDrainLegacyChests({
        expectedPhase: 'draining', limit: BATCH_LIMIT,
        verificationFingerprint: current.verificationFingerprint,
      }));
      current = await status(connection);
    }
    current = await setPhase(connection, current, 'drop_ready', true, true);
  }
  assertChestMigrationDropReady(current);
  return current;
}

async function main(): Promise<void> {
  if (process.env['CHEST_MIGRATION_CONFIRM'] !== `migrate:${DATABASE}`) {
    throw new Error(`CHEST_MIGRATION_CONFIRM_must_equal:migrate:${DATABASE}`);
  }
  const target = process.env['CHEST_MIGRATION_TARGET'];
  if (target !== 'rehearsal' && target !== 'production') throw new Error('CHEST_MIGRATION_TARGET_required');
  const stopAfter = process.env['CHEST_MIGRATION_STOP_AFTER'] ?? 'drop_ready';
  if (stopAfter !== 'placeable_reads' && stopAfter !== 'drop_ready') {
    throw new Error('CHEST_MIGRATION_STOP_AFTER_invalid');
  }
  if (target === 'production' && process.env['CHEST_MIGRATION_PRODUCTION_CONFIRM'] !== DATABASE) {
    throw new Error('chest_migration_production_confirmation_required');
  }
  const connection = await connect(await ownerToken());
  try {
    const final = await runChestMigration(
      connection,
      stopAfter,
      process.env['CHEST_MIGRATION_REQUIRE_PLACEABLE_READS_START'] === '1',
    );
    process.stdout.write(`${JSON.stringify({ ok: true, target, database: DATABASE,
      phase: final.phase, verificationFingerprint: final.verificationFingerprint,
      drainFingerprint: final.drainFingerprint })}\n`);
  } finally {
    connection.disconnect();
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

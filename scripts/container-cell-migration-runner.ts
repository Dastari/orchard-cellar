import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { formatWithOptions } from 'node:util';
import { decodeJwtClaims, validateIdTokenClaims, verifyIdTokenSignature } from '@orchard/auth/oidc-token';
import { DbConnection } from '@orchard/world-bindings';
import {
  refreshRejoinCredentialFile,
  type StoredRejoinCredential,
} from './world-rejoin-credentials.js';

/**
 * Release-lane runner for Uncapped Storage step 4 (wiki Roadmap/Uncapped Storage), the container-cell migration.
 * After the non-destructive publish it copies every placeable's legacy `world_placeable_slot` rows into
 * `placeable_container_cell` and moves every offline character into `player_container_cell` (older hotbar and
 * equipment layouts included, through the connect path's own steps), in idempotent batches that a world owner or admin
 * may run (the dev account is an admin), then requires the world's own status report to be complete: every
 * placeable with legacy rows has a receipt whose source fingerprint matches its (never rewritten) legacy rows, no
 * player plan is refused, and, when given, the whole-table legacy fingerprint equals the expected value (for example
 * the isolated restore rehearsal's). Connected players move at connect time regardless.
 */

const HOST = process.env['SPACETIMEDB_HOST'] ?? 'http://127.0.0.1:3000';
const DATABASE = process.env['SPACETIMEDB_DATABASE'] ?? 'orchard-cellar-world';
const BATCH_LIMIT = 100;
const STATUS_PLAN_LIMIT = 10_000;
const TIMEOUT_MS = 40_000;

export interface ContainerCellMigrationIssue { readonly kind: string; readonly id: string; readonly code: string }
export interface ContainerCellMigrationStatus {
  readonly schemaVersion: 1;
  readonly layoutVersion: number;
  readonly players: {
    readonly current: number; readonly legacy: number; readonly planned: number; readonly planTruncated: boolean;
    readonly legacyRows: number; readonly legacyCells: number; readonly legacyQuantity: number; readonly cells: number;
  };
  readonly placeables: {
    readonly legacy: number; readonly copied: number; readonly uncopied: number;
    readonly legacyRows: number; readonly legacyCells: number; readonly legacyQuantity: number;
    readonly legacyFingerprint: string; readonly receiptFingerprint: string;
    readonly receipts: number; readonly cells: number; readonly backfillComplete: boolean;
  };
  readonly issues: readonly ContainerCellMigrationIssue[];
  readonly placeableCopyComplete: boolean;
}

interface MigrationConnection extends DbConnection {
  readonly procedures: DbConnection['procedures'] & {
    adminContainerCellMigrationStatus(args: { maximumPlayerPlans: number }): Promise<string>;
  };
  readonly reducers: DbConnection['reducers'] & {
    adminBackfillPlaceableContainerCells(args: { limit: number }): Promise<void>;
    adminBackfillPlayerContainerCells(args: { limit: number }): Promise<void>;
  };
}

function fail(code: string): never { throw new Error(code); }

/** The whole-table legacy fingerprint shape, `placeable-cells:<cells>:<total quantity>:<8 hex>` (sim container-migration). */
export const LEGACY_PLACEABLE_FINGERPRINT = /^placeable-cells:[0-9]+:[0-9]+:[0-9a-f]{8}$/u;

type ConsoleMethod = 'log' | 'info' | 'debug' | 'warn' | 'error' | 'trace';

/**
 * Keeps the runner's stdout a pure JSON-lines stream that the release lane parses: the SpacetimeDB SDK logs every level
 * (for example `INFO Connecting to SpacetimeDB WS...`) through `console.log`, so every console method is routed to
 * stderr for the life of the run. Returns the restore callback.
 */
export function routeConsoleToStderr(
  target: Pick<Console, ConsoleMethod> = console,
  write: (text: string) => void = (text) => { process.stderr.write(text); },
): () => void {
  const methods: readonly ConsoleMethod[] = ['log', 'info', 'debug', 'warn', 'error', 'trace'];
  const originals = methods.map((method) => [method, target[method]] as const);
  for (const method of methods) {
    target[method] = (...args: unknown[]) => { write(`${formatWithOptions({ colors: false }, ...args)}\n`); };
  }
  return () => { for (const [method, original] of originals) target[method] = original; };
}

function object(value: unknown, key: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(`container_cell_migration_status_invalid:${key}`);
  return value as Record<string, unknown>;
}

function count(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) fail(`container_cell_migration_status_invalid:${key}`);
  return value;
}

function flag(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  if (typeof value !== 'boolean') fail(`container_cell_migration_status_invalid:${key}`);
  return value;
}

function text(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string') fail(`container_cell_migration_status_invalid:${key}`);
  return value;
}

export function parseContainerCellMigrationStatus(payload: string): ContainerCellMigrationStatus {
  const record = object(JSON.parse(payload) as unknown, 'status');
  if (record['schemaVersion'] !== 1) fail('container_cell_migration_status_invalid:schemaVersion');
  const players = object(record['players'], 'players');
  const placeables = object(record['placeables'], 'placeables');
  const issues = record['issues'];
  if (!Array.isArray(issues)) fail('container_cell_migration_status_invalid:issues');
  return Object.freeze({
    schemaVersion: 1,
    layoutVersion: count(record, 'layoutVersion'),
    players: Object.freeze({
      current: count(players, 'current'), legacy: count(players, 'legacy'), planned: count(players, 'planned'),
      planTruncated: flag(players, 'planTruncated'), legacyRows: count(players, 'legacyRows'),
      legacyCells: count(players, 'legacyCells'), legacyQuantity: count(players, 'legacyQuantity'), cells: count(players, 'cells'),
    }),
    placeables: Object.freeze({
      legacy: count(placeables, 'legacy'), copied: count(placeables, 'copied'), uncopied: count(placeables, 'uncopied'),
      legacyRows: count(placeables, 'legacyRows'), legacyCells: count(placeables, 'legacyCells'),
      legacyQuantity: count(placeables, 'legacyQuantity'), legacyFingerprint: text(placeables, 'legacyFingerprint'),
      receiptFingerprint: text(placeables, 'receiptFingerprint'), receipts: count(placeables, 'receipts'),
      cells: count(placeables, 'cells'), backfillComplete: flag(placeables, 'backfillComplete'),
    }),
    issues: Object.freeze(issues.map((entry, index) => {
      const issue = object(entry, `issues.${index}`);
      return Object.freeze({ kind: text(issue, 'kind'), id: text(issue, 'id'), code: text(issue, 'code') });
    })),
    placeableCopyComplete: flag(record, 'placeableCopyComplete'),
  });
}

/**
 * The lane's completion gate. Players still on the legacy layout are allowed (they move when they connect) only when
 * their plans were all checked and none was refused; placeables must all be copied with matching receipts.
 */
export function assertContainerCellMigrationComplete(
  status: ContainerCellMigrationStatus,
  expectedLegacyFingerprint?: string,
): void {
  if (status.issues.length > 0) fail(`container_cell_migration_issues:${status.issues.map(({ kind, id }) => `${kind}:${id}`).join(',')}`);
  if (!status.placeables.backfillComplete || !status.placeableCopyComplete || status.placeables.uncopied !== 0
    || status.placeables.copied !== status.placeables.legacy || status.placeables.legacyFingerprint === '') {
    fail('container_cell_migration_placeables_incomplete');
  }
  if (status.players.planTruncated) fail('container_cell_migration_player_plans_truncated');
  if (expectedLegacyFingerprint !== undefined && status.placeables.legacyFingerprint !== expectedLegacyFingerprint) {
    fail('container_cell_migration_legacy_fingerprint_mismatch');
  }
}

export interface ContainerCellMigrationEvidence {
  readonly legacyFingerprint: string;
  readonly receiptFingerprint: string;
  readonly status: ContainerCellMigrationStatus;
}

/**
 * Reads a runner JSON-lines log (the release lane's evidence file) and returns the completed run's final legacy
 * fingerprint. Every line must be JSON; the log must end with the final status report and the `ok` line, the report
 * must pass the completion gate, and both must name the same well-formed legacy fingerprint. The lane compares the
 * isolated restore rehearsal's value with production's through this reader, so anything else fails closed.
 */
export function readContainerCellMigrationEvidence(log: string): ContainerCellMigrationEvidence {
  const lines = log.split('\n').filter((line) => line.trim() !== '');
  const records = lines.map((line) => {
    try {
      return object(JSON.parse(line) as unknown, 'log_line');
    } catch {
      return fail('container_cell_migration_log_invalid:not_json_lines');
    }
  });
  const [statusRecord, finalRecord] = records.slice(-2);
  if (finalRecord?.['ok'] !== true || statusRecord?.['event'] !== 'container_cell_migration_status') {
    fail('container_cell_migration_log_invalid:incomplete');
  }
  // The status event carries the report plus the lane's `event` and `database` labels, which the parser ignores.
  const status = parseContainerCellMigrationStatus(JSON.stringify(statusRecord));
  assertContainerCellMigrationComplete(status);
  const legacyFingerprint = text(finalRecord, 'legacyFingerprint');
  if (!LEGACY_PLACEABLE_FINGERPRINT.test(legacyFingerprint) || status.placeables.legacyFingerprint !== legacyFingerprint
    || text(finalRecord, 'receiptFingerprint') !== status.placeables.receiptFingerprint) {
    fail('container_cell_migration_log_invalid:fingerprint');
  }
  return Object.freeze({ legacyFingerprint, receiptFingerprint: status.placeables.receiptFingerprint, status });
}

async function refreshCredential(credential: Required<Pick<StoredRejoinCredential, 'clientId' | 'refreshToken'>>) {
  const issuer = process.env['OIDC_ISSUER'] ?? 'https://auth.orchard.dastari.net/realms/orchard';
  const endpoint = new URL(`${issuer.replace(/\/$/u, '')}/protocol/openid-connect/token`);
  if (endpoint.protocol !== 'https:'
    && !(process.env['ALLOW_LOOPBACK_REJOIN_OIDC'] === '1' && ['127.0.0.1', 'localhost'].includes(endpoint.hostname))) {
    throw new Error('container_cell_migration_refresh_requires_https');
  }
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: credential.clientId,
      refresh_token: credential.refreshToken }),
  });
  if (!response.ok) throw new Error(`container_cell_migration_refresh_failed:${response.status}`);
  const payload = await response.json() as Record<string, unknown>;
  if (typeof payload['id_token'] !== 'string') throw new Error('container_cell_migration_refresh_invalid_response');
  await verifyIdTokenSignature(payload['id_token'], `${issuer.replace(/\/$/u, '')}/protocol/openid-connect/certs`);
  validateIdTokenClaims(decodeJwtClaims(payload['id_token']), undefined, Date.now(),
    issuer.replace(/\/$/u, ''), credential.clientId);
  return { token: payload['id_token'], refreshToken: typeof payload['refresh_token'] === 'string'
    ? payload['refresh_token'] : credential.refreshToken };
}

/**
 * The operator credential: a world owner or admin (the batches and the status accept either, through
 * canAdministerWorld). `CONTAINER_CELL_MIGRATION_CREDENTIAL_LABEL` names it in the rejoin credential file; the lane
 * passes its content-publication credential, normally the dev account.
 */
async function operatorToken(): Promise<string> {
  const path = process.env['WORLD_REJOIN_TOKENS_FILE'];
  if (path === undefined) throw new Error('WORLD_REJOIN_TOKENS_FILE_required');
  const resolved = await refreshRejoinCredentialFile({ path, refresh: refreshCredential, requireRefresh: true });
  const label = process.env['CONTAINER_CELL_MIGRATION_CREDENTIAL_LABEL'];
  const selected = label === undefined ? resolved.credentials[0]
    : resolved.credentials.find((credential) => credential.label === label);
  if (selected === undefined) throw new Error('container_cell_migration_credential_missing');
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
  return timeout('container_cell_migration_connect', new Promise((resolve, reject) => {
    DbConnection.builder().withUri(HOST).withDatabaseName(DATABASE).withToken(token)
      .onConnect((connection) => resolve(connection as MigrationConnection))
      .onConnectError((_context, error) => reject(error))
      .build();
  }));
}

async function status(connection: MigrationConnection): Promise<ContainerCellMigrationStatus> {
  const current = parseContainerCellMigrationStatus(await timeout('container_cell_migration_status',
    connection.procedures.adminContainerCellMigrationStatus({ maximumPlayerPlans: STATUS_PLAN_LIMIT })));
  process.stdout.write(`${JSON.stringify({ event: 'container_cell_migration_status', database: DATABASE, ...current })}\n`);
  return current;
}

export async function runContainerCellMigration(
  connection: MigrationConnection,
  expectedLegacyFingerprint?: string,
): Promise<ContainerCellMigrationStatus> {
  let current = await status(connection);
  while (!current.placeables.backfillComplete) {
    await timeout('container_cell_migration_placeables', connection.reducers.adminBackfillPlaceableContainerCells({ limit: BATCH_LIMIT }));
    current = await status(connection);
  }
  // Offline characters with a valid plan, on any older layout; a refused plan stays on the legacy layout and is reported
  // as an issue. A migration row with no character is left for connect and stays counted as legacy.
  for (let previous = Number.POSITIVE_INFINITY; current.players.legacy > 0 && current.players.legacy < previous;) {
    previous = current.players.legacy;
    await timeout('container_cell_migration_players', connection.reducers.adminBackfillPlayerContainerCells({ limit: BATCH_LIMIT }));
    current = await status(connection);
  }
  assertContainerCellMigrationComplete(current, expectedLegacyFingerprint);
  return current;
}

async function main(): Promise<void> {
  // `final-fingerprint <log>`: print a completed run log's legacy fingerprint (the lane's comparison input).
  if (process.argv[2] === 'final-fingerprint') {
    const path = process.argv[3];
    if (path === undefined || process.argv.length !== 4) throw new Error('usage: final-fingerprint <runner-log.jsonl>');
    process.stdout.write(`${readContainerCellMigrationEvidence(await readFile(path, 'utf8')).legacyFingerprint}\n`);
    return;
  }
  if (process.argv.length !== 2) throw new Error('usage: container-cell-migration-runner.ts [final-fingerprint <log>]');
  if (process.env['CONTAINER_CELL_MIGRATION_CONFIRM'] !== `migrate:${DATABASE}`) {
    throw new Error(`CONTAINER_CELL_MIGRATION_CONFIRM_must_equal:migrate:${DATABASE}`);
  }
  const target = process.env['CONTAINER_CELL_MIGRATION_TARGET'];
  if (target !== 'rehearsal' && target !== 'production') throw new Error('CONTAINER_CELL_MIGRATION_TARGET_required');
  if (target === 'production' && process.env['CONTAINER_CELL_MIGRATION_PRODUCTION_CONFIRM'] !== DATABASE) {
    throw new Error('container_cell_migration_production_confirmation_required');
  }
  const expected = process.env['CONTAINER_CELL_EXPECTED_LEGACY_FINGERPRINT'] ?? '';
  // Production always compares against the isolated restore rehearsal's legacy fingerprint.
  if (expected !== '' && !LEGACY_PLACEABLE_FINGERPRINT.test(expected)) throw new Error('CONTAINER_CELL_EXPECTED_LEGACY_FINGERPRINT_invalid');
  if (target === 'production' && expected === '') throw new Error('CONTAINER_CELL_EXPECTED_LEGACY_FINGERPRINT_required');
  const connection = await connect(await operatorToken());
  try {
    const final = await runContainerCellMigration(connection, expected === '' ? undefined : expected);
    process.stdout.write(`${JSON.stringify({ ok: true, target, database: DATABASE,
      legacyFingerprint: final.placeables.legacyFingerprint, receiptFingerprint: final.placeables.receiptFingerprint,
      placeablesCopied: final.placeables.copied, playersCurrent: final.players.current,
      playersLegacy: final.players.legacy })}\n`);
  } finally {
    connection.disconnect();
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  routeConsoleToStderr();
  await main();
}

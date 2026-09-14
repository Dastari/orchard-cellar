import { pathToFileURL } from 'node:url';
import { decodeJwtClaims, validateIdTokenClaims, verifyIdTokenSignature } from '@orchard/auth/oidc-token';
import { DbConnection } from '@orchard/world-bindings';
import { refreshRejoinCredentialFile, type StoredRejoinCredential } from './world-rejoin-credentials.js';

const HOST = process.env['SPACETIMEDB_HOST'] ?? 'http://127.0.0.1:3000';
const DATABASE = process.env['SPACETIMEDB_DATABASE'] ?? 'orchard-cellar-world';
const BATCH_LIMIT = 100;
const VERIFY_LIMIT = 4096;
const TIMEOUT_MS = 40_000;
const PHASES = ['inspect', 'parity_verified', 'draining', 'schema_removal_candidate'] as const;
export type LegacyFarmRetirementPhase = typeof PHASES[number];

export interface LegacyFarmRetirementStatus {
  readonly schemaVersion: 1;
  readonly phase: LegacyFarmRetirementPhase;
  readonly migrationVersion: number;
  readonly inspectionFingerprint: string;
  readonly verificationFingerprint: string;
  readonly remainingFingerprint: string;
  readonly drainFingerprint: string;
  readonly inspectedPrivateInventoryCount: string;
  readonly inspectedPlayerSurvivalCompatibilityCount: string;
  readonly inspectedFarmParcelCount: string;
  readonly inspectedCropPatchCount: string;
  readonly inspectedFarmActivityCount: string;
  readonly privateInventoryCount: string;
  readonly playerSurvivalCompatibilityCount: string;
  readonly farmParcelCount: string;
  readonly cropPatchCount: string;
  readonly farmActivityCount: string;
  readonly remainingCount: string;
}

export interface LegacyFarmRetirementConnection {
  readonly procedures: {
    adminLegacyFarmRetirementStatus(args: Record<string, never>): Promise<string>;
  };
  readonly reducers: {
    adminInspectLegacyFarmRetirement(args: { expectedPhase: string; maximumRows: number }): Promise<void>;
    adminVerifyLegacyFarmRetirement(args: {
      expectedPhase: string; maximumRows: number; inspectionFingerprint: string;
    }): Promise<void>;
    adminSetLegacyFarmRetirementPhase(args: {
      expectedPhase: string; nextPhase: string; verificationFingerprint: string; drainFingerprint: string;
    }): Promise<void>;
    adminDrainLegacyFarmRetirement(args: {
      expectedPhase: string; limit: number; verificationFingerprint: string; expectedRemainingFingerprint: string;
    }): Promise<void>;
  };
}

const COUNT_FIELDS = [
  'inspectedPrivateInventoryCount', 'inspectedPlayerSurvivalCompatibilityCount',
  'inspectedFarmParcelCount', 'inspectedCropPatchCount', 'inspectedFarmActivityCount',
  'privateInventoryCount', 'playerSurvivalCompatibilityCount', 'farmParcelCount',
  'cropPatchCount', 'farmActivityCount', 'remainingCount',
] as const;

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string') throw new Error(`legacy_farm_retirement_status_invalid:${key}`);
  return value;
}

export function parseLegacyFarmRetirementStatus(payload: string): LegacyFarmRetirementStatus {
  const value: unknown = JSON.parse(payload);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('legacy_farm_retirement_status_invalid');
  }
  const record = value as Record<string, unknown>;
  if (record['schemaVersion'] !== 1) throw new Error('legacy_farm_retirement_status_invalid:schemaVersion');
  if (typeof record['migrationVersion'] !== 'number' || !Number.isSafeInteger(record['migrationVersion'])) {
    throw new Error('legacy_farm_retirement_status_invalid:migrationVersion');
  }
  const phase = requiredString(record, 'phase');
  if (!(PHASES as readonly string[]).includes(phase)) {
    throw new Error('legacy_farm_retirement_status_invalid:phase');
  }
  const result = {
    schemaVersion: 1 as const,
    phase: phase as LegacyFarmRetirementPhase,
    migrationVersion: record['migrationVersion'],
    inspectionFingerprint: requiredString(record, 'inspectionFingerprint'),
    verificationFingerprint: requiredString(record, 'verificationFingerprint'),
    remainingFingerprint: requiredString(record, 'remainingFingerprint'),
    drainFingerprint: requiredString(record, 'drainFingerprint'),
    ...Object.fromEntries(COUNT_FIELDS.map((key) => [key, requiredString(record, key)])),
  } as LegacyFarmRetirementStatus;
  for (const field of COUNT_FIELDS) {
    if (!/^\d+$/u.test(result[field])) throw new Error(`legacy_farm_retirement_status_invalid:${field}`);
  }
  return result;
}

export function assertLegacyFarmSchemaRemovalCandidate(status: LegacyFarmRetirementStatus): void {
  if (status.phase !== 'schema_removal_candidate' || status.migrationVersion < 1
    || status.inspectionFingerprint === '' || status.verificationFingerprint === ''
    || status.remainingFingerprint === '' || status.drainFingerprint === ''
    || status.privateInventoryCount !== '0' || status.playerSurvivalCompatibilityCount !== '0'
    || status.farmParcelCount !== '0' || status.cropPatchCount !== '0'
    || status.farmActivityCount !== '0' || status.remainingCount !== '0') {
    throw new Error('legacy_farm_retirement_candidate_not_ready');
  }
}

async function readStatus(connection: LegacyFarmRetirementConnection): Promise<LegacyFarmRetirementStatus> {
  return parseLegacyFarmRetirementStatus(await connection.procedures.adminLegacyFarmRetirementStatus({}));
}

async function setPhase(connection: LegacyFarmRetirementConnection, current: LegacyFarmRetirementStatus,
  nextPhase: LegacyFarmRetirementPhase): Promise<LegacyFarmRetirementStatus> {
  await connection.reducers.adminSetLegacyFarmRetirementPhase({
    expectedPhase: current.phase,
    nextPhase,
    verificationFingerprint: current.verificationFingerprint,
    drainFingerprint: current.drainFingerprint,
  });
  const next = await readStatus(connection);
  if (next.phase !== nextPhase) throw new Error('legacy_farm_retirement_phase_commit_missing');
  return next;
}

export async function runLegacyFarmRetirement(
  connection: LegacyFarmRetirementConnection,
  options: { readonly allowDrain: boolean } = { allowDrain: false },
): Promise<LegacyFarmRetirementStatus> {
  let current = await readStatus(connection);
  if (current.phase === 'inspect') {
    await connection.reducers.adminInspectLegacyFarmRetirement({
      expectedPhase: 'inspect', maximumRows: VERIFY_LIMIT,
    });
    current = await readStatus(connection);
    await connection.reducers.adminVerifyLegacyFarmRetirement({
      expectedPhase: 'inspect', maximumRows: VERIFY_LIMIT,
      inspectionFingerprint: current.inspectionFingerprint,
    });
    current = await readStatus(connection);
    current = await setPhase(connection, current, 'parity_verified');
  }
  if (!options.allowDrain) return current;
  if (current.phase === 'parity_verified') current = await setPhase(connection, current, 'draining');
  if (current.phase === 'draining') {
    while (current.remainingCount !== '0' || current.drainFingerprint === '') {
      await connection.reducers.adminDrainLegacyFarmRetirement({
        expectedPhase: 'draining', limit: BATCH_LIMIT,
        verificationFingerprint: current.verificationFingerprint,
        expectedRemainingFingerprint: current.remainingFingerprint,
      });
      current = await readStatus(connection);
    }
    current = await setPhase(connection, current, 'schema_removal_candidate');
  }
  assertLegacyFarmSchemaRemovalCandidate(current);
  return current;
}

async function refreshCredential(credential: Required<Pick<StoredRejoinCredential, 'clientId' | 'refreshToken'>>) {
  const issuer = process.env['OIDC_ISSUER'] ?? 'https://auth.orchard.dastari.net/realms/orchard';
  const endpoint = new URL(`${issuer.replace(/\/$/u, '')}/protocol/openid-connect/token`);
  if (endpoint.protocol !== 'https:'
    && !(process.env['ALLOW_LOOPBACK_REJOIN_OIDC'] === '1'
      && ['127.0.0.1', 'localhost'].includes(endpoint.hostname))) {
    throw new Error('legacy_farm_retirement_refresh_requires_https');
  }
  const response = await fetch(endpoint, { method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: credential.clientId,
      refresh_token: credential.refreshToken }) });
  if (!response.ok) throw new Error(`legacy_farm_retirement_refresh_failed:${response.status}`);
  const payload = await response.json() as Record<string, unknown>;
  if (typeof payload['id_token'] !== 'string') throw new Error('legacy_farm_retirement_refresh_invalid');
  await verifyIdTokenSignature(payload['id_token'], `${issuer.replace(/\/$/u, '')}/protocol/openid-connect/certs`);
  validateIdTokenClaims(decodeJwtClaims(payload['id_token']), undefined, Date.now(),
    issuer.replace(/\/$/u, ''), credential.clientId);
  return { token: payload['id_token'], refreshToken: typeof payload['refresh_token'] === 'string'
    ? payload['refresh_token'] : credential.refreshToken };
}

async function ownerToken(): Promise<string> {
  const path = process.env['WORLD_REJOIN_TOKENS_FILE'];
  if (path === undefined) throw new Error('WORLD_REJOIN_TOKENS_FILE_required');
  const resolved = await refreshRejoinCredentialFile({ path, refresh: refreshCredential, requireRefresh: true });
  const label = process.env['LEGACY_FARM_RETIREMENT_OWNER_LABEL'];
  const selected = label === undefined ? resolved.credentials[0]
    : resolved.credentials.find((credential) => credential.label === label);
  if (selected === undefined) throw new Error('legacy_farm_retirement_owner_credential_missing');
  return selected.token;
}

async function connect(token: string): Promise<LegacyFarmRetirementConnection & { disconnect(): void }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('legacy_farm_retirement_connect_timeout')), TIMEOUT_MS);
    DbConnection.builder().withUri(HOST).withDatabaseName(DATABASE).withToken(token)
      .onConnect((connection) => {
        clearTimeout(timer);
        resolve(connection as unknown as LegacyFarmRetirementConnection & { disconnect(): void });
      })
      .onConnectError((_context, error) => { clearTimeout(timer); reject(error); })
      .build();
  });
}

async function main(): Promise<void> {
  if (process.env['LEGACY_FARM_RETIREMENT_CONFIRM'] !== `inspect:${DATABASE}`) {
    throw new Error(`LEGACY_FARM_RETIREMENT_CONFIRM_must_equal:inspect:${DATABASE}`);
  }
  const target = process.env['LEGACY_FARM_RETIREMENT_TARGET'];
  if (target !== 'rehearsal' && target !== 'production') {
    throw new Error('LEGACY_FARM_RETIREMENT_TARGET_required');
  }
  const allowDrain = process.env['LEGACY_FARM_RETIREMENT_DRAIN'] === '1';
  if (allowDrain && process.env['LEGACY_FARM_RETIREMENT_FINALIZER_RECEIPT'] !== `rehearsed:${DATABASE}`) {
    throw new Error(`LEGACY_FARM_RETIREMENT_FINALIZER_RECEIPT_must_equal:rehearsed:${DATABASE}`);
  }
  if (allowDrain && target === 'production'
    && process.env['LEGACY_FARM_RETIREMENT_PRODUCTION_CONFIRM'] !== DATABASE) {
    throw new Error('legacy_farm_retirement_production_confirmation_required');
  }
  const connection = await connect(await ownerToken());
  try {
    const result = await runLegacyFarmRetirement(connection, { allowDrain });
    process.stdout.write(`${JSON.stringify({ ok: true, target, database: DATABASE, phase: result.phase,
      inspectionFingerprint: result.inspectionFingerprint,
      verificationFingerprint: result.verificationFingerprint,
      drainFingerprint: result.drainFingerprint })}\n`);
  } finally {
    connection.disconnect();
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

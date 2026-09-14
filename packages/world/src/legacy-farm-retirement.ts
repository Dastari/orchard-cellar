export const LEGACY_FARM_RETIREMENT_BATCH_MAX = 100;
export const LEGACY_FARM_RETIREMENT_MIGRATION_VERSION = 1;

export type LegacyFarmRetirementPhase =
  | 'inspect'
  | 'parity_verified'
  | 'draining'
  | 'schema_removal_candidate';

export interface LegacyPrivateInventoryRow {
  readonly identity: string;
  readonly fruit: bigint;
  readonly bottles: bigint;
  readonly knowledge: number;
}

export interface LegacyPlayerSurvivalCompatibilityRow {
  readonly identity: string;
  readonly wood: number;
  readonly stone: number;
}

export interface LegacyFarmParcelRow {
  readonly id: bigint;
  readonly owner: string;
  readonly name: string;
  readonly originX: number;
  readonly originY: number;
  readonly width: number;
  readonly height: number;
}

export interface LegacyCropPatchRow {
  readonly id: bigint;
  readonly parcelId: bigint;
  readonly owner: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly chunkX: number;
  readonly chunkY: number;
  readonly plantedAtTick: bigint;
  readonly watered: boolean;
  readonly wateredAtTick: bigint;
  readonly spaceId: number;
}

export interface LegacyFarmActivityRow {
  readonly identity: string;
  readonly planted: number;
  readonly watered: number;
  readonly harvested: number;
}

export interface LegacyFarmRetirementSource {
  /** The durable marker was committed atomically with the original migration. */
  readonly migrationVersion: number;
  readonly privateInventory: readonly LegacyPrivateInventoryRow[];
  /** Only rows with non-zero compatibility balances need a drain write. */
  readonly playerSurvivalCompatibility: readonly LegacyPlayerSurvivalCompatibilityRow[];
  readonly farmParcels: readonly LegacyFarmParcelRow[];
  readonly cropPatches: readonly LegacyCropPatchRow[];
  readonly farmActivity: readonly LegacyFarmActivityRow[];
}

export interface LegacyFarmRetirementCounts {
  readonly privateInventory: number;
  readonly playerSurvivalCompatibility: number;
  readonly farmParcels: number;
  readonly cropPatches: number;
  readonly farmActivity: number;
  readonly total: number;
}

export interface LegacyFarmRetirementInspection {
  readonly counts: LegacyFarmRetirementCounts;
  readonly sourceFingerprint: string;
}

export interface LegacyFarmRetirementVerification extends LegacyFarmRetirementInspection {
  readonly verificationFingerprint: string;
}

export interface LegacyFarmRetirementDrainPlan {
  readonly privateInventoryIdentities: readonly string[];
  readonly playerSurvivalCompatibilityIdentities: readonly string[];
  readonly farmParcelIds: readonly bigint[];
  readonly cropPatchIds: readonly bigint[];
  readonly farmActivityIdentities: readonly string[];
  readonly rowsDrained: number;
  readonly remainingCounts: LegacyFarmRetirementCounts;
  readonly remainingFingerprint: string;
  readonly drainFingerprint: string;
}

function fail(code: string): never { throw new Error(code); }

function stableJson(value: unknown): string {
  if (typeof value === 'bigint') return JSON.stringify(`${value}n`);
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
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

function identityOrder<T extends { readonly identity: string }>(rows: readonly T[]): T[] {
  return [...rows].sort((left, right) => left.identity.localeCompare(right.identity));
}

function idOrder<T extends { readonly id: bigint }>(rows: readonly T[]): T[] {
  return [...rows].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

function normalizedSource(source: LegacyFarmRetirementSource): LegacyFarmRetirementSource {
  return {
    migrationVersion: source.migrationVersion,
    privateInventory: identityOrder(source.privateInventory),
    playerSurvivalCompatibility: identityOrder(source.playerSurvivalCompatibility)
      .filter(({ wood, stone }) => wood !== 0 || stone !== 0),
    farmParcels: idOrder(source.farmParcels),
    cropPatches: idOrder(source.cropPatches),
    farmActivity: identityOrder(source.farmActivity),
  };
}

function counts(source: LegacyFarmRetirementSource): LegacyFarmRetirementCounts {
  const result = {
    privateInventory: source.privateInventory.length,
    playerSurvivalCompatibility: source.playerSurvivalCompatibility.length,
    farmParcels: source.farmParcels.length,
    cropPatches: source.cropPatches.length,
    farmActivity: source.farmActivity.length,
  };
  return Object.freeze({ ...result, total: Object.values(result).reduce((sum, count) => sum + count, 0) });
}

export function inspectLegacyFarmRetirement(
  source: LegacyFarmRetirementSource,
  maximumRows: number,
): LegacyFarmRetirementInspection {
  if (!Number.isSafeInteger(maximumRows) || maximumRows < 1) fail('legacy_farm_retirement_limit_invalid');
  const normalized = normalizedSource(source);
  const sourceCounts = counts(normalized);
  if (sourceCounts.total > maximumRows) fail('legacy_farm_retirement_inspection_truncated');
  return Object.freeze({
    counts: sourceCounts,
    sourceFingerprint: `legacy-farm-source:${fingerprint(normalized)}`,
  });
}

/**
 * The migration marker is the historical parity receipt: SpacetimeDB committed
 * it in the same reducer transaction as the inventory/world/statistic backfill.
 * Present-day target equality is deliberately not required because legitimate
 * play can consume migrated items, harvest crops, or advance statistics.
 */
export function verifyLegacyFarmRetirement(
  source: LegacyFarmRetirementSource,
  maximumRows: number,
  expectedSourceFingerprint: string,
): LegacyFarmRetirementVerification {
  if (source.migrationVersion < LEGACY_FARM_RETIREMENT_MIGRATION_VERSION) {
    fail('legacy_farm_retirement_migration_incomplete');
  }
  const inspection = inspectLegacyFarmRetirement(source, maximumRows);
  if (inspection.sourceFingerprint !== expectedSourceFingerprint) {
    fail('legacy_farm_retirement_inspection_stale');
  }
  return Object.freeze({
    ...inspection,
    verificationFingerprint: `legacy-farm-verification:${fingerprint({
      migrationVersion: source.migrationVersion,
      sourceFingerprint: inspection.sourceFingerprint,
      counts: inspection.counts,
    })}`,
  });
}

function withoutSelected<T>(rows: readonly T[], selected: ReadonlySet<T>): T[] {
  return rows.filter((row) => !selected.has(row));
}

export function planLegacyFarmRetirementDrain(
  source: LegacyFarmRetirementSource,
  request: {
    readonly limit: number;
    readonly expectedRemainingFingerprint: string;
    readonly verificationFingerprint: string;
    readonly previousDrainFingerprint: string;
  },
): LegacyFarmRetirementDrainPlan {
  if (!Number.isSafeInteger(request.limit) || request.limit < 1
    || request.limit > LEGACY_FARM_RETIREMENT_BATCH_MAX) fail('legacy_farm_retirement_limit_invalid');
  if (!request.verificationFingerprint.startsWith('legacy-farm-verification:')) {
    fail('legacy_farm_retirement_verification_missing');
  }
  const normalized = normalizedSource(source);
  const currentInspection = inspectLegacyFarmRetirement(normalized, Number.MAX_SAFE_INTEGER);
  if (currentInspection.sourceFingerprint !== request.expectedRemainingFingerprint) {
    fail('legacy_farm_retirement_source_drift');
  }

  let remaining = request.limit;
  const privateInventory = normalized.privateInventory.slice(0, remaining); remaining -= privateInventory.length;
  const survival = normalized.playerSurvivalCompatibility.slice(0, remaining); remaining -= survival.length;
  const parcels = normalized.farmParcels.slice(0, remaining); remaining -= parcels.length;
  const patches = normalized.cropPatches.slice(0, remaining); remaining -= patches.length;
  const activity = normalized.farmActivity.slice(0, remaining); remaining -= activity.length;
  const after: LegacyFarmRetirementSource = {
    migrationVersion: normalized.migrationVersion,
    privateInventory: withoutSelected(normalized.privateInventory, new Set(privateInventory)),
    playerSurvivalCompatibility: withoutSelected(normalized.playerSurvivalCompatibility, new Set(survival)),
    farmParcels: withoutSelected(normalized.farmParcels, new Set(parcels)),
    cropPatches: withoutSelected(normalized.cropPatches, new Set(patches)),
    farmActivity: withoutSelected(normalized.farmActivity, new Set(activity)),
  };
  const remainingInspection = inspectLegacyFarmRetirement(after, Number.MAX_SAFE_INTEGER);
  const receipt = {
    previousDrainFingerprint: request.previousDrainFingerprint,
    verificationFingerprint: request.verificationFingerprint,
    before: currentInspection.sourceFingerprint,
    after: remainingInspection.sourceFingerprint,
    privateInventory: privateInventory.map(({ identity }) => identity),
    playerSurvivalCompatibility: survival.map(({ identity }) => identity),
    farmParcels: parcels.map(({ id }) => id),
    cropPatches: patches.map(({ id }) => id),
    farmActivity: activity.map(({ identity }) => identity),
  };
  return Object.freeze({
    privateInventoryIdentities: Object.freeze(receipt.privateInventory),
    playerSurvivalCompatibilityIdentities: Object.freeze(receipt.playerSurvivalCompatibility),
    farmParcelIds: Object.freeze(receipt.farmParcels),
    cropPatchIds: Object.freeze(receipt.cropPatches),
    farmActivityIdentities: Object.freeze(receipt.farmActivity),
    rowsDrained: request.limit - remaining,
    remainingCounts: remainingInspection.counts,
    remainingFingerprint: remainingInspection.sourceFingerprint,
    drainFingerprint: `legacy-farm-drain:${fingerprint(receipt)}`,
  });
}

const NEXT_PHASE: Readonly<Record<LegacyFarmRetirementPhase, LegacyFarmRetirementPhase | null>> = {
  inspect: 'parity_verified',
  parity_verified: 'draining',
  draining: 'schema_removal_candidate',
  schema_removal_candidate: null,
};

export function planLegacyFarmRetirementTransition(
  currentPhase: LegacyFarmRetirementPhase,
  request: {
    readonly expectedPhase: LegacyFarmRetirementPhase;
    readonly nextPhase: LegacyFarmRetirementPhase;
    readonly verificationFingerprint: string;
    readonly expectedVerificationFingerprint: string;
    readonly drainFingerprint: string;
    readonly expectedDrainFingerprint: string;
    readonly remainingFingerprint: string;
    readonly expectedEmptyFingerprint: string;
    readonly remainingCount: number;
  },
): LegacyFarmRetirementPhase {
  if (currentPhase !== request.expectedPhase) fail('legacy_farm_retirement_phase_stale');
  if (NEXT_PHASE[currentPhase] !== request.nextPhase) fail('legacy_farm_retirement_phase_invalid');
  if (!request.verificationFingerprint.startsWith('legacy-farm-verification:')
    || request.verificationFingerprint !== request.expectedVerificationFingerprint) {
    fail('legacy_farm_retirement_verification_stale');
  }
  if (request.nextPhase === 'schema_removal_candidate'
    && (request.remainingCount !== 0
      || request.remainingFingerprint !== request.expectedEmptyFingerprint
      || !request.drainFingerprint.startsWith('legacy-farm-drain:')
      || request.drainFingerprint !== request.expectedDrainFingerprint)) {
    fail('legacy_farm_retirement_candidate_not_ready');
  }
  return request.nextPhase;
}

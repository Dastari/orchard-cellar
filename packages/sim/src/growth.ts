/** Fixed-point denominator for composable growth-rate modifiers. */
export const GROWTH_RATE_BASIS_POINTS = 10_000;

/** Inputs shared by trees, crops, and any other persisted growth lifecycle. */
export interface GrowthRateModifiers {
  readonly waterBps?: number;
  readonly fertilizerBps?: number;
  readonly poisonBps?: number;
  readonly biomeBps?: number;
}

export interface GrowthProfile {
  readonly maxProgress: number;
  /** Ascending progress values at which each visible stage becomes active. */
  readonly stageThresholds: readonly number[];
}

function finiteInteger(value: number | undefined): number {
  return value === undefined || !Number.isFinite(value) ? 0 : Math.trunc(value);
}

/** Growth cannot reverse below zero. A combined -100% modifier pauses it. */
export function growthRateBasisPoints(modifiers: GrowthRateModifiers = {}): number {
  const adjustment = finiteInteger(modifiers.waterBps)
    + finiteInteger(modifiers.fertilizerBps)
    + finiteInteger(modifiers.poisonBps)
    + finiteInteger(modifiers.biomeBps);
  return Math.max(0, GROWTH_RATE_BASIS_POINTS + adjustment);
}

/** A generic preference helper for crop definitions and biome-aware plants. */
export function preferredBiomeGrowthModifier(
  actualBiome: string,
  preferredBiomes: readonly string[],
  unsuitablePenaltyBps = -5_000,
): number {
  return preferredBiomes.length === 0 || preferredBiomes.includes(actualBiome)
    ? 0
    : Math.min(0, finiteInteger(unsuitablePenaltyBps));
}

/** Deterministically converts a fractional rate into whole progress units. */
export function growthIncrementAtSweep(
  authorityTick: bigint,
  sweepTicks: number,
  modifiers: GrowthRateModifiers = {},
  phaseSeed = 0,
): number {
  if (!Number.isInteger(sweepTicks) || sweepTicks <= 0) return 0;
  const rate = growthRateBasisPoints(modifiers);
  const whole = Math.floor(rate / GROWTH_RATE_BASIS_POINTS);
  const remainder = rate % GROWTH_RATE_BASIS_POINTS;
  if (remainder === 0) return whole;
  const sweep = authorityTick / BigInt(sweepTicks);
  const phase = BigInt(Math.abs(Math.trunc(phaseSeed)) % GROWTH_RATE_BASIS_POINTS);
  const roll = Number((sweep * 7_919n + phase * 104_729n) % BigInt(GROWTH_RATE_BASIS_POINTS));
  return whole + (roll < remainder ? 1 : 0);
}

export function advanceGrowthProgressAtSweep(
  progress: number,
  profile: GrowthProfile,
  authorityTick: bigint,
  sweepTicks: number,
  modifiers: GrowthRateModifiers = {},
  phaseSeed = 0,
): number {
  const maximum = Math.max(0, Math.trunc(profile.maxProgress));
  const current = Math.max(0, Math.min(maximum, Math.floor(progress)));
  return Math.min(maximum, current + growthIncrementAtSweep(authorityTick, sweepTicks, modifiers, phaseSeed));
}

/**
 * Closed-form counterpart for large crop populations. Store a start tick and
 * modifiers, derive progress when queried, and avoid per-crop scheduled writes.
 */
export function growthProgressForElapsedTicks(
  startProgress: number,
  elapsedTicks: bigint,
  sweepTicks: number,
  profile: GrowthProfile,
  modifiers: GrowthRateModifiers = {},
): number {
  if (!Number.isInteger(sweepTicks) || sweepTicks <= 0 || elapsedTicks <= 0n) {
    return Math.max(0, Math.min(Math.trunc(profile.maxProgress), Math.floor(startProgress)));
  }
  const sweeps = elapsedTicks / BigInt(sweepTicks);
  const gained = sweeps * BigInt(growthRateBasisPoints(modifiers)) / BigInt(GROWTH_RATE_BASIS_POINTS);
  const maximum = Math.max(0, Math.trunc(profile.maxProgress));
  return Math.min(maximum, Math.max(0, Math.floor(startProgress)) + Number(gained));
}

/** Zero-based visible stage, or null while the object remains a stump/seed. */
export function growthStageIndexForProgress(profile: GrowthProfile, progress: number): number | null {
  const current = Math.max(0, Math.min(Math.trunc(profile.maxProgress), Math.floor(progress)));
  let stage: number | null = null;
  for (const [index, threshold] of profile.stageThresholds.entries()) {
    if (current < threshold) break;
    stage = index;
  }
  return stage;
}

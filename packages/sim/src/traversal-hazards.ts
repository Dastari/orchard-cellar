import type { MediumHazard } from './traversal.js';

/** Numerator carries fractional health units across periods and brief exits.
 * The unit can be centi-HP for players or whole HP for existing NPC rows. */
export interface HazardDamageState {
  readonly numerator: bigint;
  readonly elapsedTicks: number;
}
export interface HazardDamageStep {
  readonly state: HazardDamageState;
  readonly damage: number;
}
/** Accumulates actual exposed time, never offline catch-up. Application cadence
 * counts simulation ticks, not calls or frames. Integer carry prevents tiny
 * health pools from rounding every pulse down to zero. */
export function advanceHazardDamage(
  previous: HazardDamageState,
  hazard: MediumHazard,
  maximumHealth: number,
  elapsedTicks: number,
  ticksPerSecond: number,
  exposed: boolean,
  immune: boolean,
): HazardDamageStep {
  if (!Number.isSafeInteger(maximumHealth) || maximumHealth <= 0
    || !Number.isSafeInteger(elapsedTicks) || elapsedTicks < 0
    || !Number.isSafeInteger(ticksPerSecond) || ticksPerSecond <= 0
    || !Number.isSafeInteger(hazard.intervalTicks) || hazard.intervalTicks <= 0
    || !Number.isSafeInteger(hazard.maxHealthBasisPointsPerSecond) || hazard.maxHealthBasisPointsPerSecond <= 0
    || !Number.isSafeInteger(previous.elapsedTicks) || previous.elapsedTicks < 0
    || previous.elapsedTicks >= hazard.intervalTicks || previous.numerator < 0n) {
    throw new RangeError('invalid_hazard_damage_state');
  }
  if (immune) return { state: { numerator: 0n, elapsedTicks: 0 }, damage: 0 };
  const denominator = 10_000n * BigInt(ticksPerSecond);
  const perTick = exposed && !immune
    ? BigInt(maximumHealth) * BigInt(hazard.maxHealthBasisPointsPerSecond) : 0n;
  let numerator = previous.numerator;
  let remaining = elapsedTicks;
  let phase = previous.elapsedTicks;
  let damage = 0n;
  while (remaining > 0) {
    const step = Math.min(remaining, hazard.intervalTicks - phase);
    numerator += perTick * BigInt(step);
    phase += step;
    remaining -= step;
    if (phase === hazard.intervalTicks) {
      damage += numerator / denominator;
      numerator %= denominator;
      phase = 0;
    }
  }
  const applied = Number(damage);
  if (!Number.isSafeInteger(applied)) throw new RangeError('hazard_damage_overflow');
  return { state: { numerator, elapsedTicks: phase }, damage: applied };
}

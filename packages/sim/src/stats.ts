import {
  BASE_ATTRIBUTE,
  HEALTH_CENTI_PER_STRENGTH,
  HEALTH_REGEN_CENTI_PER_SECOND,
  MANA_CENTI_PER_INTELLIGENCE,
  MANA_REGEN_CENTI_PER_WISDOM,
  MAX_ATTRIBUTE,
  MIN_ATTRIBUTE,
  VIGOUR_CENTI_PER_CONSTITUTION,
  VIGOUR_REGEN_CENTI_PER_CONSTITUTION,
} from './balance.js';
import { AUTHORITY_HZ } from './net-timing.js';
import { resolveModifierTarget, type Modifier } from './modifiers.js';

export const ATTRIBUTE_IDS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
export type AttributeId = typeof ATTRIBUTE_IDS[number];

export interface Attributes {
  readonly str: number;
  readonly dex: number;
  readonly con: number;
  readonly int: number;
  readonly wis: number;
  readonly cha: number;
}

export const BASE_ATTRIBUTES: Attributes = {
  str: BASE_ATTRIBUTE,
  dex: BASE_ATTRIBUTE,
  con: BASE_ATTRIBUTE,
  int: BASE_ATTRIBUTE,
  wis: BASE_ATTRIBUTE,
  cha: BASE_ATTRIBUTE,
};

export interface ResolvedStats {
  readonly attributes: Attributes;
  readonly maxHealthCenti: number;
  readonly maxManaCenti: number;
  readonly maxVigourCenti: number;
  readonly healthRegenCentiPerSecond: number;
  readonly manaRegenCentiPerSecond: number;
  readonly vigourRegenCentiPerSecond: number;
}

export interface VitalState {
  readonly healthCenti: number;
  readonly manaCenti: number;
  readonly vigourCenti: number;
  readonly healthRemainder: number;
  readonly manaRemainder: number;
  readonly vigourRemainder: number;
  readonly regenTick: bigint;
}

function clampAttribute(value: number): number {
  return Math.max(MIN_ATTRIBUTE, Math.min(MAX_ATTRIBUTE, Math.floor(value)));
}

export function createBaseAttributes(overrides: Partial<Attributes> = {}): Attributes {
  return Object.fromEntries(ATTRIBUTE_IDS.map((attribute) => [
    attribute,
    clampAttribute(overrides[attribute] ?? BASE_ATTRIBUTE),
  ])) as unknown as Attributes;
}

export function checkModifier(attribute: number): number {
  return Math.floor((attribute - BASE_ATTRIBUTE) / 2);
}

/** Two-pass resolution: attributes first, then values derived from the resolved
 * attributes plus modifiers aimed directly at those derived targets. */
export function resolveStats(
  baseAttributes: Attributes = BASE_ATTRIBUTES,
  modifiers: readonly Modifier[] = [],
): ResolvedStats {
  const attributes = Object.fromEntries(ATTRIBUTE_IDS.map((attribute) => [
    attribute,
    resolveModifierTarget(attribute, clampAttribute(baseAttributes[attribute]), modifiers),
  ])) as unknown as Attributes;
  return {
    attributes,
    maxHealthCenti: resolveModifierTarget(
      'maxHealth', attributes.str * HEALTH_CENTI_PER_STRENGTH, modifiers,
    ),
    maxManaCenti: resolveModifierTarget(
      'maxMana', attributes.int * MANA_CENTI_PER_INTELLIGENCE, modifiers,
    ),
    maxVigourCenti: resolveModifierTarget(
      'maxVigour', attributes.con * VIGOUR_CENTI_PER_CONSTITUTION, modifiers,
    ),
    healthRegenCentiPerSecond: resolveModifierTarget(
      'healthRegen', HEALTH_REGEN_CENTI_PER_SECOND, modifiers,
    ),
    manaRegenCentiPerSecond: resolveModifierTarget(
      'manaRegen', attributes.wis * MANA_REGEN_CENTI_PER_WISDOM, modifiers,
    ),
    vigourRegenCentiPerSecond: resolveModifierTarget(
      'vigourRegen', attributes.con * VIGOUR_REGEN_CENTI_PER_CONSTITUTION, modifiers,
    ),
  };
}

export function createFullVitalState(stats: ResolvedStats, regenTick = 0n): VitalState {
  return {
    healthCenti: stats.maxHealthCenti,
    manaCenti: stats.maxManaCenti,
    vigourCenti: stats.maxVigourCenti,
    healthRemainder: 0,
    manaRemainder: 0,
    vigourRemainder: 0,
    regenTick,
  };
}

function advanceVital(
  current: number,
  remainder: number,
  maximum: number,
  ratePerSecond: number,
  elapsedTicks: bigint,
): readonly [value: number, remainder: number] {
  const clamped = Math.max(0, Math.min(maximum, current));
  if (clamped >= maximum || ratePerSecond <= 0) return [clamped, 0];
  if (elapsedTicks <= 0n) return [clamped, Math.max(0, remainder) % AUTHORITY_HZ];
  const numerator = BigInt(ratePerSecond) * elapsedTicks + BigInt(Math.max(0, remainder));
  const gain = numerator / BigInt(AUTHORITY_HZ);
  const room = BigInt(maximum - clamped);
  if (gain >= room) return [maximum, 0];
  return [clamped + Number(gain), Number(numerator % BigInt(AUTHORITY_HZ))];
}

/** Lazy, exact catch-up. BigInt tick arithmetic prevents long offline gaps from
 * losing precision; no value can bank regeneration while already full. */
export function advanceVitals(
  state: VitalState,
  stats: ResolvedStats,
  authorityTick: bigint,
): VitalState {
  const elapsed = authorityTick > state.regenTick ? authorityTick - state.regenTick : 0n;
  const [healthCenti, healthRemainder] = advanceVital(
    state.healthCenti, state.healthRemainder, stats.maxHealthCenti,
    stats.healthRegenCentiPerSecond, elapsed,
  );
  const [manaCenti, manaRemainder] = advanceVital(
    state.manaCenti, state.manaRemainder, stats.maxManaCenti,
    stats.manaRegenCentiPerSecond, elapsed,
  );
  const [vigourCenti, vigourRemainder] = advanceVital(
    state.vigourCenti, state.vigourRemainder, stats.maxVigourCenti,
    stats.vigourRegenCentiPerSecond, elapsed,
  );
  return {
    healthCenti,
    manaCenti,
    vigourCenti,
    healthRemainder,
    manaRemainder,
    vigourRemainder,
    regenTick: authorityTick > state.regenTick ? authorityTick : state.regenTick,
  };
}

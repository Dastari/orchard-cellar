import {
  BOOTSTRAP_CHARACTER_COMBAT_BALANCE,
  type CharacterCombatBalanceProfile,
} from './character-combat-balance.js';
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
  str: BOOTSTRAP_CHARACTER_COMBAT_BALANCE.baseAttribute,
  dex: BOOTSTRAP_CHARACTER_COMBAT_BALANCE.baseAttribute,
  con: BOOTSTRAP_CHARACTER_COMBAT_BALANCE.baseAttribute,
  int: BOOTSTRAP_CHARACTER_COMBAT_BALANCE.baseAttribute,
  wis: BOOTSTRAP_CHARACTER_COMBAT_BALANCE.baseAttribute,
  cha: BOOTSTRAP_CHARACTER_COMBAT_BALANCE.baseAttribute,
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

function clampAttribute(profile: CharacterCombatBalanceProfile, value: number): number {
  return Math.max(profile.minimumAttribute, Math.min(profile.maximumAttribute, Math.floor(value)));
}

export function createBaseAttributesWithProfile(profile: CharacterCombatBalanceProfile,
  overrides: Partial<Attributes> = {}): Attributes {
  return Object.fromEntries(ATTRIBUTE_IDS.map((attribute) => [
    attribute,
    clampAttribute(profile, overrides[attribute] ?? profile.baseAttribute),
  ])) as unknown as Attributes;
}

export function createBaseAttributes(overrides: Partial<Attributes> = {}): Attributes {
  return createBaseAttributesWithProfile(BOOTSTRAP_CHARACTER_COMBAT_BALANCE, overrides);
}

export function checkModifierWithProfile(profile: CharacterCombatBalanceProfile, attribute: number): number {
  return Math.floor((attribute - profile.baseAttribute) / 2);
}

export function checkModifier(attribute: number): number {
  return checkModifierWithProfile(BOOTSTRAP_CHARACTER_COMBAT_BALANCE, attribute);
}

/** Two-pass resolution: attributes first, then values derived from the resolved
 * attributes plus modifiers aimed directly at those derived targets. */
export function resolveStatsWithProfile(
  profile: CharacterCombatBalanceProfile,
  baseAttributes: Attributes = createBaseAttributesWithProfile(profile),
  modifiers: readonly Modifier[] = [],
): ResolvedStats {
  const attributes = Object.fromEntries(ATTRIBUTE_IDS.map((attribute) => [
    attribute,
    resolveModifierTarget(attribute, clampAttribute(profile, baseAttributes[attribute]), modifiers, profile),
  ])) as unknown as Attributes;
  return {
    attributes,
    maxHealthCenti: resolveModifierTarget(
      'maxHealth', attributes.str * profile.healthCentiPerStrength, modifiers, profile,
    ),
    maxManaCenti: resolveModifierTarget(
      'maxMana', attributes.int * profile.manaCentiPerIntelligence, modifiers, profile,
    ),
    maxVigourCenti: resolveModifierTarget(
      'maxVigour', attributes.con * profile.vigourCentiPerConstitution, modifiers, profile,
    ),
    healthRegenCentiPerSecond: resolveModifierTarget(
      'healthRegen', profile.healthRegenCentiPerSecond, modifiers, profile,
    ),
    manaRegenCentiPerSecond: resolveModifierTarget(
      'manaRegen', attributes.wis * profile.manaRegenCentiPerWisdom, modifiers, profile,
    ),
    vigourRegenCentiPerSecond: resolveModifierTarget(
      'vigourRegen', attributes.con * profile.vigourRegenCentiPerConstitution, modifiers, profile,
    ),
  };
}

export function resolveStats(
  baseAttributes: Attributes = BASE_ATTRIBUTES,
  modifiers: readonly Modifier[] = [],
): ResolvedStats {
  return resolveStatsWithProfile(BOOTSTRAP_CHARACTER_COMBAT_BALANCE, baseAttributes, modifiers);
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

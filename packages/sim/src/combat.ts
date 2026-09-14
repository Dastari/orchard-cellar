import {
  BOOTSTRAP_CHARACTER_COMBAT_BALANCE,
  type CharacterCombatBalanceProfile,
} from './character-combat-balance.js';
import { statelessRoll, type SkillCheckSeedPart } from './checks.js';
import { resolveModifierTarget, type Modifier } from './modifiers.js';

export type CombatAttackKind = 'melee' | 'ranged';

export interface CombatDamageInput {
  readonly attackKind: CombatAttackKind;
  readonly weaponBaseCenti: number;
  readonly scalingAttribute: number;
  readonly armorCenti: number;
  readonly armorPctBasisPoints: number;
  readonly seedParts: readonly SkillCheckSeedPart[];
  readonly attackerModifiers?: readonly Modifier[];
  readonly defenderModifiers?: readonly Modifier[];
}

export interface CombatDamageResult {
  readonly damageCenti: number;
  readonly attackPowerCenti: number;
  readonly variancePermille: number;
  readonly critical: boolean;
  readonly armorCenti: number;
  readonly armorPctBasisPoints: number;
}

function safeNonNegativeInteger(label: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative safe integer`);
  return value;
}

/** docs/32 §3: one deterministic integer damage path for every present and
 * future actor. Callers supply authority-owned stats and stable seed parts. */
export function resolveCombatDamage(input: CombatDamageInput): CombatDamageResult {
  return resolveCombatDamageWithProfile(BOOTSTRAP_CHARACTER_COMBAT_BALANCE, input);
}

export function resolveCombatDamageWithProfile(
  profile: CharacterCombatBalanceProfile,
  input: CombatDamageInput,
): CombatDamageResult {
  const attackerModifiers = input.attackerModifiers ?? [];
  const defenderModifiers = input.defenderModifiers ?? [];
  const weaponBaseCenti = safeNonNegativeInteger('weaponBaseCenti', input.weaponBaseCenti);
  const scalingAttribute = safeNonNegativeInteger('scalingAttribute', input.scalingAttribute);
  const baseAttackPower = Math.floor(weaponBaseCenti * scalingAttribute / 10);
  const attackPowerCenti = resolveModifierTarget(
    input.attackKind === 'ranged' ? 'rangedPower' : 'attackPower',
    baseAttackPower,
    attackerModifiers, profile,
  );
  const variancePermille = 900 + statelessRoll([...input.seedParts, 'variance'], 201);
  const criticalChanceBasisPoints = resolveModifierTarget('criticalChance', 1_000, attackerModifiers, profile);
  const critical = statelessRoll([...input.seedParts, 'critical'], 10_000) < criticalChanceBasisPoints;
  const variedPower = Math.floor(attackPowerCenti * variancePermille / 1_000);
  const criticalPower = critical ? Math.floor(variedPower * 3 / 2) : variedPower;
  const mitigation = resolveCombatMitigationWithProfile(
    profile, criticalPower, input.armorCenti, input.armorPctBasisPoints, defenderModifiers,
  );
  return {
    damageCenti: Math.max(profile.combatMinimumDamageCenti, mitigation.damageCenti),
    attackPowerCenti,
    variancePermille,
    critical,
    armorCenti: mitigation.armorCenti,
    armorPctBasisPoints: mitigation.armorPctBasisPoints,
  };
}

/** Exact lazy regeneration: unoccupied spaces need no ticking writes and catch
 * up deterministically when next occupied or damaged. */
export function regeneratedCombatTargetHealth(
  healthCenti: number,
  maxHealthCenti: number,
  regenCentiPerSecond: number,
  fromTick: bigint,
  toTick: bigint,
  authorityHz: number,
): number {
  if (toTick <= fromTick || healthCenti >= maxHealthCenti) return Math.min(healthCenti, maxHealthCenti);
  const elapsedTicks = toTick - fromTick;
  const recovered = BigInt(regenCentiPerSecond) * elapsedTicks / BigInt(authorityHz);
  return Math.min(maxHealthCenti, healthCenti + Number(recovered));
}

/** Shared incoming damage calculation. Fixed-power enemy patterns use this
 * without gaining the player's random critical/variance roll. */
export function resolveCombatMitigation(
  damageCenti: number, baseArmorCenti = 0, baseArmorPctBasisPoints = 0,
  defenderModifiers: readonly Modifier[] = [],
): { readonly damageCenti: number; readonly armorCenti: number; readonly armorPctBasisPoints: number } {
  return resolveCombatMitigationWithProfile(
    BOOTSTRAP_CHARACTER_COMBAT_BALANCE,
    damageCenti, baseArmorCenti, baseArmorPctBasisPoints, defenderModifiers,
  );
}

export function resolveCombatMitigationWithProfile(
  profile: CharacterCombatBalanceProfile,
  damageCenti: number, baseArmorCenti = 0, baseArmorPctBasisPoints = 0,
  defenderModifiers: readonly Modifier[] = [],
): { readonly damageCenti: number; readonly armorCenti: number; readonly armorPctBasisPoints: number } {
  safeNonNegativeInteger('damageCenti', damageCenti);
  const armorCenti = resolveModifierTarget(
    'armor',
    safeNonNegativeInteger('armorCenti', baseArmorCenti),
    defenderModifiers, profile,
  );
  const armorPctBasisPoints = resolveModifierTarget(
    'armorPct',
    safeNonNegativeInteger('armorPctBasisPoints', baseArmorPctBasisPoints),
    defenderModifiers, profile,
  );
  const afterFlatArmor = Math.max(0, damageCenti - armorCenti);
  const afterPercentArmor = Math.floor(
    afterFlatArmor * (profile.basisPoints - armorPctBasisPoints) / profile.basisPoints,
  );
  return { damageCenti: damageCenti === 0 ? 0 : Math.max(profile.combatMinimumDamageCenti, afterPercentArmor), armorCenti, armorPctBasisPoints };
}

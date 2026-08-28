import {
  BASIS_POINTS,
  COMBAT_MINIMUM_DAMAGE_CENTI,
} from './balance.js';
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
  const attackerModifiers = input.attackerModifiers ?? [];
  const defenderModifiers = input.defenderModifiers ?? [];
  const weaponBaseCenti = safeNonNegativeInteger('weaponBaseCenti', input.weaponBaseCenti);
  const scalingAttribute = safeNonNegativeInteger('scalingAttribute', input.scalingAttribute);
  const baseAttackPower = Math.floor(weaponBaseCenti * scalingAttribute / 10);
  const attackPowerCenti = resolveModifierTarget(
    input.attackKind === 'ranged' ? 'rangedPower' : 'attackPower',
    baseAttackPower,
    attackerModifiers,
  );
  const variancePermille = 900 + statelessRoll([...input.seedParts, 'variance'], 201);
  const critical = statelessRoll([...input.seedParts, 'critical'], 20) >= 18;
  const variedPower = Math.floor(attackPowerCenti * variancePermille / 1_000);
  const criticalPower = critical ? Math.floor(variedPower * 3 / 2) : variedPower;
  const armorCenti = resolveModifierTarget(
    'armor',
    safeNonNegativeInteger('armorCenti', input.armorCenti),
    defenderModifiers,
  );
  const armorPctBasisPoints = resolveModifierTarget(
    'armorPct',
    safeNonNegativeInteger('armorPctBasisPoints', input.armorPctBasisPoints),
    defenderModifiers,
  );
  const afterFlatArmor = Math.max(0, criticalPower - armorCenti);
  const afterPercentArmor = Math.floor(
    afterFlatArmor * (BASIS_POINTS - armorPctBasisPoints) / BASIS_POINTS,
  );
  return {
    damageCenti: Math.max(COMBAT_MINIMUM_DAMAGE_CENTI, afterPercentArmor),
    attackPowerCenti,
    variancePermille,
    critical,
    armorCenti,
    armorPctBasisPoints,
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

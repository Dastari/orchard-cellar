import { balanceFieldsTuple, balanceTupleFields } from './content/balance-fields.js';
import balanceJson from '../../assets/content/balance.json' with { type: 'json' };
import type {
  CharacterCombatBalanceContentDefinition,
  CharacterCombatBalanceTuple,
} from './content/balance-definition.js';
import type { ContentRegistry } from './content/registry.js';

export interface CharacterCombatBalanceProfile {
  readonly baseAttribute: number;
  readonly minimumAttribute: number;
  readonly maximumAttribute: number;
  readonly basisPoints: number;
  readonly centiUnitsPerDisplayUnit: number;
  readonly healthCentiPerStrength: number;
  readonly manaCentiPerIntelligence: number;
  readonly vigourCentiPerConstitution: number;
  readonly healthRegenCentiPerSecond: number;
  readonly manaRegenCentiPerWisdom: number;
  readonly vigourRegenCentiPerConstitution: number;
  readonly regenSweepTicks: number;
  readonly bowBaseDamageCenti: number;
  readonly swordBaseDamageCenti: number;
  readonly combatMinimumDamageCenti: number;
  readonly archeryTargetMaxHealthCenti: number;
  readonly archeryTargetRegenCentiPerSecond: number;
  readonly archeryTargetRegenIntervalTicks: number;
}

export function characterCombatBalanceFromTuple(
  values: CharacterCombatBalanceTuple,
): CharacterCombatBalanceProfile {
  return Object.freeze({
    baseAttribute: values[0], minimumAttribute: values[1], maximumAttribute: values[2],
    basisPoints: values[3], centiUnitsPerDisplayUnit: values[4],
    healthCentiPerStrength: values[5], manaCentiPerIntelligence: values[6],
    vigourCentiPerConstitution: values[7], healthRegenCentiPerSecond: values[8],
    manaRegenCentiPerWisdom: values[9], vigourRegenCentiPerConstitution: values[10],
    regenSweepTicks: values[11], bowBaseDamageCenti: values[12], swordBaseDamageCenti: values[13],
    combatMinimumDamageCenti: values[14], archeryTargetMaxHealthCenti: values[15],
    archeryTargetRegenCentiPerSecond: values[16], archeryTargetRegenIntervalTicks: values[17],
  });
}

export function runtimeCharacterCombatBalance(
  registry: Pick<ContentRegistry, 'balances'>,
): CharacterCombatBalanceProfile | null {
  const matches = [...registry.balances.values()].filter(
    (definition): definition is CharacterCombatBalanceContentDefinition => (
      definition.retired !== true && 'profile' in definition
      && definition.profile === 'character_combat'
    ),
  );
  return matches.length === 1 ? Object.freeze({ ...matches[0]!.fields }) : null;
}

function bootstrapCharacterCombatDefinition(): CharacterCombatBalanceContentDefinition {
  const matches = (balanceJson as readonly Record<string, unknown>[]).filter((definition) => (
    definition.profile === 'character_combat' && definition.retired !== true
  ));
  if (matches.length !== 1) throw new Error('bootstrap_character_combat_balance_unavailable');
  const definition = matches[0]!;
  const values = definition.values ?? balanceFieldsTuple('character_combat', definition.fields as object);
  if (!Array.isArray(values) || values.length !== 18
    || values.some((value) => !Number.isSafeInteger(value) || Number(value) <= 0)) {
    throw new Error('bootstrap_character_combat_balance_invalid');
  }
  return { ...definition, fields: balanceTupleFields('character_combat', values) } as unknown as CharacterCombatBalanceContentDefinition;
}

/** Explicit compatibility for isolated simulation callers without a live registry. */
export const BOOTSTRAP_CHARACTER_COMBAT_BALANCE = characterCombatBalanceFromTuple(
  balanceFieldsTuple('character_combat', bootstrapCharacterCombatDefinition().fields) as CharacterCombatBalanceTuple,
);

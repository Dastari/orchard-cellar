import { resolveModifierTarget, type Modifier } from './modifiers.js';
import { SIM_TICKS_PER_SECOND } from './state.js';
import type { Attributes } from './stats.js';
import type { ContentRegistry } from './content/registry.js';
import type { SprintAbilityContentDefinition } from './content/loadout-definition.js';
import { activeNewPlayerLoadout } from './new-player-loadout.js';
import {
  BOOTSTRAP_CHARACTER_COMBAT_BALANCE,
  type CharacterCombatBalanceProfile,
} from './character-combat-balance.js';

export type AbilityDefinition = SprintAbilityContentDefinition;
export type AbilityId = SprintAbilityContentDefinition['id'];

export interface ResolvedSprintAbility {
  readonly speedPermille: number;
  readonly vigourDrainCentiPerSecond: number;
}

/** Resolves by the unique active new-player role and semantic adapter. The
 * loadout and ability ids may both be renamed without changing authority. */
export function runtimeSprintAbilityDefinition(
  registry: Pick<ContentRegistry, 'loadouts'>,
): SprintAbilityContentDefinition | null {
  const loadout = activeNewPlayerLoadout(registry);
  if (loadout === null) return null;
  const candidates = loadout.abilities.filter(({ adapter }) => adapter === 'sprint');
  return candidates.length === 1 ? candidates[0]! : null;
}

/** Constitution represents endurance: 10 CON is the authored baseline, twice
 * that CON halves the drain, and half that CON doubles it. Direct sprint
 * modifiers then flow through the same flat/percent/override pipeline as every
 * other derived stat. */
export function resolveSprintAbility(
  definition: SprintAbilityContentDefinition,
  attributes: Attributes,
  modifiers: readonly Modifier[] = [],
  profile: CharacterCombatBalanceProfile = BOOTSTRAP_CHARACTER_COMBAT_BALANCE,
): ResolvedSprintAbility {
  const endurance = Math.max(1, Math.floor(attributes[definition.primaryAttribute]));
  const attributeCost = Math.ceil(
    definition.vigourDrainCentiPerSecond * definition.baselineAttribute / endurance,
  );
  return {
    speedPermille: resolveModifierTarget(
      definition.modifierTargets[0], definition.speedPermille, modifiers, profile,
    ),
    vigourDrainCentiPerSecond: resolveModifierTarget(
      definition.modifierTargets[1], attributeCost, modifiers, profile,
    ),
  };
}

/** Cumulative ceiling makes a 60-step second cost exactly the configured rate,
 * while short taps can still be charged without another persisted remainder. */
export function sprintVigourCostForSteps(rateCentiPerSecond: number, steps: number): number {
  const rate = Math.max(0, Math.floor(rateCentiPerSecond));
  const count = Math.max(0, Math.floor(steps));
  return Math.ceil(rate * count / SIM_TICKS_PER_SECOND);
}

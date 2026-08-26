import {
  BASE_ATTRIBUTE,
  SPRINT_SPEED_PERMILLE,
  SPRINT_VIGOUR_DRAIN_CENTI_PER_SECOND,
} from './balance.js';
import { resolveModifierTarget, type Modifier, type StatTarget } from './modifiers.js';
import { SIM_TICKS_PER_SECOND } from './state.js';
import type { Attributes } from './stats.js';

export const ABILITY_TAGS = [
  'ability.movement',
  'resource.vigour',
  'attribute.con',
  'modifier.equipment',
  'modifier.effect',
  'modifier.skill',
  'modifier.environment',
] as const;
export type AbilityTag = typeof ABILITY_TAGS[number];

export interface AbilityDefinition {
  readonly displayName: string;
  readonly input: string;
  readonly primaryAttribute: keyof Attributes;
  readonly tags: readonly AbilityTag[];
  readonly modifierTargets: readonly StatTarget[];
}

/** Shared ability metadata is deliberately data, not reducer knowledge. Future
 * skills and effects can discover the same tags/targets used by authority. */
export const ABILITY_DEFINITIONS = {
  sprint: {
    displayName: 'Sprint',
    input: 'Shift',
    primaryAttribute: 'con',
    tags: ABILITY_TAGS,
    modifierTargets: ['sprintSpeed', 'sprintVigourCost'],
  },
} as const satisfies Readonly<Record<string, AbilityDefinition>>;

export type AbilityId = keyof typeof ABILITY_DEFINITIONS;

export interface ResolvedSprintAbility {
  readonly speedPermille: number;
  readonly vigourDrainCentiPerSecond: number;
}

/** Constitution represents endurance: 10 CON is the authored baseline, twice
 * that CON halves the drain, and half that CON doubles it. Direct sprint
 * modifiers then flow through the same flat/percent/override pipeline as every
 * other derived stat. */
export function resolveSprintAbility(
  attributes: Attributes,
  modifiers: readonly Modifier[] = [],
): ResolvedSprintAbility {
  const constitution = Math.max(1, Math.floor(attributes.con));
  const constitutionCost = Math.ceil(
    SPRINT_VIGOUR_DRAIN_CENTI_PER_SECOND * BASE_ATTRIBUTE / constitution,
  );
  return {
    speedPermille: resolveModifierTarget('sprintSpeed', SPRINT_SPEED_PERMILLE, modifiers),
    vigourDrainCentiPerSecond: resolveModifierTarget(
      'sprintVigourCost', constitutionCost, modifiers,
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

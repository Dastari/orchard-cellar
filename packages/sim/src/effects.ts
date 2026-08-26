import type { Modifier } from './modifiers.js';

export const EFFECT_KINDS = ['well_rested', 'winded', 'orchard_tea'] as const;
export type EffectKind = typeof EFFECT_KINDS[number];

export interface EffectDefinition {
  readonly name: string;
  readonly maxStacks: number;
  readonly durationTicks: number;
  readonly modifiers: readonly Modifier[];
  readonly family?: string;
  readonly scaleModifiersWithStacks?: boolean;
}

export const EFFECT_DEFINITIONS = {
  well_rested: {
    name: 'Well Rested',
    maxStacks: 1,
    durationTicks: 144_000,
    modifiers: [{
      id: 'effect.well_rested.vigour_regen', target: 'vigourRegen',
      layer: 'pctAdd', value: 2_500, source: 'effect',
    }],
  },
  winded: {
    name: 'Winded',
    maxStacks: 1,
    durationTicks: 1_800,
    modifiers: [{
      id: 'effect.winded.vigour_regen', target: 'vigourRegen',
      layer: 'pctAdd', value: -5_000, source: 'effect',
    }],
  },
  orchard_tea: {
    name: 'Orchard Tea',
    maxStacks: 1,
    durationTicks: 6_000,
    modifiers: [{
      id: 'effect.orchard_tea.constitution', target: 'con',
      layer: 'flat', value: 2, source: 'effect',
    }],
  },
} as const satisfies Readonly<Record<EffectKind, EffectDefinition>>;

export interface PlayerEffectState {
  readonly id: bigint;
  readonly effectKind: EffectKind;
  readonly stacks: number;
  readonly appliedTick: bigint;
  readonly expiresTick: bigint;
}

export function effectActiveAt(effect: PlayerEffectState, authorityTick: bigint): boolean {
  return effect.expiresTick > authorityTick;
}

/** Reapplication refreshes duration and increases stacks only while the prior
 * instance is still live. Persistent row identity is retained for DB updates. */
export function refreshEffect(
  existing: PlayerEffectState | null,
  effectKind: EffectKind,
  authorityTick: bigint,
  id = existing?.id ?? 0n,
): PlayerEffectState {
  const definition = EFFECT_DEFINITIONS[effectKind];
  const refreshing = existing !== null
    && existing.effectKind === effectKind
    && effectActiveAt(existing, authorityTick);
  return {
    id,
    effectKind,
    stacks: refreshing ? Math.min(definition.maxStacks, existing.stacks + 1) : 1,
    appliedTick: authorityTick,
    expiresTick: authorityTick + BigInt(definition.durationTicks),
  };
}

export function activeEffects(
  effects: readonly PlayerEffectState[],
  authorityTick: bigint,
): readonly PlayerEffectState[] {
  return effects.filter((effect) => effectActiveAt(effect, authorityTick));
}

export function modifiersForEffects(
  effects: readonly PlayerEffectState[],
  authorityTick: bigint,
): readonly Modifier[] {
  return activeEffects(effects, authorityTick).flatMap((effect) => {
    const definition: EffectDefinition = EFFECT_DEFINITIONS[effect.effectKind];
    const stacks = Math.max(1, Math.min(definition.maxStacks, Math.floor(effect.stacks)));
    return definition.modifiers.map((modifier) => {
      const family = modifier.family ?? definition.family;
      return {
        ...modifier,
        id: `${modifier.id}#${effect.id.toString()}`,
        value: definition.scaleModifiersWithStacks === false
          ? modifier.value
          : modifier.value * stacks,
        ...(family === undefined ? {} : { family }),
      };
    });
  });
}

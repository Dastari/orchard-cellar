import type { Modifier } from './modifiers.js';

export interface EffectDefinition {
  readonly name: string;
  readonly maxStacks: number;
  readonly durationTicks: number;
  readonly modifiers: readonly Modifier[];
  readonly family?: string;
  readonly scaleModifiersWithStacks?: boolean;
}

export type EffectDefinitionResolver = (effectKind: string) => EffectDefinition | null;

export interface PlayerEffectState {
  readonly id: bigint;
  readonly effectKind: string;
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
  effectKind: string,
  authorityTick: bigint,
  definition: EffectDefinition,
  id = existing?.id ?? 0n,
  appliedStacks = 1,
): PlayerEffectState {
  if (!Number.isSafeInteger(appliedStacks) || appliedStacks < 1) {
    throw new Error('effect stacks must be a positive safe integer');
  }
  const refreshing = existing !== null
    && existing.effectKind === effectKind
    && effectActiveAt(existing, authorityTick);
  return {
    id,
    effectKind,
    stacks: refreshing
      ? Math.min(definition.maxStacks, existing.stacks + appliedStacks)
      : Math.min(definition.maxStacks, appliedStacks),
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
  definitionFor: EffectDefinitionResolver,
): readonly Modifier[] {
  return activeEffects(effects, authorityTick).flatMap((effect) => {
    const definition = definitionFor(effect.effectKind);
    // Durable rows outlive content revisions. Missing or retired definitions
    // are inert until an active revision intentionally reintroduces the slug.
    if (definition === null) return [];
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

import { BOOTSTRAP_COMPILED_CONTENT } from './content/bootstrap-projection.js';
import { runtimeCreatureDefinition } from './content/runtime.js';
import type { ContentRegistry } from './content/registry.js';
import type { Modifier } from './modifiers.js';
import { runtimeCharacterCombatBalance } from './character-combat-balance.js';
import { resolveStats, resolveStatsWithProfile, type Attributes, type ResolvedStats } from './stats.js';
import { WILDLIFE_SPECIES, type WildlifeSpecies } from './wildlife.js';

export type CreatureKind = WildlifeSpecies;

export interface CreatureDefinition {
  readonly name: string;
  readonly level: number;
  readonly attributes: Attributes;
  readonly innateModifiers: readonly Modifier[];
  readonly hostile: boolean;
}

/** Bootstrap-only compatibility projection for callers that have not yet been
 * injected with the active content registry. */
export const CREATURE_DEFINITIONS: Readonly<Record<CreatureKind, CreatureDefinition>> = Object.freeze(
  Object.fromEntries(WILDLIFE_SPECIES.map((species) => {
    const definition = BOOTSTRAP_COMPILED_CONTENT.creatures[species];
    if (definition === undefined) throw new Error(`bootstrap_creature_missing:${species}`);
    return [species, definition.combat] as const;
  })) as unknown as Record<CreatureKind, CreatureDefinition>,
);

export function runtimeResolveCreatureStats(registry: ContentRegistry, species: string): ResolvedStats | null {
  const definition = runtimeCreatureDefinition(registry, species);
  const profile = runtimeCharacterCombatBalance(registry);
  return definition === null || profile === null ? null
    : resolveStatsWithProfile(profile, definition.combat.attributes, definition.combat.innateModifiers);
}

export function runtimeCreatureIsHuntable(registry: ContentRegistry, species: string): boolean {
  return runtimeCreatureDefinition(registry, species)?.combat.huntable === true;
}

export function runtimeCreatureCombatExperience(registry: ContentRegistry, species: string): number | null {
  return runtimeCreatureDefinition(registry, species)?.combat.experience ?? null;
}

export function runtimeCreatureRespawnTicks(registry: ContentRegistry, species: string): number | null {
  return runtimeCreatureDefinition(registry, species)?.combat.respawnTicks ?? null;
}

export function resolveCreatureStats(kind: CreatureKind): ResolvedStats {
  const definition = CREATURE_DEFINITIONS[kind];
  return resolveStats(definition.attributes, definition.innateModifiers);
}

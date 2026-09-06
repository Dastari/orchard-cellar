import { bootstrapDefinitionsOfKind } from './bootstrap-pack-loader.js';

/** Combat XP is an engine progression constant; authored loot ids come from
 * the creature registry and therefore cannot drift from a published pack. */
const WILDLIFE_COMBAT_EXPERIENCE: Readonly<Record<string, number>> = Object.freeze({
  chicken: 14, rooster: 14, duck: 14, goose: 18, pig: 22, cow: 28, sheep: 22,
});

export const WILDLIFE_LOOT_PROFILES: Readonly<Record<string, {
  readonly lootId: `loot:${string}`;
  readonly combatExperience: number;
}>> = Object.freeze(Object.fromEntries(
  bootstrapDefinitionsOfKind('creature').flatMap((definition) => {
    const combatExperience = WILDLIFE_COMBAT_EXPERIENCE[definition.species];
    return definition.loot === undefined || combatExperience === undefined
      ? []
      : [[definition.species, { lootId: definition.loot, combatExperience }]];
  }),
));

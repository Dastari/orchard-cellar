import type { Modifier } from './modifiers.js';
import { resolveStats, type Attributes, type ResolvedStats } from './stats.js';
import type { WildlifeSpecies } from './wildlife.js';

export type CreatureKind = WildlifeSpecies;

export interface CreatureDefinition {
  readonly name: string;
  readonly level: number;
  readonly attributes: Attributes;
  readonly innateModifiers: readonly Modifier[];
  readonly hostile: boolean;
}

const NONE: readonly Modifier[] = [];
const attributes = (str: number, dex: number, con: number, int: number, wis: number, cha: number): Attributes => ({
  str, dex, con, int, wis, cha,
});

/** v1 statlines establish one shared actor shape; none are hostile and no
 * damage verb consumes these values yet. */
export const CREATURE_DEFINITIONS = {
  horse: { name: 'Horse', level: 2, attributes: attributes(14, 12, 14, 2, 10, 7), innateModifiers: NONE, hostile: false },
  cow: { name: 'Cow', level: 1, attributes: attributes(12, 6, 14, 2, 10, 6), innateModifiers: NONE, hostile: false },
  sheep: { name: 'Sheep', level: 1, attributes: attributes(8, 8, 11, 2, 10, 7), innateModifiers: NONE, hostile: false },
  pig: { name: 'Pig', level: 1, attributes: attributes(9, 8, 12, 2, 10, 7), innateModifiers: NONE, hostile: false },
  chicken: { name: 'Chicken', level: 1, attributes: attributes(3, 12, 6, 2, 9, 6), innateModifiers: NONE, hostile: false },
  rooster: { name: 'Rooster', level: 1, attributes: attributes(4, 12, 7, 2, 9, 8), innateModifiers: NONE, hostile: false },
  duck: { name: 'Duck', level: 1, attributes: attributes(3, 11, 7, 2, 10, 7), innateModifiers: NONE, hostile: false },
  goose: { name: 'Goose', level: 1, attributes: attributes(5, 10, 8, 2, 10, 8), innateModifiers: NONE, hostile: false },
  swan: { name: 'Swan', level: 1, attributes: attributes(5, 10, 8, 2, 11, 10), innateModifiers: NONE, hostile: false },
  frog: { name: 'Frog', level: 1, attributes: attributes(2, 13, 5, 2, 10, 5), innateModifiers: NONE, hostile: false },
  mouse: { name: 'Mouse', level: 1, attributes: attributes(1, 14, 4, 3, 11, 5), innateModifiers: NONE, hostile: false },
  butterfly: { name: 'Butterfly', level: 1, attributes: attributes(1, 15, 3, 1, 9, 8), innateModifiers: NONE, hostile: false },
  bee: { name: 'Bee', level: 1, attributes: attributes(1, 15, 4, 1, 10, 5), innateModifiers: NONE, hostile: false },
  capybara: { name: 'Capybara', level: 1, attributes: attributes(8, 8, 12, 2, 11, 10), innateModifiers: NONE, hostile: false },
  camel: { name: 'Camel', level: 2, attributes: attributes(13, 8, 16, 2, 11, 7), innateModifiers: NONE, hostile: false },
  scarab: { name: 'Scarab', level: 1, attributes: attributes(2, 10, 8, 1, 8, 3), innateModifiers: NONE, hostile: false },
  vulture: { name: 'Vulture', level: 2, attributes: attributes(7, 13, 9, 2, 12, 6), innateModifiers: NONE, hostile: false },
  snail: { name: 'Snail', level: 1, attributes: attributes(2, 2, 12, 1, 8, 4), innateModifiers: NONE, hostile: false },
} as const satisfies Readonly<Record<CreatureKind, CreatureDefinition>>;

export function resolveCreatureStats(kind: CreatureKind): ResolvedStats {
  const definition = CREATURE_DEFINITIONS[kind];
  return resolveStats(definition.attributes, definition.innateModifiers);
}

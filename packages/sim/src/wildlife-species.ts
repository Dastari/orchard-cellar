/** Wildlife species ids. Generator-free leaf (static-world S6a): `wildlife.ts`
 * samples the island generator for spawns, so the species list lives here and
 * `wildlife.ts` re-exports it (same module instance for every importer). */
export const WILDLIFE_SPECIES = [
  'horse', 'cow', 'sheep', 'pig', 'chicken', 'rooster',
  'duck', 'goose', 'swan', 'frog', 'mouse', 'butterfly', 'bee',
  'capybara', 'camel', 'scarab', 'vulture', 'snail',
] as const;
export type WildlifeSpecies = typeof WILDLIFE_SPECIES[number];

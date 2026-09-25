/** Survival biome ids and the pure per-biome traversal rules.
 *
 * Generator-free leaf (static-world S6a): this module must not import the
 * island generator (`survival-world.ts`), `procedural-terrain`, the map
 * compiler, `map-document-v3` or the sim barrel, so chunk-native clients can
 * use it without shipping the generator. `survival-world.ts` re-exports every
 * public name here, so existing imports keep working and resolve to this one
 * module instance. `generator-free-leaves.test.ts` enforces the boundary. */
import { MAP_BIOME_IDS, type MapBiomeId } from './biomes.js';
import type { MovementMedium } from './state.js';

export const SURVIVAL_BIOMES = MAP_BIOME_IDS;
export type SurvivalBiome = MapBiomeId;

export const SURVIVAL_DIRT_CLIFF_ROLES = [
  'none',
  'edge',
  'ramp_top_left',
  'ramp_top_right',
  'ramp_bottom_left',
  'ramp_bottom_right',
] as const;
export type SurvivalDirtCliffRole = typeof SURVIVAL_DIRT_CLIFF_ROLES[number];

export function survivalBiomeBlocksMovement(biome: SurvivalBiome): boolean {
  return biome === 'lava'
    || biome === 'water'
    || biome === 'freshwater'
    || biome === 'waterfall'
    || biome === 'ridge'
    || biome === 'desert_ridge'
    || biome === 'oasis_water'
    || biome === 'coastal_cliff';
}

/** Shared terrain-medium rule used by authority, prediction, wildlife, and
 * future vehicles. Water traversal includes calm ocean/inland water, but not
 * shore blends or waterfalls; air ignores terrain while remaining in bounds. */
export function survivalBiomeBlocksTraversal(biome: SurvivalBiome, medium: MovementMedium): boolean {
  if (medium === 'air') return false;
  if (medium === 'water') {
    return biome !== 'water' && biome !== 'freshwater' && biome !== 'oasis_water';
  }
  return survivalBiomeBlocksMovement(biome);
}

/** Fixed dimensions, seed and version of the generated survival island.
 *
 * Generator-free leaf (static-world S6a): this module must not import the
 * island generator (`survival-world.ts`), `procedural-terrain`, the map
 * compiler, `map-document-v3` or the sim barrel, so chunk-native clients can
 * use it without shipping the generator. `survival-world.ts` re-exports every
 * public name here, so existing imports keep working and resolve to this one
 * module instance. `generator-free-leaves.test.ts` enforces the boundary. */

/** The original generated island remains a 320x320 deterministic local space.
 * A wide ocean apron surrounds it so later islands can be added without moving
 * or reshaping the current landmass again. */
export const SURVIVAL_ISLAND_SIZE = 320;
export const SURVIVAL_OCEAN_PADDING_TILES = 256;
export const SURVIVAL_ISLAND_OFFSET_TILES = SURVIVAL_OCEAN_PADDING_TILES;
export const SURVIVAL_WORLD_SIZE = SURVIVAL_ISLAND_SIZE + SURVIVAL_OCEAN_PADDING_TILES * 2;
export const SURVIVAL_WORLD_SEED = 0x4f434852;
export const SURVIVAL_WORLD_VERSION = 30;
export const SURVIVAL_CHUNK_TILES = 16;

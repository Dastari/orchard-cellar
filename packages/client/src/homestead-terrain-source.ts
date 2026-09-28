import { homesteadBiomeAt, survivalTreeKindAt, type SurvivalResourceRegistry, type SurvivalTreeKind } from '@orchard/sim';
import type { SpaceTerrainGenerators } from '@orchard/engine/space-terrain';

/**
 * Static world S6: the ONE client module that still samples the island generator, for homestead
 * exteriors only (a homestead enlarges the ~8x8 island tiles around its overworld site). Nothing
 * else may import the generator; the generator-free build check allows this module explicitly.
 *
 * PENDING the S6 homestead decision (Agent Mail `static-s6`): this generator-backed implementation
 * is replaced by sampling the published topside chunks around the site, or a server-stored patch.
 */
export const homesteadTerrainGenerators: SpaceTerrainGenerators = Object.freeze({ homesteadBiomeAt });

/** The tree species the island has at island tile (x, y): homestead surrounding woodland. */
export function homesteadTreeKindAt(seed: number, islandTileX: number, islandTileY: number,
  registry: SurvivalResourceRegistry): SurvivalTreeKind {
  return survivalTreeKindAt(seed, islandTileX, islandTileY, registry);
}

/** The island biome under a homestead tile (the homestead's enlargement of its site). */
export { homesteadBiomeAt };

/** The generated island topside's terrain, and `terrainForSpace` for every
 * space. This is the legacy generator path static-world S6b removes from the
 * client: the island classification samples the island generator.
 *
 * Everything else moved out unchanged (static-world S6a) and is re-exported
 * here so existing imports keep working:
 * - per-cell terrain queries: `terrain-sampling.ts` (generator-free);
 * - non-island space terrain and the cellar overlay: `space-terrain.ts`;
 * - the `TerrainArray` type: `terrain-array.ts`.
 * New code that does not build island terrain should import those modules. */
import {
  SURVIVAL_BIOMES,
  SURVIVAL_WORLD_SIZE,
  TOPSIDE_SPACE_ID,
  homesteadBiomeAt,
  survivalBiomeAllowsHorseJump,
  survivalDirtCliffRoleBytes,
  survivalDirtTerraceBytes,
  survivalElevationBytes,
  survivalTerrainBlocksTraversalAt,
  survivalTerrainBytes,
  survivalTerrainTransitions,
  type ContentRegistry,
  type SpaceDefinition,
} from "@orchard/sim";
import { cellFlagsWhere } from '@orchard/sim/cell-flags';
import {
  spaceTerrain,
  type SpaceTerrainClassification,
  type SpaceTerrainGenerators,
} from "./space-terrain.js";
import type { TerrainArray } from "./terrain-array.js";

export * from "./terrain-sampling.js";
export {
  terrainWithCellarExcavations,
  type CellarExcavationTile,
} from "./space-terrain.js";

export function terrainForWorld(seed: number, version: number): TerrainArray {
  return terrainForSpace(
    {
      spaceId: TOPSIDE_SPACE_ID,
      name: "island",
      sizeTiles: SURVIVAL_WORLD_SIZE,
      generator: "island",
      environment: "outdoor",
      ambient: "clock",
      weather: true,
      audioBed: "estate",
    },
    seed,
    version,
  );
}

/** The generated island topside's terrain classification. This is the island
 * generator path static-world S6b deletes; every other space kind lives in
 * `space-terrain.ts`. */
function islandTerrainClassification(space: SpaceDefinition, seed: number): SpaceTerrainClassification {
  const biomes = survivalTerrainBytes(seed);
  const elevations = Int16Array.from(survivalElevationBytes(seed));
  return {
    spaceId: space.spaceId,
    generator: space.generator,
    defaultCliffFamily: 'stone_1',
    projectionStyle: 'raised',
    baseDatum: 0,
    width: SURVIVAL_WORLD_SIZE,
    height: SURVIVAL_WORLD_SIZE,
    biomes,
    blocked: cellFlagsWhere(biomes.length, (index) =>
      survivalTerrainBlocksTraversalAt(
        seed,
        index % SURVIVAL_WORLD_SIZE,
        Math.floor(index / SURVIVAL_WORLD_SIZE),
        "ground",
      ),
    ),
    horseJumpableTerrain: cellFlagsWhere(biomes.length, (index) =>
      survivalBiomeAllowsHorseJump(SURVIVAL_BIOMES[biomes[index]!] ?? "water"),
    ),
    elevations,
    terrainTransitions: survivalTerrainTransitions(seed),
    raisedTerrainCollisionClassified: true,
    dirtCliffRoles: survivalDirtCliffRoleBytes(seed),
    dirtTerraces: survivalDirtTerraceBytes(seed),
  };
}

/** Generator inputs for `spaceTerrain`: the island and homestead biomes. */
const TERRAIN_GENERATORS: SpaceTerrainGenerators = { island: islandTerrainClassification, homesteadBiomeAt };

/** Terrain of any space, including the generated island. Non-island spaces
 * are built by `spaceTerrain` (`space-terrain.ts`); output and caching are
 * identical to the pre-split implementation. */
export function terrainForSpace(
  space: SpaceDefinition,
  seed: number,
  version: number,
  registry?:ContentRegistry,
): TerrainArray {
  return spaceTerrain(space, seed, version, registry, TERRAIN_GENERATORS);
}

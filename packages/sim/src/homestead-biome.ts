/** Homestead exterior biomes. A homestead enlarges a patch of the generated
 * island around its overworld site, so this samples the island generator
 * (`survivalBiomeAt`) and is deliberately kept out of `spaces.ts`: space
 * definitions, ids and tiles stay generator-free (static-world S6a) while
 * homestead terrain keeps its exact generated look. */
import { HOMESTEAD_SIZE_TILES } from './spaces.js';
import { homesteadBiomeWith } from './homestead-biome-rules.js';
import type { SurvivalBiome } from './survival-biomes.js';
import { survivalBiomeAt } from './survival-world.js';

/** Enlarges roughly eight overworld tiles into the starter farm while keeping
 * a safe central clearing and its permanent north/south path. */
export function homesteadBiomeAt(
  worldSeed: number,
  site: { readonly worldTileX: number; readonly worldTileY: number },
  tileX: number,
  tileY: number,
  sizeTiles = HOMESTEAD_SIZE_TILES,
): SurvivalBiome {
  return homesteadBiomeWith((x, y) => survivalBiomeAt(worldSeed, x, y), site, tileX, tileY, sizeTiles);
}

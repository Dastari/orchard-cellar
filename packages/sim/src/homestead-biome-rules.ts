/** Generator-free homestead exterior biomes (static world S6): a homestead enlarges the island tiles
 * around its overworld site, keeping a safe central clearing and its permanent north/south path. The
 * island biome sampler is the caller's: the generator (`homestead-biome.ts`) or, in the client, the
 * published topside chunks around the site. */
import { HOMESTEAD_ENTRY_TILE, HOMESTEAD_SIZE_TILES, HOMESTEAD_TENT_TILE } from './spaces.js';
import type { SurvivalBiome } from './survival-biomes.js';

/** The island tile a homestead tile enlarges (four homestead tiles per island tile around the site). */
export function homesteadIslandTile(site: { readonly worldTileX: number; readonly worldTileY: number },
  tileX: number, tileY: number, sizeTiles = HOMESTEAD_SIZE_TILES): { readonly tileX: number; readonly tileY: number } {
  const center = Math.floor(sizeTiles / 2);
  return { tileX: site.worldTileX + Math.floor((tileX - center) / 4), tileY: site.worldTileY + Math.floor((tileY - center) / 4) };
}

export function homesteadBiomeWith(
  islandBiomeAt: (tileX: number, tileY: number) => SurvivalBiome,
  site: { readonly worldTileX: number; readonly worldTileY: number },
  tileX: number,
  tileY: number,
  sizeTiles = HOMESTEAD_SIZE_TILES,
): SurvivalBiome {
  if (tileY < sizeTiles && Math.abs(tileX - HOMESTEAD_ENTRY_TILE.tileX) <= 3
    && tileY >= HOMESTEAD_TENT_TILE.tileY - 1) return 'plains';
  const source = homesteadIslandTile(site, tileX, tileY, sizeTiles);
  return islandBiomeAt(source.tileX, source.tileY);
}

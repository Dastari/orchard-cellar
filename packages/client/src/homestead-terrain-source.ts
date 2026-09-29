import { homesteadBiomeWith, SURVIVAL_BIOMES, survivalTreeKindWith, type SurvivalBiome, type SurvivalResourceRegistry, type SurvivalTreeKind } from '@orchard/sim';
import { chunkBlobPath, validateRuntimeManifest, verifyRuntimeChunk } from '@orchard/sim/chunk-runtime';
import { WORLD_CHUNK_HALO, WORLD_CHUNK_SIZE, WORLD_CHUNK_STRIDE, type WorldChunk, type WorldChunkManifest } from '@orchard/sim/world-chunk';
import type { SpaceTerrainGenerators } from '@orchard/engine/space-terrain';
import type { ChunkBlobCache } from './chunk-shadow-cache.js';

/**
 * Static world S6: homestead exteriors without the island generator. A homestead enlarges the island
 * tiles around its overworld site (four homestead tiles per island tile), so its biomes and woodland
 * species come from the PUBLISHED TOPSIDE CHUNKS around the site (1 to 4 chunks): the authored island,
 * which equals the generator wherever the island was not hand-edited (owner decision, 2026-09-29).
 * The rules are the generator's own (`homesteadBiomeWith`, `survivalTreeKindWith`, pinned to it by
 * `survival-tree-species.test.ts`). The one difference: the generator counts streams as "beside a
 * river" for its fruit trees, and chunks cannot tell a stream from a lake, so a lake counts too.
 */

/** Island tiles around a site a homestead of `sizeTiles` samples: half its enlargement (four
 * homestead tiles per island tile, so 16 for the 128-tile exterior), one for rounding, two for rivers. */
export function homesteadSiteReachTiles(sizeTiles: number): number {
  return Math.ceil(sizeTiles / 8) + 1 + 2;
}

export interface HomesteadIslandPatch {
  /** `manifest revision:site`. */
  readonly key: string;
  biomeAt(tileX: number, tileY: number): SurvivalBiome;
  riverNear(tileX: number, tileY: number): boolean;
}

type Site = { readonly worldTileX: number; readonly worldTileY: number };
const siteKey = (site: Site): string => `${site.worldTileX}:${site.worldTileY}`;

/** The topside chunks a site's patch reads. */
export function homesteadPatchChunks(site: Site, sizeTiles: number): { readonly cx: number; readonly cy: number }[] {
  const reach = homesteadSiteReachTiles(sizeTiles);
  const minCx = Math.floor((site.worldTileX - reach) / WORLD_CHUNK_SIZE), maxCx = Math.floor((site.worldTileX + reach) / WORLD_CHUNK_SIZE);
  const minCy = Math.floor((site.worldTileY - reach) / WORLD_CHUNK_SIZE), maxCy = Math.floor((site.worldTileY + reach) / WORLD_CHUNK_SIZE);
  const out: { cx: number; cy: number }[] = [];
  for (let cy = minCy; cy <= maxCy; cy += 1) for (let cx = minCx; cx <= maxCx; cx += 1) out.push({ cx, cy });
  return out;
}

/** The patch over decoded topside chunks (a chunk the manifest lacks reads as ocean). */
export function homesteadIslandPatch(revision: number, site: Site, chunks: ReadonlyMap<string, WorldChunk>): HomesteadIslandPatch {
  const water = SURVIVAL_BIOMES.indexOf('water');
  const code = (tileX: number, tileY: number): number => {
    const cx = Math.floor(tileX / WORLD_CHUNK_SIZE), cy = Math.floor(tileY / WORLD_CHUNK_SIZE);
    const biomes = chunks.get(`${cx}:${cy}`)?.arrays['biomes'];
    if (biomes === undefined) return water;
    const x = tileX - cx * WORLD_CHUNK_SIZE + WORLD_CHUNK_HALO, y = tileY - cy * WORLD_CHUNK_SIZE + WORLD_CHUNK_HALO;
    return Number(biomes[y * WORLD_CHUNK_STRIDE + x] ?? water);
  };
  const biomeAt = (tileX: number, tileY: number): SurvivalBiome => SURVIVAL_BIOMES[code(tileX, tileY)] ?? 'water';
  return {
    key: `${revision}:${siteKey(site)}`,
    biomeAt,
    riverNear: (tileX, tileY) => {
      for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) {
        const biome = biomeAt(tileX + dx, tileY + dy);
        if (biome === 'freshwater' || biome === 'waterfall') return true;
      }
      return false;
    },
  };
}

const patches = new Map<string, HomesteadIslandPatch>();
const loading = new Map<string, Promise<void>>();
/** A failed load (a fetch or verification error) is retried after this long, not every frame. */
const RETRY_AFTER_MS = 5_000;
const failedAt = new Map<string, number>();

/** The loaded patch for a site, if any. */
export function loadedHomesteadIslandPatch(site: Site): HomesteadIslandPatch | undefined {
  return patches.get(siteKey(site));
}

/**
 * Starts loading the site's topside chunks (once per site) and returns the patch once it is ready.
 * `shadow` is the topside `world_chunk_shadow` row; blobs come from `/world/` through the chunk
 * cache, verified against the manifest like every chunk the client reads. A site keeps its first
 * patch for the page's life: `spaceTerrain` caches the exterior per space, so a republish reaches
 * a homestead on the next load, and its terrain and woodland always agree.
 */
export function ensureHomesteadIslandPatch(site: Site, sizeTiles: number, shadow: { readonly revision: number; readonly manifestJson: string } | null,
  fetchBlob: (path: string, maxBytes: number) => Promise<Uint8Array>, cache: ChunkBlobCache | undefined): HomesteadIslandPatch | undefined {
  const existing = patches.get(siteKey(site));
  if (existing !== undefined || shadow === null) return existing;
  const key = siteKey(site);
  if (!loading.has(key) && Date.now() - (failedAt.get(key) ?? -Infinity) >= RETRY_AFTER_MS) {
    const pending = (async () => {
      const manifest: WorldChunkManifest = validateRuntimeManifest(JSON.parse(shadow.manifestJson));
      const chunks = new Map<string, WorldChunk>();
      for (const { cx, cy } of homesteadPatchChunks(site, sizeTiles)) {
        const head = manifest.chunks.find(entry => entry.cx === cx && entry.cy === cy);
        if (head === undefined) continue;
        let bytes = await cache?.get(head.contentHash).catch(() => undefined);
        if (bytes === undefined) {
          bytes = await fetchBlob(chunkBlobPath(manifest.spaceId, head.contentHash), head.byteLength);
          await cache?.put(head.contentHash, bytes, manifest.spaceId).catch(() => undefined);
        }
        chunks.set(`${cx}:${cy}`, verifyRuntimeChunk(bytes, manifest, cx, cy));
      }
      patches.set(siteKey(site), homesteadIslandPatch(shadow.revision, site, chunks));
      failedAt.delete(key);
    })().catch(() => { failedAt.set(key, Date.now()); }).finally(() => loading.delete(key));
    loading.set(key, pending);
  }
  return undefined;
}

/** The one generators object homestead terrain uses (space-terrain accepts a single set): its biome
 * sampler reads the loaded patch of the site, which the caller ensures before building the terrain. */
export const homesteadTerrainGenerators: SpaceTerrainGenerators = Object.freeze({
  homesteadBiomeAt: (_seed: number, site: Site, tileX: number, tileY: number, sizeTiles?: number): SurvivalBiome =>
    homesteadExteriorBiomeAt(site, tileX, tileY, sizeTiles),
});

/** The biome of homestead tile (x, y) from the site's loaded patch (throws without one: callers
 * wait for `ensureHomesteadIslandPatch`). */
export function homesteadExteriorBiomeAt(site: Site, tileX: number, tileY: number, sizeTiles?: number): SurvivalBiome {
  const patch = patches.get(siteKey(site));
  if (patch === undefined) throw new Error('homestead_island_patch_missing');
  return homesteadBiomeWith((x, y) => patch.biomeAt(x, y), site, tileX, tileY, sizeTiles);
}

/** The island tree species at island tile (x, y) of a site's patch (homestead woodland). */
export function homesteadTreeKindAt(site: Site, seed: number, islandTileX: number, islandTileY: number,
  registry: SurvivalResourceRegistry): SurvivalTreeKind | null {
  const patch = patches.get(siteKey(site));
  if (patch === undefined) return null;
  return survivalTreeKindWith(patch.biomeAt(islandTileX, islandTileY), patch.riverNear(islandTileX, islandTileY), seed, islandTileX, islandTileY, registry);
}

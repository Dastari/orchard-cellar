import { describe, expect, it, vi } from 'vitest';
import {
  bootstrapContentRegistry, homesteadBiomeAt, HOMESTEAD_TERRAIN_SIZE_TILES, SURVIVAL_BIOMES, SURVIVAL_WORLD_SEED, survivalBiomeAt, survivalTreeKindAt,
} from '@orchard/sim';
import { WORLD_CHUNK_SIZE, WORLD_CHUNK_STRIDE, decodeWorldChunk, encodeWorldChunk, type WorldChunk, type WorldChunkManifest } from '@orchard/sim/world-chunk';
import {
  ensureHomesteadIslandPatch, homesteadExteriorBiomeAt, homesteadIslandPatch, homesteadPatchChunks, homesteadTreeKindAt, loadedHomesteadIslandPatch,
} from './homestead-terrain-source.js';

const seed = SURVIVAL_WORLD_SEED;
const CELLS = WORLD_CHUNK_STRIDE ** 2;

/** A topside chunk whose biomes are the generated island's (what an unedited publication holds). */
function generatedChunk(cx: number, cy: number): Uint8Array {
  const biomes = new Uint8Array(CELLS);
  for (let y = 0; y < WORLD_CHUNK_STRIDE; y += 1) for (let x = 0; x < WORLD_CHUNK_STRIDE; x += 1) {
    biomes[y * WORLD_CHUNK_STRIDE + x] = SURVIVAL_BIOMES.indexOf(survivalBiomeAt(seed, cx * WORLD_CHUNK_SIZE + x - 1, cy * WORLD_CHUNK_SIZE + y - 1));
  }
  return encodeWorldChunk({ schema: 1, mediumSchema: 1, spaceId: 0, cx, cy, assetRevision: 'assets-1',
    arrays: { medium: new Uint8Array(CELLS), solidBlocked: new Uint8Array(CELLS), 'clientGround.blocked': new Uint8Array(CELLS),
      'clientWater.blocked': new Uint8Array(CELLS).fill(1), biomes },
    records: [], assetIds: [], atlasPackIds: [] });
}

function generatedPatchChunks(site: { worldTileX: number; worldTileY: number }): Map<string, WorldChunk> {
  return new Map(homesteadPatchChunks(site, HOMESTEAD_TERRAIN_SIZE_TILES).map(({ cx, cy }) => [`${cx}:${cy}`, decodeWorldChunk(generatedChunk(cx, cy))]));
}

/** Static world S6, homestead option (a): a homestead exterior samples the published topside chunks
 * around its site. On an island nobody edited, that is exactly the generator's homestead. */
describe('homestead exteriors from the topside chunks (static world S6)', () => {
  const registry = bootstrapContentRegistry();
  // A central site, one on a chunk corner (its patch spans four chunks) and one near the coast.
  const sites = [{ worldTileX: 400, worldTileY: 410 }, { worldTileX: 384, worldTileY: 320 }, { worldTileX: 120, worldTileY: 90 }];

  it('reads the chunks a site covers: one, or up to four across chunk seams', () => {
    expect(homesteadPatchChunks({ worldTileX: 416, worldTileY: 410 }, HOMESTEAD_TERRAIN_SIZE_TILES)).toEqual([{ cx: 6, cy: 6 }]);
    expect(homesteadPatchChunks({ worldTileX: 384, worldTileY: 320 }, HOMESTEAD_TERRAIN_SIZE_TILES)).toHaveLength(4);
  });

  it('match the generator exterior biome on every tile of an unedited island', () => {
    for (const site of sites) {
      const patch = homesteadIslandPatch(1, site, generatedPatchChunks(site));
      for (let y = 0; y < HOMESTEAD_TERRAIN_SIZE_TILES; y += 1) for (let x = 0; x < HOMESTEAD_TERRAIN_SIZE_TILES; x += 1) {
        const source = { tileX: site.worldTileX + Math.floor((x - 64) / 4), tileY: site.worldTileY + Math.floor((y - 64) / 4) };
        expect(patch.biomeAt(source.tileX, source.tileY)).toBe(survivalBiomeAt(seed, source.tileX, source.tileY));
      }
    }
  }, 60_000);

  it('load a site once, verified, then build the generator exterior and its woodland species', async () => {
    const site = sites[1]!;
    const coords = homesteadPatchChunks(site, HOMESTEAD_TERRAIN_SIZE_TILES);
    const blobs = new Map(coords.map(({ cx, cy }) => {
      const bytes = generatedChunk(cx, cy);
      return [decodeWorldChunk(bytes).contentHash, bytes] as const;
    }));
    const manifest: WorldChunkManifest = { schema: 1, chunkSize: 64, spaceId: 0, width: 832, height: 832, assetRevision: 'assets-1',
      sourceRevision: 3, sourceHash: 'map-3', metadata: {},
      chunks: [...blobs].map(([hash, bytes]) => { const chunk = decodeWorldChunk(bytes); return { cx: chunk.cx, cy: chunk.cy, contentHash: hash, byteLength: bytes.length }; }) };
    const fetchBlob = vi.fn(async (path: string) => blobs.get(/([a-f0-9]{64})\.bin$/u.exec(path)![1]!)!);
    const shadow = { revision: 7, manifestJson: JSON.stringify(manifest) };
    expect(ensureHomesteadIslandPatch(site, HOMESTEAD_TERRAIN_SIZE_TILES, shadow, fetchBlob, undefined)).toBeUndefined();
    expect(() => homesteadExteriorBiomeAt(site, 10, 10)).toThrow('homestead_island_patch_missing');
    expect(homesteadTreeKindAt(site, seed, site.worldTileX, site.worldTileY, registry)).toBeNull();
    await vi.waitFor(() => expect(loadedHomesteadIslandPatch(site)).toBeDefined());
    expect(fetchBlob).toHaveBeenCalledTimes(4);
    expect(ensureHomesteadIslandPatch(site, HOMESTEAD_TERRAIN_SIZE_TILES, shadow, fetchBlob, undefined)?.key).toBe('7:384:320');
    expect(fetchBlob).toHaveBeenCalledTimes(4);

    for (let y = 0; y < HOMESTEAD_TERRAIN_SIZE_TILES; y += 3) for (let x = 0; x < HOMESTEAD_TERRAIN_SIZE_TILES; x += 3) {
      expect(homesteadExteriorBiomeAt(site, x, y, HOMESTEAD_TERRAIN_SIZE_TILES), `${x},${y}`)
        .toBe(homesteadBiomeAt(seed, site, x, y, HOMESTEAD_TERRAIN_SIZE_TILES));
    }
    // Species: the generator's, except that a lake within two tiles counts as a river for the fruit
    // trees (chunks cannot tell streams from lakes); every difference is such a tile.
    const patch = loadedHomesteadIslandPatch(site)!;
    let differ = 0, total = 0;
    for (let y = site.worldTileY - 16; y < site.worldTileY + 16; y += 1) for (let x = site.worldTileX - 16; x < site.worldTileX + 16; x += 1) {
      total += 1;
      if (homesteadTreeKindAt(site, seed, x, y, registry) === survivalTreeKindAt(seed, x, y, registry)) continue;
      differ += 1;
      expect(patch.riverNear(x, y), `${x},${y}`).toBe(true);
    }
    expect(differ / total).toBeLessThan(0.05);
  }, 60_000);

  it('retry a failed load only after a pause, never every frame', async () => {
    const site = { worldTileX: 200, worldTileY: 200 };
    const manifest: WorldChunkManifest = { schema: 1, chunkSize: 64, spaceId: 0, width: 832, height: 832, assetRevision: 'assets-1',
      sourceRevision: 3, sourceHash: 'map-3', metadata: {}, chunks: [{ cx: 3, cy: 3, contentHash: 'a'.repeat(64), byteLength: 100 }] };
    const fetchBlob = vi.fn(async () => { throw new Error('offline'); });
    const shadow = { revision: 1, manifestJson: JSON.stringify(manifest) };
    ensureHomesteadIslandPatch(site, HOMESTEAD_TERRAIN_SIZE_TILES, shadow, fetchBlob, undefined);
    await vi.waitFor(() => expect(fetchBlob).toHaveBeenCalledTimes(1));
    await new Promise(resolve => setTimeout(resolve, 10));
    for (let frame = 0; frame < 10; frame += 1) ensureHomesteadIslandPatch(site, HOMESTEAD_TERRAIN_SIZE_TILES, shadow, fetchBlob, undefined);
    expect(fetchBlob).toHaveBeenCalledTimes(1);
    expect(loadedHomesteadIslandPatch(site)).toBeUndefined();
  });
});

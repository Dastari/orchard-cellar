import { beforeAll, describe, expect, it, vi } from 'vitest';
import { bootstrapContentRegistry, compileMapDocument, mapTraversalChannels, runtimeTilesetResolver, runtimeTraversalPolicy,
  terrainDocumentForMapV3, TOPSIDE_SPACE_ID, type ContentRegistry, type MapDocumentV3 } from '@orchard/sim';
import { terrainArrayForMapDocument } from '@orchard/engine/editor-terrain';
import { ChunkTerrainStore } from '@orchard/engine/chunk-terrain-store';
import type { TerrainArray } from '@orchard/engine/terrain';
import { rebuildWorldChunkDocument, worldChunkBaseBiomes } from '@orchard/sim/world-chunk-document';
import { WORLD_CHUNK_SIZE, type ChunkArray } from '@orchard/sim/world-chunk';
import { captureWorldChunkSnapshot, materializeWorldChunks, worldChunkTerrainChannels, type MaterializedWorldChunks, type WorldChunkSnapshot } from './materialize-world-chunks.js';
import { AUTHORED_WATER_OVER_WATERFALL, authoredRoundTripRow, bootstrapRoundTripRow } from './world-chunk-document.fixture.js';

/**
 * Static-world S7a idempotence: compile the document rebuilt from the chunks over the
 * BAKED chunk base, with no generator. The compile path consults exactly five island
 * generator inputs (map-document generatedBaseCellAt, map-document-v3 resolvedMapBiomeAt
 * and editor-terrain terrainArrayForMapDocument). While `base.chunks` is set they are
 * answered from the published chunk channels, and every other survival-world export
 * throws, which proves nothing else of the generator is consulted.
 */
interface BakedBase {
  readonly store: ChunkTerrainStore;
  /** World index → generated biome recorded by the extension (`documentCells.baseBiomes`). */
  readonly baseBiomes: ReadonlyMap<number, number>;
}
const base = vi.hoisted(() => ({ chunks: null as BakedBase | null,
  redirected: ['survivalBiomeAt', 'survivalTerrainHeightAt', 'survivalTerrainBlocksTraversalAt', 'survivalDirtTerraceBytes', 'survivalDirtCliffRoleBytes'],
  /** Seed-free lookups the compile may still use. */
  pure: ['survivalBiomeAllowsHorseJump'] }));
vi.mock('../packages/sim/src/survival-world.js', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const biomes = actual['SURVIVAL_BIOMES'] as readonly string[];
  const baked = (): ChunkTerrainStore => base.chunks!.store;
  const index = (tileX: number, tileY: number): number => tileY * baked().width + tileX;
  const redirected: Record<string, (...args: never[]) => unknown> = {
    survivalBiomeAt: (_seed: number, tileX: number, tileY: number) => biomes[base.chunks!.baseBiomes.get(index(tileX, tileY)) ?? baked().biomes[index(tileX, tileY)]!],
    survivalTerrainHeightAt: (_seed: number, tileX: number, tileY: number) => baked().elevations[index(tileX, tileY)],
    survivalTerrainBlocksTraversalAt: (_seed: number, tileX: number, tileY: number, medium: string) => {
      if (medium !== 'ground') throw new Error(`generator consulted: survivalTerrainBlocksTraversalAt(${medium})`);
      return baked().blocked[index(tileX, tileY)] !== 0;
    },
    survivalDirtTerraceBytes: () => Uint8Array.from(baked().dirtTerraces!),
    survivalDirtCliffRoleBytes: () => Uint8Array.from(baked().dirtCliffRoles!),
  };
  return Object.fromEntries(Object.entries(actual).map(([name, value]) => {
    if (typeof value !== 'function' || base.pure.includes(name)) return [name, value];
    const original = value as (...args: unknown[]) => unknown;
    return [name, (...args: unknown[]) => {
      if (base.chunks === null) return original(...args);
      if (!base.redirected.includes(name)) throw new Error(`generator consulted: ${name}`);
      return redirected[name]!(...(args as never[]));
    }];
  }));
});

/** The live compile path of liveIslandTerrain (the one every authored island takes), forced. */
function compilePathTerrain(document: MapDocumentV3, registry: ContentRegistry, version: number) {
  const terrainDocument = terrainDocumentForMapV3(document);
  const compiled = compileMapDocument(terrainDocument, runtimeTilesetResolver(registry.tilesets));
  const terrain: TerrainArray = { ...terrainArrayForMapDocument(terrainDocument, compiled, document), spaceId: TOPSIDE_SPACE_ID, version,
    ...(runtimeTraversalPolicy(registry) !== null ? { traversalChannels: mapTraversalChannels(document, compiled) } : {}) };
  return { terrain, channels: worldChunkTerrainChannels(terrain, document, compiled) };
}
/** Channel name → differing cell indices (a missing or extra channel is reported as `[-1]`). */
function channelDifferences(actual: Readonly<Record<string, ChunkArray>>, expected: Readonly<Record<string, ChunkArray>>): Record<string, number[]> {
  const result: Record<string, number[]> = {};
  for (const name of new Set([...Object.keys(actual), ...Object.keys(expected)])) {
    const a = actual[name], b = expected[name];
    if (a === undefined || b === undefined || a.length !== b.length) { result[name] = [-1]; continue; }
    const cells: number[] = [];
    for (let index = 0; index < a.length; index++) if (a[index] !== b[index]) cells.push(index);
    if (cells.length > 0) result[name] = cells;
  }
  return result;
}

describe.each([
  ['bootstrap island', bootstrapRoundTripRow],
  ['authored document', authoredRoundTripRow],
] as const)('generator-free recompile over the baked chunk base: %s', (name, fixture) => {
  let registry: ContentRegistry;
  let snapshot: WorldChunkSnapshot;
  let published: MaterializedWorldChunks;
  let store: ChunkTerrainStore;
  let rebuilt: MapDocumentV3;
  let baked: Record<string, ChunkArray>;
  let baseBiomes: Map<number, number>;
  beforeAll(() => {
    registry = bootstrapContentRegistry();
    const row = fixture(registry);
    snapshot = captureWorldChunkSnapshot(row, registry);
    published = materializeWorldChunks(snapshot, row, registry, { includeAuthoredDocument: true });
    const blobs = new Map(published.manifest.chunks.map((head, index) => [head.contentHash, published.blobs[index]!]));
    rebuilt = rebuildWorldChunkDocument(published.manifest, hash => blobs.get(hash));
    store = new ChunkTerrainStore(published.manifest, runtimeTilesetResolver(registry.tilesets));
    for (const bytes of published.blobs) store.install(bytes);
    // The chunk terrain channels exactly as published (the collision and authority channels derive from them).
    const names = Object.keys(worldChunkTerrainChannels(snapshot.terrain, snapshot.document,
      compileMapDocument(terrainDocumentForMapV3(snapshot.document), runtimeTilesetResolver(registry.tilesets))));
    baked = Object.fromEntries(names.map(channel => [channel, store.channels[channel]!]));
    baseBiomes = new Map();
    for (const { cx, cy } of published.manifest.chunks) {
      for (const [local, biome] of worldChunkBaseBiomes(store.chunkAt(cx, cy)!, (published.manifest.metadata['biomePalette'] as readonly unknown[]).length)) {
        baseBiomes.set((cy * WORLD_CHUNK_SIZE + Math.floor(local / WORLD_CHUNK_SIZE)) * store.width + cx * WORLD_CHUNK_SIZE + local % WORLD_CHUNK_SIZE, biome);
      }
    }
  }, 180_000);

  const tile = (index: number): string => `${index % store.width},${Math.floor(index / store.width)}`;
  /** Everything a compile yields beyond the chunk channels (records and the traversal projection). */
  function compileExtras(terrain: TerrainArray): string {
    const traversal = terrain.traversalChannels;
    return JSON.stringify([terrain.terrainTransitions, terrain.terrainOverrides, terrain.cellParts === undefined ? null : [...terrain.cellParts],
      traversal === undefined ? null : [Array.from(traversal.medium), Array.from(traversal.solidBlocked)]]);
  }
  function overBakedBase(recorded = baseBiomes) {
    base.chunks = { store, baseBiomes: recorded };
    try { return compilePathTerrain(rebuilt, registry, snapshot.terrain.version); } finally { base.chunks = null; }
  }

  it('consults only the five redirected generator inputs', () => {
    // Any other survival-world export throws `generator consulted` while the baked base is active.
    expect(() => overBakedBase()).not.toThrow();
    base.chunks = { store, baseBiomes };
    try { expect(() => compilePathTerrain({ ...rebuilt, provenance: { ...rebuilt.provenance } }, registry, 0)).not.toThrow(); } finally { base.chunks = null; }
  }, 180_000);

  if (name === 'bootstrap island') {
    it('reproduces the generator compile exactly, but an unauthored island is published from the generated fast path', () => {
      expect(baseBiomes.size).toBe(0);
      const generatorFree = overBakedBase();
      const generator = compilePathTerrain(rebuilt, registry, snapshot.terrain.version);
      // Base: on an unauthored island the baked channels ARE the generator base.
      expect(channelDifferences(generatorFree.channels, generator.channels)).toEqual({});
      expect(compileExtras(generatorFree.terrain)).toBe(compileExtras(generator.terrain));
      // Path: an island without authored terrain is published from terrainForWorld (liveIslandUsesGeneratedTerrain).
      // Any compile of it (the first authored terrain edit) adds four channels to every chunk and blocks the three
      // fisherman-dock water tiles that the generator's ground traversal leaves walkable.
      const differences = channelDifferences(generatorFree.channels, baked);
      expect(Object.fromEntries(Object.entries(differences).map(([channel, cells]) => [channel, cells.map(index => index < 0 ? 'absent' : tile(index))])))
        .toEqual({ authoredSurfaces: ['absent'], cliffFamilies: ['absent'], ledges: ['absent'], surfaceFamilies: ['absent'], blocked: ['407,317', '408,317', '409,317'] });
      for (const index of differences['blocked']!) expect([baked['blocked']![index], generatorFree.channels['blocked']![index]]).toEqual([0, 1]);
    }, 180_000);
  } else {
    it('reproduces every chunk channel over the baked base plus the recorded base biomes, and not without them', () => {
      // Recorded: consulting cells (biome without surface, or surface/feature without biome) whose baked biome lost the generated one.
      expect([...baseBiomes.keys()].map(tile).sort()).toEqual(['406,400', '407,400', '408,400', `${AUTHORED_WATER_OVER_WATERFALL.tileX},${AUTHORED_WATER_OVER_WATERFALL.tileY}`].sort());
      const generator = compilePathTerrain(rebuilt, registry, snapshot.terrain.version);
      expect(channelDifferences(generator.channels, baked)).toEqual({}); // the chunks were compiled over the generator base
      const generatorFree = overBakedBase();
      expect(channelDifferences(generatorFree.channels, baked)).toEqual({});
      expect(compileExtras(generatorFree.terrain)).toBe(compileExtras(generator.terrain));
      // Without them the biome-only cell takes its surface from the authored biome (beach → sand), not the generated one.
      const lossy = overBakedBase(new Map());
      expect(Object.fromEntries(Object.entries(channelDifferences(lossy.channels, baked)).map(([channel, cells]) => [channel, cells.map(tile)])))
        .toEqual({ authoredSurfaces: ['406,400'], compiledSurfaces: ['406,400'] });
    }, 180_000);
  }
});

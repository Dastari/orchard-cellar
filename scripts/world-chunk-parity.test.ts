import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { activeSurvivalLandmarks, bootstrapContentRegistry, createLiveIslandMapDocument, generateSurvivalResources, LIVE_ISLAND_MAP_ID,
  serializeMapDocumentV3, SURVIVAL_WORLD_SEED, TOPSIDE_SPACE_ID, type ContentRegistry } from '@orchard/sim';
import { ChunkTerrainStore } from '@orchard/engine/chunk-terrain-store';
import { CHUNK_RUNTIME_MAX_BLOB_BYTES, sampleChunkCollision, verifyRuntimeChunk } from '@orchard/sim/chunk-runtime';
import { canonicalChunkJson, decodeWorldChunk, worldChunkHash, WORLD_CHUNK_AUTHORITY_CHANNELS } from '@orchard/sim/world-chunk';
import { captureWorldChunkSnapshot, materializeWorldChunks, verifyWorldChunkParity, type MaterializedWorldChunks, type WorldChunkSnapshot } from './materialize-world-chunks.js';

const hashJson = (value: unknown): string => worldChunkHash(new TextEncoder().encode(canonicalChunkJson(value)));
const WATERFALL = Array.from({ length: 15 }, (_, index) => ({ x: 414 + index % 3, y: 357 + Math.floor(index / 3) }));

describe('static island materialization golden parity', () => {
  // One bootstrap snapshot (the expensive capture + server oracle) shared by every case.
  let registry: ContentRegistry;
  let snapshot: WorldChunkSnapshot;
  let audit: MaterializedWorldChunks;
  let published: MaterializedWorldChunks;
  beforeAll(() => {
    registry = bootstrapContentRegistry();
    const document = createLiveIslandMapDocument({ landmarks: activeSurvivalLandmarks(registry, TOPSIDE_SPACE_ID) });
    const row = { mapId: LIVE_ISLAND_MAP_ID, revision: document.revision, contentHash: 'bootstrap-golden', documentJson: serializeMapDocumentV3(document) };
    snapshot = captureWorldChunkSnapshot(row, registry);
    audit = materializeWorldChunks(snapshot, row, registry, { includeServerOracle: true });
    published = materializeWorldChunks(snapshot, row, registry);
  }, 120_000);

  it('reconstructs every seed/bootstrap channel, server collision and ordered record from 13×13 chunks', () => {
    expect(audit.blobs).toHaveLength(169);
    for (const { x, y } of WATERFALL) {
      const index = y * snapshot.terrain.width + x;
      expect(snapshot.channels['medium']![index]).toBe(1); // waterfall: shallow_water
      expect(snapshot.channels['solidBlocked']![index]).toBe(0);
      expect(snapshot.channels['clientWater.blocked']![index]).toBe(1);
      expect(snapshot.channels['serverWater.blocked']![index]).toBe(0);
    }
    verifyWorldChunkParity(snapshot, audit);
    const goldens = JSON.parse(readFileSync(new URL('./world-chunk-goldens.json', import.meta.url), 'utf8')) as Record<string, string>;
    expect(Object.keys(snapshot.channels).sort()).toEqual(Object.keys(goldens).filter(name => !['records', 'authority.records', 'authority.metadata'].includes(name)).sort());
    for (const [name, values] of Object.entries(snapshot.channels)) {
      expect(worldChunkHash(new Uint8Array(values.buffer, values.byteOffset, values.byteLength)), name).toBe(goldens[name]);
    }
    // The pre-authority record stream is unchanged; authority records are appended after it.
    const legacy = snapshot.records.filter(record => !record.kind.startsWith('authority.'));
    expect(snapshot.records.slice(0, legacy.length)).toEqual(legacy);
    expect(hashJson(legacy), 'ordered records').toBe(goldens['records']);
    expect(hashJson(snapshot.records.slice(legacy.length)), 'ordered authority records').toBe(goldens['authority.records']);
    expect(hashJson(snapshot.metadata['authority']), 'authority metadata').toBe(goldens['authority.metadata']);
  }, 120_000);

  it('publishes authority channels, not audit oracle channels, and rebuilds the full server composition from them', () => {
    expect(published.blobs).toHaveLength(169);
    verifyWorldChunkParity(snapshot, published);
    const sizes = published.blobs.map(bytes => bytes.length);
    expect(Math.max(...sizes)).toBeLessThan(CHUNK_RUNTIME_MAX_BLOB_BYTES);
    for (const [index, bytes] of published.blobs.entries()) {
      const head = published.manifest.chunks[index]!;
      const chunk = verifyRuntimeChunk(bytes, published.manifest, head.cx, head.cy);
      expect(chunk.authoritySchema).toBe(1);
      expect(Object.keys(chunk.arrays)).toEqual(expect.arrayContaining(Object.keys(WORLD_CHUNK_AUTHORITY_CHANNELS)));
      expect(Object.keys(chunk.arrays).filter(name => name.startsWith('server'))).toEqual([]);
      expect(chunk.arrays['authority.water.horseJumpableTerrain']).toBeUndefined(); // SW-D1
    }
    // D6/SW-D1: the 15 waterfall cells are boat-enterable in the published authority water channel.
    const waterfallHead = published.manifest.chunks.findIndex(head => head.cx === 6 && head.cy === 5);
    const waterfall = decodeWorldChunk(published.blobs[waterfallHead]!);
    for (const { x, y } of WATERFALL) {
      expect(snapshot.channels['authority.water.blocked']![y * snapshot.terrain.width + x], `${x},${y}`).toBe(0);
      expect(snapshot.authority.composed.water.blocked[y * snapshot.terrain.width + x]).toBe(false);
      expect(sampleChunkCollision(waterfall, x, y).authority?.waterBlocked, `${x},${y}`).toBe(false);
    }
  }, 120_000);

  it('carries generated resource ids and order byte-identical to generateSurvivalResources(SURVIVAL_WORLD_SEED)', () => {
    const store = new ChunkTerrainStore(published.manifest, snapshot.terrain.tilesets);
    for (const bytes of published.blobs) store.install(bytes);
    const generated = generateSurvivalResources(SURVIVAL_WORLD_SEED, registry);
    const records = store.records('authority.resource');
    expect(records.map(record => record.ordinal)).toEqual(generated.map((_, index) => index));
    const ids = (values: readonly { readonly id: number }[]): Uint8Array => new TextEncoder().encode(canonicalChunkJson(values.map(({ id }) => id)));
    expect(ids(records.map(record => record.value as unknown as { id: number }))).toEqual(ids(generated));
    expect(records.map(record => record.value)).toEqual(generated.map(resource => ({ id: resource.id, kind: resource.kind,
      generatedTile: { tileX: resource.tileX, tileY: resource.tileY }, effectiveTile: { tileX: resource.tileX, tileY: resource.tileY }, suppressed: false })));
    expect((published.manifest.metadata['authority'] as { resources: unknown }).resources)
      .toEqual({ count: generated.length, orderHash: hashJson(generated.map(({ id }) => id)) });
  }, 120_000);
});

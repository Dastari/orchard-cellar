import { describe, expect, it } from 'vitest';
import { Buffer } from 'node:buffer';
import { decodeWorldChunk, encodeWorldChunk, sliceWorldChunkChannel, type WorldChunkManifest, type ChunkArray } from '@orchard/sim/world-chunk';
import { ChunkTerrainStore } from './chunk-terrain-store.js';
import type { TerrainArray } from './terrain.js';

function fixture() {
  const width = 65, height = 2;
  const arrays: Record<string, ChunkArray> = {
    medium: new Uint8Array(width * height).fill(1), solidBlocked: new Uint8Array(width * height),
    biomes: Uint8Array.from({ length: width * height }, (_, i) => i % 13),
    elevations: Int16Array.from({ length: width * height }, (_, i) => i - 90),
    blocked: new Uint8Array(width * height), horseJumpableTerrain: new Uint8Array(width * height).fill(1),
    dirtCliffRoles: new Uint8Array(width * height), dirtTerraces: new Uint8Array(width * height),
  };
  const blobs = [0, 1].map(cx => encodeWorldChunk({ schema: 1, mediumSchema: 1, spaceId: 1, cx, cy: 0, assetRevision: 'a',
    arrays: Object.fromEntries(Object.entries(arrays).map(([name, value]) => [name, sliceWorldChunkChannel(value, width, height, cx, 0, name === 'medium' ? 5 : name === 'solidBlocked' ? 1 : 0)])),
    records: [{ kind: 'resource', ordinal: 1 - cx, tileX: cx * 64, tileY: 0, value: { id: 1000 + cx } }], assetIds: [], atlasPackIds: [] }));
  const manifest: WorldChunkManifest = { schema: 1, chunkSize: 64, spaceId: 1, width, height, assetRevision: 'a', sourceRevision: 1, sourceHash: 'source',
    metadata: { terrain: { seed: 42, version: 1 }, channels: Object.fromEntries(Object.entries(arrays).map(([name, value]) => [name, { type: value instanceof Int16Array ? 'i16' : 'u8', planes: 1 }])) },
    chunks: blobs.map((bytes, cx) => ({ cx, cy: 0, byteLength: bytes.length, contentHash: decodeWorldChunk(bytes).contentHash })) };
  return { arrays, blobs, manifest };
}
describe('ChunkTerrainStore', () => {
  it('implements TerrainArray and keeps missing cells blocked', () => {
    const { arrays, blobs, manifest } = fixture();
    const store = new ChunkTerrainStore(manifest);
    const terrain: TerrainArray = store;
    expect(terrain.blocked.every(Boolean)).toBe(true);
    expect(store.channels['medium']?.every(value => value === 5)).toBe(true);
    expect(store.channels['solidBlocked']?.every(value => value === 1)).toBe(true);
    expect(store.hasTile(64, 0)).toBe(false);
    expect(() => store.collision('clientGround')).toThrow(/every/u);
    const nodeBuffer = Buffer.from(blobs[1]!);
    store.install(nodeBuffer);
    nodeBuffer.fill(0); // readFile buffers must be copied, not retained as mutable views
    expect(store.hasTile(64, 0)).toBe(true);
    expect(store.hasTile(0, 0)).toBe(false);
    expect(terrain.blocked[0]).toBe(true);
    expect(terrain.blocked[64]).toBe(false);
    store.install(blobs[0]!);
    store.install(blobs[0]!);
    expect(store.complete).toBe(true);
    expect(store.chunkAt(1, 0)?.arrays['medium']?.[69]).toBe(5);
    expect(store.chunkAt(1, 0)?.arrays['solidBlocked']?.[69]).toBe(1);
    expect(store.channels).toEqual(arrays);
    expect(store.records('resource').map(record => record.value)).toEqual([{ id: 1001 }, { id: 1000 }]);
    expect(store.chunkAt(1, 0)?.arrays['elevations']?.[66]).toBe(arrays['elevations']?.[63]);
    expect(store.hasTile(65, 0)).toBe(false);
  });
  it('rejects stale content/asset heads and invalid manifests without mutating cells', () => {
    const { blobs, manifest } = fixture();
    const store = new ChunkTerrainStore({ ...manifest, assetRevision: 'other' });
    expect(() => store.install(blobs[0]!)).toThrow(/manifest/u);
    expect(store.blocked.every(Boolean)).toBe(true);
    expect(() => new ChunkTerrainStore({ ...manifest, chunks: [manifest.chunks[0]!, manifest.chunks[0]!] })).toThrow(/duplicate/u);
  });
});

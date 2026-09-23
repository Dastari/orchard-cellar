import { describe, expect, it } from 'vitest';
import { decodeWorldChunk, encodeWorldChunk, sliceWorldChunkChannel, WORLD_CHUNK_STRIDE, type WorldChunk } from './world-chunk.js';

function fixture(): Omit<WorldChunk, 'contentHash'> {
  return { schema: 1, spaceId: 1, cx: -1, cy: 2, assetRevision: 'assets-a',
    arrays: { biome: new Uint8Array(WORLD_CHUNK_STRIDE ** 2).fill(4), elevation: new Int16Array(WORLD_CHUNK_STRIDE ** 2).fill(-7) },
    records: [{ kind: 'generatedResource', ordinal: 3, tileX: -1, tileY: 128, value: { id: 1000000042 } }],
    assetIds: ['tree_oak'], atlasPackIds: ['trees-oak'], cellParts: { '0': [{ slot: 'path', exact: { frame: 42 } }] } };
}
describe('world chunk binary format', () => {
  it('round-trips signed coordinates/elevations, IDs, parts and an unaligned input view', () => {
    const input = fixture();
    const bytes = encodeWorldChunk(input);
    const view = new Uint8Array(bytes.length + 3); view.set(bytes, 3);
    const decoded = decodeWorldChunk(view.subarray(3));
    expect(decoded).toEqual({ ...input, contentHash: expect.stringMatching(/^[a-f0-9]{64}$/u) });
    expect(decodeWorldChunk(bytes, decoded.contentHash)).toEqual(decoded);
  });
  it('canonicalizes object/channel key order without reordering authored lists', () => {
    const a = fixture();
    expect(encodeWorldChunk(a)).toEqual(encodeWorldChunk({ ...a, arrays: { elevation: a.arrays['elevation']!, biome: a.arrays['biome']! } }));
    expect(decodeWorldChunk(encodeWorldChunk({ ...a, cx: -2, records: [] })).contentHash).not.toBe(decodeWorldChunk(encodeWorldChunk({ ...a, records: [] })).contentHash);
  });
  it('rejects corrupt, truncated, extended, wrong-version and wrong-head blobs', () => {
    const bytes = encodeWorldChunk(fixture());
    for (const index of [0, 6, 8, 40, 48, bytes.length - 1]) {
      const corrupt = bytes.slice(); corrupt[index] = corrupt[index]! ^ 1;
      expect(() => decodeWorldChunk(corrupt)).toThrow();
    }
    expect(() => decodeWorldChunk(bytes.slice(0, -1))).toThrow();
    expect(() => decodeWorldChunk(new Uint8Array([...bytes, 0]))).toThrow();
    expect(() => decodeWorldChunk(bytes, '0'.repeat(64))).toThrow(/hash/u);
  });
  it('rejects wrong record ownership, invalid part addresses and malformed channels', () => {
    const a = fixture();
    expect(() => encodeWorldChunk({ ...a, cx: 0 })).toThrow(/anchor/u);
    expect(() => encodeWorldChunk({ ...a, cellParts: { '4096': [] } })).toThrow(/parts/u);
    expect(() => encodeWorldChunk({ ...a, arrays: { biome: new Uint8Array(17) } })).toThrow(/channel/u);
  });
  it('retains medium beside legacy planes and rejects unsupported extension data', () => {
    const source = fixture();
    const arrays = { ...source.arrays, medium: new Uint8Array(WORLD_CHUNK_STRIDE ** 2).fill(4),
      solidBlocked: new Uint8Array(WORLD_CHUNK_STRIDE ** 2),
      'clientGround.blocked': new Uint8Array(WORLD_CHUNK_STRIDE ** 2).fill(1),
      'clientWater.blocked': new Uint8Array(WORLD_CHUNK_STRIDE ** 2) };
    const input = { ...source, mediumSchema: 1 as const, arrays };
    expect(decodeWorldChunk(encodeWorldChunk(input))).toEqual({ ...input, contentHash: expect.any(String) });
    expect(() => encodeWorldChunk({ ...input, mediumSchema: 2 as 1 })).toThrow(/medium/u);
    expect(() => encodeWorldChunk({ ...source, arrays })).toThrow(/medium/u);
    expect(() => encodeWorldChunk({ ...input, arrays: { ...arrays, medium: new Uint8Array(WORLD_CHUNK_STRIDE ** 2).fill(6) } })).toThrow(/medium/u);
    expect(() => encodeWorldChunk({ ...input, arrays: { ...arrays, solidBlocked: new Uint8Array(WORLD_CHUNK_STRIDE ** 2).fill(2) } })).toThrow(/medium/u);
    expect(() => encodeWorldChunk({ ...input, arrays: source.arrays })).toThrow(/medium/u);
  });
  it('copies neighbour halos and plane-major channels, including map-edge sentinels', () => {
    const width = 65, height = 2;
    const source = Int16Array.from({ length: width * height * 2 }, (_, index) => index - 100);
    const a = sliceWorldChunkChannel(source, width, height, 0, 0, -999);
    const b = sliceWorldChunkChannel(source, width, height, 1, 0, -999);
    expect(a[0]).toBe(-999);
    expect(a[WORLD_CHUNK_STRIDE + 65]).toBe(source[64]);
    expect(b[WORLD_CHUNK_STRIDE]).toBe(source[63]);
    expect(b[WORLD_CHUNK_STRIDE + 1]).toBe(source[64]);
    expect(b[WORLD_CHUNK_STRIDE + 2]).toBe(-999);
    expect(b[WORLD_CHUNK_STRIDE ** 2 + WORLD_CHUNK_STRIDE + 1]).toBe(source[width * height + 64]);
  });
});

import { describe, expect, it } from 'vitest';
import { decodeWorldChunk, encodeWorldChunk, sliceWorldChunkChannel, WORLD_CHUNK_AUTHORITY_CHANNELS, WORLD_CHUNK_STRIDE, type ChunkJson, type WorldChunk, worldChunkHash } from './world-chunk.js';
import { authorityChunkFixture } from './chunk-runtime.fixture.js';
import { encodeWorldChunk as legacyEncodeWorldChunk } from './world-chunk.schema1-legacy.fixture.js';

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
  it('derives the content address and the header digest check from one hash, with unchanged tamper errors', () => {
    const bytes = encodeWorldChunk(fixture());
    const decoded = decodeWorldChunk(bytes);
    const headerHex = Array.from(bytes.subarray(8, 40), byte => byte.toString(16).padStart(2, '0')).join('');
    expect(decoded.contentHash).toBe(worldChunkHash(bytes.subarray(40)));
    expect(decoded.contentHash).toBe(headerHex);
    // Header digest, JSON length, metadata and channel payload tampering all fail the same way.
    for (const index of [8, 39, 40, 48, bytes.length - 1]) {
      const corrupt = bytes.slice(); corrupt[index] = corrupt[index]! ^ 1;
      expect(() => decodeWorldChunk(corrupt), `byte ${index}`).toThrow(new TypeError('World chunk hash mismatch'));
    }
    expect(() => decodeWorldChunk(bytes, worldChunkHash(bytes))).toThrow(new TypeError('World chunk hash mismatch'));
    expect(decodeWorldChunk(bytes, headerHex).contentHash).toBe(headerHex);
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
  it('round-trips the additive authority extension and fails closed on partial or unknown authority data', () => {
    const source = fixture();
    const authority = authorityChunkFixture(-1, 2);
    const input = { ...source, authoritySchema: 1 as const, arrays: { ...source.arrays, ...authority.arrays }, records: [...source.records, ...authority.records] };
    const bytes = encodeWorldChunk(input);
    expect(decodeWorldChunk(bytes)).toEqual({ ...input, contentHash: expect.any(String) });
    // Blobs without the extension are byte-identical to the deployed (pre-authority) encoder
    // and carry no authority header key at all.
    expect(encodeWorldChunk(source)).toEqual(legacyEncodeWorldChunk(source));
    const medium = { ...source, mediumSchema: 1 as const, arrays: { ...source.arrays, medium: new Uint8Array(WORLD_CHUNK_STRIDE ** 2), solidBlocked: new Uint8Array(WORLD_CHUNK_STRIDE ** 2) } };
    expect(encodeWorldChunk(medium)).toEqual(legacyEncodeWorldChunk(medium));
    expect('authoritySchema' in decodeWorldChunk(encodeWorldChunk(source))).toBe(false);
    const withoutSchema: Omit<WorldChunk, 'contentHash'> = { ...source, arrays: input.arrays, records: input.records };
    const cells = WORLD_CHUNK_STRIDE ** 2;
    expect(() => encodeWorldChunk({ ...input, authoritySchema: 2 as 1 })).toThrow(/authority/u);
    expect(() => encodeWorldChunk(withoutSchema)).toThrow(/authority/u);
    expect(() => encodeWorldChunk({ ...source, records: [...source.records, authority.records[0]!] })).toThrow(/authority/u);
    for (const name of Object.keys(WORLD_CHUNK_AUTHORITY_CHANNELS)) {
      const arrays: Record<string, Uint8Array | Int16Array> = { ...input.arrays };
      delete arrays[name];
      expect(() => encodeWorldChunk({ ...input, arrays }), name).toThrow(/authority/u);
    }
    expect(() => encodeWorldChunk({ ...input, arrays: { ...input.arrays, 'authority.water.blocked': new Uint8Array(cells).fill(2) } })).toThrow(/authority/u);
    expect(() => encodeWorldChunk({ ...input, arrays: { ...input.arrays, 'authority.combatRegion': new Uint8Array(cells).fill(65) } })).toThrow(/authority/u);
    expect(() => encodeWorldChunk({ ...input, arrays: { ...input.arrays, 'authority.ground.elevations': new Uint8Array(cells) } })).toThrow(/authority/u);
    const record = (index: number, value: Record<string, ChunkJson>) => ({ ...input, records: input.records.map((row, at) => at === source.records.length + index ? { ...row, value: { ...(row.value as Record<string, ChunkJson>), ...value } } : row) });
    expect(() => encodeWorldChunk(record(0, { group: 'live' }))).toThrow(/authority record/u);
    expect(() => encodeWorldChunk(record(0, { right: -1_000_000 }))).toThrow(/authority record/u);
    expect(() => encodeWorldChunk(record(0, { sourceId: '' }))).toThrow(/authority record/u);
    expect(() => encodeWorldChunk(record(2, { medium: 'air' }))).toThrow(/authority record/u);
    expect(() => encodeWorldChunk(record(3, { tileX: 0 }))).toThrow(/authority record/u);
    expect(() => encodeWorldChunk(record(5, { suppressed: 'no' }))).toThrow(/authority record/u);
    // Resources are anchored at the chunk of their effective tile; generator fields are typed.
    expect(() => encodeWorldChunk(record(5, { effectiveTile: { tileX: -59, tileY: 131 } }))).toThrow(/authority record/u);
    expect(() => encodeWorldChunk(record(5, { richness: -1 }))).toThrow(/authority record/u);
    expect(() => encodeWorldChunk(record(5, { nodeClass: 3 }))).toThrow(/authority record/u);
    expect(() => encodeWorldChunk(record(6, { id: '007' }))).toThrow(/authority record/u);
    expect(() => encodeWorldChunk(record(6, { tile: { tileX: -60, tileY: 128 } }))).toThrow(/authority record/u);
  });
  it('keeps the authority extension additive within schema 1: unknown authority channels and records pass through', () => {
    const source = fixture();
    const authority = authorityChunkFixture(-1, 2);
    const cells = WORLD_CHUNK_STRIDE ** 2;
    const later = { ...source, authoritySchema: 1 as const,
      arrays: { ...source.arrays, ...authority.arrays, 'authority.air.blocked': new Uint8Array(cells).fill(7), 'authority.water.horseJumpableTerrain': new Uint8Array(cells) },
      records: [...source.records, ...authority.records, { kind: 'authority.laterKind', ordinal: 0, tileX: -60, tileY: 130, value: { anything: [1, 'two'] } }] };
    expect(decodeWorldChunk(encodeWorldChunk(later))).toEqual({ ...later, contentHash: expect.any(String) });
    // Known channels and kinds are still validated, and unknown data still needs the schema.
    expect(() => encodeWorldChunk({ ...later, arrays: { ...later.arrays, 'authority.water.blocked': new Uint8Array(cells).fill(2) } })).toThrow(/authority/u);
    expect(() => encodeWorldChunk({ ...later, records: [...later.records, { ...authority.records[0]!, value: { group: 'live' } }] })).toThrow(/authority record/u);
    const unversioned: Omit<WorldChunk, 'contentHash'> = { ...source, arrays: later.arrays, records: later.records };
    expect(() => encodeWorldChunk({ ...unversioned, arrays: { ...source.arrays, 'authority.air.blocked': new Uint8Array(cells) }, records: source.records })).toThrow(/authority/u);
    expect(() => encodeWorldChunk({ ...unversioned, arrays: source.arrays, records: [...source.records, later.records.at(-1)!] })).toThrow(/authority/u);
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

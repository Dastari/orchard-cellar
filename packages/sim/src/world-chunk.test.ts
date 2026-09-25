import { describe, expect, it } from 'vitest';
import { sha256 } from '@noble/hashes/sha2.js';
import { decodeWorldChunk, encodeWorldChunk, sliceWorldChunkChannel, worldChunkHasAuthority, WORLD_CHUNK_AUTHORITY_CHANNELS, WORLD_CHUNK_OBSTACLE_TABLE_MAX_ROWS, WORLD_CHUNK_OBSTACLE_TILE_UNITS,
  WORLD_CHUNK_STRIDE, type ChunkJson, type WorldChunk, type WorldChunkRecord, worldChunkHash } from './world-chunk.js';
import { authorityChunkFixture } from './chunk-runtime.fixture.js';
import { TILE_SIZE_FIXED } from './state.js';
import { encodeWorldChunk as legacyEncodeWorldChunk } from './world-chunk.schema1-legacy.fixture.js';
import { decodeWorldChunk as deployedDecodeWorldChunk } from './world-chunk.authority1-deployed.fixture.js';

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
    expect(() => encodeWorldChunk({ ...input, authoritySchema: 3 as 1 })).toThrow(/authority/u);
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

/** A chunk at (cx, cy) with dense prefab-style collision: `count` 64-unit sub-cell boxes,
 * each emitted as a client ground, a client water and an authored authority record, after
 * the fixture's base obstacle and suppressed key (the materializer's record layout). */
function denseChunk(count: number, cx = 2, cy = 6): Omit<WorldChunk, 'contentHash'> {
  const authority = authorityChunkFixture(cx, cy);
  const x0 = cx * 64 * 256, y0 = cy * 64 * 256;
  const boxes = Array.from({ length: count }, (_, index) => {
    const cell = Math.floor(index / 16), bit = index % 16;
    const left = x0 + (cell % 60) * 256 + (bit % 4) * 64, top = y0 + Math.floor(cell / 60) * 256 + Math.floor(bit / 4) * 64;
    return { left, top, right: left + 63, bottom: top + 63, sourceId: `object:prefab-${Math.floor(cell / 3)}` };
  });
  const anchor = ({ left, top }: { left: number; top: number }) => ({ tileX: Math.floor(left / 256), tileY: Math.floor(top / 256) });
  const plain = (kind: string, start: number) => boxes.map(({ left, top, right, bottom }, index) => ({ kind, ordinal: start + index, ...anchor({ left, top }), value: { left, top, right, bottom } }));
  const [baseObstacle, authoredObstacle, suppressed, ...rest] = authority.records;
  const records: WorldChunkRecord[] = [
    { kind: 'objects', ordinal: 0, tileX: cx * 64, tileY: cy * 64, value: { id: 'prefab-0', tileX: cx * 64, tileY: cy * 64 } },
    ...plain('clientGround.obstacle', 40), ...plain('clientWater.obstacle', 17),
    baseObstacle!, authoredObstacle!,
    ...boxes.map((box, index) => ({ kind: 'authority.ground.obstacle', ordinal: 2 + index, ...anchor(box), value: { group: 'authored', ordinal: 1 + index, ...box } })),
    suppressed!, ...rest,
  ];
  return { schema: 1, mediumSchema: 1, authoritySchema: 1, spaceId: 0, cx, cy, assetRevision: 'assets-1',
    arrays: { medium: new Uint8Array(WORLD_CHUNK_STRIDE ** 2), solidBlocked: new Uint8Array(WORLD_CHUNK_STRIDE ** 2), ...authority.arrays },
    records, assetIds: [], atlasPackIds: [] };
}
function header(bytes: Uint8Array): Record<string, unknown> {
  const length = new DataView(bytes.buffer, bytes.byteOffset).getUint32(40, true);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(44, 44 + length))) as Record<string, unknown>;
}
/** Re-envelopes a blob with an edited header (valid hash), to reach the decoder's table checks. */
function withHeader(bytes: Uint8Array, edit: (value: Record<string, unknown>) => void): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset);
  const length = view.getUint32(40, true);
  const value = header(bytes); edit(value);
  const json = new TextEncoder().encode(JSON.stringify(value));
  const result = new Uint8Array(44 + json.length + bytes.length - 44 - length);
  result.set(bytes.subarray(0, 8));
  new DataView(result.buffer).setUint32(40, json.length, true);
  result.set(json, 44);
  result.set(bytes.subarray(44 + length), 44 + json.length);
  result.set(sha256(result.subarray(40)), 8);
  return result;
}
type Table = { boxes: number[]; sources?: string[]; lists: { kind: string; at: number; rows: number[]; anchors?: number[] }[] };
describe('authority schema 2: the obstacle table (BUG-044)', () => {
  it('derives table anchors from the fixed-point tile size', () => {
    expect(WORLD_CHUNK_OBSTACLE_TILE_UNITS).toBe(TILE_SIZE_FIXED);
  });
  it('decodes to exactly the version-1 chunk while storing each obstacle once', () => {
    const v1 = denseChunk(1_600);
    const v2 = { ...v1, authoritySchema: 2 as const };
    const bytes1 = encodeWorldChunk(v1), bytes2 = encodeWorldChunk(v2);
    const decoded = decodeWorldChunk(bytes2);
    expect(decoded).toEqual({ ...v2, contentHash: expect.any(String) });
    expect(JSON.stringify(decoded.records)).toBe(JSON.stringify(decodeWorldChunk(bytes1).records)); // key order too
    expect(worldChunkHasAuthority(decoded)).toBe(true);
    const raw = header(bytes2), table = raw['obstacleTable'] as Table;
    expect(raw['authoritySchema']).toBe(2);
    expect((raw['records'] as WorldChunkRecord[]).map(({ kind }) => kind)).toEqual(['objects', 'authority.walkable', 'authority.ground.transition', 'authority.resource', 'authority.resourcePlacement']);
    expect(table.lists.map(({ kind, at }) => [kind, at])).toEqual([['clientGround.obstacle', 1], ['clientWater.obstacle', 1_601],
      ['authority.ground.obstacle', 3_201], ['authority.suppressedObstacleKey', 4_803]]);
    // Every distinct box once: the sub-cell boxes plus the fixture base box (its suppressed key and
    // authored box repeat boxes already in the table).
    expect(table.boxes).toHaveLength(4 * 1_601);
    expect(table.lists.every(list => list.anchors === undefined)).toBe(true);
    expect(bytes2.length).toBeLessThan(bytes1.length / 4);
    expect(encodeWorldChunk(v2)).toEqual(bytes2); // deterministic
  });
  it('is rejected, never mis-read, by the deployed version-1 decoder; version 1 still decodes everywhere', () => {
    const v1 = denseChunk(64);
    expect(() => deployedDecodeWorldChunk(encodeWorldChunk({ ...v1, authoritySchema: 2 }))).toThrow(new TypeError('Unsupported authority schema'));
    expect(deployedDecodeWorldChunk(encodeWorldChunk(v1))).toEqual(decodeWorldChunk(encodeWorldChunk(v1)));
    expect(() => encodeWorldChunk({ ...v1, authoritySchema: 3 as 2 })).toThrow(/authority/u);
  });
  it('keeps a kind as JSON records when it is not a contiguous run of plain table values, and anchors odd records explicitly', () => {
    const v1 = denseChunk(8);
    const records = [...v1.records];
    // clientWater.obstacle split by another kind; clientGround.obstacle given an extra key.
    records.splice(12, 0, { kind: 'decoration', ordinal: 0, tileX: 128, tileY: 384, value: { id: 1 } });
    records[1] = { ...records[1]!, value: { ...(records[1]!.value as Record<string, ChunkJson>), elevation: 2 } };
    // An authority obstacle anchored away from its top-left tile, and one hanging off the chunk's top-left.
    const authority = records.findIndex(record => record.kind === 'authority.ground.obstacle' && (record.value as Record<string, ChunkJson>)['group'] === 'authored');
    records[authority] = { ...records[authority]!, tileX: 130, tileY: 390 };
    const overhang = records.findIndex(record => record.kind === 'authority.suppressedObstacleKey');
    records[overhang] = { ...records[overhang]!, value: { medium: 'water', left: 128 * 256 - 100, top: 384 * 256 - 5, right: 128 * 256 + 10, bottom: 384 * 256 + 3 } };
    const input = { ...v1, authoritySchema: 2 as const, records };
    const bytes = encodeWorldChunk(input);
    expect(decodeWorldChunk(bytes)).toEqual({ ...input, contentHash: expect.any(String) });
    const table = header(bytes)['obstacleTable'] as Table;
    expect(table.lists.map(({ kind }) => kind)).toEqual(['authority.ground.obstacle', 'authority.suppressedObstacleKey']);
    expect(table.lists[0]!.anchors).toEqual([1, 130, 390]);
    expect(table.lists[1]!.anchors).toEqual([0, 128, 384]);
    // Nothing to compact: a version-2 chunk without a table.
    const bare = { ...input, records: records.filter(record => !['authority.ground.obstacle', 'authority.suppressedObstacleKey'].includes(record.kind)) };
    expect(header(encodeWorldChunk(bare))['obstacleTable']).toBeUndefined();
    expect(decodeWorldChunk(encodeWorldChunk(bare))).toEqual({ ...bare, contentHash: expect.any(String) });
  });
  it('decodes a later, unknown authority version without using its authority data; the table itself stays mandatory', () => {
    const v2 = encodeWorldChunk({ ...denseChunk(16), authoritySchema: 2 });
    // A later version: authority data unvalidated (here even invalid), records and channels intact.
    const later = withHeader(v2, value => {
      value['authoritySchema'] = 3;
      (value['records'] as WorldChunkRecord[]).push({ kind: 'authority.resource', ordinal: 9, tileX: 128, tileY: 384, value: { id: -1 } });
    });
    const decoded = decodeWorldChunk(later);
    expect(decoded.authoritySchema).toBe(3);
    expect(worldChunkHasAuthority(decoded)).toBe(false);
    expect(decoded.records.filter(record => record.kind === 'clientGround.obstacle')).toEqual(decodeWorldChunk(v2).records.filter(record => record.kind === 'clientGround.obstacle'));
    // Known versions are still fully validated, and the encoder writes known versions only.
    expect(() => decodeWorldChunk(withHeader(later, value => { value['authoritySchema'] = 2; }))).toThrow(/authority record/u);
    expect(() => encodeWorldChunk({ ...decoded, authoritySchema: 3 })).toThrow(/Unsupported authority schema/u);
    // Unlike the authority version, an unknown table version is never skipped: it replaces records.
    expect(() => decodeWorldChunk(withHeader(later, value => { (value['obstacleTable'] as Record<string, unknown>)['schema'] = 2; }))).toThrow(/Unsupported obstacle table/u);
  });
  it('bounds record amplification: the declared rows and boxes are capped before any record is built', () => {
    const bytes = encodeWorldChunk({ ...denseChunk(4), authoritySchema: 2 });
    const table = header(bytes)['obstacleTable'] as Table;
    const others = table.lists.slice(1).reduce((sum, list) => sum + list.rows.length / (list.kind.startsWith('authority.ground') ? 5 : list.kind.includes('suppressed') ? 3 : 2), 0);
    // Minimal rows: every row repeats the first record (ordinal delta 0, box delta 0).
    const rows = (count: number) => (value: Record<string, unknown>) => {
      const lists = (value['obstacleTable'] as Table).lists, added = count - lists[0]!.rows.length / 2;
      lists[0]!.rows = [...lists[0]!.rows.slice(0, 2), ...new Array<number>(2 * (count - 1)).fill(0)];
      for (const list of lists.slice(1)) list.at += added; // later blocks start after the longer one
    };
    expect(decodeWorldChunk(withHeader(bytes, rows(WORLD_CHUNK_OBSTACLE_TABLE_MAX_ROWS - others))).records).toHaveLength(WORLD_CHUNK_OBSTACLE_TABLE_MAX_ROWS + 5);
    expect(() => decodeWorldChunk(withHeader(bytes, rows(WORLD_CHUNK_OBSTACLE_TABLE_MAX_ROWS - others + 1)))).toThrow(/too large/u);
    expect(() => decodeWorldChunk(withHeader(bytes, rows(250_000)))).toThrow(/too large/u);
    expect(() => decodeWorldChunk(withHeader(bytes, value => {
      const table = value['obstacleTable'] as Table;
      table.boxes = table.boxes.concat(new Array<number>(4 * WORLD_CHUNK_OBSTACLE_TABLE_MAX_ROWS).fill(0));
    }))).toThrow(/too large/u);
    // The encoder never writes past the cap: a kind that would exceed it stays JSON records.
    const count = 40_000, x = 128 * 256, y = 384 * 256;
    const box = { left: x, top: y, right: x + 63, bottom: y + 63 };
    const many = (kind: string) => Array.from({ length: count }, (_, ordinal) => ({ kind, ordinal, tileX: 128, tileY: 384, value: box }));
    const input = { ...denseChunk(0), authoritySchema: 2 as const, records: [...many('clientGround.obstacle'), ...many('clientWater.obstacle')] };
    const encoded = encodeWorldChunk(input);
    expect((header(encoded)['obstacleTable'] as Table).lists.map(({ kind }) => kind)).toEqual(['clientGround.obstacle']);
    expect(decodeWorldChunk(encoded)).toEqual({ ...input, contentHash: expect.any(String) });
  });
  it('keeps a kind as JSON records when its coordinates or ordinals are too large to delta-code safely', () => {
    const big = Number.MAX_SAFE_INTEGER;
    const v1 = denseChunk(4);
    const records = v1.records.map(record => record.kind === 'clientGround.obstacle' && record.ordinal === 40
      ? { ...record, value: { left: -big, top: -big, right: big, bottom: big } }
      : record.kind === 'authority.ground.obstacle' && record.ordinal === 3 ? { ...record, value: { ...(record.value as Record<string, ChunkJson>), ordinal: big } } : record);
    const input = { ...v1, authoritySchema: 2 as const, records };
    const bytes = encodeWorldChunk(input);
    expect((header(bytes)['obstacleTable'] as Table).lists.map(({ kind }) => kind)).toEqual(['clientWater.obstacle', 'authority.suppressedObstacleKey']);
    expect(decodeWorldChunk(bytes)).toEqual({ ...input, contentHash: expect.any(String) });
  });
  it('fails closed on a malformed table', () => {
    const bytes = encodeWorldChunk({ ...denseChunk(4), authoritySchema: 2 });
    expect(decodeWorldChunk(withHeader(bytes, () => undefined)).records).toEqual(decodeWorldChunk(bytes).records);
    const table = (value: Record<string, unknown>) => value['obstacleTable'] as Table;
    const cases: [string, (value: Record<string, unknown>) => void, RegExp][] = [
      ['schema 1 with a table', value => { value['authoritySchema'] = 1; }, /schema 2 required/u],
      ['unknown table version', value => { (value['obstacleTable'] as Record<string, unknown>)['schema'] = 2; }, /Unsupported obstacle table/u],
      ['table without its version', value => { delete (value['obstacleTable'] as Record<string, unknown>)['schema']; }, /Unsupported obstacle table/u],
      ['table without an authority version', value => { delete value['authoritySchema']; }, /schema 2 required/u],
      ['non-integer authority version', value => { value['authoritySchema'] = 2.5; }, /Unsupported authority schema/u],
      ['authority version 0', value => { value['authoritySchema'] = 0; }, /Unsupported authority schema/u],
      ['box index out of range', value => { table(value).lists[0]!.rows[1] = 99; }, /row/u],
      ['negative box width', value => { table(value).boxes[2] = -1; }, /box/u],
      ['fractional box', value => { table(value).boxes[0] = 0.5; }, /table/u],
      ['bad group', value => { table(value).lists[2]!.rows[2] = 2; }, /row/u],
      ['bad medium', value => { table(value).lists[3]!.rows[2] = 5; }, /row/u],
      ['source out of range', value => { table(value).lists[2]!.rows[4] = 50; }, /row/u],
      ['empty source id', value => { table(value).sources![0] = ''; }, /table/u],
      ['unknown kind', value => { table(value).lists[0]!.kind = 'decoration'; }, /list/u],
      ['kind also a JSON record', value => { table(value).lists[0]!.kind = 'objects'; }, /list/u],
      ['duplicate kind', value => { table(value).lists[1]!.kind = 'clientGround.obstacle'; }, /list/u],
      ['blocks out of order', value => { table(value).lists[1]!.at = 0; }, /list/u],
      ['block past the records', value => { table(value).lists[3]!.at = 10_000; }, /list/u],
      ['ragged rows', value => { table(value).lists[0]!.rows.push(1); }, /list/u],
      ['empty list', value => { table(value).lists[0]!.rows = []; }, /list/u],
      ['anchor outside the chunk', value => { table(value).lists[0]!.anchors = [0, 0, 0]; }, /anchor/u],
      ['unused anchor', value => { table(value).lists[0]!.anchors = [9, 128, 384]; }, /anchor/u],
      ['negative ordinal', value => { table(value).lists[0]!.rows[0] = -1; }, /anchor/u],
      ['authority ordinal below zero', value => { table(value).lists[2]!.rows[3] = 50; }, /authority record/u],
    ];
    for (const [name, edit, error] of cases) expect(() => decodeWorldChunk(withHeader(bytes, edit)), name).toThrow(error);
  });
});

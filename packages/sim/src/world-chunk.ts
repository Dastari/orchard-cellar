import { sha256 } from '@noble/hashes/sha2.js';
import { RULE_MEDIA, type RuleMedium } from './rule-catalogue.js';

/** Offline/materialized world format. No generator or engine dependency. */
export const WORLD_CHUNK_SCHEMA = 1 as const;
/** Independent extension version: never reinterpret existing numeric medium IDs. */
export const WORLD_CHUNK_MEDIUM_SCHEMA = 1 as const;
export const WORLD_CHUNK_MEDIA = RULE_MEDIA;
export type WorldChunkMedium = RuleMedium;
export const WORLD_CHUNK_VOID = 5 as const;
export const WORLD_CHUNK_SIZE = 64 as const;
export const WORLD_CHUNK_HALO = 1 as const;
export const WORLD_CHUNK_STRIDE = WORLD_CHUNK_SIZE + 2 * WORLD_CHUNK_HALO;
export type ChunkJson = null | boolean | number | string | readonly ChunkJson[] | { readonly [key: string]: ChunkJson };
export type ChunkArray = Uint8Array | Int16Array;
export interface WorldChunkRecord {
  readonly kind: string;
  /** Original stream position, retained across arbitrary chunk fetch order. */
  readonly ordinal: number;
  readonly tileX: number;
  readonly tileY: number;
  readonly value: ChunkJson;
}
export interface WorldChunk {
  readonly schema: typeof WORLD_CHUNK_SCHEMA;
  readonly mediumSchema?: typeof WORLD_CHUNK_MEDIUM_SCHEMA;
  readonly spaceId: number;
  readonly cx: number;
  readonly cy: number;
  readonly assetRevision: string;
  readonly contentHash: string;
  /** All channels include a 1-cell halo, plane-major then row-major. */
  readonly arrays: Readonly<Record<string, ChunkArray>>;
  readonly records: readonly WorldChunkRecord[];
  readonly assetIds: readonly string[];
  readonly atlasPackIds: readonly string[];
  /** Optional sparse local cell part stacks; independent of the authoring PR. */
  readonly cellParts?: Readonly<Record<string, ChunkJson>>;
}
export interface WorldChunkHead {
  readonly cx: number;
  readonly cy: number;
  readonly contentHash: string;
  readonly byteLength: number;
}
export interface WorldChunkManifest {
  readonly schema: typeof WORLD_CHUNK_SCHEMA;
  readonly chunkSize: typeof WORLD_CHUNK_SIZE;
  readonly spaceId: number;
  readonly width: number;
  readonly height: number;
  readonly assetRevision: string;
  readonly sourceRevision: number;
  readonly sourceHash: string;
  /** Scalar terrain/collision metadata and small shared dictionaries only. */
  readonly metadata: Readonly<Record<string, ChunkJson>>;
  readonly chunks: readonly WorldChunkHead[];
}
const MAGIC = new Uint8Array([79, 67, 67, 72, 78, 75, 1, 0]);
const PREFIX_SIZE = 44;
const MAX_BYTES = 32 * 1024 * 1024;
const CELL_COUNT = WORLD_CHUNK_STRIDE ** 2;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });
export function worldChunkHash(bytes: Uint8Array): string {
  return Array.from(sha256(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
/** Canonical keys; authored list order is deliberately preserved. */
export function canonicalChunkJson(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
    }
    return item;
  });
}
function validInteger(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value); }
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function strings(value: unknown): value is string[] { return Array.isArray(value) && value.every(item => typeof item === 'string'); }
function checkHeader(value: unknown): asserts value is Omit<WorldChunk, 'arrays' | 'contentHash'> {
  if (!object(value) || value['schema'] !== WORLD_CHUNK_SCHEMA
    || !validInteger(value['spaceId']) || !validInteger(value['cx']) || !validInteger(value['cy'])
    || typeof value['assetRevision'] !== 'string' || !strings(value['assetIds']) || !strings(value['atlasPackIds'])
    || !Array.isArray(value['records'])) throw new TypeError('Invalid world chunk header');
  if (value['mediumSchema'] !== undefined && value['mediumSchema'] !== WORLD_CHUNK_MEDIUM_SCHEMA) throw new TypeError('Unsupported medium schema');
  for (const record of value['records']) {
    if (!object(record) || typeof record['kind'] !== 'string' || !validInteger(record['ordinal']) || record['ordinal'] < 0
      || !validInteger(record['tileX']) || !validInteger(record['tileY']) || !('value' in record)
      || Math.floor(record['tileX'] / WORLD_CHUNK_SIZE) !== value['cx']
      || Math.floor(record['tileY'] / WORLD_CHUNK_SIZE) !== value['cy']) throw new TypeError('Invalid chunk record anchor');
  }
  if (value['cellParts'] !== undefined) {
    if (!object(value['cellParts'])) throw new TypeError('Invalid cell parts');
    for (const [key, parts] of Object.entries(value['cellParts'])) {
      if (!/^\d+$/u.test(key) || Number(key) >= WORLD_CHUNK_SIZE ** 2 || !Array.isArray(parts)) throw new TypeError('Invalid local cell parts');
    }
  }
}
function checkMedium(schema: unknown, arrays: Readonly<Record<string, ChunkArray>>): void {
  const medium = arrays['medium'], solid = arrays['solidBlocked'];
  if (schema === undefined && medium === undefined && solid === undefined) return;
  if (schema !== WORLD_CHUNK_MEDIUM_SCHEMA || !(medium instanceof Uint8Array) || !(solid instanceof Uint8Array)
    || medium.length !== CELL_COUNT || solid.length !== CELL_COUNT
    || medium.some(value => value >= WORLD_CHUNK_MEDIA.length) || solid.some(value => value > 1)) throw new TypeError('Invalid medium channels');
}
/** Hash covers coordinates, schema, metadata and every channel byte. LE is explicit. */
export function encodeWorldChunk(chunk: Omit<WorldChunk, 'contentHash'>): Uint8Array {
  checkHeader(chunk);
  checkMedium(chunk.mediumSchema, chunk.arrays);
  const channels = Object.entries(chunk.arrays).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  const descriptors = channels.map(([name, array]) => {
    if (!/^[a-zA-Z][a-zA-Z0-9.]*$/u.test(name) || !(array instanceof Uint8Array || array instanceof Int16Array) || array.length === 0
      || array.length % CELL_COUNT !== 0 || array.length / CELL_COUNT > 256) throw new TypeError(`Invalid channel ${name}`);
    return { name, type: array instanceof Int16Array ? 'i16' : 'u8', length: array.length };
  });
  const header = { schema: chunk.schema, ...(chunk.mediumSchema === undefined ? {} : { mediumSchema: chunk.mediumSchema }), spaceId: chunk.spaceId, cx: chunk.cx, cy: chunk.cy, assetRevision: chunk.assetRevision,
    records: chunk.records, assetIds: chunk.assetIds, atlasPackIds: chunk.atlasPackIds, ...(chunk.cellParts === undefined ? {} : { cellParts: chunk.cellParts }) };
  const json = encoder.encode(canonicalChunkJson({ ...header, channels: descriptors }));
  const length = PREFIX_SIZE + json.length + channels.reduce((sum, [, array]) => sum + array.byteLength, 0);
  if (length > MAX_BYTES) throw new RangeError('World chunk exceeds size limit');
  const bytes = new Uint8Array(length);
  bytes.set(MAGIC);
  const view = new DataView(bytes.buffer);
  view.setUint32(40, json.length, true);
  bytes.set(json, PREFIX_SIZE);
  let offset = PREFIX_SIZE + json.length;
  for (const [, array] of channels) {
    if (array instanceof Uint8Array) { bytes.set(array, offset); offset += array.length; }
    else for (const value of array) { view.setInt16(offset, value, true); offset += 2; }
  }
  bytes.set(sha256(bytes.subarray(40)), 8);
  return bytes;
}
export function decodeWorldChunk(bytes: Uint8Array, expectedHash?: string): WorldChunk {
  if (bytes.length < PREFIX_SIZE || bytes.length > MAX_BYTES || MAGIC.some((value, index) => bytes[index] !== value)) throw new TypeError('Invalid world chunk envelope');
  const digest = sha256(bytes.subarray(40));
  const contentHash = worldChunkHash(bytes.subarray(40));
  if (digest.some((value, index) => bytes[index + 8] !== value) || (expectedHash !== undefined && contentHash !== expectedHash)) throw new TypeError('World chunk hash mismatch');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(40, true);
  if (jsonLength > bytes.length - PREFIX_SIZE) throw new TypeError('Truncated chunk metadata');
  const raw: unknown = JSON.parse(decoder.decode(bytes.subarray(PREFIX_SIZE, PREFIX_SIZE + jsonLength)));
  checkHeader(raw);
  const channels: unknown = (raw as unknown as Record<string, unknown>)['channels'];
  if (!Array.isArray(channels)) throw new TypeError('Invalid channel directory');
  const arrays: Record<string, ChunkArray> = Object.create(null) as Record<string, ChunkArray>;
  let offset = PREFIX_SIZE + jsonLength;
  for (const entry of channels) {
    if (!object(entry) || typeof entry['name'] !== 'string' || !/^[a-zA-Z][a-zA-Z0-9.]*$/u.test(entry['name'])
      || Object.prototype.hasOwnProperty.call(arrays, entry['name']) || !validInteger(entry['length']) || entry['length'] <= 0
      || entry['length'] % CELL_COUNT !== 0 || entry['length'] / CELL_COUNT > 256
      || (entry['type'] !== 'u8' && entry['type'] !== 'i16')) throw new TypeError('Invalid channel descriptor');
    const length = entry['length'];
    const size = entry['type'] === 'i16' ? 2 : 1;
    if (offset + length * size > bytes.length) throw new TypeError('Truncated chunk channel');
    const array = size === 1 ? Uint8Array.from(bytes.subarray(offset, offset + length)) : new Int16Array(length);
    if (size === 2) for (let index = 0; index < length; index++) array[index] = view.getInt16(offset + index * 2, true);
    arrays[entry['name']] = array;
    offset += length * size;
  }
  checkMedium(raw.mediumSchema, arrays);
  if (offset !== bytes.length) throw new TypeError('Trailing chunk bytes');
  const header = { ...raw } as unknown as Record<string, unknown>;
  delete header['channels'];
  return { ...header, arrays, contentHash } as unknown as WorldChunk;
}
/** Copies source channels into a full halo; outside the finite map uses the supplied sentinel. */
export function sliceWorldChunkChannel(source: ChunkArray, width: number, height: number, cx: number, cy: number, outside = 0): ChunkArray {
  if (![width, height, cx, cy].every(Number.isSafeInteger) || width <= 0 || height <= 0) throw new TypeError('Invalid source channel coordinates');
  const planes = source.length / (width * height);
  if (!Number.isInteger(planes) || planes < 1) throw new TypeError('Invalid source channel dimensions');
  const result = source instanceof Int16Array ? new Int16Array(CELL_COUNT * planes) : new Uint8Array(CELL_COUNT * planes);
  result.fill(outside);
  for (let plane = 0; plane < planes; plane++) for (let y = 0; y < WORLD_CHUNK_STRIDE; y++) for (let x = 0; x < WORLD_CHUNK_STRIDE; x++) {
    const worldX = cx * WORLD_CHUNK_SIZE + x - 1;
    const worldY = cy * WORLD_CHUNK_SIZE + y - 1;
    if (worldX >= 0 && worldX < width && worldY >= 0 && worldY < height) result[plane * CELL_COUNT + y * WORLD_CHUNK_STRIDE + x] = source[plane * width * height + worldY * width + worldX]!;
  }
  return result;
}

import { sha256 } from '@noble/hashes/sha2.js';
import { RULE_MEDIA, type RuleMedium } from './rule-catalogue.js';

/** Offline/materialized world format. No generator or engine dependency. */
export const WORLD_CHUNK_SCHEMA = 1 as const;
/** Independent extension version: never reinterpret existing numeric medium IDs. */
export const WORLD_CHUNK_MEDIUM_SCHEMA = 1 as const;
/** Additive authority extension (static-world S1a). Deployed schema-1 decoders
 * ignore the unknown header key, `authority.*` channels and record kinds. Within
 * schema 1 the extension is itself additive: the known channels and record kinds
 * below are required/validated, later `authority.*` additions pass through. */
export const WORLD_CHUNK_AUTHORITY_SCHEMA = 1 as const;
/** Server-authoritative static channels. `authority.combatRegion` is 0 for no
 * region, otherwise 1 + index into manifest `metadata.authority.combatRegions`.
 * There is deliberately no water horse-jump channel: it is all false (SW-D1). */
export const WORLD_CHUNK_AUTHORITY_CHANNELS = Object.freeze({
  'authority.ground.blocked': 'u8',
  'authority.ground.elevations': 'i16',
  'authority.ground.terrainPlaneBlocked': 'u8',
  'authority.ground.horseJumpableTerrain': 'u8',
  'authority.water.blocked': 'u8',
  'authority.combatRegion': 'u8',
} as const);
export type WorldChunkAuthorityChannel = keyof typeof WORLD_CHUNK_AUTHORITY_CHANNELS;
export const WORLD_CHUNK_AUTHORITY_RECORD_KINDS = Object.freeze([
  'authority.ground.obstacle', 'authority.water.obstacle', 'authority.ground.transition',
  'authority.walkable', 'authority.suppressedObstacleKey', 'authority.resource', 'authority.resourcePlacement',
] as const);
export type WorldChunkAuthorityRecordKind = typeof WORLD_CHUNK_AUTHORITY_RECORD_KINDS[number];
/** Combat regions are capped at 64 by the map parser; the u8 channel stores 1 + index. */
export const WORLD_CHUNK_AUTHORITY_MAX_COMBAT_REGIONS = 64;
/** Fixed-point box, anchored at the chunk owning its top-left tile. `ordinal`
 * is the position within its group; the server composes (base filtered by the
 * suppressed keys, live rows included) followed by authored, both in order. */
export interface WorldChunkAuthorityObstacle {
  readonly group: 'base' | 'authored';
  readonly ordinal: number;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly sourceId: string;
}
/** A static decoration box the server removes from every base obstacle list. */
export interface WorldChunkAuthoritySuppressedObstacle {
  readonly medium: 'ground' | 'water';
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}
export interface WorldChunkAuthorityTile { readonly tileX: number; readonly tileY: number }
/** Generated resource, anchored at the chunk of its EFFECTIVE tile (after any
 * map placement); ids and ordinals follow generateSurvivalResources. The optional
 * generator fields are present exactly when the generator set them, so the server's
 * `?? default` fallbacks in generatedWorldResourceRow resolve identically. */
export interface WorldChunkAuthorityResource {
  readonly id: number;
  readonly kind: string;
  readonly generatedTile: WorldChunkAuthorityTile;
  readonly effectiveTile: WorldChunkAuthorityTile;
  readonly suppressed: boolean;
  readonly nodeClass?: string;
  readonly richness?: number;
  readonly spawnSiteId?: number;
  readonly activationOrdinal?: number;
}
/** A map resource placement whose id is NOT generated. Reconcile keeps (never
 * deletes) an existing row with such an id, so the full set must be known. */
export interface WorldChunkAuthorityResourcePlacement {
  /** Decimal u64, exactly as authored in the map document. */
  readonly id: string;
  readonly originTile: WorldChunkAuthorityTile;
  readonly tile: WorldChunkAuthorityTile;
}
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
  readonly authoritySchema?: typeof WORLD_CHUNK_AUTHORITY_SCHEMA;
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
  if (value['authoritySchema'] !== undefined && value['authoritySchema'] !== WORLD_CHUNK_AUTHORITY_SCHEMA) throw new TypeError('Unsupported authority schema');
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
function tile(value: unknown): boolean {
  return object(value) && validInteger(value['tileX']) && validInteger(value['tileY']);
}
function anchoredAt(value: unknown, record: WorldChunkRecord): boolean {
  return tile(value) && (value as Record<string, unknown>)['tileX'] === record.tileX && (value as Record<string, unknown>)['tileY'] === record.tileY;
}
function box(value: Record<string, unknown>): boolean {
  return validInteger(value['left']) && validInteger(value['top']) && validInteger(value['right']) && validInteger(value['bottom'])
    && value['left'] <= value['right'] && value['top'] <= value['bottom'];
}
function authorityRecordValid(record: WorldChunkRecord): boolean {
  const value = record.value;
  if (!object(value)) return false;
  switch (record.kind as WorldChunkAuthorityRecordKind) {
    case 'authority.ground.obstacle': case 'authority.water.obstacle':
      return (value['group'] === 'base' || value['group'] === 'authored') && validInteger(value['ordinal']) && value['ordinal'] >= 0
        && box(value) && typeof value['sourceId'] === 'string' && value['sourceId'].length > 0;
    case 'authority.suppressedObstacleKey':
      return (value['medium'] === 'ground' || value['medium'] === 'water') && box(value);
    case 'authority.walkable':
      return value['tileX'] === record.tileX && value['tileY'] === record.tileY;
    case 'authority.resource':
      return validInteger(value['id']) && value['id'] > 0 && typeof value['kind'] === 'string' && value['kind'].length > 0
        && tile(value['generatedTile']) && anchoredAt(value['effectiveTile'], record) && typeof value['suppressed'] === 'boolean'
        && (value['nodeClass'] === undefined || (typeof value['nodeClass'] === 'string' && value['nodeClass'].length > 0))
        && ['richness', 'spawnSiteId', 'activationOrdinal'].every(key => value[key] === undefined || (validInteger(value[key]) && value[key] >= 0));
    case 'authority.resourcePlacement':
      return typeof value['id'] === 'string' && /^[1-9][0-9]{0,19}$/u.test(value['id']) && tile(value['originTile']) && anchoredAt(value['tile'], record);
    case 'authority.ground.transition':
      return validInteger(value['lowerTileX']) && validInteger(value['lowerTileY']);
    default:
      return true; // later additive authority record kinds
  }
}
/** Fails closed: the known authority data is complete and valid for schema 1, or
 * absent without it. Unknown `authority.*` channels/records are tolerated (additive). */
function checkAuthority(schema: unknown, arrays: Readonly<Record<string, ChunkArray>>, records: readonly WorldChunkRecord[]): void {
  const channelNames = Object.keys(arrays).filter(name => name.startsWith('authority.'));
  const recordKinds = records.filter(record => record.kind.startsWith('authority.'));
  if (schema === undefined && channelNames.length === 0 && recordKinds.length === 0) return;
  if (schema !== WORLD_CHUNK_AUTHORITY_SCHEMA) throw new TypeError('Invalid authority channels: schema required');
  for (const [name, type] of Object.entries(WORLD_CHUNK_AUTHORITY_CHANNELS)) {
    const array = arrays[name];
    const planar = name === 'authority.ground.terrainPlaneBlocked';
    if (array === undefined || (type === 'i16') !== (array instanceof Int16Array)
      || (planar ? array.length % CELL_COUNT !== 0 : array.length !== CELL_COUNT)) throw new TypeError(`Invalid authority channel ${name}`);
    const limit = name === 'authority.combatRegion' ? WORLD_CHUNK_AUTHORITY_MAX_COMBAT_REGIONS : type === 'u8' ? 1 : Infinity;
    if (array.some(value => value > limit)) throw new TypeError(`Invalid authority channel ${name}`);
  }
  for (const record of recordKinds) {
    if (!authorityRecordValid(record)) throw new TypeError(`Invalid authority record ${record.kind}`);
  }
}
/** Hash covers coordinates, schema, metadata and every channel byte. LE is explicit. */
export function encodeWorldChunk(chunk: Omit<WorldChunk, 'contentHash'>): Uint8Array {
  checkHeader(chunk);
  checkMedium(chunk.mediumSchema, chunk.arrays);
  checkAuthority(chunk.authoritySchema, chunk.arrays, chunk.records);
  const channels = Object.entries(chunk.arrays).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  const descriptors = channels.map(([name, array]) => {
    if (!/^[a-zA-Z][a-zA-Z0-9.]*$/u.test(name) || !(array instanceof Uint8Array || array instanceof Int16Array) || array.length === 0
      || array.length % CELL_COUNT !== 0 || array.length / CELL_COUNT > 256) throw new TypeError(`Invalid channel ${name}`);
    return { name, type: array instanceof Int16Array ? 'i16' : 'u8', length: array.length };
  });
  const header = { schema: chunk.schema, ...(chunk.mediumSchema === undefined ? {} : { mediumSchema: chunk.mediumSchema }),
    ...(chunk.authoritySchema === undefined ? {} : { authoritySchema: chunk.authoritySchema }), spaceId: chunk.spaceId, cx: chunk.cx, cy: chunk.cy, assetRevision: chunk.assetRevision,
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
  checkAuthority(raw.authoritySchema, arrays, raw.records);
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

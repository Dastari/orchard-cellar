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
/** Authority extension version 2 (BUG-044): the same channels and records as 1,
 * but the obstacle record kinds (WORLD_CHUNK_OBSTACLE_TABLE_KINDS) may be stored
 * once, compactly, in the header's `obstacleTable` instead of as JSON records.
 * The decoder expands the table back into the identical records, so a decoded
 * version-2 chunk equals the version-1 chunk except for `authoritySchema`.
 * The deployed decoders (Game 0.46.0 and earlier with the extension) accept only
 * version 1 and reject version 2 ('Unsupported authority schema'), so they never
 * read a version-2 blob without its obstacles. The manifest's
 * `metadata.authority.schema` is unchanged (still WORLD_CHUNK_AUTHORITY_SCHEMA).
 *
 * From this version on, decoding tolerates an unknown (future) authority version:
 * the chunk decodes with its `authoritySchema` kept and its authority data
 * unvalidated, and worldChunkHasAuthority is false, so only the consumers that read
 * authority data refuse it (`authority_missing`) and fall back. Anything that
 * REPLACES records every consumer reads (the obstacle table) is versioned on its
 * own and fails closed instead. */
export const WORLD_CHUNK_AUTHORITY_SCHEMA_V2 = 2 as const;
export type WorldChunkAuthoritySchema = typeof WORLD_CHUNK_AUTHORITY_SCHEMA | typeof WORLD_CHUNK_AUTHORITY_SCHEMA_V2;
/** Every authority extension version this codec reads and writes. */
export const WORLD_CHUNK_AUTHORITY_SCHEMAS: readonly WorldChunkAuthoritySchema[] = Object.freeze([WORLD_CHUNK_AUTHORITY_SCHEMA, WORLD_CHUNK_AUTHORITY_SCHEMA_V2]);
function knownAuthoritySchema(value: unknown): value is WorldChunkAuthoritySchema {
  return (WORLD_CHUNK_AUTHORITY_SCHEMAS as readonly unknown[]).includes(value);
}
/** True when the decoded chunk carries a known, validated authority extension version.
 * Consumers of authority data use this, never a comparison with one version. */
export function worldChunkHasAuthority(chunk: { readonly authoritySchema?: unknown }): boolean {
  return knownAuthoritySchema(chunk.authoritySchema);
}
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
  /** A WorldChunkAuthoritySchema when encoded here; a decoded chunk may carry an unknown
   * later version (authority data unvalidated): check worldChunkHasAuthority. */
  readonly authoritySchema?: number;
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
function hexDigest(digest: Uint8Array): string {
  return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
}
export function worldChunkHash(bytes: Uint8Array): string {
  return hexDigest(sha256(bytes));
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
/** `decoding` tolerates an unknown later authority version; the encoder writes known versions only. */
function checkHeader(value: unknown, decoding = false): asserts value is Omit<WorldChunk, 'arrays' | 'contentHash'> {
  if (!object(value) || value['schema'] !== WORLD_CHUNK_SCHEMA
    || !validInteger(value['spaceId']) || !validInteger(value['cx']) || !validInteger(value['cy'])
    || typeof value['assetRevision'] !== 'string' || !strings(value['assetIds']) || !strings(value['atlasPackIds'])
    || !Array.isArray(value['records'])) throw new TypeError('Invalid world chunk header');
  if (value['mediumSchema'] !== undefined && value['mediumSchema'] !== WORLD_CHUNK_MEDIUM_SCHEMA) throw new TypeError('Unsupported medium schema');
  const authority = value['authoritySchema'];
  if (authority !== undefined && !knownAuthoritySchema(authority)
    && !(decoding && validInteger(authority) && authority > WORLD_CHUNK_AUTHORITY_SCHEMA_V2)) throw new TypeError('Unsupported authority schema');
  // The table must never reach a decoder that predates it: version-1-only decoders reject
  // any authority version but 1, so a table requires version 2 or later.
  if (value['obstacleTable'] !== undefined && (authority === undefined || authority === WORLD_CHUNK_AUTHORITY_SCHEMA)) throw new TypeError('Invalid obstacle table: authority schema 2 required');
  checkRecords(value['records'], value['cx'], value['cy']);
  if (value['cellParts'] !== undefined) {
    if (!object(value['cellParts'])) throw new TypeError('Invalid cell parts');
    for (const [key, parts] of Object.entries(value['cellParts'])) {
      if (!/^\d+$/u.test(key) || Number(key) >= WORLD_CHUNK_SIZE ** 2 || !Array.isArray(parts)) throw new TypeError('Invalid local cell parts');
    }
  }
}
function checkRecords(records: readonly unknown[], cx: number, cy: number): void {
  for (const record of records) {
    if (!object(record) || typeof record['kind'] !== 'string' || !validInteger(record['ordinal']) || record['ordinal'] < 0
      || !validInteger(record['tileX']) || !validInteger(record['tileY']) || !('value' in record)
      || Math.floor(record['tileX'] / WORLD_CHUNK_SIZE) !== cx
      || Math.floor(record['tileY'] / WORLD_CHUNK_SIZE) !== cy) throw new TypeError('Invalid chunk record anchor');
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
  if (schema === undefined) throw new TypeError('Invalid authority channels: schema required');
  if (!knownAuthoritySchema(schema)) return; // a later version (decoding only): its consumers check worldChunkHasAuthority
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
// ---------------------------------------------------------------------------
// Obstacle table (authority schema 2, BUG-044)
// ---------------------------------------------------------------------------

/** Value shape of each record kind the obstacle table can hold. `box` is a plain
 * fixed-point box; `authority` an ordered, sourced authority obstacle; `suppressed`
 * a suppressed decoration key. Any other kind always stays a JSON record. */
export const WORLD_CHUNK_OBSTACLE_TABLE_KINDS = Object.freeze({
  'authority.ground.obstacle': 'authority',
  'authority.water.obstacle': 'authority',
  'authority.suppressedObstacleKey': 'suppressed',
  'clientGround.obstacle': 'box',
  'clientWater.obstacle': 'box',
  'serverGround.obstacle': 'box',
  'serverWater.obstacle': 'box',
} as const);
type ObstacleShape = typeof WORLD_CHUNK_OBSTACLE_TABLE_KINDS[keyof typeof WORLD_CHUNK_OBSTACLE_TABLE_KINDS];
/** Fixed-point units per tile, used only to derive a table record's anchor
 * (floor(left / units), floor(top / units)); a record anchored anywhere else
 * carries an explicit anchor, so correctness never depends on this value. */
export const WORLD_CHUNK_OBSTACLE_TILE_UNITS = 256;
/** The table's own format version. The table replaces records, so a decoder that
 * cannot expand it must not decode the chunk at all: an unknown version is rejected
 * whatever the authority version. A changed table format bumps this, never the key. */
export const WORLD_CHUNK_OBSTACLE_TABLE_SCHEMA = 1 as const;
/**
 * The header's `obstacleTable` (`schema`: WORLD_CHUNK_OBSTACLE_TABLE_SCHEMA). Every integer column is a delta from the previous
 * row of the same list (the first row from 0), so runs of neighbouring sub-cell
 * boxes and consecutive ordinals cost a few bytes each.
 * - `boxes`: each distinct box once, 4 integers per box: left and top as deltas
 *   from the previous box, then right - left and bottom - top;
 * - `sources`: each distinct authority `sourceId` once;
 * - `lists`: one per compacted record kind, in record order. `at` is the index in
 *   the decoded `records` where its contiguous block starts. `rows` holds per record:
 *   `box` [ordinal, box]; `authority` [ordinal, box, group (0 base, 1 authored),
 *   ordinal - value.ordinal, source]; `suppressed` [ordinal, box, medium (0 ground,
 *   1 water)] (ordinal, box, the offset and source delta-coded). `anchors` lists
 *   [row, tileX, tileY] for the rows not anchored at the derived tile.
 */
export interface WorldChunkObstacleTable {
  readonly schema: typeof WORLD_CHUNK_OBSTACLE_TABLE_SCHEMA;
  readonly boxes: readonly number[];
  readonly sources?: readonly string[];
  readonly lists: readonly { readonly kind: string; readonly at: number; readonly rows: readonly number[]; readonly anchors?: readonly number[] }[];
}
const SHAPE_WIDTH: Readonly<Record<ObstacleShape, number>> = { box: 2, authority: 5, suppressed: 3 };
const SHAPE_KEYS: Readonly<Record<ObstacleShape, string>> = {
  box: 'bottom,left,right,top',
  authority: 'bottom,group,left,ordinal,right,sourceId,top',
  suppressed: 'bottom,left,medium,right,top',
};
function tableShape(kind: string): ObstacleShape | undefined {
  return Object.prototype.hasOwnProperty.call(WORLD_CHUNK_OBSTACLE_TABLE_KINDS, kind)
    ? WORLD_CHUNK_OBSTACLE_TABLE_KINDS[kind as keyof typeof WORLD_CHUNK_OBSTACLE_TABLE_KINDS] : undefined;
}
/** Exactly the value a table row reproduces: the shape's keys, integer boxes, known enums. */
function tableValue(shape: ObstacleShape, value: ChunkJson): value is Record<string, ChunkJson> {
  if (!object(value) || Object.keys(value).sort().join(',') !== SHAPE_KEYS[shape] || !box(value)) return false;
  if (shape === 'authority') return (value['group'] === 'base' || value['group'] === 'authored') && validInteger(value['ordinal']) && value['ordinal'] >= 0
    && typeof value['sourceId'] === 'string' && value['sourceId'].length > 0;
  if (shape === 'suppressed') return value['medium'] === 'ground' || value['medium'] === 'water';
  return true;
}
/** Splits the table kinds out of `records` (each kind only when every record of it is
 * a contiguous run of table-shaped values); the rest stay JSON records in order. */
function compactObstacles(records: readonly WorldChunkRecord[]): { records: WorldChunkRecord[]; obstacleTable: WorldChunkObstacleTable } | undefined {
  const runs = new Map<string, { start: number; end: number }>();
  const eligible = new Set<string>();
  records.forEach((record, index) => {
    const shape = tableShape(record.kind);
    if (shape === undefined) return;
    const run = runs.get(record.kind);
    if (run === undefined) { runs.set(record.kind, { start: index, end: index + 1 }); eligible.add(record.kind); }
    else if (run.end === index) run.end = index + 1;
    else eligible.delete(record.kind); // not contiguous: keep this kind as JSON records
    if (!tableValue(shape, record.value)) eligible.delete(record.kind);
  });
  if (eligible.size === 0) return undefined;
  const boxIndex = new Map<string, number>(), boxes: number[] = [];
  const sourceIndex = new Map<string, number>(), sources: string[] = [];
  let previousLeft = 0, previousTop = 0;
  const boxOf = (value: Record<string, ChunkJson>): number => {
    const left = value['left'] as number, top = value['top'] as number, right = value['right'] as number, bottom = value['bottom'] as number;
    const key = `${left}:${top}:${right}:${bottom}`;
    let index = boxIndex.get(key);
    if (index === undefined) {
      index = boxIndex.size;
      boxIndex.set(key, index);
      boxes.push(left - previousLeft, top - previousTop, right - left, bottom - top);
      previousLeft = left; previousTop = top;
    }
    return index;
  };
  const kept: WorldChunkRecord[] = [];
  const lists: { kind: string; at: number; rows: number[]; anchors?: number[] }[] = [];
  for (let index = 0; index < records.length;) {
    const record = records[index]!;
    if (!eligible.has(record.kind)) { kept.push(record); index += 1; continue; }
    const { end } = runs.get(record.kind)!, shape = tableShape(record.kind)!;
    const rows: number[] = [], anchors: number[] = [];
    let ordinal = 0, boxAt = 0, offset = 0, source = 0;
    for (let row = 0; index + row < end; row++) {
      const item = records[index + row]!, value = item.value as Record<string, ChunkJson>;
      const at = boxOf(value);
      rows.push(item.ordinal - ordinal, at - boxAt);
      ordinal = item.ordinal; boxAt = at;
      if (shape === 'authority') {
        const id = value['sourceId'] as string;
        let sourceAt = sourceIndex.get(id);
        if (sourceAt === undefined) { sourceAt = sources.length; sourceIndex.set(id, sourceAt); sources.push(id); }
        const nextOffset = item.ordinal - (value['ordinal'] as number);
        rows.push(value['group'] === 'base' ? 0 : 1, nextOffset - offset, sourceAt - source);
        offset = nextOffset; source = sourceAt;
      } else if (shape === 'suppressed') rows.push(value['medium'] === 'ground' ? 0 : 1);
      if (item.tileX !== Math.floor((value['left'] as number) / WORLD_CHUNK_OBSTACLE_TILE_UNITS)
        || item.tileY !== Math.floor((value['top'] as number) / WORLD_CHUNK_OBSTACLE_TILE_UNITS)) anchors.push(row, item.tileX, item.tileY);
    }
    lists.push({ kind: record.kind, at: index, rows, ...(anchors.length === 0 ? {} : { anchors }) });
    index = end;
  }
  return { records: kept, obstacleTable: { schema: WORLD_CHUNK_OBSTACLE_TABLE_SCHEMA, boxes, ...(sources.length === 0 ? {} : { sources }), lists } };
}
function tableIntegers(value: unknown, width: number): value is number[] {
  return Array.isArray(value) && value.length % width === 0 && value.every(validInteger);
}
/** Rebuilds the records a table replaced, in place, exactly as JSON.parse would
 * return them (sorted keys). Fails closed on any malformed or out-of-range entry.
 * Every rebuilt record passes checkRecords and authorityRecordValid by construction
 * (integer boxes with right >= left, known enums, non-empty sources) plus the anchor
 * and ordinal checks made here, so the decoder does not re-validate them (BUG-044
 * decode budget: 4 ms per chunk). */
function expandObstacles(records: readonly WorldChunkRecord[], table: unknown, cx: number, cy: number): WorldChunkRecord[] {
  if (object(table) && table['schema'] !== WORLD_CHUNK_OBSTACLE_TABLE_SCHEMA) throw new TypeError('Unsupported obstacle table');
  if (!object(table) || !tableIntegers(table['boxes'], 4) || !Array.isArray(table['lists']) || table['lists'].length === 0
    || (table['sources'] !== undefined && (!strings(table['sources']) || table['sources'].some(id => id.length === 0)))) throw new TypeError('Invalid obstacle table');
  const rawBoxes = table['boxes'], sources: readonly string[] = (table['sources'] as string[] | undefined) ?? [];
  const boxes: { left: number; top: number; right: number; bottom: number }[] = [];
  let left = 0, top = 0;
  for (let index = 0; index < rawBoxes.length; index += 4) {
    left += rawBoxes[index]!; top += rawBoxes[index + 1]!;
    const width = rawBoxes[index + 2]!, height = rawBoxes[index + 3]!;
    if (width < 0 || height < 0 || !validInteger(left) || !validInteger(top) || !validInteger(left + width) || !validInteger(top + height)) throw new TypeError('Invalid obstacle table box');
    boxes.push({ left, top, right: left + width, bottom: top + height });
  }
  const kinds = new Set(records.map(record => record.kind));
  const result: WorldChunkRecord[] = [];
  let kept = 0;
  for (const list of table['lists'] as unknown[]) {
    const shape = object(list) && typeof list['kind'] === 'string' ? tableShape(list['kind']) : undefined;
    if (!object(list) || shape === undefined || kinds.has(list['kind'] as string) || !validInteger(list['at']) || list['at'] < result.length
      || list['at'] - result.length > records.length - kept || !tableIntegers(list['rows'], SHAPE_WIDTH[shape]) || list['rows'].length === 0
      || (list['anchors'] !== undefined && !tableIntegers(list['anchors'], 3))) throw new TypeError('Invalid obstacle table list');
    const kind = list['kind'] as string;
    kinds.add(kind); // a kind appears once, and never also as JSON records
    while (result.length < list['at']) result.push(records[kept++]!);
    const rows = list['rows'], anchors = (list['anchors'] as number[] | undefined) ?? [], width = SHAPE_WIDTH[shape];
    let ordinal = 0, boxAt = 0, offset = 0, source = 0, anchor = 0, previousAnchor = -1;
    for (let row = 0; row * width < rows.length; row++) {
      const at = row * width;
      ordinal += rows[at]!; boxAt += rows[at + 1]!;
      const item = boxes[boxAt];
      if (item === undefined || !validInteger(ordinal)) throw new TypeError('Invalid obstacle table row');
      if (ordinal < 0) throw new TypeError('Invalid chunk record anchor');
      let tileX = Math.floor(item.left / WORLD_CHUNK_OBSTACLE_TILE_UNITS), tileY = Math.floor(item.top / WORLD_CHUNK_OBSTACLE_TILE_UNITS);
      if (anchor < anchors.length && anchors[anchor] === row) {
        if (row <= previousAnchor) throw new TypeError('Invalid obstacle table anchor');
        previousAnchor = row; tileX = anchors[anchor + 1]!; tileY = anchors[anchor + 2]!; anchor += 3;
      }
      if (Math.floor(tileX / WORLD_CHUNK_SIZE) !== cx || Math.floor(tileY / WORLD_CHUNK_SIZE) !== cy) throw new TypeError('Invalid chunk record anchor');
      let value: Record<string, ChunkJson>;
      if (shape === 'authority') {
        const group = rows[at + 2];
        offset += rows[at + 3]!; source += rows[at + 4]!;
        const sourceId = sources[source];
        if ((group !== 0 && group !== 1) || sourceId === undefined) throw new TypeError('Invalid obstacle table row');
        if (!validInteger(ordinal - offset) || ordinal - offset < 0) throw new TypeError(`Invalid authority record ${kind}`);
        value = { bottom: item.bottom, group: group === 0 ? 'base' : 'authored', left: item.left, ordinal: ordinal - offset, right: item.right, sourceId, top: item.top };
      } else if (shape === 'suppressed') {
        const medium = rows[at + 2];
        if (medium !== 0 && medium !== 1) throw new TypeError('Invalid obstacle table row');
        value = { bottom: item.bottom, left: item.left, medium: medium === 0 ? 'ground' : 'water', right: item.right, top: item.top };
      } else value = { bottom: item.bottom, left: item.left, right: item.right, top: item.top };
      result.push({ kind, ordinal, tileX, tileY, value });
    }
    if (anchor !== anchors.length) throw new TypeError('Invalid obstacle table anchor');
  }
  while (kept < records.length) result.push(records[kept++]!);
  return result;
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
  // Authority schema 2 (BUG-044): the obstacle kinds go into the table, once each.
  const compacted = chunk.authoritySchema === WORLD_CHUNK_AUTHORITY_SCHEMA_V2 ? compactObstacles(chunk.records) : undefined;
  if (compacted !== undefined && canonicalChunkJson(expandObstacles(compacted.records, compacted.obstacleTable, chunk.cx, chunk.cy)) !== canonicalChunkJson(chunk.records)) {
    throw new Error('Obstacle table does not reproduce the chunk records');
  }
  const json = encoder.encode(canonicalChunkJson({ ...header, ...compacted, channels: descriptors }));
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
  // One SHA-256 pass: the header digest and the content address are the same hash.
  const digest = sha256(bytes.subarray(40));
  const contentHash = hexDigest(digest);
  if (digest.some((value, index) => bytes[index + 8] !== value) || (expectedHash !== undefined && contentHash !== expectedHash)) throw new TypeError('World chunk hash mismatch');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(40, true);
  if (jsonLength > bytes.length - PREFIX_SIZE) throw new TypeError('Truncated chunk metadata');
  const raw: unknown = JSON.parse(decoder.decode(bytes.subarray(PREFIX_SIZE, PREFIX_SIZE + jsonLength)));
  checkHeader(raw, true);
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
  const header = { ...raw } as unknown as Record<string, unknown>;
  delete header['channels'];
  checkMedium(raw.mediumSchema, arrays);
  // The JSON records; the table's records are valid by construction (expandObstacles).
  checkAuthority(raw.authoritySchema, arrays, raw.records);
  if (header['obstacleTable'] !== undefined) {
    header['records'] = expandObstacles(raw.records, header['obstacleTable'], raw.cx, raw.cy);
    delete header['obstacleTable'];
  }
  if (offset !== bytes.length) throw new TypeError('Trailing chunk bytes');
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

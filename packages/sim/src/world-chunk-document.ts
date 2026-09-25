import {
  WORLD_CHUNK_DOCUMENT_SCHEMA, WORLD_CHUNK_SIZE, canonicalChunkJson, decodeWorldChunk,
  type ChunkJson, type WorldChunkDocumentCells, type WorldChunkManifest, type WorldChunkRecord,
} from './world-chunk.js';
import type { MapDocumentV3 } from './map-document-v3.js';

/**
 * Static-world S7a: rebuild the live map document from the published chunks plus
 * the manifest, with no generator, compiler or map-document module (type imports
 * only). The inverse of what the materializer writes:
 *
 * - `metadata.document` (every manifest): id, provenance, layers, prefabs,
 *   generatedSuppressions, entityStates, combatRegions;
 * - the entity lists as ordered chunk records (every chunk): objects, landmarks,
 *   scenery, anchors, resourcePlacements, stairRun;
 * - the chunk `cellParts` (every chunk): authored cell part stacks;
 * - the authored-document extension, only with the materializer option:
 *   `documentCells` per chunk (the sparse authored cells, without parts, plus the
 *   few pre-overlay `baseBiomes` a generator-free recompile needs) and
 *   `metadata.authoredDocument` (every remaining top-level key, the key orders and
 *   the semantic hash).
 *
 * The chunk format stores JSON with canonical (sorted) keys, but the document's
 * semantic hash (`mapDocumentV3Hash`, Studio's `editorMapSemanticHash`) is over the
 * serialized text, so it depends on key order, and the live document's order
 * follows its publication history. The extension therefore records the key order
 * of every JSON path class, and the rebuild fails closed unless it reproduces the
 * recorded semantic hash exactly.
 */

/** Document list key → the chunk record kind the materializer emits for it. */
export const WORLD_CHUNK_DOCUMENT_LIST_RECORDS = Object.freeze({
  objects: 'objects', landmarks: 'landmarks', scenery: 'scenery', anchors: 'anchors',
  resourcePlacements: 'resourcePlacements', stairRuns: 'stairRun',
} as const);
type DocumentListKey = keyof typeof WORLD_CHUNK_DOCUMENT_LIST_RECORDS;
const LIST_KEYS = Object.keys(WORLD_CHUNK_DOCUMENT_LIST_RECORDS) as DocumentListKey[];
/** Top-level keys every manifest already carries in `metadata.document`. */
export const WORLD_CHUNK_DOCUMENT_METADATA_KEYS = Object.freeze([
  'id', 'provenance', 'layers', 'prefabs', 'generatedSuppressions', 'entityStates', 'combatRegions',
] as const);
const METADATA_KEYS: readonly string[] = WORLD_CHUNK_DOCUMENT_METADATA_KEYS;
/** The JSON path class of every authored cell (`cells` is keyed by `x,y`). */
export const WORLD_CHUNK_DOCUMENT_CELL_CLASS = 'cells.*';

/** `metadata.authoredDocument` in the manifest. */
export interface WorldChunkAuthoredDocument {
  readonly schema: typeof WORLD_CHUNK_DOCUMENT_SCHEMA;
  /** Every top-level key not carried elsewhere (scalars, `transitions`, and any key a later document adds). */
  readonly fields: { readonly [key: string]: ChunkJson };
  /** Key orders per JSON path class: `''` is the root, `[]` any array element, `cells.*` any cell. */
  readonly keyOrders: WorldChunkDocumentKeyOrders['keyOrders'];
  readonly keyOrderChoices: WorldChunkDocumentKeyOrders['keyOrderChoices'];
  /** Completeness: authored cells (with or without parts) and entries per document list. */
  readonly counts: { readonly cells: number; readonly lists: { readonly [key: string]: number } };
  /** `mapDocumentV3Hash({ ...document, revision: 0 })` of the published document. */
  readonly semanticHash: string;
}

type JsonObject = { readonly [key: string]: ChunkJson };
function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function childClass(path: string, key: string): string {
  if (path === '' && key === 'cells') return 'cells';
  if (path === 'cells') return WORLD_CHUNK_DOCUMENT_CELL_CLASS;
  return path === '' ? key : `${path}.${key}`;
}

/** Key order of every JSON object in a document, by path class. */
export interface WorldChunkDocumentKeyOrders {
  /** Distinct key sequences per path class, in first-seen order. An object uses
   * the one variant with exactly its key set... */
  readonly keyOrders: { readonly [pathClass: string]: readonly (readonly string[])[] };
  /** ...unless two variants of its class share a key set (the same keys authored in
   * different orders): then every instance of the class, in document order, names its variant. */
  readonly keyOrderChoices: { readonly [pathClass: string]: readonly number[] };
}
function keySet(keys: readonly string[]): string { return [...keys].sort().join('\u0000'); }

/** Captures the key order of every object (the root included; not the `cells` map, whose order is canonical). */
export function worldChunkDocumentKeyOrders(document: JsonObject): WorldChunkDocumentKeyOrders {
  const variants = new Map<string, { readonly list: string[][]; readonly index: Map<string, number>; readonly instances: number[] }>();
  const visit = (value: ChunkJson, path: string): void => {
    if (Array.isArray(value)) { for (const item of value) visit(item, `${path}[]`); return; }
    if (!isObject(value)) return;
    const keys = Object.keys(value);
    if (path !== 'cells' && keys.length > 0) {
      const entry = variants.get(path) ?? { list: [], index: new Map<string, number>(), instances: [] };
      variants.set(path, entry);
      const identity = keys.join('\u0000');
      let variant = entry.index.get(identity);
      if (variant === undefined) { variant = entry.list.length; entry.list.push(keys); entry.index.set(identity, variant); }
      entry.instances.push(variant);
    }
    for (const key of keys) visit(value[key]!, childClass(path, key));
  };
  visit(document, '');
  const classes = [...variants.keys()].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  const keyOrderChoices: Record<string, number[]> = {};
  for (const path of classes) {
    const { list, instances } = variants.get(path)!;
    if (new Set(list.map(keySet)).size !== list.length) keyOrderChoices[path] = instances;
  }
  return { keyOrders: Object.fromEntries(classes.map(path => [path, variants.get(path)!.list])), keyOrderChoices };
}

/** The manifest half of the extension, from the document exactly as serialized
 * (`JSON.parse(serializeMapDocumentV3(document))`) and its semantic hash. */
export function worldChunkAuthoredDocument(normalized: JsonObject, semanticHash: string): WorldChunkAuthoredDocument {
  const cells = normalized['cells'];
  if (!isObject(cells)) throw new TypeError('chunk_document_cells_missing');
  const fields: Record<string, ChunkJson> = {};
  const lists: Record<string, number> = {};
  for (const [key, value] of Object.entries(normalized)) {
    if (key === 'cells' || METADATA_KEYS.includes(key)) continue;
    if ((LIST_KEYS as readonly string[]).includes(key)) {
      if (!Array.isArray(value)) throw new TypeError(`chunk_document_list_invalid: ${key}`);
      lists[key] = value.length;
    } else fields[key] = value;
  }
  return { schema: WORLD_CHUNK_DOCUMENT_SCHEMA, fields, ...worldChunkDocumentKeyOrders(normalized),
    counts: { cells: Object.keys(cells).length, lists }, semanticHash };
}

function cellCoordinates(key: string, width: number, height: number): { readonly tileX: number; readonly tileY: number } {
  const match = /^(\d+),(\d+)$/u.exec(key);
  const tileX = Number(match?.[1]), tileY = Number(match?.[2]);
  if (match === null || !Number.isSafeInteger(tileX) || !Number.isSafeInteger(tileY) || tileX >= width || tileY >= height
    || key !== `${tileX},${tileY}`) throw new TypeError(`chunk_document_cell_key_invalid: ${key}`);
  return { tileX, tileY };
}

/** Whether compiling this authored cell consults the generated (pre-overlay) biome
 * that the post-overlay `biomes` channel does not keep: for the surface of a cell with an
 * authored biome but no surface (map-document generatedBaseCellAt), and for the
 * resolved biome of a cell with an authored surface or feature but no biome
 * (map-document-v3 resolvedMapBiomeAt: traversal medium and gameplay biome queries). */
export function authoredCellConsultsBaseBiome(cell: JsonObject): boolean {
  return cell['biome'] !== undefined ? cell['surface'] === undefined : cell['surface'] !== undefined || cell['feature'] !== undefined;
}

/** The per-chunk half of the extension: authored cells (without `parts`, which the
 * chunk's `cellParts` carries) grouped by chunk key `cx:cy`, palette-encoded.
 * `baseBiomeAt` returns the generated biome index where a cell needs it (see
 * WorldChunkDocumentCells.baseBiomes) and the baked channel lost it, else undefined. */
export function worldChunkDocumentCellsByChunk(cells: { readonly [key: string]: JsonObject }, width: number, height: number,
  baseBiomeAt: (tileX: number, tileY: number, cell: JsonObject) => number | undefined = () => undefined): Map<string, WorldChunkDocumentCells> {
  const byChunk = new Map<string, { local: number; cell: JsonObject; base: number | undefined }[]>();
  for (const [key, cell] of Object.entries(cells)) {
    const { tileX, tileY } = cellCoordinates(key, width, height);
    const rest = Object.fromEntries(Object.entries(cell).filter(([name]) => name !== 'parts'));
    if (Object.keys(rest).length === 0) continue; // a parts-only cell lives in cellParts alone
    const chunk = `${Math.floor(tileX / WORLD_CHUNK_SIZE)}:${Math.floor(tileY / WORLD_CHUNK_SIZE)}`;
    const list = byChunk.get(chunk) ?? [];
    list.push({ local: (tileY % WORLD_CHUNK_SIZE) * WORLD_CHUNK_SIZE + tileX % WORLD_CHUNK_SIZE, cell: rest,
      base: authoredCellConsultsBaseBiome(rest) ? baseBiomeAt(tileX, tileY, rest) : undefined });
    byChunk.set(chunk, list);
  }
  const result = new Map<string, WorldChunkDocumentCells>();
  for (const [chunk, list] of byChunk) {
    list.sort((a, b) => a.local - b.local);
    const palette: JsonObject[] = [];
    const indices = new Map<string, number>();
    const flat: number[] = [];
    const bases: number[] = [];
    for (const { local, cell, base } of list) {
      if (base !== undefined) bases.push(local, base);
      // Palette identity is the canonical value (the encoder sorts keys; the rebuild restores their order).
      const identity = canonicalChunkJson(cell);
      let index = indices.get(identity);
      if (index === undefined) { index = palette.length; palette.push(cell); indices.set(identity, index); }
      flat.push(local, index);
    }
    result.set(chunk, { palette, cells: flat, ...(bases.length > 0 ? { baseBiomes: bases } : {}) });
  }
  return result;
}

/** The generated biome index a generator-free compile of this chunk must use at a
 * local cell, where the extension recorded one (otherwise the baked `biomes` channel). */
export function worldChunkBaseBiomes(chunk: { readonly documentCells?: WorldChunkDocumentCells }): ReadonlyMap<number, number> {
  const bases = chunk.documentCells?.baseBiomes ?? [];
  const result = new Map<number, number>();
  for (let index = 0; index < bases.length; index += 2) result.set(bases[index]!, bases[index + 1]!);
  return result;
}

/** Studio's semantic hash (`mapDocumentV3Hash` with revision pinned to 0) for a
 * document already in serialized (normalized) form: the same FNV-1a over the same
 * text. It equals `mapDocumentV3Hash` only for normalized documents. */
export function normalizedMapDocumentSemanticHash(document: object): string {
  let hash = 2_166_136_261;
  for (const character of `${JSON.stringify({ ...document, revision: 0 }, null, 2)}\n`) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Restores the captured key order of every object (the inverse of worldChunkDocumentKeyOrders). */
function keyOrderRestorer(orders: WorldChunkDocumentKeyOrders): { readonly apply: (root: JsonObject) => ChunkJson; readonly finish: () => void } {
  const used = new Map<string, number>();
  const orderFor = (path: string, keys: readonly string[]): readonly string[] => {
    const variants = orders.keyOrders[path] ?? [];
    const choices = orders.keyOrderChoices[path];
    const set = keySet(keys);
    let order: readonly string[] | undefined;
    if (choices !== undefined) {
      const instance = used.get(path) ?? 0;
      used.set(path, instance + 1);
      order = variants[choices[instance] ?? -1];
    } else {
      const matches = variants.filter(variant => keySet(variant) === set);
      if (matches.length === 1) order = matches[0];
    }
    if (order === undefined || keySet(order) !== set) throw new Error(`chunk_document_key_order_missing: ${path}`);
    return order;
  };
  const visit = (value: ChunkJson, path: string): ChunkJson => {
    if (Array.isArray(value)) return value.map(item => visit(item, `${path}[]`));
    if (!isObject(value)) return value;
    const keys = Object.keys(value);
    if (keys.length === 0) return {};
    // The cells map itself is ordered like normalizeMapDocumentV3 (localeCompare of `x,y`).
    const order = path === 'cells' ? [...keys].sort((left, right) => left.localeCompare(right)) : orderFor(path, keys);
    const result: Record<string, ChunkJson> = {};
    for (const key of order) result[key] = visit(value[key]!, childClass(path, key));
    return result;
  };
  return {
    apply: root => visit(root, ''),
    finish: () => {
      for (const [path, choices] of Object.entries(orders.keyOrderChoices)) {
        if ((used.get(path) ?? 0) !== choices.length) throw new Error(`chunk_document_key_order_choices_unused: ${path}`);
      }
    },
  };
}

function authoredDocumentMetadata(manifest: WorldChunkManifest): WorldChunkAuthoredDocument {
  const value = manifest.metadata['authoredDocument'];
  if (!isObject(value) || value['schema'] !== WORLD_CHUNK_DOCUMENT_SCHEMA || !isObject(value['fields']) || !isObject(value['keyOrders'])
    || !isObject(value['keyOrderChoices']) || !isObject(value['counts']) || typeof value['semanticHash'] !== 'string') throw new Error('chunk_document_metadata_missing');
  return value as unknown as WorldChunkAuthoredDocument;
}

/** True when the manifest publishes the authored-document extension. */
export function manifestCarriesAuthoredDocument(manifest: WorldChunkManifest): boolean {
  return manifest.metadata['authoredDocument'] !== undefined;
}

/**
 * Rebuilds the live map document from every manifest chunk. Decodes each blob
 * once (against its head hash) and keeps only the authored data. Fails closed on
 * a missing blob or extension, incomplete records or cells, and any difference
 * from the recorded semantic hash.
 */
export function rebuildWorldChunkDocument(manifest: WorldChunkManifest, readBlob: (hash: string) => Uint8Array | undefined): MapDocumentV3 {
  const authored = authoredDocumentMetadata(manifest);
  const documentMetadata = manifest.metadata['document'];
  if (!isObject(documentMetadata)) throw new Error('chunk_document_metadata_missing');
  const cells: Record<string, Record<string, ChunkJson>> = {};
  const records = new Map<string, WorldChunkRecord[]>(LIST_KEYS.map(key => [WORLD_CHUNK_DOCUMENT_LIST_RECORDS[key], []]));
  for (const head of manifest.chunks) {
    const bytes = readBlob(head.contentHash);
    if (bytes === undefined) throw new Error('chunk_document_blob_missing');
    const chunk = decodeWorldChunk(bytes, head.contentHash);
    if (chunk.cx !== head.cx || chunk.cy !== head.cy || chunk.spaceId !== manifest.spaceId) throw new Error('chunk_document_head_mismatch');
    if (chunk.documentSchema !== WORLD_CHUNK_DOCUMENT_SCHEMA || chunk.documentCells === undefined) throw new Error('chunk_document_extension_missing');
    const tile = (local: number): string => `${chunk.cx * WORLD_CHUNK_SIZE + local % WORLD_CHUNK_SIZE},${chunk.cy * WORLD_CHUNK_SIZE + Math.floor(local / WORLD_CHUNK_SIZE)}`;
    const { palette, cells: flat } = chunk.documentCells;
    for (let index = 0; index < flat.length; index += 2) cells[tile(flat[index]!)] = { ...palette[flat[index + 1]!]! };
    for (const [local, parts] of Object.entries(chunk.cellParts ?? {})) {
      const key = tile(Number(local));
      cells[key] = { ...(cells[key] ?? {}), parts };
    }
    for (const record of chunk.records) records.get(record.kind)?.push(record);
  }
  if (Object.keys(cells).length !== authored.counts.cells) throw new Error('chunk_document_cells_incomplete');
  const rootOrder = authored.keyOrders['']?.[0];
  if (rootOrder === undefined || authored.keyOrders['']!.length !== 1) throw new Error('chunk_document_key_order_missing: root');
  for (const key of [...Object.keys(authored.fields), ...Object.keys(authored.counts.lists)]) {
    if (!rootOrder.includes(key)) throw new Error(`chunk_document_key_unplaced: ${key}`);
  }
  const root: Record<string, ChunkJson> = {};
  for (const key of rootOrder) {
    if (key === 'cells') { root[key] = cells; continue; }
    const kind = (WORLD_CHUNK_DOCUMENT_LIST_RECORDS as Readonly<Record<string, string>>)[key];
    if (kind !== undefined) {
      const list = records.get(kind)!.sort((a, b) => a.ordinal - b.ordinal);
      if (list.length !== authored.counts.lists[key] || list.some((record, ordinal) => record.ordinal !== ordinal)) throw new Error(`chunk_document_records_incomplete: ${key}`);
      root[key] = list.map(record => record.value);
      continue;
    }
    const source = METADATA_KEYS.includes(key) ? documentMetadata : authored.fields;
    if (!Object.hasOwn(source, key)) throw new Error(`chunk_document_key_missing: ${key}`);
    root[key] = source[key]!;
  }
  if (root['width'] !== manifest.width || root['height'] !== manifest.height) throw new Error('chunk_document_dimensions_mismatch');
  const restorer = keyOrderRestorer(authored);
  const document = restorer.apply(root) as unknown as MapDocumentV3;
  restorer.finish();
  if (normalizedMapDocumentSemanticHash(document) !== authored.semanticHash) throw new Error('chunk_document_semantic_hash_mismatch');
  return document;
}

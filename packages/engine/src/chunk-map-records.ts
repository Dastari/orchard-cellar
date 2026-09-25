import type {
  CombatRegion, ContentRegistry, GeneratedSurvivalDecoration, MapContentLayerDefinition, MapLandmarkInstance, MapObjectInstance, MapPrefabDocumentV2,
} from '@orchard/sim';
import { chunkAuthorityMetadata } from '@orchard/sim/chunk-collision';
import type { ChunkJson, WorldChunk, WorldChunkManifest } from '@orchard/sim/world-chunk';
import { CHUNK_WINDOW_MARGIN_TILES, type ChunkWindowRect, type ChunkWindowSource } from './chunk-terrain-window.js';
import type { MapObjectRecords } from './map-object-presentation.js';
import type { TerrainArray } from './terrain-array.js';
import { terrainBaseDatum, terrainMaximumElevation, terrainMinimumElevation, terrainVisualProjectionRowsPerLevel } from './terrain-sampling.js';

/**
 * Static world S4e: the authored map content the topside client draws, from the
 * chunk records of a render window instead of the whole live map document.
 *
 * Generator-free, like chunk-terrain-window.ts: it reads only the manifest and the
 * window's resident chunks. The materializer (scripts/materialize-world-chunks.ts)
 * publishes, per chunk, the records anchored in it:
 *
 * - `objects` and `landmarks`: the document's lists, anchored at the instance tile;
 * - `decoration`: the topside decoration list exactly as the client composed it
 *   from the document (the procedural decorations, then every enabled landmark's
 *   decoration with its `landmark`), with raw generated ids. Suppression stays
 *   explicit data: consumers apply `generatedSuppressions` as before;
 * - `authority.walkable`: the landmark ground-walkable tiles (already applied to
 *   the authority collision channels; kept so consumers can explain them).
 *
 * The manifest carries what is map-wide: the document id, layer stack and prefabs
 * (`metadata.document`), and the server's combat regions and generated
 * suppressions (`metadata.authority`, the same data the S4d collision uses).
 *
 * A window holds exactly the records anchored in its resident chunks, in stream
 * (document) order. Content anchored outside it is absent: the render window keeps
 * CHUNK_WINDOW_MARGIN_TILES between the camera's view and its edge. That is enough
 * only while no prefab placement plus light reaches further from its anchor than
 * the margin less the painters' own view allowance, which chunkMapRecordsReach
 * checks for every build (and the materializer for every publication).
 */

/** A topside decoration: generated id and art, plus its landmark when authored. */
export interface MapDecorationRecord extends GeneratedSurvivalDecoration {
  readonly landmark?: MapLandmarkInstance;
}

/**
 * The authored map content the topside painters, light occluders, supply cache and
 * ferry read. A whole `MapDocumentV3` satisfies it structurally (modes off and
 * shadow); a chunk window's records supply the same lists in mode `on`.
 */
export interface TopsideMapRecords extends MapObjectRecords {
  readonly landmarks: readonly MapLandmarkInstance[];
  readonly generatedSuppressions: readonly string[];
  readonly combatRegions?: readonly CombatRegion[];
}

export interface ChunkWindowMapRecords extends TopsideMapRecords {
  readonly source: 'chunks';
  readonly objects: readonly MapObjectInstance[];
  readonly combatRegions: readonly CombatRegion[];
  /** The decorations anchored in the window, unsuppressed, in document order. */
  readonly decorations: readonly MapDecorationRecord[];
  /** Landmark ground-walkable tiles anchored in the window. */
  readonly walkable: readonly { readonly tileX: number; readonly tileY: number }[];
  readonly rect: ChunkWindowRect;
  /** `cx:cy` of the chunks the records came from. */
  readonly present: ReadonlySet<string>;
  /** `cx:cy` of window chunks resident when the window was built but evicted since
   * (the look-ahead pin moved on). They are skipped, as the collision reads them
   * as missing; build again once they are resident. */
  readonly evicted: readonly string[];
}

/** The largest object scale (MapObjectInstance.scale is 1 or 2). */
const MAX_OBJECT_SCALE = 2;

/** How far, in tiles, authored map content can reach from its anchor, and what the window allows. */
export interface ChunkMapRecordsReach {
  /** Farthest placement or collision cell foot from an object's anchor, at the largest object scale. */
  readonly prefabTiles: number;
  /** Largest light radius plus its scaled offset, from the content registry. */
  readonly lightTiles: number;
  /** The painters' visible margin beyond the camera's view (the terrain projection margin). */
  readonly viewTiles: number;
  /** CHUNK_WINDOW_MARGIN_TILES. */
  readonly marginTiles: number;
  readonly fits: boolean;
}

const prefabReachCache = new WeakMap<readonly MapPrefabDocumentV2[], { tiles: number; permille: number }>();
function prefabReach(prefabs: readonly MapPrefabDocumentV2[]): { tiles: number; permille: number } {
  let cached = prefabReachCache.get(prefabs);
  if (cached === undefined) {
    let extent = 0, permille = 1000;
    for (const prefab of prefabs) {
      for (const part of [...(prefab.placements ?? []), ...(prefab.cells ?? [])]) {
        extent = Math.max(extent, Math.abs(part.tileX - prefab.pivot.tileX), Math.abs(part.tileY - prefab.pivot.tileY));
      }
      for (const rule of prefab.presentation?.rules ?? []) permille = Math.max(permille, rule.scalePermille ?? 1000);
    }
    // A placement's foot is its tile's south edge: one more tile than the offset.
    cached = { tiles: Math.ceil(extent * MAX_OBJECT_SCALE) + 1, permille };
    prefabReachCache.set(prefabs, cached);
  }
  return cached;
}

const lightReachCache = new WeakMap<object, { radius: number; offsetPixels: number }>();
function lightReach(registry: Pick<ContentRegistry, 'objects'>): { radius: number; offsetPixels: number } {
  let cached = lightReachCache.get(registry.objects);
  if (cached === undefined) {
    let radius = 0, offsetPixels = 0;
    for (const definition of registry.objects.values()) {
      for (const light of [definition.components.light, ...(definition.components.overrides ?? []).map(override => override.light)]) {
        if (light === undefined || light === null || light === false) continue;
        radius = Math.max(radius, light.radiusTiles ?? 0);
        offsetPixels = Math.max(offsetPixels, Math.abs(light.offsetY ?? 0));
      }
    }
    cached = { radius, offsetPixels };
    lightReachCache.set(registry.objects, cached);
  }
  return cached;
}

/** The painters' visible margin beyond the view, in tiles (gameplay-painter-setup's
 * terrain projection margin, at least 64 pixels). */
export function chunkMapViewAllowanceTiles(terrain: TerrainArray): number {
  const datum = terrainBaseDatum(terrain);
  const pixels = Math.max(64, Math.max(Math.abs(terrainMaximumElevation(terrain) - datum), Math.abs(terrainMinimumElevation(terrain) - datum))
    * terrainVisualProjectionRowsPerLevel(terrain) * 16);
  return Math.ceil(pixels / 16);
}

/**
 * The window-edge premise: content anchored outside a window never reaches the
 * view the window serves. A placement lands at most `prefabTiles` from its anchor,
 * its light reaches `lightTiles` further, and the painters draw `viewTiles` beyond
 * the view; together they must fit in CHUNK_WINDOW_MARGIN_TILES.
 */
export function chunkMapRecordsReach(prefabs: readonly MapPrefabDocumentV2[], registry: Pick<ContentRegistry, 'objects'>,
  viewTiles: number): ChunkMapRecordsReach {
  const prefab = prefabReach(prefabs), light = lightReach(registry);
  // +1: the flame flicker widens a radius by a fraction of a tile.
  const lightTiles = Math.ceil(light.radius + light.offsetPixels * MAX_OBJECT_SCALE * prefab.permille / 1000 / 16) + 1;
  return { prefabTiles: prefab.tiles, lightTiles, viewTiles, marginTiles: CHUNK_WINDOW_MARGIN_TILES,
    fits: prefab.tiles + lightTiles + viewTiles <= CHUNK_WINDOW_MARGIN_TILES };
}

/** The manifest's prefabs (its `metadata.document.prefabs`), for the reach check. */
export function chunkManifestPrefabs(manifest: WorldChunkManifest): readonly MapPrefabDocumentV2[] {
  return mapMetadata(manifest).prefabs;
}

export interface ChunkWindowMapRecordsOptions {
  /** Check the window-edge premise (chunkMapRecordsReach) and throw when it fails. */
  readonly reach?: { readonly registry: Pick<ContentRegistry, 'objects'>; readonly viewTiles: number };
}

function record(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const text = (value: unknown): value is string => typeof value === 'string';

/** The shapes painters dereference; a record that lacks them is a malformed publication. */
function validObject(value: ChunkJson): boolean {
  return record(value) && text(value['id']) && text(value['prefabId']) && finite(value['prefabRevision'])
    && finite(value['tileX']) && finite(value['tileY']) && finite(value['elevation']) && text(value['layer'])
    && [0, 1, 2, 3].includes(value['quarterTurns'] as number) && typeof value['flipX'] === 'boolean' && typeof value['enabled'] === 'boolean';
}
function validLandmark(value: unknown): boolean {
  return record(value) && text(value['id']) && text(value['kind']) && text(value['layer']) && finite(value['tileX']) && finite(value['tileY'])
    && finite(value['sourceDecorationId']) && typeof value['enabled'] === 'boolean';
}
function validDecoration(value: ChunkJson): boolean {
  return record(value) && finite(value['id']) && text(value['kind']) && finite(value['tileX']) && finite(value['tileY'])
    && finite(value['variant']) && (value['landmark'] === undefined || validLandmark(value['landmark']));
}
function validTile(value: ChunkJson): boolean {
  return record(value) && Number.isInteger(value['tileX']) && Number.isInteger(value['tileY']);
}

const KINDS = { objects: validObject, landmarks: validLandmark, decoration: validDecoration, 'authority.walkable': validTile } as const;
type Kind = keyof typeof KINDS;
type Ordered = { readonly ordinal: number; readonly value: ChunkJson };
type ChunkMapRecordsView = Readonly<Record<Kind, readonly Ordered[]>>;

/** Decoded chunks are immutable: their map records are extracted and checked once. */
const chunkViews = new WeakMap<WorldChunk, ChunkMapRecordsView>();
function chunkView(chunk: WorldChunk, cx: number, cy: number): ChunkMapRecordsView {
  let view = chunkViews.get(chunk);
  if (view === undefined) {
    const lists: Record<Kind, Ordered[]> = { objects: [], landmarks: [], decoration: [], 'authority.walkable': [] };
    for (const item of chunk.records) {
      if (!Object.prototype.hasOwnProperty.call(KINDS, item.kind)) continue;
      const kind = item.kind as Kind;
      if (!KINDS[kind](item.value)) throw new Error(`chunk_map_record_invalid:${kind}@${cx},${cy}#${item.ordinal}`);
      lists[kind].push({ ordinal: item.ordinal, value: item.value });
    }
    view = lists;
    chunkViews.set(chunk, view);
  }
  return view;
}

interface ManifestMapMetadata {
  readonly id: string;
  readonly layers: readonly Pick<MapContentLayerDefinition, 'id' | 'order'>[];
  readonly prefabs: readonly MapPrefabDocumentV2[];
  readonly combatRegions: readonly CombatRegion[];
  readonly generatedSuppressions: readonly string[];
}
/** Keyed by manifest identity (published manifests are never mutated). */
const manifestMetadata = new WeakMap<WorldChunkManifest, ManifestMapMetadata>();
function mapMetadata(manifest: WorldChunkManifest): ManifestMapMetadata {
  let cached = manifestMetadata.get(manifest);
  if (cached === undefined) {
    const authority = chunkAuthorityMetadata(manifest);
    if (authority === undefined) throw new Error('chunk_map_records_authority_missing');
    const document = manifest.metadata['document'];
    if (!record(document) || !text(document['id']) || !Array.isArray(document['layers']) || !Array.isArray(document['prefabs'])) {
      throw new Error('chunk_map_records_document_missing');
    }
    cached = { id: document['id'], layers: document['layers'] as unknown as ManifestMapMetadata['layers'],
      prefabs: document['prefabs'] as unknown as ManifestMapMetadata['prefabs'],
      combatRegions: authority.combatRegions, generatedSuppressions: authority.generatedSuppressions };
    manifestMetadata.set(manifest, cached);
  }
  return cached;
}

function merged<T>(lists: readonly (readonly Ordered[])[], kind: string): T[] {
  const all = lists.flat().sort((a, b) => a.ordinal - b.ordinal);
  for (let index = 1; index < all.length; index++) {
    if (all[index]!.ordinal === all[index - 1]!.ordinal) throw new Error(`chunk_map_record_order:${kind}#${all[index]!.ordinal}`);
  }
  return all.map(({ value }) => value as unknown as T);
}

/**
 * The map records of a render window, from exactly the chunks it was built with
 * (`window.present`; a chunk that arrives later is picked up when the window
 * rebuilds; one evicted since is skipped and listed in `evicted`). Throws on a
 * manifest without the authority or document metadata, a malformed record, or
 * (with `options.reach`) content that could reach past the window margin: the
 * caller then falls back to its legacy source.
 */
export function buildChunkWindowMapRecords(source: ChunkWindowSource,
  window: { readonly rect: ChunkWindowRect; readonly present: ReadonlySet<string>; readonly manifest: WorldChunkManifest },
  options: ChunkWindowMapRecordsOptions = {}): ChunkWindowMapRecords {
  const manifest = window.manifest;
  if (source.manifest !== manifest) throw new Error('chunk_map_records_manifest_mismatch');
  const meta = mapMetadata(manifest);
  if (options.reach !== undefined) {
    const reach = chunkMapRecordsReach(meta.prefabs, options.reach.registry, options.reach.viewTiles);
    if (!reach.fits) {
      throw new Error(`chunk_map_records_reach_exceeds_margin:prefab=${reach.prefabTiles},light=${reach.lightTiles},view=${reach.viewTiles}>${reach.marginTiles}`);
    }
  }
  const views: ChunkMapRecordsView[] = [];
  const present = new Set<string>();
  const evicted: string[] = [];
  const { rect } = window;
  for (let cy = rect.cy; cy < rect.cy + rect.rows; cy++) for (let cx = rect.cx; cx < rect.cx + rect.columns; cx++) {
    const key = `${cx}:${cy}`;
    if (!window.present.has(key)) continue;
    const chunk = source.peekChunk(cx, cy);
    if (chunk === undefined) { evicted.push(key); continue; }
    views.push(chunkView(chunk, cx, cy));
    present.add(key);
  }
  return {
    source: 'chunks',
    id: meta.id,
    layers: meta.layers,
    prefabs: meta.prefabs,
    combatRegions: meta.combatRegions,
    generatedSuppressions: meta.generatedSuppressions,
    objects: merged<MapObjectInstance>(views.map(view => view.objects), 'objects'),
    landmarks: merged<MapLandmarkInstance>(views.map(view => view.landmarks), 'landmarks'),
    decorations: merged<MapDecorationRecord>(views.map(view => view.decoration), 'decoration'),
    walkable: merged<{ tileX: number; tileY: number }>(views.map(view => view['authority.walkable']), 'authority.walkable'),
    rect,
    present,
    evicted,
  };
}

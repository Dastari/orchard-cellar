import type { CellPart, MapSurfaceKind, RuntimeTilesetResolver, TerrainOverride, TerrainTransition } from '@orchard/sim';
import { WORLD_CHUNK_SIZE, WORLD_CHUNK_STRIDE, WORLD_CHUNK_VOID, type ChunkArray, type ChunkJson, type WorldChunk, type WorldChunkManifest } from '@orchard/sim/world-chunk';
import type { TerrainArray } from './terrain-array.js';
import { terrainIndexAt } from './terrain-index.js';

/**
 * Static world S4c: the client's topside terrain in chunk mode `on` is a fixed
 * window of resident chunks, never the whole map. The window is at most
 * CHUNK_WINDOW_CHUNKS x CHUNK_WINDOW_CHUNKS terrain chunks (5 x 5 = 320 x 320
 * tiles), aligned to the chunk grid and clamped inside the map, and is exposed
 * as an ordinary TerrainArray whose origin is its top-left world tile. Every
 * renderer reads it through terrainIndexAt, so drawing a tile in the window
 * gives the same answer as drawing it from the whole map, as long as the tiles
 * that tile's art reads (its neighbours, contour and projection rows) are in
 * the window too. CHUNK_WINDOW_MARGIN_TILES is that allowance: the window is
 * kept so the camera's view plus the margin stays inside it.
 *
 * This module is generator-free: it reads only the manifest and resident chunks.
 */
export const CHUNK_WINDOW_CHUNKS = 5;
export const CHUNK_WINDOW_MARGIN_TILES = 32;

/** Inclusive world-tile bounds. */
export interface TileBounds { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number }

/** A window of terrain chunks: top-left chunk (cx, cy) and its size in chunks. */
export interface ChunkWindowRect { readonly cx: number; readonly cy: number; readonly columns: number; readonly rows: number }

/** The source a window is built from: a BoundedChunkTerrainStore (structurally). */
export interface ChunkWindowSource {
  readonly manifest: WorldChunkManifest;
  peekChunk(cx: number, cy: number): WorldChunk | undefined;
}

export interface ChunkTerrainWindow {
  readonly terrain: TerrainArray;
  readonly rect: ChunkWindowRect;
  /** `cx:cy` of the window chunks that were resident when it was built. */
  readonly present: ReadonlySet<string>;
  /** Window chunks that were not resident (they read as blocked void). */
  readonly missing: number;
}

export function chunkWindowKey(rect: ChunkWindowRect): string {
  return `${rect.cx}:${rect.cy}:${rect.columns}x${rect.rows}`;
}

/** Tile bounds of the whole window (clamped to the map). */
export function chunkWindowTileBounds(rect: ChunkWindowRect, mapWidth: number, mapHeight: number): TileBounds {
  const minX = rect.cx * WORLD_CHUNK_SIZE;
  const minY = rect.cy * WORLD_CHUNK_SIZE;
  return { minX, minY,
    maxX: Math.min(mapWidth, (rect.cx + rect.columns) * WORLD_CHUNK_SIZE) - 1,
    maxY: Math.min(mapHeight, (rect.cy + rect.rows) * WORLD_CHUNK_SIZE) - 1 };
}

function mapChunkCounts(mapWidth: number, mapHeight: number): readonly [number, number] {
  if (!Number.isSafeInteger(mapWidth) || !Number.isSafeInteger(mapHeight) || mapWidth <= 0 || mapHeight <= 0) throw new Error('invalid_chunk_window_map');
  return [Math.ceil(mapWidth / WORLD_CHUNK_SIZE), Math.ceil(mapHeight / WORLD_CHUNK_SIZE)];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/**
 * The window for a camera view. The current window is kept while the view plus
 * the margin (clipped to the map) still fits inside it, so walking back and
 * forth over a chunk edge does not rebuild; otherwise the window is centred on
 * the chunk under the view's centre. A view wider than the window (a huge
 * viewport at minimum zoom) is capped: the window never grows past 5 x 5, and
 * the tiles beyond it simply do not draw.
 */
export function chunkWindowForView(view: TileBounds, mapWidth: number, mapHeight: number,
  previous?: ChunkWindowRect | null, margin = CHUNK_WINDOW_MARGIN_TILES): ChunkWindowRect {
  const [chunksX, chunksY] = mapChunkCounts(mapWidth, mapHeight);
  const columns = Math.min(CHUNK_WINDOW_CHUNKS, chunksX), rows = Math.min(CHUNK_WINDOW_CHUNKS, chunksY);
  const finite = [view.minX, view.minY, view.maxX, view.maxY].every(Number.isFinite);
  const centreX = finite ? clamp((view.minX + view.maxX) / 2, 0, mapWidth - 1) : 0;
  const centreY = finite ? clamp((view.minY + view.maxY) / 2, 0, mapHeight - 1) : 0;
  if (previous && previous.columns === columns && previous.rows === rows && finite) {
    const kept = chunkWindowTileBounds(previous, mapWidth, mapHeight);
    const needed = { minX: clamp(Math.floor(view.minX) - margin, 0, mapWidth - 1), minY: clamp(Math.floor(view.minY) - margin, 0, mapHeight - 1),
      maxX: clamp(Math.ceil(view.maxX) + margin, 0, mapWidth - 1), maxY: clamp(Math.ceil(view.maxY) + margin, 0, mapHeight - 1) };
    if (needed.minX >= kept.minX && needed.minY >= kept.minY && needed.maxX <= kept.maxX && needed.maxY <= kept.maxY) return previous;
  }
  return {
    cx: clamp(Math.floor(centreX / WORLD_CHUNK_SIZE) - Math.floor(columns / 2), 0, chunksX - columns),
    cy: clamp(Math.floor(centreY / WORLD_CHUNK_SIZE) - Math.floor(rows / 2), 0, chunksY - rows),
    columns, rows,
  };
}

/**
 * Tile bounds to pin so the bounded store pins exactly the window's chunks:
 * BoundedChunkTerrainStore.pinView adds one ring of chunks around the view, so
 * the window minus its outer ring is passed (the whole window when it is under
 * three chunks across). The pinned set is at most 5 x 5 = 25 chunks, the
 * store's budget, whatever the viewport size.
 */
export function chunkWindowPinBounds(rect: ChunkWindowRect): readonly [number, number, number, number] {
  const inner = (start: number, count: number): readonly [number, number] => count >= 3 ? [start + 1, start + count - 2] : [start, start + count - 1];
  const [left, right] = inner(rect.cx, rect.columns), [top, bottom] = inner(rect.cy, rect.rows);
  return [left * WORLD_CHUNK_SIZE, top * WORLD_CHUNK_SIZE, (right + 1) * WORLD_CHUNK_SIZE - 1, (bottom + 1) * WORLD_CHUNK_SIZE - 1];
}

interface ChunkRecordsView {
  readonly overrides: readonly { readonly tileX: number; readonly tileY: number; readonly value: TerrainOverride }[];
  readonly transitions: readonly { readonly ordinal: number; readonly value: TerrainTransition }[];
}
/** Decoded chunks are immutable: their terrain records are extracted once. */
const recordViews = new WeakMap<WorldChunk, ChunkRecordsView>();
function chunkRecords(chunk: WorldChunk): ChunkRecordsView {
  let view = recordViews.get(chunk);
  if (view === undefined) {
    const overrides: { tileX: number; tileY: number; value: TerrainOverride }[] = [];
    const transitions: { ordinal: number; value: TerrainTransition }[] = [];
    for (const record of chunk.records) {
      if (record.kind === 'terrainOverride') overrides.push({ tileX: record.tileX, tileY: record.tileY, value: record.value as unknown as TerrainOverride });
      else if (record.kind === 'transition') transitions.push({ ordinal: record.ordinal, value: record.value as unknown as TerrainTransition });
    }
    view = { overrides, transitions };
    recordViews.set(chunk, view);
  }
  return view;
}

/** Map-wide elevation range: the plane channels are indexed from the map's
 * minimum, and projection margins use its extremes, so a window must not use
 * its own. The minimum is the client collision's; the plane count gives the maximum. */
function mapElevationRange(manifest: WorldChunkManifest, localMaximum: number): { minimum: number; maximum: number } | undefined {
  const collisions = manifest.metadata['collisions'] as Readonly<Record<string, ChunkJson>> | undefined;
  const ground = collisions?.['clientGround'] as Readonly<Record<string, ChunkJson>> | undefined;
  const minimum = ground?.['terrainMinimumElevation'];
  if (typeof minimum !== 'number' || !Number.isSafeInteger(minimum)) return undefined;
  const planes = (manifest.metadata['channels'] as Readonly<Record<string, { readonly planes?: number }>> | undefined)?.['terrainPlaneBlocked']?.planes;
  const planeMaximum = typeof planes === 'number' && Number.isSafeInteger(planes) && planes > 0 ? minimum + planes - 1 : minimum;
  return { minimum, maximum: Math.max(localMaximum, planeMaximum) };
}

/**
 * Builds the window from the resident chunks. Missing chunks read like the
 * whole-world adapter's unloaded cells: blocked, void medium, zero elsewhere.
 * Records (overrides, transitions, cell parts) come from resident chunks only.
 */
export function buildChunkTerrainWindow(source: ChunkWindowSource, rect: ChunkWindowRect,
  options: { readonly tilesets?: RuntimeTilesetResolver } = {}): ChunkTerrainWindow {
  const manifest = source.manifest;
  const bounds = chunkWindowTileBounds(rect, manifest.width, manifest.height);
  const originX = bounds.minX, originY = bounds.minY;
  const width = bounds.maxX - originX + 1, height = bounds.maxY - originY + 1, cells = width * height;
  if (!(width > 0 && height > 0)) throw new Error('invalid_chunk_window');
  const meta = (manifest.metadata['terrain'] ?? {}) as Readonly<Record<string, ChunkJson>>;
  const specifications = (manifest.metadata['channels'] ?? {}) as Readonly<Record<string, { readonly type: string; readonly planes: number }>>;
  const chunks: { cx: number; cy: number; chunk: WorldChunk }[] = [];
  const present = new Set<string>();
  for (let cy = rect.cy; cy < rect.cy + rect.rows; cy++) for (let cx = rect.cx; cx < rect.cx + rect.columns; cx++) {
    const chunk = source.peekChunk(cx, cy);
    if (chunk === undefined) continue;
    chunks.push({ cx, cy, chunk });
    present.add(`${cx}:${cy}`);
  }
  const channel = (name: string): ChunkArray | undefined => {
    const spec = specifications[name];
    if (spec === undefined) return undefined;
    const planes = spec.planes;
    const target = spec.type === 'i16' ? new Int16Array(cells * planes) : new Uint8Array(cells * planes);
    if (name === 'medium') target.fill(WORLD_CHUNK_VOID);
    else if (/blocked|PlaneBlocked/iu.test(name)) target.fill(1);
    for (const { cx, cy, chunk } of chunks) {
      const data = chunk.arrays[name];
      if (data === undefined || data.length !== planes * WORLD_CHUNK_STRIDE ** 2) throw new Error(`chunk_window_channel_mismatch:${name}`);
      const firstX = cx * WORLD_CHUNK_SIZE, firstY = cy * WORLD_CHUNK_SIZE;
      const columns = Math.min(WORLD_CHUNK_SIZE, bounds.maxX + 1 - firstX), rows = Math.min(WORLD_CHUNK_SIZE, bounds.maxY + 1 - firstY);
      for (let plane = 0; plane < planes; plane++) for (let y = 0; y < rows; y++) {
        // Skip the one-cell halo: local (x, y) is at (x + 1, y + 1) in the stride.
        const from = plane * WORLD_CHUNK_STRIDE ** 2 + (y + 1) * WORLD_CHUNK_STRIDE + 1;
        (target as Uint8Array).set((data as Uint8Array).subarray(from, from + columns), plane * cells + (firstY + y - originY) * width + firstX - originX);
      }
    }
    return target;
  };
  const u8 = (name: string): Uint8Array | undefined => channel(name) as Uint8Array | undefined;
  const required = <T extends ChunkArray>(name: string, value: ChunkArray | undefined, type: new (length: number) => T): T => {
    if (!(value instanceof type)) throw new Error(`chunk_window_missing_channel:${name}`);
    return value;
  };
  const booleans = (name: string): boolean[] => {
    const bytes = required(name, u8(name), Uint8Array);
    const result = new Array<boolean>(cells);
    for (let index = 0; index < cells; index++) result[index] = bytes[index] !== 0;
    return result;
  };
  const elevations = required('elevations', channel('elevations'), Int16Array);
  const optional: Record<string, unknown> = {};
  for (const name of ['cliffFamilies', 'surfaceFamilies', 'ledges', 'authoredFarmland', 'terrainPlaneBlocked'] as const) {
    const value = u8(name);
    if (value !== undefined) optional[name] = value;
  }
  const surfaces = u8('authoredSurfaces');
  if (surfaces !== undefined) {
    const palette = manifest.metadata['surfacePalette'] as readonly MapSurfaceKind[];
    optional['authoredSurfaces'] = Array.from(surfaces, (index) => palette[index]!);
  }
  const window = { width, height, originX, originY };
  if (meta['hasOverrides']) {
    const overrides = new Array<TerrainOverride | null>(cells).fill(null);
    for (const { chunk } of chunks) for (const record of chunkRecords(chunk).overrides) {
      const index = terrainIndexAt(window, record.tileX, record.tileY);
      if (index >= 0) overrides[index] = record.value;
    }
    optional['terrainOverrides'] = overrides;
  }
  if (meta['hasTransitions']) {
    optional['terrainTransitions'] = chunks.flatMap(({ chunk }) => chunkRecords(chunk).transitions)
      .sort((a, b) => a.ordinal - b.ordinal).map(({ value }) => value);
  }
  if (meta['hasCellParts']) {
    const parts = new Map<number, readonly CellPart[]>();
    for (const { cx, cy, chunk } of chunks) for (const [local, value] of Object.entries(chunk.cellParts ?? {})) {
      const offset = Number(local);
      const index = terrainIndexAt(window, cx * WORLD_CHUNK_SIZE + offset % WORLD_CHUNK_SIZE, cy * WORLD_CHUNK_SIZE + Math.floor(offset / WORLD_CHUNK_SIZE));
      if (index >= 0) parts.set(index, value as unknown as readonly CellPart[]);
    }
    optional['cellParts'] = parts;
  }
  for (const field of ['generator', 'defaultCliffFamily', 'defaultSurfaceFamily', 'cliffFamilyIds', 'projectionStyle', 'baseDatum',
    'fixedTerrainPlane', 'raisedTerrainCollisionClassified'] as const) {
    if (meta[field] !== undefined) optional[field] = meta[field];
  }
  let localMaximum = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < cells; index++) if (elevations[index]! > localMaximum) localMaximum = elevations[index]!;
  const elevationRange = mapElevationRange(manifest, localMaximum === Number.NEGATIVE_INFINITY ? 0 : localMaximum);
  const terrain = {
    spaceId: manifest.spaceId,
    seed: Number(meta['seed'] ?? 0),
    version: Number(meta['version'] ?? manifest.sourceRevision),
    width, height, originX, originY,
    worldWidth: manifest.width, worldHeight: manifest.height,
    ...optional,
    ...(elevationRange === undefined ? {} : { elevationRange }),
    ...(options.tilesets === undefined ? {} : { tilesets: options.tilesets }),
    biomes: required('biomes', u8('biomes'), Uint8Array),
    elevations,
    dirtCliffRoles: required('dirtCliffRoles', u8('dirtCliffRoles'), Uint8Array),
    dirtTerraces: required('dirtTerraces', u8('dirtTerraces'), Uint8Array),
    blocked: booleans('blocked'),
    horseJumpableTerrain: booleans('horseJumpableTerrain'),
  } as TerrainArray;
  return { terrain, rect, present, missing: rect.columns * rect.rows - present.size };
}

/** Tile regions whose window data changed, for GroundChunkCache.invalidateRegion. */
export type ChunkWindowInvalidation = TileBounds;
const EVERYTHING: ChunkWindowInvalidation = { minX: -Infinity, minY: -Infinity, maxX: Infinity, maxY: Infinity };

export interface ChunkWindowStore extends ChunkWindowSource {
  readonly installs: number;
}

/**
 * Keeps the current window for a store and a camera view and reports which
 * tiles changed. A rebuild happens when the store (revision) changes, when the
 * window moves, or when a window chunk that was missing has been installed.
 *
 * Invalidation: a cached ground chunk drawn from one window is still right in
 * the next if none of the tiles it reads changed. A tile's data changes only
 * when its terrain chunk becomes present or absent (same revision), so each
 * such chunk, grown by the margin, is reported; a new store reports everything.
 */
export class ChunkTerrainWindowTracker {
  #store: ChunkWindowStore | undefined;
  #window: ChunkTerrainWindow | undefined;
  #installs = -1;
  #tilesets: RuntimeTilesetResolver | undefined;
  #pending: ChunkWindowInvalidation[] = [];
  #builds = 0;
  lastBuildMs = 0;
  constructor(readonly margin = CHUNK_WINDOW_MARGIN_TILES) {}
  get window(): ChunkTerrainWindow | undefined { return this.#window; }
  get builds(): number { return this.#builds; }
  /** Rect for a view against the current window (hysteresis), without building. */
  rectFor(store: ChunkWindowStore, view: TileBounds): ChunkWindowRect {
    const previous = store === this.#store ? this.#window?.rect : undefined;
    return chunkWindowForView(view, store.manifest.width, store.manifest.height, previous, this.margin);
  }
  update(store: ChunkWindowStore, rect: ChunkWindowRect, tilesets?: RuntimeTilesetResolver): ChunkTerrainWindow {
    const current = this.#window;
    const sameStore = store === this.#store && tilesets === this.#tilesets;
    const sameRect = current !== undefined && chunkWindowKey(current.rect) === chunkWindowKey(rect);
    const arrived = sameStore && sameRect && current.missing > 0 && store.installs !== this.#installs
      && [...windowChunks(rect)].some(([cx, cy]) => !current.present.has(`${cx}:${cy}`) && store.peekChunk(cx, cy) !== undefined);
    if (current !== undefined && sameStore && sameRect && !arrived) {
      this.#installs = store.installs;
      return current;
    }
    const startedAt = performance.now();
    const next = buildChunkTerrainWindow(store, rect, tilesets === undefined ? {} : { tilesets });
    this.lastBuildMs = performance.now() - startedAt;
    this.#builds++;
    if (!sameStore || current === undefined) this.#pending = [EVERYTHING];
    else if (this.#pending[0] !== EVERYTHING) {
      for (const key of new Set([...current.present, ...next.present])) {
        if (current.present.has(key) === next.present.has(key)) continue;
        const [cx, cy] = key.split(':').map(Number) as [number, number];
        this.#pending.push({ minX: cx * WORLD_CHUNK_SIZE - this.margin, minY: cy * WORLD_CHUNK_SIZE - this.margin,
          maxX: (cx + 1) * WORLD_CHUNK_SIZE - 1 + this.margin, maxY: (cy + 1) * WORLD_CHUNK_SIZE - 1 + this.margin });
      }
    }
    this.#store = store; this.#tilesets = tilesets; this.#window = next; this.#installs = store.installs;
    return next;
  }
  /** Hands over (and forgets) the regions changed since the last drain. */
  drainInvalidations(visit: (region: ChunkWindowInvalidation) => void): void {
    const pending = this.#pending;
    this.#pending = [];
    for (const region of pending) visit(region);
  }
  /** Leaves chunk mode: the next window is a fresh start (and clears everything). */
  reset(): void {
    if (this.#window !== undefined) this.#pending = [EVERYTHING];
    this.#store = undefined; this.#window = undefined; this.#installs = -1; this.#tilesets = undefined;
  }
}

function* windowChunks(rect: ChunkWindowRect): Generator<readonly [number, number]> {
  for (let cy = rect.cy; cy < rect.cy + rect.rows; cy++) for (let cx = rect.cx; cx < rect.cx + rect.columns; cx++) yield [cx, cy];
}

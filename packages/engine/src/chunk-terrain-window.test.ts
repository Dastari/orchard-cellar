import { describe, expect, it } from 'vitest';
import { applyMapEdit, createEmptyMapDocument, SURVIVAL_BIOMES, type MapCellPatch, type MapDocumentV2, type MapEditCommand } from '@orchard/sim';
import { canonicalChunkJson, decodeWorldChunk, encodeWorldChunk, sliceWorldChunkChannel, type ChunkArray, type WorldChunk, type WorldChunkManifest, type WorldChunkRecord } from '@orchard/sim/world-chunk';
import {
  buildChunkTerrainWindow, CHUNK_WINDOW_MARGIN_TILES, chunkWindowForView, chunkWindowPinBounds, chunkWindowTileBounds,
  chunkWindowTileReuse, ChunkTerrainWindowTracker, type ChunkTerrainWindow, type ChunkWindowStore,
} from './chunk-terrain-window.js';
import { prepareLightTerrainOcclusion, type PreparedLightTerrainOcclusion } from './light-occlusion.js';
import { terrainArrayForMapDocument } from './editor-terrain.js';
import { GroundChunkCache } from './ground-cache.js';
import {
  plateauLayerPlansAt, terrainBiomeAt, terrainContourBoundaryBetween, terrainElevationAt, terrainMinimumElevation, terrainPlaneCollisionCellAt, type TerrainArray,
} from './terrain.js';
import { terrainIndexAt, terrainIsWindow, terrainSparseKey, terrainSparseKeyTile } from './terrain-index.js';
import { recordGroundDrawList, recordingArt, recordingCanvasFactory, recordingGroundCache } from './testing/draw-list-recorder.js';

function paint(document: MapDocumentV2, points: readonly { tileX: number; tileY: number }[], patch: MapCellPatch): MapDocumentV2 {
  return applyMapEdit(document, { kind: 'paint', points, patch } as MapEditCommand).document;
}
function area(x0: number, y0: number, x1: number, y1: number): { tileX: number; tileY: number }[] {
  const points: { tileX: number; tileY: number }[] = [];
  for (let tileY = y0; tileY <= y1; tileY += 1) for (let tileX = x0; tileX <= x1; tileX += 1) points.push({ tileX, tileY });
  return points;
}

/** A 6 x 6 chunk authored map whose features cross chunk edges. */
function authoredMap(): TerrainArray {
  let document = createEmptyMapDocument({ id: 'chunk-window', title: 'Window', width: 384, height: 384 });
  document = paint(document, area(100, 90, 150, 140), { elevation: 1 });
  document = paint(document, area(115, 100, 135, 125), { elevation: 2 });
  document = paint(document, area(190, 180, 260, 200), { elevation: 1, cliffFamily: 'cave' });
  document = paint(document, area(60, 200, 140, 230), { surface: 'water' });
  document = paint(document, area(150, 240, 200, 250), { surface: 'sand' });
  document = paint(document, area(200, 60, 280, 64), { feature: 'path' });
  document = paint(document, area(250, 250, 270, 270), { feature: 'farmland' });
  document = paint(document, area(300, 300, 340, 330), { surfaceFamily: 'grass_2' });
  document = paint(document, area(320, 100, 330, 102), { ledge: true });
  document = paint(document, area(340, 340, 383, 383), { elevation: 1 });
  document = paint(document, [{ tileX: 130, tileY: 180 }], { cellPart: { slot: 'path', exact: { frame: 12 } } });
  document = paint(document, [{ tileX: 101, tileY: 141 }], { terrainOverride: { contourLevel: 1, frameIndex: 7, family: 'stone_1' } });
  document = { ...document, stairRuns: [{ x: 126, y: 141, direction: 'up', fromLevel: 0, toLevel: 1, width: 2 }] } as MapDocumentV2;
  return terrainArrayForMapDocument(document);
}

/** Cuts a whole terrain into decoded chunks and a manifest, like the materializer. */
function chunked(terrain: TerrainArray): { manifest: WorldChunkManifest; chunks: Map<string, WorldChunk> } {
  const { width, height } = terrain;
  const channels: Record<string, ChunkArray> = {};
  for (const field of ['biomes', 'elevations', 'dirtCliffRoles', 'dirtTerraces', 'cliffFamilies', 'surfaceFamilies', 'ledges', 'authoredFarmland', 'terrainPlaneBlocked'] as const) {
    const value = terrain[field];
    if (value !== undefined) channels[field] = value;
  }
  channels['blocked'] = Uint8Array.from(terrain.blocked, Number);
  channels['horseJumpableTerrain'] = Uint8Array.from(terrain.horseJumpableTerrain, Number);
  channels['medium'] = new Uint8Array(width * height);
  channels['solidBlocked'] = new Uint8Array(width * height);
  const records: WorldChunkRecord[] = [];
  terrain.terrainOverrides?.forEach((value, index) => {
    if (value !== null) records.push({ kind: 'terrainOverride', ordinal: index, tileX: index % width, tileY: Math.floor(index / width), value: JSON.parse(JSON.stringify(value)) });
  });
  terrain.terrainTransitions?.forEach((value, index) => records.push({ kind: 'transition', ordinal: index, tileX: value.lowerTileX, tileY: value.lowerTileY, value: JSON.parse(JSON.stringify(value)) }));
  const chunks = new Map<string, WorldChunk>();
  const heads: WorldChunkManifest['chunks'][number][] = [];
  for (let cy = 0; cy < height / 64; cy++) for (let cx = 0; cx < width / 64; cx++) {
    const cellParts: Record<string, never> = {};
    for (const [index, parts] of terrain.cellParts ?? []) {
      const x = index % width, y = Math.floor(index / width);
      if (Math.floor(x / 64) === cx && Math.floor(y / 64) === cy) cellParts[String((y % 64) * 64 + x % 64)] = JSON.parse(JSON.stringify(parts)) as never;
    }
    const bytes = encodeWorldChunk({ schema: 1, mediumSchema: 1, spaceId: 0, cx, cy, assetRevision: 'a',
      arrays: Object.fromEntries(Object.entries(channels).map(([name, value]) => [name, sliceWorldChunkChannel(value, width, height, cx, cy, /blocked/iu.test(name) ? 1 : name === 'medium' ? 5 : 0)])),
      records: records.filter((record) => Math.floor(record.tileX / 64) === cx && Math.floor(record.tileY / 64) === cy),
      assetIds: [], atlasPackIds: [], ...(Object.keys(cellParts).length > 0 ? { cellParts } : {}) });
    const chunk = decodeWorldChunk(bytes);
    chunks.set(`${cx}:${cy}`, chunk);
    heads.push({ cx, cy, contentHash: chunk.contentHash, byteLength: bytes.length });
  }
  const meta: Record<string, unknown> = { hasCellParts: terrain.cellParts !== undefined, hasTransitions: terrain.terrainTransitions !== undefined,
    hasOverrides: terrain.terrainOverrides !== undefined };
  for (const field of ['seed', 'version', 'generator', 'defaultCliffFamily', 'defaultSurfaceFamily', 'cliffFamilyIds', 'projectionStyle', 'baseDatum',
    'fixedTerrainPlane', 'raisedTerrainCollisionClassified'] as const) if (terrain[field] !== undefined) meta[field] = terrain[field];
  const manifest = { schema: 1, chunkSize: 64, spaceId: 0, width, height, assetRevision: 'a', sourceRevision: 1, sourceHash: 'map',
    metadata: JSON.parse(JSON.stringify({ terrain: meta,
      collisions: { clientGround: { terrainMinimumElevation: terrainMinimumElevation(terrain) } },
      channels: Object.fromEntries(Object.entries(channels).map(([name, value]) => [name, { type: value instanceof Int16Array ? 'i16' : 'u8', planes: value.length / (width * height) }])),
    })), chunks: heads } as WorldChunkManifest;
  return { manifest, chunks };
}

function source(manifest: WorldChunkManifest, chunks: ReadonlyMap<string, WorldChunk>, withheld = new Set<string>()): ChunkWindowStore & { installs: number } {
  const store = { manifest, installs: 0, peekChunk: (cx: number, cy: number) => withheld.has(`${cx}:${cy}`) ? undefined : chunks.get(`${cx}:${cy}`) };
  return store;
}

describe('chunk render window (static world S4c)', () => {
  const legacy = authoredMap();
  const { manifest, chunks } = chunked(legacy);

  it('chooses a 5 x 5 window around the view, clamped to the map, with hysteresis and a capped pin', () => {
    const rect = chunkWindowForView({ minX: 200, minY: 200, maxX: 240, maxY: 222 }, 384, 384);
    expect(rect).toEqual({ cx: 1, cy: 1, columns: 5, rows: 5 });
    expect(chunkWindowForView({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, 384, 384)).toEqual({ cx: 0, cy: 0, columns: 5, rows: 5 });
    expect(chunkWindowForView({ minX: 370, minY: 370, maxX: 400, maxY: 400 }, 384, 384)).toEqual({ cx: 1, cy: 1, columns: 5, rows: 5 });
    // Kept while the view plus the margin fits; recentred once it does not.
    const kept = chunkWindowForView({ minX: 120, minY: 200, maxX: 160, maxY: 222 }, 832, 832, { cx: 0, cy: 1, columns: 5, rows: 5 });
    expect(kept).toEqual({ cx: 0, cy: 1, columns: 5, rows: 5 });
    const moved = chunkWindowForView({ minX: 280, minY: 200, maxX: 320, maxY: 222 }, 832, 832, kept);
    expect(moved).toEqual({ cx: 2, cy: 1, columns: 5, rows: 5 });
    // A huge view is capped at 5 x 5 (never throws, never pins more than 25 chunks).
    expect(chunkWindowForView({ minX: -1000, minY: -1000, maxX: 5000, maxY: 5000 }, 832, 832)).toEqual({ cx: 8, cy: 8, columns: 5, rows: 5 });
    expect(chunkWindowForView({ minX: Number.NaN, minY: 0, maxX: 1, maxY: 1 }, 832, 832)).toEqual({ cx: 0, cy: 0, columns: 5, rows: 5 });
    // Small maps: the window is the map.
    expect(chunkWindowForView({ minX: 0, minY: 0, maxX: 10, maxY: 10 }, 100, 70)).toEqual({ cx: 0, cy: 0, columns: 2, rows: 2 });
    // pinView adds one ring: pinning the inner 3 x 3 pins exactly the window.
    expect(chunkWindowPinBounds({ cx: 2, cy: 1, columns: 5, rows: 5 })).toEqual([192, 128, 383, 319]);
    expect(chunkWindowPinBounds({ cx: 0, cy: 0, columns: 2, rows: 2 })).toEqual([0, 0, 127, 127]);
    expect(chunkWindowTileBounds({ cx: 12, cy: 12, columns: 1, rows: 1 }, 832, 800)).toEqual({ minX: 768, minY: 768, maxX: 831, maxY: 799 });
  });

  it('packs window sparse keys without aliasing and keeps the whole-map key unchanged', () => {
    const whole = { width: 10, height: 10 };
    expect(terrainSparseKey(whole, 3, 2)).toBe(23);
    expect(terrainSparseKey(whole, -1, 3)).toBe(29); // historical alias of (9, 2)
    expect(terrainSparseKeyTile(whole, 23)).toEqual({ tileX: 3, tileY: 2 });
    const window = { width: 10, height: 10, originX: 640, originY: 0 };
    expect(terrainIsWindow(window)).toBe(true);
    expect(terrainIsWindow({ width: 1, height: 1, originX: 0, originY: 0 })).toBe(true);
    expect(terrainSparseKey(window, 639, 3)).not.toBe(terrainSparseKey(window, 649, 2));
    for (const [x, y] of [[640, 0], [639, 3], [-5, -7], [831, 831]] as const) expect(terrainSparseKeyTile(window, terrainSparseKey(window, x, y))).toEqual({ tileX: x, tileY: y });
  });

  it('matches the whole map cell for cell and resolver for resolver at a non-zero origin', () => {
    const rect = { cx: 1, cy: 1, columns: 5, rows: 5 };
    const { terrain, missing, present } = buildChunkTerrainWindow(source(manifest, chunks), rect, legacy.tilesets === undefined ? {} : { tilesets: legacy.tilesets });
    expect(missing).toBe(0);
    expect(present.size).toBe(25);
    expect([terrain.originX, terrain.originY, terrain.width, terrain.height, terrain.worldWidth, terrain.worldHeight]).toEqual([64, 64, 320, 320, 384, 384]);
    for (let y = 64; y < 384; y++) for (let x = 64; x < 384; x++) {
      const at = terrainIndexAt(legacy, x, y), local = terrainIndexAt(terrain, x, y);
      if (terrain.elevations[local] !== legacy.elevations[at] || terrain.biomes[local] !== legacy.biomes[at] || terrain.blocked[local] !== legacy.blocked[at]
        || terrain.surfaceFamilies?.[local] !== legacy.surfaceFamilies?.[at] || terrain.ledges?.[local] !== legacy.ledges?.[at]
        || terrain.authoredFarmland?.[local] !== legacy.authoredFarmland?.[at] || terrain.cliffFamilies?.[local] !== legacy.cliffFamilies?.[at]
        // Chunk records carry canonical (sorted-key) JSON.
        || canonicalChunkJson(terrain.terrainOverrides?.[local] ?? null) !== canonicalChunkJson(legacy.terrainOverrides?.[at] ?? null)
        || canonicalChunkJson(terrain.cellParts?.get(local) ?? null) !== canonicalChunkJson(legacy.cellParts?.get(at) ?? null)) throw new Error(`cell ${x},${y}`);
    }
    expect(legacy.terrainTransitions?.length).toBeGreaterThan(0);
    expect(terrain.terrainTransitions).toEqual(legacy.terrainTransitions);
    expect(terrain.cellParts?.size).toBe(1);
    for (let y = 72; y < 376; y += 2) for (let x = 72; x < 376; x += 2) {
      expect(terrainElevationAt(terrain, x, y)).toBe(terrainElevationAt(legacy, x, y));
      expect(terrainBiomeAt(terrain, x, y)).toBe(terrainBiomeAt(legacy, x, y));
      expect(terrainPlaneCollisionCellAt(terrain, x, y, 1)).toBe(terrainPlaneCollisionCellAt(legacy, x, y, 1));
      expect(JSON.stringify(plateauLayerPlansAt(terrain, x, y))).toBe(JSON.stringify(plateauLayerPlansAt(legacy, x, y)));
    }
    // The walking-step check translates the step and transitions into the window.
    for (const transition of legacy.terrainTransitions ?? []) {
      for (const [dx, dy] of [[0, -1], [0, 1], [1, 0], [-1, 0]] as const) {
        const from = [transition.lowerTileX, transition.lowerTileY] as const, to = [transition.lowerTileX + dx, transition.lowerTileY + dy] as const;
        expect(terrainContourBoundaryBetween(terrain, ...from, ...to)).toBe(terrainContourBoundaryBetween(legacy, ...from, ...to));
        const upper = [transition.upperTileX, transition.upperTileY] as const;
        expect(terrainContourBoundaryBetween(terrain, ...upper, ...from)).toBe(terrainContourBoundaryBetween(legacy, ...upper, ...from));
      }
    }
    // Outside the window: blocked and flat, like any off-map tile.
    expect(terrainIndexAt(terrain, 63, 100)).toBe(-1);
    expect(terrainElevationAt(terrain, 63, 100)).toBe(0);
  });

  it('draws the same ground and raised-terrain lists as the whole map for views inside the window', () => {
    const art = recordingArt();
    const { terrain } = buildChunkTerrainWindow(source(manifest, chunks), { cx: 1, cy: 1, columns: 5, rows: 5 }, legacy.tilesets === undefined ? {} : { tilesets: legacy.tilesets });
    for (const [x, y] of [[125, 120], [225, 190], [128, 145], [260, 262], [330, 330], [360, 370]] as const) {
      const view = { cameraX: x * 16 - 320, cameraY: y * 16 - 180, width: 640, height: 360 };
      expect(recordGroundDrawList(terrain, recordingGroundCache().cache, art, view).digest, `${x},${y}`)
        .toBe(recordGroundDrawList(legacy, recordingGroundCache().cache, art, view).digest);
    }
  });

  it('fills missing chunks as blocked void and rebuilds when they arrive, invalidating only their neighbourhood', () => {
    const withheld = new Set(['3:3']);
    const store = source(manifest, chunks, withheld);
    const tracker = new ChunkTerrainWindowTracker();
    const rect = { cx: 1, cy: 1, columns: 5, rows: 5 };
    const first = tracker.update(store, rect);
    expect(first.missing).toBe(1);
    expect(first.terrain.blocked[terrainIndexAt(first.terrain, 200, 200)]).toBe(true);
    expect(first.terrain.terrainPlaneBlocked?.[terrainIndexAt(first.terrain, 200, 200)]).toBe(1);
    const regions: unknown[] = [];
    tracker.drainInvalidations((region) => regions.push(region));
    expect(regions).toEqual([{ minX: -Infinity, minY: -Infinity, maxX: Infinity, maxY: Infinity }]);
    // Nothing changed: no rebuild, no invalidation.
    expect(tracker.update(store, rect)).toBe(first);
    store.installs += 1; // some chunk outside the window
    expect(tracker.update(store, rect)).toBe(first);
    withheld.clear(); store.installs += 1;
    const second = tracker.update(store, rect);
    expect(second).not.toBe(first);
    expect(second.missing).toBe(0);
    regions.length = 0;
    tracker.drainInvalidations((region) => regions.push(region));
    const margin = CHUNK_WINDOW_MARGIN_TILES;
    expect(regions).toEqual([{ minX: 192 - margin, minY: 192 - margin, maxX: 255 + margin, maxY: 255 + margin }]);
    // Moving the window reports the chunks that left and arrived.
    const moved = tracker.update(store, { cx: 0, cy: 1, columns: 5, rows: 5 });
    expect(moved.terrain.originX).toBe(0);
    regions.length = 0;
    tracker.drainInvalidations((region) => regions.push(region));
    expect(regions).toHaveLength(10);
    // A new store (revision swap) invalidates everything.
    tracker.update(source(manifest, chunks), rect);
    regions.length = 0;
    tracker.drainInvalidations((region) => regions.push(region));
    expect(regions).toEqual([{ minX: -Infinity, minY: -Infinity, maxX: Infinity, maxY: Infinity }]);
  });

  it('keeps the fixed-plane border on the map edge, not the window edge', () => {
    const cells = 20 * 10;
    const fixed = (originX?: number): TerrainArray => ({
      spaceId: 5, seed: 1, version: 1, width: 20, height: 10, projectionStyle: 'interior', baseDatum: 0, fixedTerrainPlane: 0,
      ...(originX === undefined ? {} : { originX, originY: 0, worldWidth: 60, worldHeight: 10 }),
      biomes: new Uint8Array(cells), blocked: Array<boolean>(cells).fill(false), horseJumpableTerrain: Array<boolean>(cells).fill(false),
      elevations: new Int16Array(cells), dirtCliffRoles: new Uint8Array(cells), dirtTerraces: new Uint8Array(cells),
    });
    const whole = fixed();
    expect(terrainPlaneCollisionCellAt(whole, 0, 5, 0)).toBe('blocked');
    expect(terrainPlaneCollisionCellAt(whole, 19, 5, 0)).toBe('blocked');
    expect(terrainPlaneCollisionCellAt(whole, 1, 5, 0)).toBe('open');
    const middle = fixed(20); // world tiles 20..39 of a 60-wide map
    expect(terrainPlaneCollisionCellAt(middle, 20, 5, 0)).toBe('open');
    expect(terrainPlaneCollisionCellAt(middle, 39, 5, 0)).toBe('open');
    expect(terrainPlaneCollisionCellAt(middle, 30, 0, 0)).toBe('blocked');
    const east = fixed(40); // world tiles 40..59: its last column is the map border
    expect(terrainPlaneCollisionCellAt(east, 59, 5, 0)).toBe('blocked');
    expect(terrainPlaneCollisionCellAt(east, 58, 5, 0)).toBe('open');
  });

  it('GroundChunkCache.invalidateRegion drops only the ground chunks that draw the region', () => {
    const factory = recordingCanvasFactory();
    const cache = new GroundChunkCache(512, factory.create);
    const art = recordingArt();
    const view = { cameraX: 64 * 16, cameraY: 64 * 16, width: 64 * 16, height: 48 * 16 };
    recordGroundDrawList(legacy, cache, art, view);
    const resident = cache.residentCount;
    expect(resident).toBe(5 * 4); // ground chunks 4..8 x 4..7 intersect the view
    expect(cache.invalidateRegion(64, 64, 79, 79)).toBe(1);
    expect(cache.invalidateRegion(80, 80, 95, 95)).toBe(1);
    expect(cache.invalidateRegion(0, 0, 63, 63)).toBe(0);
    expect(cache.invalidateRegion(10, 10, 5, 5)).toBe(0);
    expect(cache.residentCount).toBe(resident - 2);
    expect(cache.invalidateRegion(-Infinity, -Infinity, Infinity, Infinity)).toBe(resident - 2);
    expect(cache.residentCount).toBe(0);
  });
});

describe('chunk window reuse (static world S4f)', () => {
  // Raised tiles marked ridge, as the island's classified contours are: they block light and cast occluders.
  const authored = authoredMap(), ridge = SURVIVAL_BIOMES.indexOf('ridge');
  const legacy: TerrainArray = { ...authored, biomes: authored.biomes.map((biome, index) => authored.elevations[index]! > 0 ? ridge : biome) };
  const { manifest, chunks } = chunked(legacy);
  const build = (cx: number, cy: number, size = 3, withheld = new Set<string>()): ChunkTerrainWindow =>
    buildChunkTerrainWindow(source(manifest, chunks, withheld), { cx, cy, columns: size, rows: size });
  const same = (a: PreparedLightTerrainOcclusion, b: PreparedLightTerrainOcclusion): boolean =>
    canonicalChunkJson({ ...a, terrainOccluders: a.terrainOccluders?.map(({ opaque, ...rest }) => ({ ...rest, opaque: Array.from(opaque) })) })
      === canonicalChunkJson({ ...b, terrainOccluders: b.terrainOccluders?.map(({ opaque, ...rest }) => ({ ...rest, opaque: Array.from(opaque) })) });

  it('reuses exactly the tiles whose radius box reads the same chunks in both windows', () => {
    const previous = build(1, 1), next = build(2, 1);
    const reuse = chunkWindowTileReuse(previous, next)!;
    const r = CHUNK_WINDOW_MARGIN_TILES;
    // Shared chunks 2..3 (x 128..255): reusable from 128 + r to 255 - r; rows keep the same top and bottom edges.
    expect(reuse.reusable(128 + r, 100)).toBe(true);
    expect(reuse.reusable(128 + r - 1, 100)).toBe(false);
    expect(reuse.reusable(255 - r, 100)).toBe(true);
    expect(reuse.reusable(256 - r, 100)).toBe(false);
    expect(reuse.reusable(200, 64)).toBe(true); // the top edge is the same edge in both windows
    // Runs agree with the predicate tile for tile.
    for (const tileY of [64, 100, 191]) {
      const runs = reuse.reusableRuns(tileY, 128, 256);
      for (let tileX = 128; tileX < 256; tileX++) {
        expect(runs.some(([start, end]) => tileX >= start && tileX < end), `${tileX},${tileY}`).toBe(reuse.reusable(tileX, tileY));
      }
    }
    // A chunk missing in one window only is not the same data.
    const withheld = chunkWindowTileReuse(previous, build(2, 1, 3, new Set(['2:2'])))!;
    expect(withheld.reusable(200, 100)).toBe(false);
    expect(withheld.reusable(200, 224)).toBe(true); // its box ends in row 3, clear of the missing chunk
    // Another manifest (revision) or tileset resolver: nothing is reused.
    expect(chunkWindowTileReuse(previous, buildChunkTerrainWindow(source({ ...manifest }, chunks), { cx: 2, cy: 1, columns: 3, rows: 3 }))).toBeUndefined();
    expect(() => chunkWindowTileReuse(previous, next, 33)).toThrow('invalid_chunk_reuse_radius');
  });

  it('prepares light identically with reuse, across moves, jumps and missing chunks', () => {
    const windows = [build(0, 0), build(1, 0), build(1, 1), build(2, 1), build(3, 3), build(2, 3), build(0, 3), build(1, 2, 3, new Set(['2:3'])),
      build(1, 2), build(0, 0, 5), build(1, 1, 5), build(1, 0, 5, new Set(['1:1'])), build(1, 1, 4)];
    let previous: ChunkTerrainWindow | undefined, prepared: PreparedLightTerrainOcclusion | undefined, reusedTiles = 0, occluders = 0;
    for (const window of windows) {
      const full = prepareLightTerrainOcclusion(build(window.rect.cx, window.rect.cy, window.rect.columns,
        new Set([...Array.from({ length: window.rect.columns * window.rect.rows }, (_, index) =>
          `${window.rect.cx + index % window.rect.columns}:${window.rect.cy + Math.floor(index / window.rect.columns)}`)].filter(key => !window.present.has(key)))).terrain);
      const reuse = previous === undefined ? undefined : chunkWindowTileReuse(previous, window);
      const incremental = prepareLightTerrainOcclusion(window.terrain, undefined,
        prepared === undefined || reuse === undefined ? undefined : { prepared, reusableRuns: reuse.reusableRuns });
      expect(same(incremental, full), `window ${window.rect.cx}:${window.rect.cy}`).toBe(true);
      if (reuse !== undefined) for (let tileY = window.terrain.originY!; tileY < window.terrain.originY! + window.terrain.height; tileY++) {
        for (const [start, end] of reuse.reusableRuns(tileY, window.terrain.originX!, window.terrain.originX! + window.terrain.width)) reusedTiles += end - start;
      }
      occluders += full.terrainOccluders?.length ?? 0;
      previous = window; prepared = incremental;
    }
    expect(reusedTiles, 'tiles were actually reused').toBeGreaterThan(10_000);
    expect(occluders, 'the map has raised-terrain occluders').toBeGreaterThan(100);
    // Non-vacuous: claiming every tile reusable after a chunk arrives gives a different answer.
    const from = build(1, 1, 3, new Set(['2:2'])), to = build(1, 1);
    expect(chunkWindowTileReuse(from, to)!.reusable(160, 160)).toBe(false);
    const wrong = prepareLightTerrainOcclusion(to.terrain, undefined, { prepared: prepareLightTerrainOcclusion(from.terrain),
      reusableRuns: (_tileY, minX, maxX) => [[minX, maxX]] });
    expect(same(wrong, prepareLightTerrainOcclusion(build(1, 1).terrain))).toBe(false);
  });

  it('adopts a window built ahead of time exactly as if update() had built it', () => {
    const store = source(manifest, chunks);
    const direct = new ChunkTerrainWindowTracker(), staged = new ChunkTerrainWindowTracker();
    const first = { cx: 0, cy: 0, columns: 5, rows: 5 }, second = { cx: 1, cy: 1, columns: 5, rows: 5 };
    direct.update(store, first); staged.update(store, first);
    const drain = (tracker: ChunkTerrainWindowTracker) => { const regions: unknown[] = []; tracker.drainInvalidations((region) => regions.push(region)); return regions; };
    drain(direct); drain(staged);
    const built = direct.update(store, second);
    const adopted = staged.adopt(store, buildChunkTerrainWindow(store, second), undefined, store.installs);
    expect(adopted.rect).toEqual(built.rect);
    expect(drain(staged)).toEqual(drain(direct));
    expect(staged.builds).toBe(direct.builds);
    // The same window stays served until something changes.
    expect(staged.update(store, second)).toBe(adopted);
    // Built before a chunk arrived: the arrival still rebuilds.
    const withheld = new Set(['2:2']), partial = source(manifest, chunks, withheld);
    const late = new ChunkTerrainWindowTracker();
    const early = late.adopt(partial, buildChunkTerrainWindow(partial, second), undefined, partial.installs);
    withheld.clear(); partial.installs += 1;
    expect(late.update(partial, second)).not.toBe(early);
    expect(() => late.adopt(source({ ...manifest }, chunks), early, undefined, 0)).toThrow('chunk_window_store_mismatch');
  });
});

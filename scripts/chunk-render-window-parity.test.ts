import { beforeAll, describe, expect, it } from 'vitest';
import { activeSurvivalLandmarks, bootstrapContentRegistry, createLiveIslandMapDocument, LIVE_ISLAND_MAP_ID, serializeMapDocumentV3, TOPSIDE_SPACE_ID } from '@orchard/sim';
import { WORLD_CHUNK_SIZE } from '@orchard/sim/world-chunk';
import { BoundedChunkTerrainStore } from '@orchard/engine/bounded-chunk-terrain-store';
import {
  buildChunkTerrainWindow, CHUNK_WINDOW_MARGIN_TILES, chunkWindowForView, chunkWindowPinBounds, chunkWindowTileBounds,
  ChunkTerrainWindowTracker, type ChunkWindowRect, type TileBounds,
} from '@orchard/engine/chunk-terrain-window';
import { plateauLayerPlansAt, terrainElevationAt, terrainMaximumElevation, terrainMinimumElevation, terrainPlaneCollisionCellAt,
  terrainProjectedElevationAtFoot, type TerrainArray } from '@orchard/engine/terrain';
import { terrainIndexAt } from '@orchard/engine/terrain-index';
import { recordGroundDrawList, recordingArt, recordingGroundCache, type RecordedView } from '@orchard/engine/testing/draw-list-recorder';
import { captureWorldChunkSnapshot, materializeWorldChunks, type MaterializedWorldChunks } from './materialize-world-chunks.js';

// Static world S4c: the client's chunk render window, built from the published
// bootstrap chunks at a non-zero origin, must draw exactly what the whole
// legacy map draws for the same world tiles. Nightly (captures the bootstrap
// island like world-chunk-parity.test.ts).

/** A 3840 x 2160 CSS screen at the minimum zoom of 2: 120 x 68 tiles. */
const LARGE_VIEW = { width: 1920, height: 1080 } as const;
/** A 1280 x 720 CSS screen at zoom 2. */
const SMALL_VIEW = { width: 640, height: 360 } as const;

function cameraAt(centerTileX: number, centerTileY: number, size: { readonly width: number; readonly height: number }): RecordedView {
  return { cameraX: centerTileX * 16 + 8 - size.width / 2, cameraY: centerTileY * 16 + 8 - size.height / 2, ...size };
}
function viewTiles(view: RecordedView): TileBounds {
  return { minX: Math.floor(view.cameraX / 16), minY: Math.floor(view.cameraY / 16),
    maxX: Math.ceil((view.cameraX + view.width) / 16), maxY: Math.ceil((view.cameraY + view.height) / 16) };
}

describe('chunk render window parity with the whole map (static world S4c)', () => {
  let legacy: TerrainArray;
  let published: MaterializedWorldChunks;
  let blobs: Map<string, Uint8Array>;
  beforeAll(() => {
    const registry = bootstrapContentRegistry();
    const document = createLiveIslandMapDocument({ landmarks: activeSurvivalLandmarks(registry, TOPSIDE_SPACE_ID) });
    const row = { mapId: LIVE_ISLAND_MAP_ID, revision: document.revision, contentHash: 'bootstrap-golden', documentJson: serializeMapDocumentV3(document) };
    const snapshot = captureWorldChunkSnapshot(row, registry);
    legacy = snapshot.terrain;
    published = materializeWorldChunks(snapshot, row, registry);
    blobs = new Map(published.manifest.chunks.map((head, index) => [`${head.cx}:${head.cy}`, published.blobs[index]!]));
  }, 180_000);

  /** Pins the window's chunks and installs them, like the loader. */
  function load(store: BoundedChunkTerrainStore, rect: ChunkWindowRect): void {
    store.pinView(...chunkWindowPinBounds(rect));
    for (const key of store.pinnedKeys) {
      const [cx, cy] = key.split(':').map(Number) as [number, number];
      store.install(blobs.get(key)!, cx, cy);
    }
  }

  it('pins exactly the window, at most 25 chunks, for any view (never over budget)', () => {
    const store = new BoundedChunkTerrainStore(published.manifest);
    const { width, height } = published.manifest;
    for (const view of [
      { minX: 0, minY: 0, maxX: 0, maxY: 0 },
      { minX: -500, minY: -500, maxX: 5000, maxY: 5000 }, // a 16K ultrawide at zoom 1: capped
      { minX: 700, minY: 20, maxX: 900, maxY: 60 },
      { minX: 300, minY: 400, maxX: 420, maxY: 468 },
    ]) {
      const rect = chunkWindowForView(view, width, height);
      expect(rect.columns * rect.rows).toBe(25);
      expect(() => store.pinView(...chunkWindowPinBounds(rect))).not.toThrow();
      const expected: string[] = [];
      for (let cy = rect.cy; cy < rect.cy + rect.rows; cy++) for (let cx = rect.cx; cx < rect.cx + rect.columns; cx++) expected.push(`${cx}:${cy}`);
      expect([...store.pinnedKeys].sort()).toEqual(expected.sort());
    }
  });

  it('reproduces every whole-map terrain channel inside the window', () => {
    const store = new BoundedChunkTerrainStore(published.manifest);
    const rect: ChunkWindowRect = { cx: 4, cy: 3, columns: 5, rows: 5 };
    load(store, rect);
    const { terrain, missing } = buildChunkTerrainWindow(store, rect, legacy.tilesets === undefined ? {} : { tilesets: legacy.tilesets });
    expect(missing).toBe(0);
    expect([terrain.originX, terrain.originY, terrain.width, terrain.height]).toEqual([256, 192, 320, 320]);
    expect(terrainMinimumElevation(terrain)).toBe(terrainMinimumElevation(legacy));
    expect(terrainMaximumElevation(terrain)).toBe(terrainMaximumElevation(legacy));
    const bounds = chunkWindowTileBounds(rect, legacy.width, legacy.height);
    const legacyPlanes = legacy.terrainPlaneBlocked!, windowPlanes = terrain.terrainPlaneBlocked!;
    const planes = legacyPlanes.length / (legacy.width * legacy.height);
    expect(windowPlanes.length / (terrain.width * terrain.height)).toBe(planes);
    for (let y = bounds.minY; y <= bounds.maxY; y++) for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const at = terrainIndexAt(legacy, x, y), local = terrainIndexAt(terrain, x, y);
      if (terrain.biomes[local] !== legacy.biomes[at] || terrain.elevations[local] !== legacy.elevations[at]
        || terrain.blocked[local] !== legacy.blocked[at] || terrain.horseJumpableTerrain[local] !== legacy.horseJumpableTerrain[at]
        || terrain.dirtCliffRoles[local] !== legacy.dirtCliffRoles[at] || terrain.dirtTerraces[local] !== legacy.dirtTerraces[at]) {
        throw new Error(`window cell ${x},${y} differs`);
      }
      for (let plane = 0; plane < planes; plane++) {
        if (windowPlanes[plane * terrain.width * terrain.height + local] !== legacyPlanes[plane * legacy.width * legacy.height + at]) throw new Error(`plane ${plane} at ${x},${y}`);
      }
    }
    const inside = (transition: { lowerTileX: number; lowerTileY: number }) => transition.lowerTileX >= bounds.minX && transition.lowerTileX <= bounds.maxX
      && transition.lowerTileY >= bounds.minY && transition.lowerTileY <= bounds.maxY;
    expect(terrain.terrainTransitions).toEqual((legacy.terrainTransitions ?? []).filter(inside));
    for (const field of ['seed', 'version', 'spaceId', 'generator', 'defaultCliffFamily', 'defaultSurfaceFamily', 'projectionStyle', 'baseDatum',
      'raisedTerrainCollisionClassified'] as const) expect(terrain[field], field).toEqual(legacy[field]);
    // Resolvers that read neighbours agree away from the window edge.
    for (let y = bounds.minY + 8; y <= bounds.maxY - 8; y += 3) for (let x = bounds.minX + 8; x <= bounds.maxX - 8; x += 3) {
      expect(terrainElevationAt(terrain, x, y)).toBe(terrainElevationAt(legacy, x, y));
      expect(terrainPlaneCollisionCellAt(terrain, x, y, 1)).toBe(terrainPlaneCollisionCellAt(legacy, x, y, 1));
      expect(terrainProjectedElevationAtFoot(terrain, x * 16 + 5, y * 16 + 9)).toBe(terrainProjectedElevationAtFoot(legacy, x * 16 + 5, y * 16 + 9));
      expect(JSON.stringify(plateauLayerPlansAt(terrain, x, y))).toBe(JSON.stringify(plateauLayerPlansAt(legacy, x, y)));
    }
  }, 60_000);

  it('draws the same ground and raised-terrain lists as the whole map at every chunk centre, edges and corners included', () => {
    const art = recordingArt();
    const store = new BoundedChunkTerrainStore(published.manifest);
    const { width, height } = published.manifest;
    const tilesets = legacy.tilesets === undefined ? {} : { tilesets: legacy.tilesets };
    const legacyCache = recordingGroundCache().cache;
    const failures: string[] = [];
    let compared = 0, draws = 0;
    // All 169 chunk centres with a 1280 x 720 screen, plus the corner and edge tiles
    // of the map and a sample of centres with a 4K screen at minimum zoom.
    const centres: { x: number; y: number; size: { width: number; height: number } }[] = [];
    for (let cy = 0; cy < height / WORLD_CHUNK_SIZE; cy++) for (let cx = 0; cx < width / WORLD_CHUNK_SIZE; cx++) {
      centres.push({ x: cx * WORLD_CHUNK_SIZE + 32, y: cy * WORLD_CHUNK_SIZE + 32, size: SMALL_VIEW });
    }
    for (const [x, y] of [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1], [width / 2, 0], [0, height / 2],
      [width - 1, height / 2], [width / 2, height - 1], [416, 360], [300, 520], [620, 250], [131, 700]] as const) {
      centres.push({ x, y, size: LARGE_VIEW });
    }
    for (const centre of centres) {
      const view = cameraAt(centre.x, centre.y, centre.size);
      const rect = chunkWindowForView(viewTiles(view), width, height);
      load(store, rect);
      const { terrain } = buildChunkTerrainWindow(store, rect, tilesets);
      // A fresh cache per window: this compares the window itself (the churn test reuses one).
      const windowList = recordGroundDrawList(terrain, recordingGroundCache().cache, art, view);
      const legacyList = recordGroundDrawList(legacy, legacyCache, art, view);
      compared += 1; draws += legacyList.count;
      if (windowList.digest !== legacyList.digest) failures.push(`${centre.x},${centre.y} (${windowList.count} vs ${legacyList.count})`);
    }
    expect(failures).toEqual([]);
    expect(compared).toBe(169 + 12);
    // One draw per ground chunk plus every raised-terrain run and face.
    expect(draws).toBeGreaterThan(169 * 20);
  }, 600_000);

  it('invalidates exactly the ground chunks next to chunks that arrive late under the view', () => {
    const art = recordingArt();
    const store = new BoundedChunkTerrainStore(published.manifest);
    const tracker = new ChunkTerrainWindowTracker();
    const { cache } = recordingGroundCache();
    const view = cameraAt(416, 360, LARGE_VIEW);
    const rect = tracker.rectFor(store, viewTiles(view));
    store.pinView(...chunkWindowPinBounds(rect));
    // The view spans tiles 356..476 across; chunk 7 (448..511) is its eastern edge.
    const late = new Set([`${Math.floor(416 / WORLD_CHUNK_SIZE) + 1}:${Math.floor(360 / WORLD_CHUNK_SIZE)}`]);
    const install = (keys: Iterable<string>) => { for (const key of keys) { const [cx, cy] = key.split(':').map(Number) as [number, number]; store.install(blobs.get(key)!, cx, cy); } };
    install(store.pinnedKeys.filter((key) => !late.has(key)));
    const drain = () => { let removed = 0; tracker.drainInvalidations((region) => { removed += cache.invalidateRegion(region.minX, region.minY, region.maxX, region.maxY); }); return removed; };
    tracker.update(store, rect, legacy.tilesets);
    drain();
    const holed = recordGroundDrawList(tracker.window!.terrain, cache, art, view);
    const residentBefore = cache.residentCount;
    install(late);
    tracker.update(store, rect, legacy.tilesets);
    const removed = drain();
    expect(removed).toBeGreaterThan(0);
    expect(removed).toBeLessThan(residentBefore);
    const arrived = recordGroundDrawList(tracker.window!.terrain, cache, art, view);
    const expected = recordGroundDrawList(legacy, recordingGroundCache().cache, art, view);
    expect(holed.digest).not.toBe(expected.digest);
    expect(arrived.digest).toBe(expected.digest);
  }, 60_000);

  it('detects a window that lacks a chunk under the view (negative control)', () => {
    const art = recordingArt();
    const store = new BoundedChunkTerrainStore(published.manifest);
    const view = cameraAt(416, 360, LARGE_VIEW);
    const rect = chunkWindowForView(viewTiles(view), published.manifest.width, published.manifest.height);
    load(store, rect);
    const centre = { cx: Math.floor(416 / WORLD_CHUNK_SIZE), cy: Math.floor(360 / WORLD_CHUNK_SIZE) };
    const holed = { manifest: store.manifest, peekChunk: (cx: number, cy: number) => cx === centre.cx && cy === centre.cy ? undefined : store.peekChunk(cx, cy) };
    const full = recordGroundDrawList(buildChunkTerrainWindow(store, rect).terrain, recordingGroundCache().cache, art, view);
    const hole = recordGroundDrawList(buildChunkTerrainWindow(holed, rect).terrain, recordingGroundCache().cache, art, view);
    expect(hole.digest).not.toBe(full.digest);
  }, 60_000);

  it('keeps parity while one ground cache follows the window across many centres, within the rebuild budget', () => {
    const art = recordingArt();
    const store = new BoundedChunkTerrainStore(published.manifest);
    const { width, height } = published.manifest;
    const tracker = new ChunkTerrainWindowTracker();
    const { cache } = recordingGroundCache();
    const legacyCache = recordingGroundCache().cache;
    const timings: number[] = [];
    const failures: string[] = [];
    let invalidated = 0;
    // A walk (at running pace, ~6 tiles per sample) that loops the island, doubles back
    // over chunk edges and then crosses the middle diagonally, at the 4K minimum-zoom view.
    const path: [number, number][] = [];
    const leg = (fromX: number, fromY: number, toX: number, toY: number) => {
      const steps = Math.ceil(Math.hypot(toX - fromX, toY - fromY) / 6);
      for (let step = 0; step <= steps; step++) path.push([Math.round(fromX + (toX - fromX) * step / steps), Math.round(fromY + (toY - fromY) * step / steps)]);
    };
    leg(120, 120, 700, 120); leg(700, 120, 700, 700); leg(700, 700, 120, 700); leg(120, 700, 120, 120);
    leg(120, 120, 150, 120); leg(150, 120, 115, 120); leg(115, 120, 200, 130); leg(200, 130, 190, 128); // hover over a chunk edge
    leg(120, 120, 700, 700);
    for (const [x, y] of path) {
      const view = cameraAt(x, y, LARGE_VIEW);
      const rect = tracker.rectFor(store, viewTiles(view));
      // The loader installs the new chunks after the pin moves: build first with
      // them missing (edge tiles only), then again once they arrive.
      store.pinView(...chunkWindowPinBounds(rect));
      const built = tracker.builds;
      tracker.update(store, rect, legacy.tilesets);
      if (tracker.builds !== built) timings.push(tracker.lastBuildMs);
      if (tracker.window!.missing > 0) {
        // A frame is drawn while the new chunks are still loading.
        tracker.drainInvalidations((region) => { invalidated += cache.invalidateRegion(region.minX, region.minY, region.maxX, region.maxY); });
        recordGroundDrawList(tracker.window!.terrain, cache, art, view);
        for (const key of store.pinnedKeys) {
          const [cx, cy] = key.split(':').map(Number) as [number, number];
          if (!store.peekChunk(cx, cy)) store.install(blobs.get(key)!, cx, cy);
        }
        const before = tracker.builds;
        tracker.update(store, rect, legacy.tilesets);
        expect(tracker.builds).toBe(before + 1);
        timings.push(tracker.lastBuildMs);
      }
      tracker.drainInvalidations((region) => { invalidated += cache.invalidateRegion(region.minX, region.minY, region.maxX, region.maxY); });
      const window = tracker.window!;
      // The view plus the margin fits the window (clipped to the map).
      const bounds = chunkWindowTileBounds(window.rect, width, height), tiles = viewTiles(view);
      expect(Math.max(0, tiles.minX - CHUNK_WINDOW_MARGIN_TILES)).toBeGreaterThanOrEqual(bounds.minX);
      expect(Math.max(0, tiles.minY - CHUNK_WINDOW_MARGIN_TILES)).toBeGreaterThanOrEqual(bounds.minY);
      expect(Math.min(width - 1, tiles.maxX + CHUNK_WINDOW_MARGIN_TILES)).toBeLessThanOrEqual(bounds.maxX);
      expect(Math.min(height - 1, tiles.maxY + CHUNK_WINDOW_MARGIN_TILES)).toBeLessThanOrEqual(bounds.maxY);
      const windowList = recordGroundDrawList(window.terrain, cache, art, view);
      const legacyList = recordGroundDrawList(legacy, legacyCache, art, view);
      if (windowList.digest !== legacyList.digest) failures.push(`${x},${y}`);
    }
    expect(failures).toEqual([]);
    expect(invalidated).toBeGreaterThan(0);
    // Window moves with every chunk crossing, never per step.
    expect(tracker.builds).toBeLessThan(path.length / 4);
    const sorted = [...timings].sort((a, b) => a - b);
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!;
    console.info(`chunk window: ${path.length} views, ${tracker.builds} builds, rebuild p50 ${sorted[Math.floor(sorted.length / 2)]!.toFixed(2)} ms, `
      + `p95 ${p95.toFixed(2)} ms, max ${sorted.at(-1)!.toFixed(2)} ms, ${invalidated} ground chunks invalidated`);
    expect(p95).toBeLessThanOrEqual(8);
  }, 600_000);
});

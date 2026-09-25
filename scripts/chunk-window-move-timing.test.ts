import v8 from 'node:v8';
import vm from 'node:vm';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  activeSurvivalLandmarks, bootstrapContentRegistry, createLiveIslandMapDocument, createMapPrefabDocument, generateSurvivalResources,
  LIVE_ISLAND_MAP_ID, serializeMapDocumentV3, SURVIVAL_WORLD_SEED, TOPSIDE_SPACE_ID,
  type CombatRegion, type ContentRegistry, type MapDocumentV3, type MapPrefabDocumentV2,
} from '@orchard/sim';
import { buildChunkWindowCollision } from '@orchard/sim/chunk-collision';
import { WORLD_CHUNK_SIZE } from '@orchard/sim/world-chunk';
import { BoundedChunkTerrainStore } from '@orchard/engine/bounded-chunk-terrain-store';
import { buildChunkTerrainWindow, CHUNK_WINDOW_MARGIN_TILES, type ChunkTerrainWindow, type TileBounds } from '@orchard/engine/chunk-terrain-window';
import { terrainRaisedFaceReach } from '@orchard/engine/terrain';
import { prepareLightTerrainOcclusion, type PreparedLightTerrainOcclusion } from '@orchard/engine/light-occlusion';
import { clientLiveRowObstacles } from '@orchard/engine/collision';
import type { LiveMapDocumentRow } from '@orchard/engine/live-map-runtime';
import { composeChunkCollisionMaps } from '../packages/client/src/chunk-collision-composition.js';
import { WorldSource, type WorldSourceCollision } from '../packages/client/src/world-source.js';
import { WorldStaticProjectionCache } from '../packages/client/src/world-static-projection.js';
import { topsideDecorationLightCasters } from '../packages/client/src/topside-map-records.js';
import { buildChunkWindowMapRecords } from '@orchard/engine/chunk-map-records';
import { chunkRuntimeParityFixture, liveRowsFixture, type ChunkRuntimeParityFixture, type LiveRowsFixture } from './world-chunk-runtime-parity.js';

/**
 * Static world S4f, nightly: the cost of a render-window move in chunk mode `on`,
 * through the client's real pipeline (WorldSource, WorldStaticProjectionCache,
 * composeChunkCollisionMaps), over long camera walks on the bootstrap island and
 * the authored document.
 *
 * Each frame runs what the client runs: setView and advance, the terrain window,
 * the chunk collision, the map records the painters draw (static world S4e) and,
 * when the collision serial changes, the collision refresh (live row composition,
 * traversal projections, light preparation, and the elevated decoration casters
 * from the window's records). Only the sprite silhouettes of the client's
 * occluders (trees, elevated objects) are left out, as in the S4d timing.
 * Chunk installs happen between frames (the loader's decode runs in its own task).
 *
 * - `synchronous`: advance is never called, so every window move is built in the
 *   frame that needs it (S4d's model, with S4f's light reuse and lazy shadow
 *   differences);
 * - `staged`: the client's S4f path. The next window is pinned ahead of the view,
 *   built one stage per frame and served in one assignment.
 *
 * Every served window, collision and light preparation is checked against a fresh
 * synchronous build of the same rect: staging and reuse change timing, never results.
 */

/** The authored document of chunk-collision-parity-authored.test.ts (S4d), rebuilt here. */
function authoredRow(registry: ContentRegistry): LiveMapDocumentRow {
  const parts = [{ slot: 'water' as const, exact: { frame: 4 } }];
  const regions: readonly CombatRegion[] = [
    { id: 'arena', spaceId: TOPSIDE_SPACE_ID, minX: 300, minY: 300, maxX: 340, maxY: 340, policy: 'hostile' },
    { id: 'arena-camp', spaceId: TOPSIDE_SPACE_ID, minX: 310, minY: 310, maxX: 315, maxY: 315, policy: 'sanctuary', parentId: 'arena' },
  ];
  const base = createLiveIslandMapDocument({ landmarks: activeSurvivalLandmarks(registry, TOPSIDE_SPACE_ID) });
  const crate: MapPrefabDocumentV2 = { ...createMapPrefabDocument({ id: 'crate', title: 'Crate', width: 1, height: 1 }),
    pivot: { tileX: 0, tileY: 0 }, cells: [{ id: 'cell', tileX: 0, tileY: 0, elevation: 0, collisionMask: 0x0660 }] };
  const [first, second] = generateSurvivalResources(SURVIVAL_WORLD_SEED, registry);
  const movedX = (Math.floor(second!.tileX / WORLD_CHUNK_SIZE) + 1) * WORLD_CHUNK_SIZE;
  const document: MapDocumentV3 = { ...base, cells: { ...base.cells, '400,400': { parts } }, combatRegions: regions,
    prefabs: [...base.prefabs, crate],
    objects: [...base.objects, { id: 'crate-1', prefabId: 'crate', prefabRevision: crate.revision, tileX: 402, tileY: 404, elevation: 0,
      layer: 'ground', enabled: true, quarterTurns: 0, flipX: false }],
    generatedSuppressions: [...base.generatedSuppressions, `resource-${first!.id}`],
    resourcePlacements: [{ id: String(second!.id), originTileX: second!.tileX, originTileY: second!.tileY, tileX: movedX, tileY: second!.tileY },
      { id: '999999999999', originTileX: 100, originTileY: 100, tileX: 101, tileY: 100 }] };
  return { mapId: LIVE_ISLAND_MAP_ID, revision: document.revision, contentHash: 'timing-authored', documentJson: serializeMapDocumentV3(document) };
}

function bootstrapRow(registry: ContentRegistry): LiveMapDocumentRow {
  const document = createLiveIslandMapDocument({ landmarks: activeSurvivalLandmarks(registry, TOPSIDE_SPACE_ID) });
  return { mapId: LIVE_ISLAND_MAP_ID, revision: document.revision, contentHash: 'timing-bootstrap', documentJson: serializeMapDocumentV3(document) };
}

/** A camera walk: rows across the island and back, VIEW tiles wide, SPEED tiles per frame. */
const VIEW = { width: 64, height: 36 }, SPEED = 0.5, LOAD_FRAMES = 6;
function walk(): TileBounds[] {
  const views: TileBounds[] = [], rows = [200, 290, 380, 470, 560, 470, 380, 290, 200];
  let x = 150, y = rows[0]!;
  const to = (tx: number, ty: number) => {
    while (Math.abs(tx - x) > 1e-9 || Math.abs(ty - y) > 1e-9) {
      x += Math.max(-SPEED, Math.min(SPEED, tx - x)); y += Math.max(-SPEED, Math.min(SPEED, ty - y));
      views.push({ minX: Math.floor(x - VIEW.width / 2), minY: Math.floor(y - VIEW.height / 2),
        maxX: Math.ceil(x + VIEW.width / 2), maxY: Math.ceil(y + VIEW.height / 2) });
    }
  };
  rows.forEach((row, index) => { to(x, row); to(index % 2 === 0 ? 680 : 150, row); });
  return views;
}

const percentile = (values: readonly number[], p: number) => values.length === 0 ? 0
  : [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))]!;
const summary = (values: readonly number[]) =>
  `p50 ${percentile(values, 0.5).toFixed(2)} / p95 ${percentile(values, 0.95).toFixed(2)} / max ${percentile(values, 1).toFixed(2)} ms (${values.length})`;

function expectSameLight(label: string, actual: PreparedLightTerrainOcclusion | undefined, expected: PreparedLightTerrainOcclusion): void {
  expect(actual, label).toBeDefined();
  expect(Buffer.compare(Buffer.from(actual!.hardBlocked), Buffer.from(expected.hardBlocked)), `${label} hard`).toBe(0);
  expect(Buffer.compare(Buffer.from(actual!.frontFaces), Buffer.from(expected.frontFaces)), `${label} faces`).toBe(0);
  const a = actual!.terrainOccluders ?? [], b = expected.terrainOccluders ?? [];
  expect(a.length, `${label} occluders`).toBe(b.length);
  a.forEach((occluder, index) => {
    const other = b[index]!;
    if (occluder.left !== other.left || occluder.top !== other.top || occluder.width !== other.width || occluder.height !== other.height
      || occluder.elevationLayer !== other.elevationLayer || Buffer.compare(Buffer.from(occluder.opaque), Buffer.from(other.opaque)) !== 0) {
      throw new Error(`${label} occluder ${index} differs`);
    }
  });
}

interface RunResult {
  /** Frame cost of every frame that did window work (a stage, a serve or a synchronous rebuild). */
  readonly workFrames: number[];
  /** Frame cost of the frames that served a new window. */
  readonly moveFrames: number[];
  readonly staged: number;
  readonly synchronous: number;
  readonly checked: number;
}

/** Forces a full GC (the flag can be set at run time; the function comes from a fresh context). */
function collector(): () => void {
  v8.setFlagsFromString('--expose-gc');
  return vm.runInNewContext('gc') as () => void;
}
const retainedBytes = (gc: () => void): number => { gc(); gc(); const usage = process.memoryUsage(); return usage.heapUsed + usage.arrayBuffers; };

interface RunOptions {
  readonly check?: boolean;
  /** Called after a frame in which a window was served or a prepared window became ready. */
  readonly probe?: (source: WorldSource, store: BoundedChunkTerrainStore) => void;
  /** Keep a WeakRef to every served window. (A WeakRef keeps its target alive until the
   * current job ends, so never together with `probe`.) */
  readonly track?: boolean;
}

function run(fixture: ChunkRuntimeParityFixture, registry: ContentRegistry, live: LiveRowsFixture, staged: boolean,
  { check = false, probe, track = false }: RunOptions = {}): RunResult & { readonly windows: readonly WeakRef<object>[]; readonly source: WorldSource } {
  const { published, blobs } = fixture;
  const store = new BoundedChunkTerrainStore(published.manifest);
  const heads = new Map(published.manifest.chunks.map(head => [`${head.cx}:${head.cy}`, head]));
  // Newly pinned chunks arrive LOAD_FRAMES frames later (fetch or cache), installed between frames.
  const arriving = new Map<string, number>();
  let frame = 0;
  const pin = (bounds: readonly [number, number, number, number]) => {
    store.pinView(...bounds);
    for (const key of store.pinnedKeys) if (!arriving.has(key)) arriving.set(key, frame + LOAD_FRAMES);
    for (const key of [...arriving.keys()]) if (!store.pinnedKeys.includes(key)) arriving.delete(key);
  };
  const install = () => {
    for (const [key, due] of arriving) {
      if (due > frame) continue;
      arriving.delete(key);
      const [cx, cy] = key.split(':').map(Number) as [number, number];
      if (store.peekChunk(cx, cy) === undefined) store.install(blobs.get(heads.get(key)!.contentHash)!, cx, cy);
    }
  };
  const projection = new WorldStaticProjectionCache();
  const source = new WorldSource({ store: () => store, pin, authorityGate: () => null,
    prewarm: [
      ({ window }) => { projection.prepareWindowLight(window); },
      ({ collision }, stepRegistry) => {
        if (collision !== undefined) composeChunkCollisionMaps({ registry: stepRegistry, collision, liveBase: [], furniture: [], dynamic: [],
          tick: 0n, projectile: (ground, water) => projection.projectile(ground, water) });
      },
      // As the client: the elevated decoration casters of the window's records (S4e).
      ({ records }, stepRegistry) => { if (records !== undefined) topsideDecorationLightCasters(records.decorations, records, stepRegistry, TOPSIDE_SPACE_ID); },
    ] });
  const refresh = (chunks: WorldSourceCollision) => {
    // Static world S4e: the elevated decoration occluders read the window's records.
    const records = source.mapRecords(registry);
    if (records !== undefined) topsideDecorationLightCasters(records.decorations, records, registry, TOPSIDE_SPACE_ID);
    const rows = clientLiveRowObstacles(live.rows.resources, live.rows.chests, [], chunks.collision.generatedSuppressions, registry);
    composeChunkCollisionMaps({ registry, collision: chunks.collision, tick: 0n,
      liveBase: rows.entries.filter(({ furniture }) => !furniture).map(({ obstacle }) => obstacle),
      furniture: rows.entries.filter(({ furniture }) => furniture).map(({ obstacle }) => obstacle), dynamic: [],
      projectile: (ground, water) => projection.projectile(ground, water) });
    return projection.prepareWindowLight(chunks.window);
  };
  const workFrames: number[] = [], moveFrames: number[] = [], windows: WeakRef<object>[] = [];
  let serial = 0, served: ChunkTerrainWindow | undefined, checked = 0;
  const views = walk();
  // Spawn: the first window's chunks are resident before play starts (spawn readiness).
  source.setView(views[0]!);
  frame += LOAD_FRAMES;
  install();
  for (const view of views) {
    install();
    const status = source.stagingStatus.pending;
    const t0 = performance.now();
    source.setView(view);
    if (staged) source.advance(registry);
    const window = source.window(registry);
    const chunks = source.collision(registry);
    // The painters read the records every frame (a cache hit but on a window's first frame).
    const records = source.mapRecords(registry);
    let light: PreparedLightTerrainOcclusion | undefined;
    const changed = chunks !== undefined && chunks.serial !== serial;
    if (changed) light = refresh(chunks);
    const elapsed = performance.now() - t0;
    frame++;
    const moved = window !== served;
    if (served !== undefined && (moved || changed || status !== source.stagingStatus.pending)) workFrames.push(elapsed);
    if (moved && served !== undefined) moveFrames.push(elapsed);
    if (changed) serial = chunks.serial;
    if (track && moved && window !== undefined) windows.push(new WeakRef(window));
    if (probe !== undefined && (moved || (status !== source.stagingStatus.pending && source.stagingStatus.pending?.endsWith(':ready') === true))) probe(source, store);
    if (moved && window !== undefined && !check) served = window;
    else if (moved && window !== undefined) {
      // Same results as a synchronous build of this rect from the same resident chunks.
      const fresh = buildChunkTerrainWindow({ manifest: store.manifest, peekChunk: (cx, cy) => window.present.has(`${cx}:${cy}`) ? store.peekChunk(cx, cy) : undefined },
        window.rect, { tilesets: window.terrain.tilesets! });
      for (const channel of ['elevations', 'biomes', 'dirtCliffRoles', 'terrainPlaneBlocked'] as const) {
        expect(Buffer.compare(Buffer.from((window.terrain[channel] as Uint8Array).buffer), Buffer.from((fresh.terrain[channel] as Uint8Array).buffer)), channel).toBe(0);
      }
      expect(window.terrain.blocked).toEqual(fresh.terrain.blocked);
      expect(chunks?.window).toBe(window);
      const collision = buildChunkWindowCollision({ manifest: store.manifest, peekChunk: (cx, cy) => window.present.has(`${cx}:${cy}`) ? store.peekChunk(cx, cy) : undefined }, window.rect);
      expect(chunks!.collision.ground.blocked).toEqual(collision.ground.blocked);
      expect(chunks!.collision.ground.obstacles).toEqual(collision.ground.obstacles);
      expect(chunks!.collision.baseObstacles).toEqual(collision.baseObstacles);
      const freshRecords = buildChunkWindowMapRecords({ manifest: store.manifest, peekChunk: (cx, cy) => store.peekChunk(cx, cy) }, window);
      expect(records).toBeDefined();
      expect(records!.objects).toEqual(freshRecords.objects);
      expect(records!.decorations).toEqual(freshRecords.decorations);
      expectSameLight(`window ${window.rect.cx}:${window.rect.cy}`, light ?? projection.prepareWindowLight(window), prepareLightTerrainOcclusion(fresh.terrain));
      checked++;
      served = window;
    }
  }
  return { workFrames, moveFrames, staged: source.stagingStatus.staged, synchronous: source.stagingStatus.synchronous, checked, windows, source };
}

function describeTiming(label: string, row: (registry: ContentRegistry) => LiveMapDocumentRow): void {
  describe(`render window move timing (static world S4f): ${label}`, () => {
    let fixture: ChunkRuntimeParityFixture, registry: ContentRegistry, live: LiveRowsFixture;
    beforeAll(() => {
      registry = bootstrapContentRegistry();
      fixture = chunkRuntimeParityFixture(row(registry), registry);
      live = liveRowsFixture(fixture.server, registry);
    }, 180_000);

    it('serves every window move within the 8 ms p95 frame budget when staged, with identical results', () => {
      // Checked runs (untimed): every served window equals a fresh synchronous build.
      const checkedSynchronous = run(fixture, registry, live, false, { check: true }), checked = run(fixture, registry, live, true, { check: true });
      expect(checkedSynchronous.checked).toBeGreaterThanOrEqual(50);
      expect(checked.checked).toBe(checkedSynchronous.checked);
      // Timed runs: the verification's own allocations would otherwise show up as GC pauses.
      const synchronous = run(fixture, registry, live, false);
      // Three staged runs: the median p95 is the budget figure (a stray major GC of the fixture-laden
      // test heap cannot move it).
      const stagedRuns = [run(fixture, registry, live, true), run(fixture, registry, live, true), run(fixture, registry, live, true)];
      const p95s = stagedRuns.map(result => percentile(result.workFrames, 0.95)).sort((a, b) => a - b);
      const staged = stagedRuns.find(result => percentile(result.workFrames, 0.95) === p95s[1])!;
      console.info(`[S4f] ${label}: synchronous moves ${summary(synchronous.moveFrames)}; staged window-work frames ${summary(staged.workFrames)} `
        + `(p95 of 3 runs ${p95s.map(value => value.toFixed(2)).join(' / ')} ms), serving frames ${summary(staged.moveFrames)}; `
        + `${staged.staged} staged / ${staged.synchronous} synchronous, ${checked.checked} windows checked`);
      expect(synchronous.moveFrames.length).toBeGreaterThanOrEqual(50);
      expect(staged.moveFrames.length).toBeGreaterThanOrEqual(50);
      // The walk never outruns the lookahead: every move after the first is staged.
      expect(staged.synchronous).toBe(0);
      expect(staged.staged).toBe(staged.moveFrames.length);
      // The S4d hard gate: every frame of a window move within 8 ms at p95 (median of three runs).
      // Wall-clock budgets hold only in the isolated nightly run (`npm run test:nightly` sets
      // ORCHARD_TIMING_BUDGETS=1: no coverage, one file at a time). Under the parallel coverage
      // suite (`npm run check`) only a loose bound applies, which still catches a gross regression.
      expect(p95s[1]).toBeLessThanOrEqual(process.env.ORCHARD_TIMING_BUDGETS === '1' ? 8 : 60);
    }, 900_000);

    it('keeps at most three windows alive and reports the peak memory of the window pipeline', async () => {
      const gc = collector();
      // The island's raised faces read well within the reuse radius (terrainRaisedFaceReach <= 32).
      expect(terrainRaisedFaceReach(buildChunkTerrainWindow({ manifest: fixture.published.manifest, peekChunk: () => undefined },
        { cx: 4, cy: 4, columns: 5, rows: 5 }).terrain)).toBeLessThanOrEqual(CHUNK_WINDOW_MARGIN_TILES);
      const baseline = retainedBytes(gc);
      let peak = 0, peakStore = 0, samples = 0;
      run(fixture, registry, live, true, { probe: (_source, store) => {
        if (samples++ % 3 !== 0) return;
        const bytes = retainedBytes(gc) - baseline;
        if (bytes > peak) { peak = bytes; peakStore = store.residentBytes; }
      } });
      const result = run(fixture, registry, live, true, { track: true });
      await new Promise(resolve => setTimeout(resolve, 0));
      gc(); await new Promise(resolve => setTimeout(resolve, 0)); gc();
      // Counted while the source is still in use (it holds the served and any pending window).
      const alive = result.windows.filter(ref => ref.deref() !== undefined).length;
      expect(result.source.stagingStatus.staged).toBeGreaterThan(0);
      const mib = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);
      console.info(`[S4f] ${label} memory: peak ${mib(peak)} MiB retained by the store, windows and caches over ${samples} samples `
        + `(store ${mib(peakStore)} MiB encoded then); ${alive} of ${result.windows.length} windows alive after the walk`);
      expect(result.windows.length).toBeGreaterThanOrEqual(50);
      expect(alive).toBeLessThanOrEqual(3);
    }, 900_000);
  });
}

describeTiming('bootstrap island', bootstrapRow);
describeTiming('authored document', authoredRow);

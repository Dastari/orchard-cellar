import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  activeSpaceGroundWalkableTiles, activeSurvivalLandmarks, AUTHORITY_TICKS_PER_DAY, bootstrapContentRegistry, createLiveIslandMapDocument,
  dayProgressAtClockTime, hearthSupplyCacheInstalled, runtimeHearthSupplyCache, SURVIVAL_WORLD_SEED, TOPSIDE_SPACE_ID,
  type ContentRegistry, type MapDocumentV3,
} from '@orchard/sim';
import { WORLD_CHUNK_SIZE } from '@orchard/sim/world-chunk';
import { BoundedChunkTerrainStore } from '@orchard/engine/bounded-chunk-terrain-store';
import { visibleWorldBounds, type VisibleWorldBounds } from '@orchard/engine/camera';
import type { ChunkWindowMapRecords, MapDecorationRecord, TopsideMapRecords } from '@orchard/engine/chunk-map-records';
import { type TileBounds } from '@orchard/engine/chunk-terrain-window';
import { CAMPFIRE_LIGHT_RADIUS_TILES } from '@orchard/engine/lighting';
import { liveIslandDocument, TERRAIN_ARRAY_MAP_OBJECT_SAMPLER, type LiveMapDocumentRow } from '@orchard/engine/live-map-runtime';
import { enqueueMapObjects, mapObjectLightOccluders, preloadMapObjectAssets } from '@orchard/engine/map-object-presentation';
import type { WorldDepthItem } from '@orchard/engine/renderer';
import {
  terrainBaseDatum, terrainElevationAtWorldFoot, terrainMaximumElevation, terrainMinimumElevation, terrainProjectedDepthAtFoot,
  terrainVisualProjectionRowsPerLevel, type TerrainArray,
} from '@orchard/engine/terrain';
import { enqueueGameplayDecorations } from '../packages/client/src/gameplay-painter-decorations.js';
import { protocolPondTies } from '../packages/client/src/render-protocol-ponds.js';
import { topsideAuthoredFixture, topsideFixtureRow } from '../packages/client/src/topside-map-records.fixture.js';
import { legacyTopsideDecorations, topsideDecorationLightCasters } from '../packages/client/src/topside-map-records.js';
import { WorldSource } from '../packages/client/src/world-source.js';
import { captureWorldChunkSnapshot, materializeWorldChunks } from './materialize-world-chunks.js';

/**
 * Static world S4e, nightly: in chunk mode `on` the topside painters draw from the
 * render window's chunk records (WorldSource.mapRecords). At every one of the 169
 * chunk centres (a 1280 x 720 screen at zoom 2) and at the map's corners and edges
 * with a 4K screen at minimum zoom, on the bootstrap island and the authored
 * fixture, the records must produce exactly the draw lists the whole live map
 * document produces:
 *
 * - the decoration painter's queue (ties, depth, receivers) and point lights, for
 *   the painter's visible bounds (enqueueGameplayDecorations, both inputs);
 * - the authored object queue and every draw call (connected-object masks included);
 * - the authored object light occluders and the elevated decoration occluders: the
 *   records' list equals the document's restricted to content anchored in the window
 *   (on the same window terrain), and equals the document's on the whole-map terrain
 *   for everything within light reach of the view;
 * - the decoration list itself, landmark walkables, pond ties, combat regions, the
 *   supply cache and the ferry availability.
 *
 * Asset frames and sprite silhouettes are mocked (as in map-object-presentation.test.ts):
 * this compares what is drawn where, not pixels.
 */

vi.mock('@orchard/ui', async (original) => {
  const { fixtureAssetMetadata } = await import('../packages/client/src/topside-map-records.fixture.js');
  return { ...await original<typeof import('@orchard/ui')>(), loadGeneratedAsset: async (name: string) => fixtureAssetMetadata(name) };
});
vi.mock('@orchard/engine/world-asset-presentation', () => ({
  worldAssetFrameSource: (_context: unknown, asset: { name: string }, frame: { x: number; y: number; width: number; height: number },
    transform: ((source: unknown) => unknown) | undefined, receivesGlobal: boolean) => {
    const source = { image: { asset: asset.name, receivesGlobal }, x: frame.x, y: frame.y, width: frame.width, height: frame.height };
    return transform?.(source) ?? source;
  },
}));
vi.mock('@orchard/engine/light-occlusion', async (original) => ({
  ...await original<typeof import('@orchard/engine/light-occlusion')>(),
  createFrameLightOccluder: (_asset: unknown, frame: { x: number; width: number; height: number }) => {
    const opaque = new Uint8Array(frame.width * frame.height);
    for (let index = 0; index < opaque.length; index += 1) opaque[index] = (index + frame.x) % 3 === 0 ? 1 : 0;
    return { left: -8, top: 1 - frame.height, width: frame.width, height: frame.height, opaque };
  },
}));
vi.mock('@orchard/engine/connected-objects', () => ({
  preloadConnectedObjectArt: async () => undefined,
  drawConnectedObject: (context: { log: unknown[] }, family: string, mask: number, x: number, y: number) => {
    context.log.push(['connected', family, mask, x, y]);
    return true;
  },
}));

/** A 1280 x 720 CSS screen at zoom 2, and a 3840 x 2160 one at the minimum zoom of 2 (world pixels). */
const SMALL_VIEW = { width: 640, height: 360 } as const;
const LARGE_VIEW = { width: 1920, height: 1080 } as const;
const NIGHT = BigInt(Math.round(dayProgressAtClockTime(22) * AUTHORITY_TICKS_PER_DAY));

interface View { readonly cameraX: number; readonly cameraY: number; readonly width: number; readonly height: number }
function cameraAt(centerTileX: number, centerTileY: number, size: { readonly width: number; readonly height: number }): View {
  return { cameraX: centerTileX * 16 + 8 - size.width / 2, cameraY: centerTileY * 16 + 8 - size.height / 2, ...size };
}
function viewTiles(view: View): TileBounds {
  return { minX: Math.floor(view.cameraX / 16), minY: Math.floor(view.cameraY / 16),
    maxX: Math.ceil((view.cameraX + view.width) / 16), maxY: Math.ceil((view.cameraY + view.height) / 16) };
}
const inside = (bounds: VisibleWorldBounds, x: number, y: number) => x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
const anchored = (present: ReadonlySet<string>, tileX: number, tileY: number) =>
  present.has(`${Math.floor(tileX / WORLD_CHUNK_SIZE)}:${Math.floor(tileY / WORLD_CHUNK_SIZE)}`);

function recordingContext(): CanvasRenderingContext2D & { log: unknown[] } {
  const log: unknown[] = [];
  return new Proxy({ log }, {
    get(target, key) {
      if (key === 'log') return target.log;
      if (key === 'getTransform') return () => ({ matrixAt: log.length });
      return (...args: unknown[]) => { log.push([String(key), ...args]); };
    },
  }) as unknown as CanvasRenderingContext2D & { log: unknown[] };
}
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) => {
    if (typeof entry === 'bigint') return `${entry}n`;
    if (ArrayBuffer.isView(entry)) {
      const bytes = new Uint8Array(entry.buffer, entry.byteOffset, entry.byteLength);
      return { length: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    }
    if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
      return Object.fromEntries(Object.entries(entry).sort(([left], [right]) => left.localeCompare(right)));
    }
    return entry;
  });
}

/** The decoration painter's queue and point lights for one view. */
function paintDecorations(registry: ContentRegistry, decorations: readonly MapDecorationRecord[], records: TopsideMapRecords,
  visible: VisibleWorldBounds, lightVisible: VisibleWorldBounds) {
  const queued: unknown[] = [];
  const pointLights: unknown[] = [];
  enqueueGameplayDecorations({
    dynamicLighting: true, debugEntitiesHidden: false,
    activeSpaceDefinition: { spaceId: TOPSIDE_SPACE_ID, generator: 'survival_island' },
    snapshot: { content: { registry }, placeables: [], homesteads: [], clock: { authorityTick: NIGHT } },
    pointLights, projectedLight: (light: object, y?: number, x?: number) => ({ ...light, projectedY: y, projectedX: x }),
    homesteadSurroundingDecorations: () => [], seed: SURVIVAL_WORLD_SEED,
    topsideDecorations: () => decorations, topsideMapRecords: records, visible, lightVisible,
    enqueueWorldDepth: (x: number, y: number, item: WorldDepthItem, terrainSampleY?: number, receiver?: string) =>
      queued.push([x, y, item.footY, item.tie, item.depthPhase ?? null, terrainSampleY ?? null, receiver ?? null]),
    context: recordingContext(), art: {}, cameraX: 0, cameraY: 0, scale: 2,
    visualTickClock: { renderTick: 0 }, renderWeather: { wind: 0 }, frameLightingModel: 'unified',
    drawSouthFacingReceiver: () => undefined, nameplates: [], renderedPlayerAnchors: new Map(), objectPresentations: {},
  } as unknown as Parameters<typeof enqueueGameplayDecorations>[0]);
  return { queued, pointLights };
}

/** gameplay-painter-setup's object queue, with every item's draw calls. */
function paintObjects(registry: ContentRegistry, records: TopsideMapRecords, visible: VisibleWorldBounds) {
  const context = recordingContext();
  const items: unknown[] = [];
  enqueueMapObjects(records, {
    context, cameraX: 0, cameraY: 0, scale: 2, timeMs: 450, materializedStreetlamps: true, contentRegistry: registry,
    visible: (x, y) => inside(visible, x, y),
    enqueue: (x, y, item) => {
      context.log.length = 0;
      item.draw();
      items.push([x, y, item.footY, item.tie, item.depthPhase ?? null, structuredClone(context.log)]);
    },
  });
  return items;
}

/** The object of a map-object occluder (its painter tie is live-map:<rank>:object:<id>:<placement>). */
const occluderObject = (occluder: { readonly painterOrder?: { readonly tie?: string } }) => occluder.painterOrder!.tie!.split(':')[3]!;

function describeParity(label: string, documentFor: (registry: ContentRegistry) => MapDocumentV3, authored: boolean): void {
  describe(`chunk map records parity with the live map document (static world S4e): ${label}`, () => {
    let registry: ContentRegistry, row: LiveMapDocumentRow, live: MapDocumentV3, legacyTerrain: TerrainArray;
    let legacyDecorations: readonly MapDecorationRecord[], blobs: Map<string, Uint8Array>;
    let source: WorldSource, store: BoundedChunkTerrainStore;
    beforeAll(async () => {
      registry = bootstrapContentRegistry();
      row = topsideFixtureRow(documentFor(registry), `records-${label}`);
      const snapshot = captureWorldChunkSnapshot(row, registry);
      const published = materializeWorldChunks(snapshot, row, registry);
      blobs = new Map(published.manifest.chunks.map((head, index) => [`${head.cx}:${head.cy}`, published.blobs[index]!]));
      legacyTerrain = snapshot.terrain;
      live = liveIslandDocument(row, registry)!;
      legacyDecorations = legacyTopsideDecorations(live, SURVIVAL_WORLD_SEED, registry);
      await preloadMapObjectAssets(live);
      store = new BoundedChunkTerrainStore(published.manifest);
      // The chunk runtime pins the window and the loader installs every pinned chunk.
      source = new WorldSource({ store: () => store, authorityGate: () => null, pin: (bounds) => {
        store.pinView(...bounds);
        for (const key of store.pinnedKeys) {
          const [cx, cy] = key.split(':').map(Number) as [number, number];
          if (store.peekChunk(cx, cy) === undefined) store.install(blobs.get(key)!, cx, cy);
        }
      } });
    }, 300_000);

    it('draws the same decorations, objects, lights and occluders at every chunk centre, edges and corners included', () => {
      const { width, height } = store.manifest;
      const centres: { x: number; y: number; size: { width: number; height: number } }[] = [];
      for (let cy = 0; cy < height / WORLD_CHUNK_SIZE; cy++) for (let cx = 0; cx < width / WORLD_CHUNK_SIZE; cx++) {
        centres.push({ x: cx * WORLD_CHUNK_SIZE + 32, y: cy * WORLD_CHUNK_SIZE + 32, size: SMALL_VIEW });
      }
      for (const [x, y] of [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1], [width / 2, 0], [0, height / 2],
        [width - 1, height / 2], [width / 2, height - 1], [416, 360], [300, 520], [620, 250], [131, 700]] as const) {
        centres.push({ x, y, size: LARGE_VIEW });
      }
      // The painters' bounds (gameplay-painter-setup): the terrain projection margin, and light reach.
      const datum = terrainBaseDatum(legacyTerrain);
      const projectionMargin = Math.max(64, Math.max(Math.abs(terrainMaximumElevation(legacyTerrain) - datum),
        Math.abs(terrainMinimumElevation(legacyTerrain) - datum)) * terrainVisualProjectionRowsPerLevel(legacyTerrain) * 16);
      const cache = runtimeHearthSupplyCache(registry, undefined, TOPSIDE_SPACE_ID)!;
      const walkable = activeSpaceGroundWalkableTiles(registry, TOPSIDE_SPACE_ID, live.landmarks);
      const failures: string[] = [];
      const totals = { decorations: 0, queued: 0, lights: 0, objects: 0, reachObjects: 0, occluders: 0, casters: 0, cacheWindows: 0 };
      for (const centre of centres) {
        const view = cameraAt(centre.x, centre.y, centre.size);
        source.setView(viewTiles(view));
        const served = source.collision(registry);
        const records: ChunkWindowMapRecords | undefined = source.mapRecords(registry);
        const where = `${centre.x},${centre.y}`;
        if (served === undefined || records === undefined) { failures.push(`${where}: not served (${source.collisionStatus.fallbackReason})`); continue; }
        const window = served.window, terrain = window.terrain, present = records.present;
        expect(window.missing, where).toBe(0);
        const fail = (what: string) => failures.push(`${where}: ${what}`);
        // The records are exactly the document's content anchored in the window, in document order.
        const expectedDecorations = legacyDecorations.filter(decoration => anchored(present, decoration.tileX, decoration.tileY));
        if (stable(records.decorations) !== stable(expectedDecorations)) fail('decoration records');
        if (stable(records.objects) !== stable(live.objects.filter(object => anchored(present, object.tileX, object.tileY)))) fail('object records');
        if (stable(records.landmarks) !== stable(live.landmarks.filter(landmark => anchored(present, landmark.tileX, landmark.tileY)))) fail('landmark records');
        if (stable(records.walkable) !== stable(walkable.filter(tile => anchored(present, tile.tileX, tile.tileY)).map(({ tileX, tileY }) => ({ tileX, tileY })))) fail('walkable records');
        if (stable([records.id, records.layers, records.prefabs, [...new Set(records.generatedSuppressions)].sort(), records.combatRegions])
          !== stable([live.id, live.layers, live.prefabs, [...new Set(live.generatedSuppressions)].sort(), live.combatRegions ?? []])) fail('map metadata');
        // The painters' draw lists for the view.
        const visible = visibleWorldBounds(view.cameraX, view.cameraY, view.width, view.height, 1, projectionMargin);
        const lightVisible = visibleWorldBounds(view.cameraX, view.cameraY, view.width, view.height, 1, (CAMPFIRE_LIGHT_RADIUS_TILES + 1) * 16);
        const fromRecords = paintDecorations(registry, records.decorations, records, visible, lightVisible);
        const fromDocument = paintDecorations(registry, legacyDecorations, live, visible, lightVisible);
        if (stable(fromRecords) !== stable(fromDocument)) fail(`decoration painter (${fromRecords.queued.length} vs ${fromDocument.queued.length})`);
        const objects = paintObjects(registry, records, visible);
        if (stable(objects) !== stable(paintObjects(registry, live, visible))) fail('object painter');
        // Authored object occluders: on the window terrain, the document's anchored in the window ...
        const recordOccluders = mapObjectLightOccluders(records, terrain, TERRAIN_ARRAY_MAP_OBJECT_SAMPLER, registry, 450);
        const windowObjects = new Set(records.objects.map(({ id }) => id));
        const documentOccluders = mapObjectLightOccluders(live, terrain, TERRAIN_ARRAY_MAP_OBJECT_SAMPLER, registry, 450);
        if (stable(recordOccluders) !== stable(documentOccluders.filter(occluder => windowObjects.has(occluderObject(occluder))))) fail('object occluders (window terrain)');
        // ... and, within light reach of the view, the document's on the whole-map terrain.
        const reach = visibleWorldBounds(view.cameraX, view.cameraY, view.width, view.height, 1, 2 * (CAMPFIRE_LIGHT_RADIUS_TILES + 1) * 16);
        const near = (occluder: { readonly footX: number; readonly footY: number }) => inside(reach, occluder.footX, occluder.footY);
        // Objects out to the same reach (more of each window, connected-object masks at chunk edges included).
        const reachObjects = paintObjects(registry, records, reach);
        if (stable(reachObjects) !== stable(paintObjects(registry, live, reach))) fail('object painter (light reach)');
        const wholeMapOccluders = mapObjectLightOccluders(live, legacyTerrain, TERRAIN_ARRAY_MAP_OBJECT_SAMPLER, registry, 450);
        if (stable(recordOccluders.filter(near)) !== stable(wholeMapOccluders.filter(near))) fail('object occluders (whole-map terrain)');
        // Elevated decoration occluders (before their sprite silhouettes), and their terrain samples in reach.
        const casters = topsideDecorationLightCasters(records.decorations, records, registry, TOPSIDE_SPACE_ID);
        const documentCasters = topsideDecorationLightCasters(legacyDecorations, live, registry, TOPSIDE_SPACE_ID)
          .filter(caster => anchored(present, caster.decoration.tileX, caster.decoration.tileY));
        if (stable(casters) !== stable(documentCasters)) fail('decoration casters');
        for (const caster of casters) {
          if (!inside(reach, caster.worldX, caster.worldY)) continue;
          if (terrainProjectedDepthAtFoot(terrain, caster.worldX, caster.worldY) !== terrainProjectedDepthAtFoot(legacyTerrain, caster.worldX, caster.worldY)
            || terrainElevationAtWorldFoot(terrain, caster.worldX, caster.worldY) !== terrainElevationAtWorldFoot(legacyTerrain, caster.worldX, caster.worldY)) {
            fail(`decoration caster terrain ${caster.tie}`);
          }
        }
        // Pond ties, the supply cache (when its tile is in the window) and the ferry regions.
        if (stable([...protocolPondTies(records.decorations, records)]) !== stable([...protocolPondTies(expectedDecorations, live)])) fail('pond ties');
        if (anchored(present, cache.tileX, cache.tileY)) {
          totals.cacheWindows++;
          if (hearthSupplyCacheInstalled(cache, records) !== hearthSupplyCacheInstalled(cache, live)) fail('supply cache');
        }
        totals.decorations += records.decorations.length; totals.queued += fromRecords.queued.length; totals.lights += fromRecords.pointLights.length;
        totals.objects += objects.length; totals.reachObjects += reachObjects.length; totals.occluders += recordOccluders.length; totals.casters += casters.length;
      }
      console.info(`[S4e] ${label}: ${centres.length} views; per view on average ${Math.round(totals.decorations / centres.length)} decoration records, `
        + `${Math.round(totals.queued / centres.length)} decorations and ${(totals.lights / centres.length).toFixed(1)} lights drawn, `
        + `${(totals.objects / centres.length).toFixed(1)} object draws (${(totals.reachObjects / centres.length).toFixed(1)} within light reach), `
        + `${(totals.occluders / centres.length).toFixed(1)} object and `
        + `${Math.round(totals.casters / centres.length)} decoration occluders; supply cache in ${totals.cacheWindows} windows`);
      expect(failures).toEqual([]);
      expect(centres).toHaveLength(169 + 12);
      // Not vacuous.
      expect(totals.queued).toBeGreaterThan(169 * 10);
      expect(totals.casters).toBeGreaterThan(169 * 10);
      if (authored) {
        expect(totals.objects).toBeGreaterThan(169);
        expect(totals.reachObjects).toBeGreaterThan(169 * 4);
        expect(totals.lights).toBeGreaterThan(60);
        expect(totals.occluders).toBeGreaterThan(169 * 20);
        expect(totals.cacheWindows).toBeGreaterThan(0);
        expect(hearthSupplyCacheInstalled(cache, live)).toBe(true);
      }
    }, 900_000);

    it('detects a window that lacks a chunk under the view (negative control)', () => {
      source.setView(viewTiles(cameraAt(416, 360, LARGE_VIEW)));
      const served = source.collision(registry)!;
      const records = source.mapRecords(registry)!;
      const centre = `${Math.floor(416 / WORLD_CHUNK_SIZE)}:${Math.floor(360 / WORLD_CHUNK_SIZE)}`;
      const holed = legacyDecorations.filter(decoration => anchored(new Set([...records.present].filter(key => key !== centre)), decoration.tileX, decoration.tileY));
      expect(records.present.has(centre)).toBe(true);
      expect(served.window.present.has(centre)).toBe(true);
      const view = cameraAt(416, 360, LARGE_VIEW);
      const visible = visibleWorldBounds(view.cameraX, view.cameraY, view.width, view.height, 1, 64);
      expect(stable(paintDecorations(registry, holed, records, visible, visible)))
        .not.toBe(stable(paintDecorations(registry, legacyDecorations, live, visible, visible)));
    }, 60_000);
  });
}

describeParity('bootstrap island', registry => createLiveIslandMapDocument({ landmarks: activeSurvivalLandmarks(registry, TOPSIDE_SPACE_ID) }), false);
describeParity('authored fixture', topsideAuthoredFixture, true);

import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  activeSurvivalLandmarks, AUTHORITY_TICKS_PER_DAY, authoredMapContentPainterTie, bootstrapContentRegistry, dayProgressAtClockTime,
  generateSurvivalLandmarkDecorations, generateSurvivalProceduralDecorations, hearthSupplyCacheInstalled,
  mapLandmarkDecoration, runtimeHearthFerryNetwork, runtimeHearthSupplyCache, runtimeLandmarkCampfirePlans, survivalDecorationBlocksTraversal,
  survivalDecorationObstacle, SURVIVAL_WORLD_SEED, TOPSIDE_SPACE_ID, type MapDocumentV3,
} from '@orchard/sim';
import { isLightEmitterKind } from '@orchard/engine/light-sources';
import {
  enqueueLiveMapObjects, liveIslandDocument, liveMapObjectLightFrameKey, liveMapObjectLightOccluders, preloadLiveMapObjectAssets,
} from '@orchard/engine/live-map-runtime';
import { overworldPoiDecorationDepthY } from '@orchard/engine/overworld-art';
import type { WorldDepthItem } from '@orchard/engine/renderer';
import type { TerrainArray } from '@orchard/engine/terrain';
import { enqueueGameplayDecorations } from './gameplay-painter-decorations.js';
import type { RuntimeSurvivalDecoration } from './gameplay-painter-inputs.js';
import { protocolPondTies } from './render-protocol-ponds.js';
import { topsideAuthoredFixture, topsideFixtureRow } from './topside-map-records.fixture.js';

const terrainFormulas = vi.hoisted(() => ({
  elevation: (_terrain: unknown, x: number, y: number) => ((x >> 4) + (y >> 4)) % 3,
  depth: (_terrain: unknown, x: number, y: number) => (((x + y) >> 4) % 2) * 8,
  sortElevation: (_terrain: unknown, x: number, y: number) => (((x * 3 + y) >> 4) % 4) * 0.75,
  sortOffset: (elevation: number) => elevation * 0.25,
}));
vi.mock('@orchard/engine/terrain', async (original) => ({
  ...await original<typeof import('@orchard/engine/terrain')>(),
  terrainElevationAtWorldFoot: terrainFormulas.elevation,
  terrainProjectedDepthAtFoot: terrainFormulas.depth,
  terrainProjectedElevationAtFoot: terrainFormulas.sortElevation,
  terrainProjectedSortOffset: terrainFormulas.sortOffset,
}));
vi.mock('@orchard/ui', async (original) => {
  const { fixtureAssetMetadata } = await import('./topside-map-records.fixture.js');
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

/** Captured from the pre-S4e painters and overworld-main functions (main 11d46f47). */
const PRE_S4E_GOLDEN = '2b9f3b5009f5ecd9799ff91c2cda6930697ea2e732ac63b0806f90620171273b';

const registry = bootstrapContentRegistry();
const tick = (hour: number) => BigInt(Math.round(dayProgressAtClockTime(hour) * AUTHORITY_TICKS_PER_DAY));
const TERRAIN = { version: 3 } as unknown as TerrainArray;
const WHOLE_MAP = { left: -64, top: -64, right: 832 * 16 + 64, bottom: 832 * 16 + 64 };

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

/** Stable text: sorted keys, typed arrays as a digest, bigints spelled out. */
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

// ---- The pre-S4e overworld-main functions, verbatim (golden capture only). ----
const topsideDecorationCache = new WeakMap<MapDocumentV3, Map<number, readonly RuntimeSurvivalDecoration[]>>();
function preTopsideDecorations(document: MapDocumentV3 | null, seed: number): readonly RuntimeSurvivalDecoration[] {
  if (document === null) return Object.freeze([
    ...generateSurvivalProceduralDecorations(seed, registry),
    ...generateSurvivalLandmarkDecorations(activeSurvivalLandmarks(registry, TOPSIDE_SPACE_ID)),
  ]);
  const bySeed = topsideDecorationCache.get(document) ?? new Map();
  const cached = bySeed.get(seed);
  if (cached !== undefined) return cached;
  const decorations = Object.freeze([
    ...generateSurvivalProceduralDecorations(seed, registry),
    ...document.landmarks
      .filter((landmark) => landmark.enabled)
      .map((landmark) => ({ ...mapLandmarkDecoration(landmark), landmark })),
  ]);
  bySeed.set(seed, decorations);
  topsideDecorationCache.set(document, bySeed);
  return decorations;
}
function preDecorationCasters(document: MapDocumentV3 | null, decorations: readonly RuntimeSurvivalDecoration[]) {
  const result: unknown[] = [];
  const liveDocument = document;
  const suppressions = new Set(liveDocument?.generatedSuppressions ?? []);
  const landmarkCampfires = new Set(runtimeLandmarkCampfirePlans(registry)
    .filter(plan => plan.spaceId === TOPSIDE_SPACE_ID).map(plan => plan.runtimeId));
  for (const decoration of decorations) {
    if (suppressions.has(`decoration-${decoration.id}`)) continue;
    if (landmarkCampfires.has(BigInt(decoration.id))) continue;
    if (!survivalDecorationBlocksTraversal(decoration.kind, 'ground', registry)) continue;
    if (decoration.kind === 'camp_pond') continue;
    if (isLightEmitterKind(decoration.kind)) continue;
    result.push([decoration.kind, 'base', decoration.tileX * 16 + 8, (decoration.tileY + 1) * 16,
      survivalDecorationObstacle(decoration, 'ground', registry),
      decoration.landmark === undefined ? `decoration:${decoration.id}`
        : liveDocument === null ? `landmark:${decoration.landmark.id}`
          : authoredMapContentPainterTie(liveDocument, decoration.landmark.layer, 'landmark', decoration.landmark.id),
      overworldPoiDecorationDepthY(decoration.kind, (decoration.tileY + 1) * 16)]);
  }
  return result;
}

/** Everything the topside painters and overworld-main derive from the map in modes off and shadow. */
async function legacyOutputs(document: MapDocumentV3) {
  const row = topsideFixtureRow(document, 'topside-golden');
  const live = liveIslandDocument(row, registry)!;
  await preloadLiveMapObjectAssets(live);
  const decorations = preTopsideDecorations(live, SURVIVAL_WORLD_SEED);
  const outputs: Record<string, unknown> = { decorations };
  for (const hour of [12, 22]) {
    const queued: unknown[] = [];
    const pointLights: unknown[] = [];
    const input = {
      dynamicLighting: true, debugEntitiesHidden: false,
      activeSpaceDefinition: { spaceId: TOPSIDE_SPACE_ID, generator: 'survival_island' },
      snapshot: { content: { registry }, placeables: [], homesteads: [], liveMapDocument: row, clock: { authorityTick: tick(hour) } },
      pointLights, projectedLight: (light: object, y?: number, x?: number) => ({ ...light, projectedY: y, projectedX: x }),
      homesteadSurroundingDecorations: () => [], seed: SURVIVAL_WORLD_SEED,
      topsideDecorations: () => decorations,
      visible: WHOLE_MAP, lightVisible: WHOLE_MAP,
      enqueueWorldDepth: (x: number, y: number, item: WorldDepthItem, terrainSampleY?: number, receiver?: string) =>
        queued.push([x, y, item.footY, item.tie, item.depthPhase ?? null, terrainSampleY ?? null, receiver ?? null]),
      context: recordingContext(), art: {}, cameraX: 0, cameraY: 0, scale: 2,
      visualTickClock: { renderTick: 0 }, renderWeather: { wind: 0 }, frameLightingModel: 'unified',
      drawSouthFacingReceiver: () => undefined, nameplates: [], renderedPlayerAnchors: new Map(), objectPresentations: {},
    };
    enqueueGameplayDecorations(input as unknown as Parameters<typeof enqueueGameplayDecorations>[0]);
    outputs[`painter/${hour}`] = { queued, pointLights };
  }
  for (const timeMs of [0, 450]) {
    const context = recordingContext();
    const items: unknown[] = [];
    enqueueLiveMapObjects(liveIslandDocument(row, registry), {
      context, cameraX: 0, cameraY: 0, scale: 2, timeMs, materializedStreetlamps: true, contentRegistry: registry,
      visible: () => true,
      enqueue: (x, y, item) => {
        context.log.length = 0;
        item.draw();
        items.push([x, y, item.footY, item.tie, item.depthPhase ?? null, structuredClone(context.log)]);
      },
    });
    outputs[`objects/${timeMs}`] = items;
    outputs[`occluders/${timeMs}`] = liveMapObjectLightOccluders(live, TERRAIN, registry, timeMs);
    outputs[`frameKey/${timeMs}`] = liveMapObjectLightFrameKey(live, registry, timeMs);
  }
  outputs['casters'] = preDecorationCasters(live, decorations);
  const cache = runtimeHearthSupplyCache(registry, undefined, TOPSIDE_SPACE_ID)!;
  outputs['supplyCache'] = hearthSupplyCacheInstalled(cache, live);
  outputs['ferry'] = runtimeHearthFerryNetwork(registry)!.destinations.map(destination =>
    live.combatRegions?.some(region => region.id === destination.availabilityRegion) === true);
  outputs['ponds'] = [...protocolPondTies(decorations, live)];
  return outputs;
}

describe('topside map records in modes off and shadow (static world S4e)', () => {
  it('draw exactly what the pre-S4e painters drew (golden)', async () => {
    const outputs = await legacyOutputs(topsideAuthoredFixture(registry));
    expect(outputs['supplyCache']).toBe(true);
    expect(outputs['ferry']).toContain(true);
    expect(createHash('sha256').update(stable(outputs)).digest('hex')).toBe(PRE_S4E_GOLDEN);
  }, 120_000);
});

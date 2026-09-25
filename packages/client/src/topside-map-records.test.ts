import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  AUTHORITY_TICKS_PER_DAY, bootstrapContentRegistry, dayProgressAtClockTime, hearthSupplyCacheInstalled, runtimeHearthFerryNetwork,
  runtimeHearthSupplyCache, SURVIVAL_WORLD_SEED, TOPSIDE_SPACE_ID, type MapDocumentV3,
} from '@orchard/sim';
import { liveIslandDocument, TERRAIN_ARRAY_MAP_OBJECT_SAMPLER } from '@orchard/engine/live-map-runtime';
import { enqueueMapObjects, mapObjectLightFrameKey, mapObjectLightOccluders, preloadMapObjectAssets } from '@orchard/engine/map-object-presentation';
import type { WorldDepthItem } from '@orchard/engine/renderer';
import type { TerrainArray } from '@orchard/engine/terrain';
import { enqueueGameplayDecorations } from './gameplay-painter-decorations.js';
import { protocolPondTies } from './render-protocol-ponds.js';
import { topsideAuthoredFixture, topsideFixtureRow } from './topside-map-records.fixture.js';
import { legacyTopsideDecorations, topsideDecorationLightCasters, topsideDecorationsFor, topsideMapRecords } from './topside-map-records.js';
import { WorldSource } from './world-source.js';

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

/** Captured from the pre-S4e painters and overworld-main functions on main 11d46f47
 * (this file at the branch's first commit calls them unchanged). */
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

/** Modes off and shadow: no chunk store serves (ChunkRuntimeController.store is
 * defined only in mode `on` once a revision has swapped in). */
const offOrShadow = new WorldSource({ store: () => undefined, pin: () => undefined });

/** Everything the topside painters and overworld-main derive from the map in modes off and shadow. */
async function legacyOutputs(document: MapDocumentV3) {
  const row = topsideFixtureRow(document, 'topside-golden');
  const live = liveIslandDocument(row, registry)!;
  const records = topsideMapRecords(offOrShadow, registry, () => liveIslandDocument(row, registry));
  // The same document object as before S4e, so every retained cache keeps its identity.
  expect(records).toBe(live);
  await preloadMapObjectAssets(records!);
  const decorations = topsideDecorationsFor(records, SURVIVAL_WORLD_SEED, registry, () => liveIslandDocument(row, registry));
  expect(decorations).toBe(legacyTopsideDecorations(live, SURVIVAL_WORLD_SEED, registry));
  const outputs: Record<string, unknown> = { decorations };
  for (const hour of [12, 22]) {
    const queued: unknown[] = [];
    const pointLights: unknown[] = [];
    const input = {
      dynamicLighting: true, debugEntitiesHidden: false,
      activeSpaceDefinition: { spaceId: TOPSIDE_SPACE_ID, generator: 'survival_island' },
      snapshot: { content: { registry }, placeables: [], homesteads: [], clock: { authorityTick: tick(hour) } },
      pointLights, projectedLight: (light: object, y?: number, x?: number) => ({ ...light, projectedY: y, projectedX: x }),
      homesteadSurroundingDecorations: () => [], seed: SURVIVAL_WORLD_SEED,
      topsideDecorations: () => decorations, topsideMapRecords: records,
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
    // gameplay-painter-setup's call.
    enqueueMapObjects(records, {
      context, cameraX: 0, cameraY: 0, scale: 2, timeMs, materializedStreetlamps: true, contentRegistry: registry,
      visible: () => true,
      enqueue: (x, y, item) => {
        context.log.length = 0;
        item.draw();
        items.push([x, y, item.footY, item.tie, item.depthPhase ?? null, structuredClone(context.log)]);
      },
    });
    outputs[`objects/${timeMs}`] = items;
    // overworld-main's authored light occluders and their frame key.
    outputs[`occluders/${timeMs}`] = mapObjectLightOccluders(records, TERRAIN, TERRAIN_ARRAY_MAP_OBJECT_SAMPLER, registry, timeMs);
    outputs[`frameKey/${timeMs}`] = mapObjectLightFrameKey(records, registry, timeMs);
  }
  // overworld-main's elevated decoration occluders (before their sprite silhouettes).
  outputs['casters'] = topsideDecorationLightCasters(decorations, records, registry, TOPSIDE_SPACE_ID).map(caster =>
    [caster.decoration.kind, 'base', caster.worldX, caster.worldY, caster.obstacle, caster.tie, caster.painterFootY]);
  const cache = runtimeHearthSupplyCache(registry, undefined, TOPSIDE_SPACE_ID)!;
  outputs['supplyCache'] = hearthSupplyCacheInstalled(cache, records);
  outputs['ferry'] = runtimeHearthFerryNetwork(registry)!.destinations.map(destination =>
    records?.combatRegions?.some(region => region.id === destination.availabilityRegion) === true);
  outputs['ponds'] = [...protocolPondTies(decorations, records)];
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

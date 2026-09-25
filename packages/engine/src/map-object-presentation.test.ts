import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it, vi } from 'vitest';
import {
  AUTHORITY_TICKS_PER_DAY,
  bootstrapContentRegistry,
  connectedObjectAsset,
  createLiveIslandMapDocument,
  createMapPrefabDocument,
  dayProgressAtClockTime,
  type MapDocumentV3,
  type MapObjectInstance,
  type MapPrefabDocumentV2,
} from '@orchard/sim';
import type { AssetFrameSource, AtlasFrame, LoadedAsset } from '@orchard/ui';
import { withGroundSpriteSource } from './ground-light-source.js';
import {
  enqueueLiveMapObjects,
  liveMapObjectAssetsReady,
  liveMapObjectLightFrameKey,
  liveMapObjectLightOccluders,
  liveMapObjectPointLights,
  preloadLiveMapObjectAssets,
} from './live-map-runtime.js';
import {
  enqueueMapObjects,
  mapObjectAssetsReady,
  mapObjectLightFrameKey,
  mapObjectLightOccluders,
  mapObjectPointLights,
  preloadMapObjectAssets,
  type MapObjectRecords,
  type MapObjectTerrainSampler,
} from './map-object-presentation.js';
import type { WorldDepthItem } from './renderer.js';
import type { TerrainArray } from './terrain.js';

/** Deterministic, position-dependent terrain answers. The adapter reaches them
 * through the mocked `terrain.ts`; the direct call uses its own sampler. */
const terrainFormulas = vi.hoisted(() => ({
  elevation: (_terrain: unknown, x: number, y: number) => ((x >> 4) + (y >> 4)) % 3,
  depth: (_terrain: unknown, x: number, y: number) => (((x + y) >> 4) % 2) * 8,
  sortElevation: (_terrain: unknown, x: number, y: number) => (((x * 3 + y) >> 4) % 4) * 0.75,
  sortOffset: (elevation: number) => elevation * 0.25,
}));

vi.mock('./terrain.js', async (original) => ({
  ...await original<typeof import('./terrain.js')>(),
  terrainElevationAtWorldFoot: terrainFormulas.elevation,
  terrainProjectedDepthAtFoot: terrainFormulas.depth,
  terrainProjectedElevationAtFoot: terrainFormulas.sortElevation,
  terrainProjectedSortOffset: terrainFormulas.sortOffset,
}));

vi.mock('@orchard/ui', async (original) => {
  const frame = (x: number, height = 32) => ({ x, y: 0, width: 16, height, durationTicks: 1 });
  return {
    ...await original<typeof import('@orchard/ui')>(),
    loadGeneratedAsset: async (name: string) => ({
      name,
      metadata: {
        image: `${name}.png`,
        animations: { burn: [frame(0), frame(16)], sway: [frame(32), frame(48, 48)] },
        animationMeta: { sway: { fps: 5 } },
        states: { base: frame(64), on: frame(80, 40) },
      },
      anchor: name.length % 2 === 0 ? [8, 31] : [7, 29],
    }),
  };
});

vi.mock('./world-asset-presentation.js', () => ({
  worldAssetFrameSource: (
    _context: unknown,
    asset: LoadedAsset,
    frame: AtlasFrame,
    transform: ((source: AssetFrameSource) => AssetFrameSource) | undefined,
    receivesGlobal: boolean,
  ) => {
    const source = {
      image: { asset: asset.name, receivesGlobal } as unknown as CanvasImageSource,
      x: frame.x, y: frame.y, width: frame.width, height: frame.height,
    };
    return transform?.(source) ?? source;
  },
}));

vi.mock('./light-occlusion.js', async (original) => ({
  ...await original<typeof import('./light-occlusion.js')>(),
  createFrameLightOccluder: (_asset: unknown, frame: AtlasFrame) => {
    const opaque = new Uint8Array(frame.width * frame.height);
    for (let index = 0; index < opaque.length; index += 1) opaque[index] = (index + frame.x) % 3 === 0 ? 1 : 0;
    return { left: -8, top: 1 - frame.height, width: frame.width, height: frame.height, opaque };
  },
}));

vi.mock('./connected-objects.js', () => ({
  preloadConnectedObjectArt: async () => undefined,
  drawConnectedObject: (context: { log: unknown[] }, family: string, mask: number, x: number, y: number,
    cameraX: number, cameraY: number, scale: number) => {
    context.log.push(['connected', family, mask, x, y, cameraX, cameraY, scale]);
    return true;
  },
}));

const registry = bootstrapContentRegistry();
const tick = (hour: number) => BigInt(Math.round(dayProgressAtClockTime(hour) * AUTHORITY_TICKS_PER_DAY));

function placement(id: string, assetName: string, visual: { kind: 'state' | 'animation'; name: string }, extra: object = {}) {
  return {
    id, assetId: 1, assetName, tileX: 0, tileY: 0, elevation: 0, layer: 'object' as const,
    quarterTurns: 0 as const, flipX: false, visual: { ...visual, frameIndex: 0 }, ...extra,
  };
}

function prefab(id: string, fields: Partial<MapPrefabDocumentV2>): MapPrefabDocumentV2 {
  return { ...createMapPrefabDocument({ id, title: id }), ...fields };
}

/** Exercises multi-placement prefabs, pivots, every quarter turn, flips, scale,
 * state-driven presentation, ground/canopy layers, lights, streetlamps, a
 * connected fence run, a disabled object and a stale prefab revision. */
function fixtureDocument(): MapDocumentV3 {
  const fence = connectedObjectAsset('wood_fence');
  const prefabs: MapPrefabDocumentV2[] = [
    prefab('tree', {
      width: 3, height: 3, pivot: { tileX: 1, tileY: 2 },
      cells: [{ id: 'trunk', tileX: 1, tileY: 2, elevation: 0, collisionMask: 0x0660 },
        { id: 'root', tileX: 2, tileY: 2, elevation: 0, collisionMask: 0x000f }],
      placements: [
        placement('trunk', 'tree_trunk_fixture', { kind: 'state', name: 'base' }, { tileX: 1, tileY: 2 }),
        placement('canopy', 'tree_canopy_fixture', { kind: 'animation', name: 'sway' }, { tileX: 1, tileY: 1, layer: 'canopy', flipX: true, quarterTurns: 1 }),
      ],
    }),
    prefab('torch', { placements: [placement('flame', 'prop_cf_standing_torch', { kind: 'animation', name: 'burn' })] }),
    prefab('streetlamp', { placements: [placement('lamp', 'prop_cf_hearth_streetlamp', { kind: 'state', name: 'base' })] }),
    prefab('standing-lamp', {
      cells: [{ id: 'base', tileX: 0, tileY: 0, elevation: 0, collisionMask: 0xffff }],
      placements: [placement('lamp', 'prop_cf_furniture_rustic_standing_lamp', { kind: 'state', name: 'base' })],
    }),
    prefab('rug', { width: 2, placements: [placement('rug', 'rug_fixture', { kind: 'state', name: 'base' }, { layer: 'ground', tileX: 1, quarterTurns: 3, flipX: true })] }),
    prefab('fence', { placements: [placement('rail', fence, { kind: 'state', name: 'base' })] }),
    prefab('sapling', {
      presentation: {
        properties: { grown: { type: 'bool', default: false } },
        rules: [{ when: { grown: true }, placementId: 'plant', appearance: { assetId: 2, assetName: 'grown_fixture', visual: { kind: 'state', name: 'on', frameIndex: 0 } }, scalePermille: 1500 }],
      },
      placements: [placement('plant', 'sapling_fixture', { kind: 'state', name: 'base' })],
    }),
  ];
  const object = (id: string, prefabId: string, tileX: number, tileY: number, fields: Partial<MapObjectInstance> = {}): MapObjectInstance => ({
    id, prefabId, prefabRevision: 0, tileX, tileY, elevation: 0, layer: 'objects',
    quarterTurns: 0, flipX: false, scale: 1, enabled: true, ...fields,
  });
  const objects: MapObjectInstance[] = [
    object('tree-a', 'tree', 10, 10),
    object('tree-b', 'tree', 20, 12, { quarterTurns: 1, flipX: true, layer: 'canopy' }),
    object('tree-c', 'tree', 30, 14, { quarterTurns: 2, scale: 2 }),
    object('tree-d', 'tree', 40, 16, { quarterTurns: 3, layer: 'gameplay' }),
    object('torch-a', 'torch', 12, 30, { scale: 2, quarterTurns: 1 }),
    object('torch-b', 'torch', 14, 30, { flipX: true }),
    object('lamp-town', 'streetlamp', 16, 30),
    object('lamp-home', 'standing-lamp', 18, 30),
    object('rug-a', 'rug', 22, 30, { layer: 'ground', quarterTurns: 1, scale: 2 }),
    object('fence-1', 'fence', 30, 40), object('fence-2', 'fence', 31, 40), object('fence-3', 'fence', 31, 41),
    object('sapling-small', 'sapling', 50, 50),
    object('sapling-grown', 'sapling', 52, 50, { state: { grown: true } }),
    object('disabled-tree', 'tree', 60, 60, { enabled: false }),
    object('stale-revision', 'torch', 62, 60, { prefabRevision: 9 }),
    object('culled-torch', 'torch', 400, 400),
  ];
  return { ...createLiveIslandMapDocument(), prefabs, objects };
}

/** What a chunk decoder would hand over: fresh copies of the same lists. */
function plainRecords(document: MapDocumentV3): MapObjectRecords {
  return {
    id: document.id,
    layers: structuredClone(document.layers),
    prefabs: structuredClone(document.prefabs),
    objects: structuredClone(document.objects),
  };
}

const directSampler: MapObjectTerrainSampler<TerrainArray> = {
  elevationAtWorldFoot: (terrain, x, y) => terrainFormulas.elevation(terrain, x, y),
  projectedDepthAtFoot: (terrain, x, y) => terrainFormulas.depth(terrain, x, y),
  projectedElevationAtFoot: (terrain, x, y) => terrainFormulas.sortElevation(terrain, x, y),
  projectedSortOffset: (elevation) => terrainFormulas.sortOffset(elevation),
};

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

type Enqueue = (context: CanvasRenderingContext2D, enqueue: (x: number, y: number, item: WorldDepthItem) => void) => number;

/** Queues, then draws every item, recording the full canvas call stream. */
function drawSpecs(run: Enqueue) {
  const context = recordingContext();
  const queued: { x: number; y: number; item: WorldDepthItem }[] = [];
  const count = run(context, (x, y, item) => queued.push({ x, y, item }));
  const items = queued.map(({ x, y, item }) => {
    context.log.length = 0;
    withGroundSpriteSource(context, (source, groundX, groundY, basis) => {
      context.log.push(['ground-source', groundX, groundY, basis]);
      return source;
    }, () => item.draw());
    const spec = { footY: item.footY, depthPhase: item.depthPhase, tie: item.tie, keys: Object.keys(item).sort() };
    return { x, y, spec, calls: structuredClone(context.log) };
  });
  return { count, items };
}

interface PresentationApi<Source> {
  readonly preload: (source: Source) => Promise<void>;
  readonly ready: (source: Source) => boolean;
  readonly enqueue: (source: Source, options: Parameters<typeof enqueueMapObjects>[1]) => number;
  readonly lights: (source: Source, authorityTick: bigint, materialized: boolean) => unknown[];
  readonly occluders: (source: Source, terrain: TerrainArray, timeMs: number) => unknown[];
  readonly frameKey: (source: Source, timeMs: number) => string;
  readonly withoutObject: (source: Source, id: string) => Source;
}

const FIXTURE_TERRAIN = { version: 7 } as unknown as TerrainArray;

/** Everything the presentation produces for the fixture: the canvas call
 * stream and painter spec of every queued item (including connected-object
 * masks and ground-sprite bases), lights, occluders and frame keys. */
async function fullOutput<Source>(source: Source, api: PresentationApi<Source>) {
  await api.preload(source);
  const draws: Record<string, ReturnType<typeof drawSpecs>> = {};
  const frameKeys: Record<string, string> = {};
  const occluders: Record<string, unknown[]> = {};
  const lights: Record<string, unknown[]> = {};
  const variants = [
    { materializedStreetlamps: false, calendarTick: tick(12) },
    { materializedStreetlamps: false, calendarTick: tick(22), contentRegistry: registry },
    { materializedStreetlamps: true, calendarTick: tick(22), contentRegistry: registry },
  ];
  for (const timeMs of [0, 200, 450]) {
    for (const [index, variant] of variants.entries()) {
      const common = { ...variant, cameraX: 37, cameraY: -11, scale: 3, timeMs, visible: (x: number) => x < 2_000 };
      draws[`${timeMs}/${index}`] = drawSpecs((context, enqueue) => api.enqueue(source, { ...common, context, enqueue }));
      // A culled caller keeps the whole-map topology source.
      draws[`${timeMs}/${index}/culled`] = drawSpecs((context, enqueue) => api.enqueue(api.withoutObject(source, 'fence-3'),
        { ...common, connectionDocument: source as MapObjectRecords, context, enqueue }));
    }
    frameKeys[timeMs] = api.frameKey(source, timeMs);
    occluders[timeMs] = api.occluders(source, FIXTURE_TERRAIN, timeMs);
  }
  for (const hour of [12, 22]) {
    for (const materialized of [false, true]) lights[`${hour}/${materialized}`] = api.lights(source, tick(hour), materialized);
  }
  return { ready: api.ready(source), draws, frameKeys, occluders, lights };
}

const adapterApi: PresentationApi<MapDocumentV3> = {
  preload: preloadLiveMapObjectAssets,
  ready: liveMapObjectAssetsReady,
  enqueue: (document, options) => enqueueLiveMapObjects(document, options),
  lights: (document, authorityTick, materialized) => liveMapObjectPointLights(document, registry, authorityTick, materialized),
  occluders: (document, terrain, timeMs) => liveMapObjectLightOccluders(document, terrain, registry, timeMs),
  frameKey: (document, timeMs) => liveMapObjectLightFrameKey(document, registry, timeMs),
  withoutObject: (document, id) => ({ ...document, objects: document.objects.filter((object) => object.id !== id) }),
};

const directApi: PresentationApi<MapObjectRecords> = {
  preload: preloadMapObjectAssets,
  ready: mapObjectAssetsReady,
  enqueue: (records, options) => enqueueMapObjects(records, options),
  lights: (records, authorityTick, materialized) => mapObjectPointLights(records, registry, authorityTick, materialized),
  occluders: (records, terrain, timeMs) => mapObjectLightOccluders(records, terrain, directSampler, registry, timeMs),
  frameKey: (records, timeMs) => mapObjectLightFrameKey(records, registry, timeMs),
  withoutObject: (records, id) => ({ ...records, objects: records.objects.filter((object) => object.id !== id) }),
};

/** Stable golden text: sorted keys, typed arrays as length plus digest, and
 * bigint, -0 and non-finite numbers spelled out. */
function goldenJson(value: unknown): string {
  return `${JSON.stringify(value, (_key, entry: unknown) => {
    if (typeof entry === 'bigint') return `${entry}n`;
    if (typeof entry === 'number' && (Object.is(entry, -0) || !Number.isFinite(entry))) return Object.is(entry, -0) ? '-0' : String(entry);
    if (ArrayBuffer.isView(entry)) {
      const bytes = new Uint8Array(entry.buffer, entry.byteOffset, entry.byteLength);
      return { typedArray: entry.constructor.name, length: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    }
    if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
      return Object.fromEntries(Object.entries(entry).sort(([left], [right]) => left.localeCompare(right)));
    }
    return entry;
  })}\n`.replaceAll('},{', '},\n{');
}

describe('map object presentation', () => {
  it('matches the golden recorded from the pre-split live-map-runtime (c2e85788)', async () => {
    const output = await fullOutput(fixtureDocument(), adapterApi);
    expect(output.ready).toBe(true);
    expect(Object.values(output.draws).every(({ count }) => count > 10)).toBe(true);
    expect(JSON.stringify(output.draws)).toContain('"connected"');
    expect(JSON.stringify(output.draws)).toContain('"ground-source"');
    expect(Object.values(output.occluders).every((list) => list.length > 4)).toBe(true);
    expect(output.lights['22/false']!.length).toBeGreaterThan(0);
    await expect(goldenJson(output)).toMatchFileSnapshot('./map-object-presentation.golden.json');
  });

  it('draws, lights and occludes plain records exactly as the live document adapter does', async () => {
    const document = fixtureDocument();
    const records = plainRecords(document);
    expect(mapObjectAssetsReady(records)).toBe(liveMapObjectAssetsReady(document));
    const adapter = await fullOutput(document, adapterApi);
    expect(await fullOutput(records, directApi)).toEqual(adapter);

    expect(enqueueMapObjects(null, { context: recordingContext(), cameraX: 0, cameraY: 0, scale: 1, timeMs: 0,
      visible: () => true, enqueue: () => undefined })).toBe(0);
    expect(mapObjectPointLights(null, registry, 0n)).toEqual([]);
    expect(mapObjectLightOccluders(null, FIXTURE_TERRAIN, directSampler, registry, 0)).toEqual([]);
  });
});

/** Import boundary: the presentation module must be loadable without the
 * whole-map generator or compiler. Only value imports count (type imports are
 * erased). The walk stops at a legacy module and reports who reached it. */
const engineSource = dirname(fileURLToPath(import.meta.url));
const packagesRoot = resolve(engineSource, '../..');
const LEGACY_MODULE = /\/packages\/(?:sim\/src\/(?:index|procedural-terrain[^/]*|survival-world[^/]*|map-compiler[^/]*|map-document-v3)|engine\/src\/(?:terrain|live-map-runtime|editor-terrain))\.ts$/u;

function valueImportSpecifiers(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, false);
  const specifiers: string[] = [];
  for (const statement of source.statements) {
    if (!(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))) continue;
    if (statement.moduleSpecifier === undefined || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      if (clause?.isTypeOnly) continue;
      const named = clause?.namedBindings;
      if (clause !== undefined && clause.name === undefined && named !== undefined && ts.isNamedImports(named)
        && named.elements.length > 0 && named.elements.every((element) => element.isTypeOnly)) continue;
    } else {
      if (statement.isTypeOnly) continue;
      const clause = statement.exportClause;
      if (clause !== undefined && ts.isNamedExports(clause) && clause.elements.length > 0
        && clause.elements.every((element) => element.isTypeOnly)) continue;
    }
    specifiers.push(statement.moduleSpecifier.text);
  }
  return specifiers;
}

function packageExport(packageName: string, subpath: string): string {
  const manifest = JSON.parse(readFileSync(resolve(packagesRoot, packageName, 'package.json'), 'utf8')) as { exports: Record<string, string> };
  const exact = manifest.exports[subpath];
  const wildcard = manifest.exports['./*'];
  const target = exact ?? (wildcard === undefined ? undefined : wildcard.replace('*', subpath.slice(2)));
  if (target === undefined) throw new Error(`@orchard/${packageName} does not export ${subpath}`);
  return resolve(packagesRoot, packageName, target);
}

function resolveImport(from: string, specifier: string): string | null {
  if (specifier.startsWith('.')) {
    const base = resolve(dirname(from), specifier).replace(/\.js$/u, '');
    for (const candidate of [`${base}.ts`, `${base}/index.ts`, base]) {
      if (/\.(?:ts|json)$/u.test(candidate) && existsSync(candidate)) return candidate;
    }
    throw new Error(`Unresolved import ${specifier} from ${from}`);
  }
  const match = /^@orchard\/([^/]+)(\/.*)?$/u.exec(specifier);
  if (match === null) return null;
  return packageExport(match[1]!, match[2] === undefined ? '.' : `.${match[2]}`);
}

/** Direct dependencies of `entry` through which a legacy module is reachable. */
function legacyReachThrough(entry: string): Map<string, string[]> {
  const reach = new Map<string, string[]>();
  for (const specifier of valueImportSpecifiers(entry)) {
    const start = resolveImport(entry, specifier);
    if (start === null) continue;
    const seen = new Set<string>();
    const stack = [start];
    const found: string[] = [];
    while (stack.length > 0) {
      const file = stack.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      if (LEGACY_MODULE.test(file)) { found.push(file.slice(packagesRoot.length + 1)); continue; }
      if (!file.endsWith('.ts')) continue;
      for (const next of valueImportSpecifiers(file)) {
        const resolved = resolveImport(file, next);
        if (resolved !== null) stack.push(resolved);
      }
    }
    if (found.length > 0) reach.set(specifier, found.sort());
  }
  return reach;
}

describe('map object presentation import boundary', () => {
  const entry = resolve(engineSource, 'map-object-presentation.ts');

  it('imports no generator, compiler, map document, terrain or sim barrel module directly', () => {
    const direct = valueImportSpecifiers(entry).map((specifier) => resolveImport(entry, specifier)).filter((file): file is string => file !== null);
    expect(direct.length).toBeGreaterThan(10);
    expect(direct.filter((file) => LEGACY_MODULE.test(file))).toEqual([]);
    expect(valueImportSpecifiers(entry)).not.toContain('@orchard/sim');
  });

  it('takes sim values only from generator-free leaf modules', () => {
    const reach = legacyReachThrough(entry);
    for (const specifier of valueImportSpecifiers(entry).filter((value) => value.startsWith('@orchard/sim/'))) {
      expect(reach.get(specifier), specifier).toBeUndefined();
    }
    expect(legacyReachThrough(resolve(packagesRoot, 'sim/src/map-object-records.ts'))).toEqual(new Map());
  });

  it('reaches legacy modules only through pre-existing shared modules the S6a split still has to cut', () => {
    // Shrink this list as S6a moves these onto sim subpaths; it must never grow.
    // S6a cut every entry: map-object presentation now reaches no legacy module.
    const preExisting: string[] = [];
    const through = [...legacyReachThrough(entry).keys()];
    expect(through.filter((specifier) => !preExisting.includes(specifier))).toEqual([]);
  });
});

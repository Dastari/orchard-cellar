import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIVE_ISLAND_MAP_ID, positionCollides, TILE_SIZE_FIXED, TOPSIDE_SPACE_ID, type CollisionMap, type MapDocumentV3 } from '@orchard/sim';
import { decodeWorldChunk, encodeWorldChunk, WORLD_CHUNK_STRIDE, type ChunkArray, type WorldChunkManifest,
  type WorldChunkRecord } from '@orchard/sim/world-chunk';
import { chunkAuthorityMode } from '../chunk-authority-setting.js';
import { assembleChunkLiveIslandRuntime, compareLiveIslandRuntime, composeChunkIslandCollision, type ChunkLiveIslandRuntime } from './chunk-authority-runtime.js';
import {
  ChunkAuthorityDispatcher, compareCollisionAtPosition,
  type ChunkAuthorityLogger, type ChunkAuthoritySource, type CompiledCollisionRuntime,
} from './chunk-authority-dispatch.js';

const CELLS = WORLD_CHUNK_STRIDE ** 2;
const T = TILE_SIZE_FIXED;
const WORLD = { width: 100, height: 64 };
const box = (tileX: number, tileY: number, tiles = 1) => ({ left: tileX * T, top: tileY * T, right: (tileX + tiles) * T - 1, bottom: tileY * T + T - 1 });
const SURVIVAL_PROVENANCE = { kind: 'generated', generator: 'survival-island', generatorSeed: 1 };

/** A 100x64 island (chunk 0 full width, chunk 1 clipped to 36 columns). Chunk 0 anchors an authored
 * obstacle at tile 62 that overhangs five tiles into chunk 1 (tiles 64-66). */
function island(options: { provenance?: unknown; hasTraversalChannels?: boolean } = {}) {
  const records = (cx: number): WorldChunkRecord[] => cx === 0
    ? [{ kind: 'authority.ground.obstacle', ordinal: 0, tileX: 2, tileY: 1, value: { group: 'base', ordinal: 0, ...box(2, 1), sourceId: 'decoration:1' } },
      { kind: 'authority.ground.obstacle', ordinal: 1, tileX: 62, tileY: 1, value: { group: 'authored', ordinal: 0, ...box(62, 1, 5), sourceId: 'landmark:bridge' } }]
    : [];
  const blobs = [0, 1].map(cx => encodeWorldChunk({ schema: 1, mediumSchema: 1, authoritySchema: 1, spaceId: 0, cx, cy: 0, assetRevision: 'assets-1',
    arrays: { medium: new Uint8Array(CELLS), solidBlocked: new Uint8Array(CELLS), biomes: new Uint8Array(CELLS),
      'authority.ground.blocked': new Uint8Array(CELLS), 'authority.ground.elevations': new Int16Array(CELLS),
      'authority.ground.terrainPlaneBlocked': new Uint8Array(CELLS), 'authority.ground.horseJumpableTerrain': new Uint8Array(CELLS),
      'authority.water.blocked': new Uint8Array(CELLS).fill(1), 'authority.combatRegion': new Uint8Array(CELLS) } satisfies Record<string, ChunkArray>,
    records: records(cx), assetIds: [], atlasPackIds: [] }));
  const hasTraversalChannels = options.hasTraversalChannels ?? true;
  const manifest: WorldChunkManifest = { schema: 1, chunkSize: 64, spaceId: 0, ...WORLD, assetRevision: 'assets-1', sourceRevision: 3, sourceHash: 'map-3',
    metadata: {
      channels: { 'authority.ground.terrainPlaneBlocked': { type: 'u8', planes: 1 } }, biomePalette: ['meadow'],
      document: { id: LIVE_ISLAND_MAP_ID, prefabs: [], provenance: (options.provenance ?? SURVIVAL_PROVENANCE) as never },
      authority: { schema: 1, combatRegions: [], generatedSuppressions: [],
        collisions: { ground: { hasTraversalChannels, terrainMinimumElevation: 0, terrainTransitions: [] }, water: { hasTraversalChannels } } },
    },
    chunks: blobs.map((bytes, cx) => ({ cx, cy: 0, contentHash: decodeWorldChunk(bytes).contentHash, byteLength: bytes.length })) };
  const store = new Map(manifest.chunks.map((head, index) => [head.contentHash, blobs[index]!]));
  return { manifest, store };
}

const REGISTRY_HASH = 'content-1';

/** The compiled runtime for the fixture: the complete chunk runtime under a compiled key, with a document. */
function compiledFor(manifest: WorldChunkManifest, readBlob: (hash: string) => Uint8Array | undefined): CompiledCollisionRuntime {
  const complete = assembleChunkLiveIslandRuntime(manifest, readBlob, { contentHash: REGISTRY_HASH });
  expect(complete.complete).toBe(true);
  return { ...complete, key: `3:map-3:${REGISTRY_HASH}`, document: {} as MapDocumentV3 };
}

interface Harness {
  readonly source: ChunkAuthoritySource;
  readonly compiled: CompiledCollisionRuntime;
  readonly reads: { blobs: number; shadow: number };
  readonly events: { level: 'info' | 'warn'; event: Record<string, unknown> }[];
  readonly logger: ChunkAuthorityLogger;
}

function harness(overrides: {
  mode?: 'shadow' | 'on'; manifest?: WorldChunkManifest; manifestJson?: string; blobs?: Map<string, Uint8Array>;
  missing?: readonly string[]; shadow?: 'none' | { mapId?: string; contentHash?: string; revision?: number };
  liveMap?: null | { revision: number; contentHash: string }; registryHash?: string; traversal?: boolean;
} = {}): Harness {
  const fixture = island();
  const manifest = overrides.manifest ?? fixture.manifest;
  const blobs = overrides.blobs ?? fixture.store;
  const reads = { blobs: 0, shadow: 0 };
  const readBlob = (hash: string): Uint8Array | undefined => {
    reads.blobs += 1;
    return overrides.missing?.includes(hash) ? undefined : blobs.get(hash);
  };
  const compiled = compiledFor(fixture.manifest, hash => fixture.store.get(hash));
  const events: Harness['events'] = [];
  const logger: ChunkAuthorityLogger = {
    info: event => events.push({ level: 'info', event: { ...event } }),
    warn: event => events.push({ level: 'warn', event: { ...event } }),
    time: () => {}, timeEnd: () => {},
  };
  const shadowOverride = overrides.shadow === 'none' ? null : overrides.shadow ?? {};
  const source: ChunkAuthoritySource = {
    mode: overrides.mode ?? 'on',
    compiled: () => compiled,
    shadow: () => {
      reads.shadow += 1;
      return shadowOverride === null ? null : { revision: shadowOverride.revision ?? 1, mapId: shadowOverride.mapId ?? LIVE_ISLAND_MAP_ID,
        contentHash: shadowOverride.contentHash ?? REGISTRY_HASH, manifestJson: overrides.manifestJson ?? JSON.stringify(manifest) };
    },
    liveMap: () => overrides.liveMap === undefined ? { revision: 3, contentHash: 'map-3' } : overrides.liveMap,
    registryContentHash: () => overrides.registryHash ?? REGISTRY_HASH,
    traversalPolicyActive: () => overrides.traversal ?? true,
    readBlob,
  };
  return { source, compiled, reads, events, logger };
}

const dispatcher = (logger: ChunkAuthorityLogger, options: { sampleLimit?: number } = {}) =>
  new ChunkAuthorityDispatcher({ logger, worldSize: WORLD, sampleIntervalTicks: 20n, sampleWindowTicks: 100n, ...options });

describe('chunk authority dispatcher: on', () => {
  it('serves a complete, fresh chunk runtime that equals compiled on the fixture', () => {
    const h = harness();
    const d = dispatcher(h.logger);
    const selected = d.select(h.source) as ChunkLiveIslandRuntime;
    expect(selected).not.toBe(h.compiled);
    expect(selected.source).toBe('chunks');
    expect(selected.key).toBe(`chunks:0:1:3:map-3:${REGISTRY_HASH}`);
    expect(compareLiveIslandRuntime(selected, h.compiled).equal).toBe(true);
    // Cached by key: the second call decodes nothing.
    const decoded = h.reads.blobs;
    expect(d.select(h.source)).toBe(selected);
    expect(h.reads.blobs).toBe(decoded);
    expect(h.events.filter(({ event }) => event['event'] === 'chunk_authority_serving')).toHaveLength(1);
    expect(d.status().fallbacks).toEqual({});
  });

  it.each([
    ['shadow_missing', { shadow: 'none' as const }],
    ['shadow_map_mismatch', { shadow: { mapId: 'other-map' } }],
    ['map_row_missing', { liveMap: null }],
    ['stale_content', { shadow: { contentHash: 'older-content' } }],
    ['stale_map', { liveMap: { revision: 4, contentHash: 'map-4' } }],
    ['traversal_policy_mismatch', { traversal: false }],
    ['manifest_invalid', { manifestJson: '{not json' }],
  ])('falls back to compiled and logs once when %s', (reason, overrides) => {
    const h = harness(overrides);
    const d = dispatcher(h.logger);
    expect(d.select(h.source)).toBe(h.compiled);
    expect(d.select(h.source)).toBe(h.compiled);
    expect(d.status().fallbacks).toEqual({ [reason]: 2 });
    const fallbacks = h.events.filter(({ event }) => event['event'] === 'chunk_authority_fallback');
    expect(fallbacks).toHaveLength(1);
    expect(fallbacks[0]).toMatchObject({ level: 'warn', event: { reason } });
  });

  it('falls back on validateRuntimeManifest and chunk_authority_metadata_missing throws, attempting each key once', () => {
    const { manifest } = island();
    const metadata = Object.fromEntries(Object.entries(manifest.metadata).filter(([key]) => key !== 'authority'));
    for (const [broken, detail] of [
      [{ ...manifest, metadata }, 'chunk_authority_metadata_missing'],
      [{ ...manifest, chunkSize: 32 }, 'invalid_chunk_manifest'],
      [{ ...manifest, chunks: [{ ...manifest.chunks[0]!, contentHash: 'not-a-hash' }] }, 'invalid_chunk_head'],
    ] as const) {
      const h = harness({ manifest: broken as WorldChunkManifest });
      const d = dispatcher(h.logger);
      expect(d.select(h.source)).toBe(h.compiled);
      expect(d.select(h.source)).toBe(h.compiled);
      expect(d.status().fallbacks).toEqual({ assemble_failed: 2 });
      expect(h.events.find(({ event }) => event['event'] === 'chunk_authority_fallback')?.event).toMatchObject({ reason: 'assemble_failed', detail });
    }
  });

  it('reproduces the compiled guards: topside, survival world size and survival island base', () => {
    const { manifest } = island();
    for (const [broken, reason] of [
      [{ ...manifest, spaceId: 5 }, 'guard_space'],
      [{ ...manifest, width: 99 }, 'guard_size'],
      [{ ...manifest, metadata: { ...manifest.metadata, document: { id: LIVE_ISLAND_MAP_ID, prefabs: [], provenance: { kind: 'authored' } } } }, 'guard_base'],
      [{ ...manifest, metadata: { ...manifest.metadata, document: { id: LIVE_ISLAND_MAP_ID, prefabs: [] } } }, 'guard_base'],
    ] as const) {
      const h = harness({ manifest: broken as unknown as WorldChunkManifest });
      const d = dispatcher(h.logger);
      expect(d.select(h.source), reason).toBe(h.compiled);
      expect(d.status().fallbacks, reason).toEqual({ [reason]: 1 });
      expect(h.reads.blobs, `${reason} decodes nothing`).toBe(0);
    }
    // The production default is the survival world size, so the 100x64 fixture is refused there.
    const h = harness();
    const production = new ChunkAuthorityDispatcher({ logger: h.logger });
    expect(production.select(h.source)).toBe(h.compiled);
    expect(production.status().fallbacks).toEqual({ guard_size: 1 });
  });

  it('never serves an incomplete runtime: an obstacle overhanging a missing chunk falls back to compiled', () => {
    const { manifest, store } = island();
    const missing = manifest.chunks[0]!.contentHash;
    const h = harness({ missing: [missing] });
    const d = dispatcher(h.logger);
    // The partial runtime loses the chunk-0 obstacle, so the tiles it overhangs in PRESENT chunk 1 open up.
    const partial = assembleChunkLiveIslandRuntime(manifest, hash => hash === missing ? undefined : store.get(hash), { contentHash: REGISTRY_HASH });
    const complete = assembleChunkLiveIslandRuntime(manifest, hash => store.get(hash), { contentHash: REGISTRY_HASH });
    expect(partial.complete).toBe(false);
    const overhang = { x: 65 * T + T / 2, y: 1 * T + T / 2 }; // tile 65: chunk 1, which decoded fine
    expect(partial.ground.blocked[1 * WORLD.width + 65]).toBe(false);
    expect(positionCollides(overhang, composeChunkIslandCollision(partial, 'ground'))).toBe(false);
    expect(positionCollides(overhang, composeChunkIslandCollision(complete, 'ground'))).toBe(true);

    const selected = d.select(h.source);
    expect(selected).toBe(h.compiled);
    expect(positionCollides(overhang, { ...selected!.ground, obstacles: selected!.ground.obstacles ?? [] })).toBe(true);
    expect(d.status().fallbacks).toEqual({ incomplete: 1 });
    expect(h.events.find(({ event }) => event['event'] === 'chunk_authority_fallback')?.event).toMatchObject({
      reason: 'incomplete', detail: expect.stringContaining(`blob_missing@0,0:${missing}`),
    });
    // The failed key is cached: the next call neither re-reads blobs nor re-logs.
    const reads = h.reads.blobs;
    expect(d.select(h.source)).toBe(h.compiled);
    expect(h.reads.blobs).toBe(reads);
    expect(h.events.filter(({ event }) => event['event'] === 'chunk_authority_fallback')).toHaveLength(1);
  });

  it('rebuilds when the shadow revision or content hash changes and keeps one runtime resident', () => {
    let revision = 1;
    const h = harness();
    const source: ChunkAuthoritySource = { ...h.source, shadow: () => ({ ...h.source.shadow()!, revision }) };
    const d = dispatcher(h.logger);
    const first = d.select(source) as ChunkLiveIslandRuntime;
    revision = 2;
    const second = d.select(source) as ChunkLiveIslandRuntime;
    expect(second).not.toBe(first);
    expect(second.key).toBe(`chunks:0:2:3:map-3:${REGISTRY_HASH}`);
    expect(h.events.filter(({ event }) => event['event'] === 'chunk_authority_assembled')).toHaveLength(2);
  });
});

describe('chunk authority dispatcher: shadow', () => {
  it('keeps compiled authoritative, compares once per key and logs an equal result', () => {
    const h = harness({ mode: 'shadow' });
    const d = dispatcher(h.logger);
    expect(d.select(h.source)).toBe(h.compiled);
    expect(d.select(h.source)).toBe(h.compiled);
    expect(d.status()).toMatchObject({ compares: 1, lastCompare: { equal: true, total: 0, fields: {} } });
    expect(h.events.filter(({ event }) => event['event'] === 'chunk_authority_shadow_compare')).toEqual([
      { level: 'info', event: expect.objectContaining({ equal: true, total: 0, samples: [] }) },
    ]);
    expect(d.sampleRuntime(40n)?.source).toBe('chunks');
    expect(d.sampleRuntime(41n)).toBeNull();
    // Switching off releases the resident runtime and stops sampling; shadow again re-assembles once.
    d.release();
    expect(d.sampleRuntime(40n)).toBeNull();
    const reads = h.reads.blobs;
    d.select(h.source);
    expect(h.reads.blobs).toBe(reads + 2);
    expect(d.status().compares).toBe(1);
  });

  it('logs at most the sample limit of disagreements without changing the result', () => {
    const h = harness({ mode: 'shadow' });
    // Compiled blocks 64 cells that the chunks leave walkable.
    const blocked = [...h.compiled.ground.blocked];
    for (let tileX = 10; tileX < 74; tileX++) blocked[5 * WORLD.width + tileX] = true;
    const compiled = { ...h.compiled, ground: { ...h.compiled.ground, blocked } };
    const source = { ...h.source, compiled: () => compiled };
    const d = dispatcher(h.logger, { sampleLimit: 32 });
    expect(d.select(source)).toBe(compiled);
    const compare = h.events.find(({ event }) => event['event'] === 'chunk_authority_shadow_compare')!;
    expect(compare.level).toBe('warn');
    expect(compare.event).toMatchObject({ equal: false, total: 64, fields: { 'ground.blocked': 64 } });
    expect(compare.event['samples']).toHaveLength(32);
    expect((compare.event['samples'] as { field: string; a: number; b: number }[])[0]).toMatchObject({ field: 'ground.blocked', tileX: 10, tileY: 5, a: 0, b: 1 });
  });

  it('logs unavailable chunks once, never throws, and still returns compiled', () => {
    const h = harness({ mode: 'shadow', shadow: { contentHash: 'older' } });
    const d = dispatcher(h.logger);
    expect(d.select(h.source)).toBe(h.compiled);
    expect(d.select(h.source)).toBe(h.compiled);
    expect(h.events.filter(({ event }) => event['event'] === 'chunk_authority_shadow_unavailable')).toEqual([
      { level: 'warn', event: expect.objectContaining({ reason: 'stale_content' }) },
    ]);
    expect(d.sampleRuntime(40n)).toBeNull();
    const throwing = { ...h.source, liveMap: () => { throw new Error('boom'); } };
    expect(d.select(throwing)).toBe(h.compiled);
    expect(h.events[h.events.length - 1]).toMatchObject({ level: 'warn', event: { event: 'chunk_authority_shadow_error', detail: 'boom' } });
  });

  it('samples final collision at player positions on cadence, bounded per window', () => {
    const h = harness({ mode: 'shadow' });
    const d = dispatcher(h.logger, { sampleLimit: 4 });
    d.select(h.source);
    const runtime = d.sampleRuntime(20n)!;
    const final = (value: typeof runtime | CompiledCollisionRuntime): { ground: CollisionMap; water: CollisionMap } =>
      ({ ground: composeChunkIslandCollision(value as ChunkLiveIslandRuntime, 'ground'), water: composeChunkIslandCollision(value as ChunkLiveIslandRuntime, 'water') });
    const positions = [{ x: 20 * T + 128, y: 20 * T + 128 }, { x: 65 * T + 128, y: 1 * T + 128 }];
    d.recordSample(20n, positions, final(h.compiled), () => final(runtime));
    expect(d.status()).toMatchObject({ sampledTicks: 1, sampledPositions: 2, sampleDisagreements: 0, loggedSamples: 0 });
    // A chunk map that lost the overhanging obstacle disagrees at the second player only.
    const lost = { ground: { ...final(runtime).ground, obstacles: [box(2, 1)] }, water: final(runtime).water };
    d.recordSample(40n, positions, final(h.compiled), () => lost);
    d.recordSample(60n, positions, final(h.compiled), () => lost);
    const logged = h.events.filter(({ event }) => event['event'] === 'chunk_authority_sample_disagreement');
    expect(logged.flatMap(({ event }) => event['samples'] as unknown[])).toHaveLength(4);
    expect(logged[0]!.event['samples']).toContainEqual(expect.objectContaining({ medium: 'ground', tileX: 65, tileY: 1, field: 'positionCollides', compiled: true, chunks: false }));
    d.recordSample(80n, positions, final(h.compiled), () => lost);
    expect(d.status()).toMatchObject({ sampledTicks: 4, sampleDisagreements: 6, loggedSamples: 4 });
    // The next window reports how many were suppressed, then logs again.
    d.recordSample(120n, positions, final(h.compiled), () => lost);
    expect(h.events.find(({ event }) => event['event'] === 'chunk_authority_sample_window')?.event).toMatchObject({ window: '0', logged: 4, suppressed: 2 });
    expect(d.status().loggedSamples).toBe(6);
    // A throwing chunk build is logged, never raised into the tick.
    expect(() => d.recordSample(140n, positions, final(h.compiled), () => { throw new Error('rebuild failed'); })).not.toThrow();
    expect(h.events[h.events.length - 1]?.event).toMatchObject({ event: 'chunk_authority_sample_error', detail: 'rebuild failed' });
  });

  it('compares every per-cell channel and the ordered obstacles near a position', () => {
    const { manifest, store } = island();
    const runtime = assembleChunkLiveIslandRuntime(manifest, hash => store.get(hash), { contentHash: REGISTRY_HASH });
    const map = composeChunkIslandCollision(runtime, 'ground');
    const at = { x: 3 * T + 10, y: 1 * T + 10 };
    expect(compareCollisionAtPosition('ground', at, map, map)).toEqual([]);
    const elevations = Int16Array.from(map.elevations!); elevations[1 * WORLD.width + 3] = 2;
    const changed = { ...map, elevations, obstacles: (map.obstacles ?? []).slice(1) };
    expect(compareCollisionAtPosition('ground', at, map, changed).map(({ field }) => field)).toEqual(expect.arrayContaining(['elevations', 'obstaclesNear']));
    // Order matters too: the same obstacles near the position in a different order disagree.
    const near = { ...map, obstacles: [box(3, 1), box(2, 1)] }, swapped = { ...map, obstacles: [box(2, 1), box(3, 1)] };
    expect(compareCollisionAtPosition('ground', at, near, swapped).map(({ field }) => field)).toEqual(['obstaclesNear']);
  });
});

/** Runs the real index.ts dispatcher wiring with injected dependencies. */
function serverFunctions(dependencies: Record<string, unknown>) {
  const source = ts.createSourceFile('index.ts', readFileSync(new URL('../index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
  const names = ['liveIslandCollisionRuntime', 'liveMapCollisionForSpace'];
  const text = names.map(name => {
    const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
    if (fn === undefined) throw new Error(`missing ${name}`);
    return fn.getText(source);
  }).join('\n');
  const javascript = ts.transpileModule(`${text}\nreturn { ${names.join(', ')} };`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return new Function(...Object.keys(dependencies), javascript)(...Object.values(dependencies)) as {
    liveIslandCollisionRuntime(ctx: unknown): unknown;
    liveMapCollisionForSpace(ctx: unknown, spaceId: number, medium: 'ground' | 'water', base: CollisionMap, runtime?: unknown): CollisionMap;
  };
}

describe('index.ts collision dispatcher wiring', () => {
  const { manifest, store } = island();
  const compiled = compiledFor(manifest, hash => store.get(hash));
  const base: CollisionMap = { width: WORLD.width, height: WORLD.height, blocked: Array<boolean>(WORLD.width * WORLD.height).fill(true),
    obstacles: [box(2, 1), box(40, 40)] };
  function world(initialFlags: string | null) {
    let flagsJson = initialFlags;
    const reads: string[] = [];
    const ctx = { db: {
      space_admin_flag: { spaceId: { find: (id: number) => (reads.push(`flag:${id}`), flagsJson === null ? null : { flagsJson }) } },
      world_chunk_shadow: { spaceId: { find: (id: bigint) => (reads.push(`shadow:${id}`), { revision: 1, mapId: LIVE_ISLAND_MAP_ID, contentHash: REGISTRY_HASH, manifestJson: JSON.stringify(manifest) }) } },
      live_map_document: { mapId: { find: (id: string) => (reads.push(`map:${id}`), { revision: 3, contentHash: 'map-3' }) } },
      world_chunk_blob: { contentHash: { find: (hash: string) => (reads.push('blob'), { bytes: Array.from(store.get(hash)!) }) } },
    } };
    let compiledCalls = 0;
    const dispatcher = new ChunkAuthorityDispatcher({ worldSize: WORLD, logger: { info() {}, warn() {}, time() {}, timeEnd() {} } });
    const functions = serverFunctions({
      chunkAuthorityMode, TOPSIDE_SPACE_ID, LIVE_ISLAND_MAP_ID,
      compiledLiveIslandRuntime: () => { compiledCalls += 1; return compiled; },
      chunkAuthorityDispatcher: dispatcher,
      contentRegistry: () => ({ contentHash: REGISTRY_HASH }), runtimeTraversalPolicy: () => ({}),
    });
    return { ctx, reads, functions, dispatcher, compiledCalls: () => compiledCalls, setFlags: (value: string) => { flagsJson = value; } };
  }

  it('off (the default, and any unset or invalid flag) is exactly the compiled runtime with no chunk reads', () => {
    for (const flags of [null, '{}', '{"chunkAuthority":"off"}', '{"chunkAuthority":"banana"}', 'not json']) {
      const { ctx, reads, functions, compiledCalls } = world(flags);
      expect(functions.liveIslandCollisionRuntime(ctx)).toBe(compiled);
      expect(compiledCalls()).toBe(1);
      expect(reads).toEqual([`flag:${TOPSIDE_SPACE_ID}`]);
      // Call-site equality: the composed collision is identical to composing over compiled directly.
      for (const medium of ['ground', 'water'] as const) {
        expect(functions.liveMapCollisionForSpace(ctx, TOPSIDE_SPACE_ID, medium, base)).toEqual(functions.liveMapCollisionForSpace(ctx, TOPSIDE_SPACE_ID, medium, base, compiled));
      }
      expect(functions.liveMapCollisionForSpace(ctx, 7, 'ground', base)).toBe(base);
    }
  });

  it('shadow returns compiled; on returns the chunk runtime, composing the same collision as compiled', () => {
    const shadow = world('{"chunkAuthority":"shadow"}');
    expect(shadow.functions.liveIslandCollisionRuntime(shadow.ctx)).toBe(compiled);
    expect(shadow.reads).toContain('blob');
    const on = world('{"chunkAuthority":"on"}');
    const runtime = on.functions.liveIslandCollisionRuntime(on.ctx) as ChunkLiveIslandRuntime;
    expect(runtime.source).toBe('chunks');
    expect(on.compiledCalls()).toBe(0);
    for (const medium of ['ground', 'water'] as const) {
      expect(on.functions.liveMapCollisionForSpace(on.ctx, TOPSIDE_SPACE_ID, medium, base)).toEqual(on.functions.liveMapCollisionForSpace(on.ctx, TOPSIDE_SPACE_ID, medium, base, compiled));
    }
  });

  it('switching shadow back to off releases the chunk runtime and stops the per-tick sampler', () => {
    const shadow = world('{"chunkAuthority":"shadow"}');
    shadow.functions.liveIslandCollisionRuntime(shadow.ctx);
    expect(shadow.dispatcher.sampleRuntime(20n)).not.toBeNull();
    shadow.setFlags('{"chunkAuthority":"off"}');
    expect(shadow.functions.liveIslandCollisionRuntime(shadow.ctx)).toBe(compiled);
    expect(shadow.dispatcher.sampleRuntime(20n)).toBeNull();
  });
});

describe('world-chunk decoding under the SpacetimeDB 2.8.2 host TextDecoder', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

  it('uses only options the host polyfill supports', () => {
    const source = readFileSync(new URL('../../../sim/src/world-chunk.ts', import.meta.url), 'utf8');
    expect(source.match(/new TextDecoder\([^)]*\)/gu)).toEqual(["new TextDecoder('utf-8', { fatal: true })"]);
    expect(source).not.toMatch(/ignoreBOM|stream:/u);
  });

  it('decodes a chunk with a stand-in for the embedded host class (label utf-8 only, fatal, no ignoreBOM/stream)', async () => {
    const Native = globalThis.TextDecoder;
    const constructed: unknown[] = [];
    // Mirrors `globalThis.TextDecoder = class TextDecoder` embedded in spacetimedb-standalone 2.8.2.
    class HostTextDecoder {
      readonly #fatal: boolean;
      constructor(label = 'utf-8', options: { fatal?: boolean; ignoreBOM?: boolean } = {}) {
        if (label !== 'utf-8') throw new RangeError('The encoding label provided is invalid');
        if (options.ignoreBOM) throw new TypeError("Option 'ignoreBOM' not supported");
        this.#fatal = !!options.fatal;
        constructed.push([label, options]);
      }
      decode(input: Uint8Array, options: { stream?: boolean } = {}): string {
        if (options.stream) throw new TypeError("Option 'stream' not supported");
        return new Native('utf-8', { fatal: this.#fatal }).decode(input);
      }
    }
    vi.resetModules();
    vi.stubGlobal('TextDecoder', HostTextDecoder);
    const fresh = await import('@orchard/sim/world-chunk');
    expect(constructed).toEqual([['utf-8', { fatal: true }]]);
    const { manifest, store } = island();
    const decoded = fresh.decodeWorldChunk(store.get(manifest.chunks[0]!.contentHash)!);
    expect(decoded.records.map(({ kind }) => kind)).toEqual(['authority.ground.obstacle', 'authority.ground.obstacle']);
  });
});

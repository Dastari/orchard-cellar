import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIVE_ISLAND_MAP_ID, mapStreetlampPlans, positionCollides, TILE_SIZE_FIXED, TOPSIDE_SPACE_ID, type CollisionMap, type CombatRegionPolicy, type MapDocumentV3 } from '@orchard/sim';
import { canonicalChunkJson, decodeWorldChunk, encodeWorldChunk, worldChunkHash, WORLD_CHUNK_STRIDE, type ChunkArray, type ChunkJson, type WorldChunkManifest,
  type WorldChunkRecord } from '@orchard/sim/world-chunk';
import { chunkAuthorityMode } from '../chunk-authority-setting.js';
import { assembleChunkLiveIslandRuntime, CHUNK_RESOURCE_GENERATOR, compareLiveIslandRuntime, composeChunkIslandCollision, type ChunkLiveIslandRuntime } from './chunk-authority-runtime.js';
import {
  ChunkAuthorityDispatcher,
  type ChunkAuthorityLogger, type ChunkAuthoritySource, type CompiledCollisionRuntime,
} from './chunk-authority-dispatch.js';

/** Whether two collision maps agree about a position. */
function sameAt(position: { x: number; y: number }, a: CollisionMap, b: CollisionMap): boolean {
  return positionCollides(position, a) === positionCollides(position, b);
}

/** The manifest record digest of an island with no generated resources or orphan placements (static world S3c). */
const NO_RESOURCES_DIGEST = { count: 0, hash: worldChunkHash(new TextEncoder().encode(canonicalChunkJson([]))) };
const CELLS = WORLD_CHUNK_STRIDE ** 2;
const T = TILE_SIZE_FIXED;
const WORLD = { width: 100, height: 64 };
const box = (tileX: number, tileY: number, tiles = 1) => ({ left: tileX * T, top: tileY * T, right: (tileX + tiles) * T - 1, bottom: tileY * T + T - 1 });
const SURVIVAL_PROVENANCE = { kind: 'generated', generator: 'survival-island', generatorSeed: 1 };

/** A 100x64 island (chunk 0 full width, chunk 1 clipped to 36 columns). Chunk 0 anchors an authored
 * obstacle at tile 62 that overhangs five tiles into chunk 1 (tiles 64-66). */
function island(options: { provenance?: unknown; hasTraversalChannels?: boolean; waterTraversal?: boolean; groundMeta?: { readonly [key: string]: ChunkJson };
  authoritySchema?: 1 | 2 } = {}) {
  const records = (cx: number): WorldChunkRecord[] => cx === 0
    ? [{ kind: 'authority.ground.obstacle', ordinal: 0, tileX: 2, tileY: 1, value: { group: 'base', ordinal: 0, ...box(2, 1), sourceId: 'decoration:1' } },
      { kind: 'authority.ground.obstacle', ordinal: 1, tileX: 62, tileY: 1, value: { group: 'authored', ordinal: 0, ...box(62, 1, 5), sourceId: 'landmark:bridge' } }]
    : [];
  const blobs = [0, 1].map(cx => encodeWorldChunk({ schema: 1, mediumSchema: 1, authoritySchema: options.authoritySchema ?? 1, spaceId: 0, cx, cy: 0, assetRevision: 'assets-1',
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
      authority: { schema: 1, combatRegions: [], generatedSuppressions: [], resources: NO_RESOURCES_DIGEST, resourcePlacements: NO_RESOURCES_DIGEST,
        resourceGenerator: CHUNK_RESOURCE_GENERATOR as never,
        collisions: { ground: options.groundMeta ?? { hasTraversalChannels, terrainMinimumElevation: 0, terrainTransitions: [] },
          water: { hasTraversalChannels: options.waterTraversal ?? hasTraversalChannels } } },
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
  manifest?: WorldChunkManifest; manifestJson?: string; blobs?: Map<string, Uint8Array>;
  missing?: readonly string[]; shadow?: 'none' | { mapId?: string; contentHash?: string; revision?: number };
  liveMap?: null | { revision: number; contentHash: string }; registryHash?: string; traversal?: boolean;
  /** The published blobs' authority schema; compiled always comes from the schema-1 fixture. */
  authoritySchema?: 1 | 2;
} = {}): Harness {
  const fixture = island();
  const published = overrides.authoritySchema === undefined ? fixture : island({ authoritySchema: overrides.authoritySchema });
  const manifest = overrides.manifest ?? published.manifest;
  const blobs = overrides.blobs ?? published.store;
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

const dispatcher = (logger: ChunkAuthorityLogger) => new ChunkAuthorityDispatcher({ logger, worldSize: WORLD });

describe('chunk authority dispatcher: on', () => {
  it('serves a complete, fresh chunk runtime that equals compiled on the fixture', () => {
    const h = harness();
    const d = dispatcher(h.logger);
    const selected = d.select(h.source) as ChunkLiveIslandRuntime;
    expect(selected).not.toBeNull();
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

  it('serves an authority schema 2 (obstacle table) publication that equals compiled (BUG-044)', () => {
    const v1 = island(), v2 = island({ authoritySchema: 2 });
    expect(v2.manifest.chunks.map(({ contentHash }) => contentHash)).not.toEqual(v1.manifest.chunks.map(({ contentHash }) => contentHash));
    const on = harness({ authoritySchema: 2 });
    const selected = dispatcher(on.logger).select(on.source) as ChunkLiveIslandRuntime;
    expect(selected.source).toBe('chunks');
    expect(selected.issues).toEqual([]);
    expect(compareLiveIslandRuntime(selected, on.compiled).equal).toBe(true);
    const schema1 = assembleChunkLiveIslandRuntime(v1.manifest, hash => v1.store.get(hash), { contentHash: REGISTRY_HASH });
    for (const medium of ['ground', 'water'] as const) {
      const chunks = composeChunkIslandCollision(selected, medium), compiled = composeChunkIslandCollision(schema1, medium);
      for (const tileX of [2, 62, 64, 65, 66, 67, 99]) {
        expect(sameAt({ x: tileX * T + T / 2, y: 1 * T + T / 2 }, compiled, chunks), `${medium} tile ${tileX}`).toBe(true);
      }
    }
  });

  it.each([
    ['shadow_missing', { shadow: 'none' as const }],
    ['shadow_map_mismatch', { shadow: { mapId: 'other-map' } }],
    ['map_row_missing', { liveMap: null }],
    ['traversal_policy_mismatch', { traversal: false }],
    ['manifest_invalid', { manifestJson: '{not json' }],
  ])('is unservable (null: the server fails safe) and logs once when %s', (reason, overrides) => {
    const h = harness(overrides);
    const d = dispatcher(h.logger);
    expect(d.select(h.source)).toBeNull();
    expect(d.select(h.source)).toBeNull();
    expect(d.status().fallbacks).toEqual({ [reason]: 2 });
    const fallbacks = h.events.filter(({ event }) => event['event'] === 'chunk_authority_unservable');
    expect(fallbacks).toHaveLength(1);
    expect(fallbacks[0]).toMatchObject({ level: 'warn', event: { reason } });
  });

  it('is unservable on validateRuntimeManifest and chunk_authority_metadata_missing throws, attempting each key once', () => {
    const { manifest } = island();
    const metadata = Object.fromEntries(Object.entries(manifest.metadata).filter(([key]) => key !== 'authority'));
    for (const [broken, reason, detail] of [
      // No authority metadata also means no resource generator stamp: stale before any assembly (S3c).
      [{ ...manifest, metadata }, 'stale_generator', `stamp missing, live ${CHUNK_RESOURCE_GENERATOR.seed}:${CHUNK_RESOURCE_GENERATOR.version}`],
      [{ ...manifest, chunkSize: 32 }, 'manifest_invalid', 'invalid_chunk_manifest'],
      [{ ...manifest, chunks: [{ ...manifest.chunks[0]!, contentHash: 'not-a-hash' }] }, 'manifest_invalid', 'invalid_chunk_head'],
    ] as const) {
      const h = harness({ manifest: broken as WorldChunkManifest });
      const d = dispatcher(h.logger);
      const parse = vi.spyOn(JSON, 'parse');
      expect(d.select(h.source)).toBeNull();
      expect(d.select(h.source)).toBeNull();
      expect(parse, 'the manifest is parsed once per key').toHaveBeenCalledTimes(1);
      parse.mockRestore();
      expect(d.status().fallbacks).toEqual({ [reason]: 2 });
      expect(h.events.find(({ event }) => event['event'] === 'chunk_authority_unservable')?.event).toMatchObject({ reason, detail });
    }
  });

  it('S3c: refuses records from another resource generator, or with no stamp, before decoding a blob (#230 review)', () => {
    const { manifest } = island();
    const withStamp = (stamp: unknown): WorldChunkManifest => ({ ...manifest, metadata: { ...manifest.metadata,
      authority: Object.fromEntries(Object.entries({ ...(manifest.metadata['authority'] as object), resourceGenerator: stamp })
        .filter(([, value]) => value !== undefined)) } as WorldChunkManifest['metadata'] });
    const live = CHUNK_RESOURCE_GENERATOR;
    for (const [stamp, detail] of [
      [{ seed: live.seed, version: live.version - 1 }, `published ${live.seed}:${live.version - 1}, live ${live.seed}:${live.version}`],
      [{ seed: live.seed + 1, version: live.version }, `published ${live.seed + 1}:${live.version}`],
      [undefined, 'stamp missing'],
      [{ seed: String(live.seed), version: live.version }, 'stamp missing'],
    ] as const) {
      const h = harness({ manifest: withStamp(stamp) });
      const d = dispatcher(h.logger);
      expect(d.select(h.source)).toBeNull();
      expect(d.status().fallbacks).toEqual({ stale_generator: 1 });
      expect(h.reads.blobs, 'no blob is decoded for a stale generator').toBe(0);
      expect(h.events.find(({ event }) => event['event'] === 'chunk_authority_unservable')?.event).toMatchObject({ reason: 'stale_generator', detail: expect.stringContaining(detail) });
    }
    // The current stamp serves.
    const ok = harness({ manifest: withStamp({ ...live }) });
    expect((dispatcher(ok.logger).select(ok.source) as ChunkLiveIslandRuntime).source).toBe('chunks');
  });

  it('caches an unexpected throw during assembly as a failed key instead of retrying every call', () => {
    const h = harness();
    let times = 0;
    const d = new ChunkAuthorityDispatcher({ worldSize: WORLD, logger: { ...h.logger, time: () => { times += 1; throw new Error('timer unavailable'); } } });
    const parse = vi.spyOn(JSON, 'parse');
    expect(d.select(h.source)).toBeNull();
    expect(d.select(h.source)).toBeNull();
    expect(parse).toHaveBeenCalledTimes(1);
    parse.mockRestore();
    expect(times).toBe(1);
    expect(d.status().fallbacks).toEqual({ assemble_failed: 2 });
    expect(h.events.find(({ event }) => event['event'] === 'chunk_authority_unservable')?.event).toMatchObject({ detail: 'timer unavailable' });
  });

  it('keeps serving the pinned publication when the content or the map moves on (SW-D2), and reports the lag', () => {
    for (const [overrides, lag] of [
      [{ shadow: { contentHash: 'older-content' } }, ['content']],
      [{ liveMap: { revision: 4, contentHash: 'map-4' } }, ['map']],
      [{ liveMap: { revision: 3, contentHash: 'map-3b' } }, ['map']],
      [{ shadow: { contentHash: 'older-content' }, liveMap: { revision: 4, contentHash: 'map-4' } }, ['content', 'map']],
    ] as const) {
      const h = harness(overrides);
      const d = dispatcher(h.logger);
      const served = d.select(h.source) as ChunkLiveIslandRuntime;
      expect(served.source, JSON.stringify(lag)).toBe('chunks');
      expect(d.select(h.source)).toBe(served);
      expect(d.status().fallbacks).toEqual({});
      expect(d.status().lastResolution).toMatchObject({ ok: true, lag });
      const pinned = h.events.filter(({ event }) => event['event'] === 'chunk_authority_serving_pinned');
      expect(pinned).toHaveLength(1);
      expect(pinned[0]).toMatchObject({ level: 'info', event: { lag } });
    }
    // A content publication after serving neither unpins nor re-assembles the resident runtime:
    // clients keep drawing exactly these chunks, so the server keeps colliding with them.
    let registryHash = REGISTRY_HASH;
    const h = harness();
    const source = { ...h.source, registryContentHash: () => registryHash };
    const d = dispatcher(h.logger);
    const first = d.select(source) as ChunkLiveIslandRuntime;
    expect(first.source).toBe('chunks');
    const blobs = h.reads.blobs;
    registryHash = 'content-2';
    expect(d.select(source)).toBe(first);
    expect(h.reads.blobs).toBe(blobs);
    expect(d.status().fallbacks).toEqual({});
    expect(d.status().lastResolution).toMatchObject({ ok: true, lag: ['content'] });
  });

  it('swaps in a republished publication cleanly and stops reporting the lag', () => {
    // Published from map 3 while the live map is at 4: the pinned publication serves, with a lag.
    const stale = harness({ liveMap: { revision: 4, contentHash: 'map-4' } });
    const d = dispatcher(stale.logger);
    const pinned = d.select(stale.source) as ChunkLiveIslandRuntime;
    expect(pinned.source).toBe('chunks');
    expect(d.status().lastResolution).toMatchObject({ ok: true, lag: ['map'] });
    // The heads catch up: a new shadow revision whose manifest describes the live map.
    const fresh = harness({ shadow: { revision: 2 } });
    const served = d.select(fresh.source) as ChunkLiveIslandRuntime;
    expect(served.source).toBe('chunks');
    expect(served).not.toBe(pinned);
    expect(d.status().lastResolution).toEqual({ ok: true, key: served.key });
    expect(d.status().fallbacks).toEqual({});
  });

  it('refuses a runtime missing the ground terrain fields (no fall-through to base transitions)', () => {
    const base: CollisionMap = { width: WORLD.width, height: WORLD.height, blocked: new Uint8Array(0), terrainMinimumElevation: -3,
      terrainTransitions: [{ lowerTileX: 1, lowerTileY: 1, upperTileX: 1, upperTileY: 2 } as never] };
    for (const [groundMeta, missing] of [
      [{ hasTraversalChannels: true, terrainTransitions: [] }, 'terrainMinimumElevation'],
      [{ hasTraversalChannels: true, terrainMinimumElevation: 0 }, 'terrainTransitions'],
    ] as const) {
      const { manifest, store } = island({ groundMeta });
      const runtime = assembleChunkLiveIslandRuntime(manifest, hash => store.get(hash), { contentHash: REGISTRY_HASH });
      expect(runtime.complete).toBe(true);
      // The hazard: liveMapCollisionForSpace's { ...base, ...authored } keeps the generated base's value.
      const composed = { ...base, ...runtime.ground };
      expect(composed[missing]).toBe(base[missing]);
      const h = harness({ manifest });
      const d = dispatcher(h.logger);
      expect(d.select(h.source), missing).toBeNull();
      expect(d.status().fallbacks).toEqual({ ground_fields_missing: 1 });
      expect(h.events.find(({ event }) => event['event'] === 'chunk_authority_unservable')?.event).toMatchObject({ reason: 'ground_fields_missing', detail: missing });
    }
  });

  it('checks traversal-channel presence on water as well as ground against the live registry policy', () => {
    const { manifest } = island({ hasTraversalChannels: true, waterTraversal: false });
    const h = harness({ manifest, traversal: true });
    const d = dispatcher(h.logger);
    expect(d.select(h.source)).toBeNull();
    expect(d.status().fallbacks).toEqual({ traversal_policy_mismatch: 1 });
    expect(h.events.find(({ event }) => event['event'] === 'chunk_authority_unservable')?.event).toMatchObject({ detail: expect.stringMatching(/^water:/u) });
    // Both media without channels match a registry without a traversal policy.
    const none = island({ hasTraversalChannels: false });
    const off = harness({ manifest: none.manifest, blobs: none.store, traversal: false });
    expect((dispatcher(off.logger).select(off.source) as ChunkLiveIslandRuntime).source).toBe('chunks');
  });

  it('guards the island: topside, survival world size and survival island base', () => {
    const { manifest } = island();
    for (const [broken, reason] of [
      [{ ...manifest, spaceId: 5 }, 'guard_space'],
      [{ ...manifest, width: 99 }, 'guard_size'],
      [{ ...manifest, metadata: { ...manifest.metadata, document: { id: LIVE_ISLAND_MAP_ID, prefabs: [], provenance: { kind: 'authored' } } } }, 'guard_base'],
      [{ ...manifest, metadata: { ...manifest.metadata, document: { id: LIVE_ISLAND_MAP_ID, prefabs: [] } } }, 'guard_base'],
    ] as const) {
      const h = harness({ manifest: broken as unknown as WorldChunkManifest });
      const d = dispatcher(h.logger);
      expect(d.select(h.source), reason).toBeNull();
      expect(d.status().fallbacks, reason).toEqual({ [reason]: 1 });
      expect(h.reads.blobs, `${reason} decodes nothing`).toBe(0);
    }
    // The production default is the survival world size, so the 100x64 fixture is refused there.
    const h = harness();
    const production = new ChunkAuthorityDispatcher({ logger: h.logger });
    expect(production.select(h.source)).toBeNull();
    expect(production.status().fallbacks).toEqual({ guard_size: 1 });
  });

  it('never serves an incomplete runtime: an obstacle overhanging a missing chunk makes the island unservable', () => {
    const { manifest, store } = island();
    const missing = manifest.chunks[0]!.contentHash;
    const h = harness({ missing: [missing] });
    const d = dispatcher(h.logger);
    // The partial runtime loses the chunk-0 obstacle, so the tiles it overhangs in PRESENT chunk 1 open up.
    const partial = assembleChunkLiveIslandRuntime(manifest, hash => hash === missing ? undefined : store.get(hash), { contentHash: REGISTRY_HASH });
    const complete = assembleChunkLiveIslandRuntime(manifest, hash => store.get(hash), { contentHash: REGISTRY_HASH });
    expect(partial.complete).toBe(false);
    const overhang = { x: 65 * T + T / 2, y: 1 * T + T / 2 }; // tile 65: chunk 1, which decoded fine
    expect(partial.ground.blocked[1 * WORLD.width + 65]).toBe(0);
    expect(positionCollides(overhang, composeChunkIslandCollision(partial, 'ground'))).toBe(false);
    expect(positionCollides(overhang, composeChunkIslandCollision(complete, 'ground'))).toBe(true);

    expect(d.select(h.source)).toBeNull();
    expect(d.status().fallbacks).toEqual({ incomplete: 1 });
    expect(h.events.find(({ event }) => event['event'] === 'chunk_authority_unservable')?.event).toMatchObject({
      reason: 'incomplete', detail: expect.stringContaining(`blob_missing@0,0:${missing}`),
    });
    // The failed key is cached: the next call neither re-reads blobs nor re-logs.
    const reads = h.reads.blobs;
    expect(d.select(h.source)).toBeNull();
    expect(h.reads.blobs).toBe(reads);
    expect(h.events.filter(({ event }) => event['event'] === 'chunk_authority_unservable')).toHaveLength(1);
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

function serverFunctions(dependencies: Record<string, unknown>) {
  const source = ts.createSourceFile('index.ts', readFileSync(new URL('../index.ts', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true);
  const names = ['liveIslandCollisionRuntime', 'chunkAuthoritySource', 'liveMapCollisionForSpace', 'liveIslandCombatPolicy',
    'liveMapRuntimeGeneratedResourceSuppressed', 'liveMapRuntimeResourceSuppressed', 'liveMapGeneratedResourceSuppressed',
    'liveIslandGeneratedResources'];
  const text = names.map(name => {
    const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
    if (fn === undefined) throw new Error(`missing ${name}`);
    return fn.getText(source);
  }).join('\n');
  const javascript = ts.transpileModule(`${text}\nreturn { ${names.join(', ')} };`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return new Function(...Object.keys(dependencies), javascript)(...Object.values(dependencies)) as {
    liveIslandCollisionRuntime(ctx: unknown): unknown;
    liveMapCollisionForSpace(ctx: unknown, spaceId: number, medium: 'ground' | 'water', base: CollisionMap, runtime?: unknown): CollisionMap;
    liveIslandCombatPolicy(ctx: unknown): CombatRegionPolicy | undefined;
    liveMapGeneratedResourceSuppressed(ctx: unknown, spaceId: number, resourceId: bigint): boolean;
    liveMapRuntimeResourceSuppressed(runtime: unknown, spaceId: number, resourceId: bigint): boolean;
    liveIslandGeneratedResources(ctx: unknown, runtime?: unknown): readonly unknown[];
  };
}

describe('index.ts collision dispatcher wiring (static world S3-final: chunks only, fail safe)', () => {
  const { manifest, store } = island();
  /** A live row the server's composition base carries (the island base itself is solid with no obstacles). */
  const live = box(40, 40);
  const base: CollisionMap = { width: WORLD.width, height: WORLD.height, blocked: new Uint8Array(WORLD.width * WORLD.height).fill(1),
    obstacles: [live] };
  /** Blob rows arrive as a fresh Uint8Array from the 2.8.2 host (readUInt8Array slices); number[] is the declared type. */
  const hostBlobs = new Map([...store].map(([hash, bytes]) => [hash, bytes.slice()]));
  function world(initialFlags: string | null, blobShape: 'host' | 'array' = 'host', fixture: { manifest: WorldChunkManifest } = { manifest },
    liveMap: { revision: number; contentHash: string } = { revision: 3, contentHash: 'map-3' }, published = true) {
    let flagsJson = initialFlags;
    const reads: string[] = [];
    const ctx = { db: {
      space_admin_flag: { spaceId: { find: (id: number) => (reads.push(`flag:${id}`), flagsJson === null ? null : { flagsJson }) } },
      world_chunk_shadow: { spaceId: { find: (id: bigint) => (reads.push(`shadow:${id}`), published
        ? { revision: 1, mapId: LIVE_ISLAND_MAP_ID, contentHash: REGISTRY_HASH, manifestJson: JSON.stringify(fixture.manifest) } : null) } },
      live_map_document: { mapId: { find: (id: string) => (reads.push(`map:${id}`), liveMap) } },
      world_chunk_blob: { contentHash: { find: (hash: string) => (reads.push('blob'),
        { bytes: blobShape === 'host' ? hostBlobs.get(hash)! : Array.from(store.get(hash)!) }) } },
    } };
    const dispatcher = new ChunkAuthorityDispatcher({ worldSize: WORLD, logger: { info() {}, warn() {}, time() {}, timeEnd() {} } });
    const functions = serverFunctions({
      chunkAuthorityMode, TOPSIDE_SPACE_ID, LIVE_ISLAND_MAP_ID,
      chunkAuthorityDispatcher: dispatcher,
      contentRegistry: () => ({ contentHash: REGISTRY_HASH }), runtimeTraversalPolicy: () => ({}),
    });
    return { ctx, reads, functions, dispatcher, setFlags: (value: string) => { flagsJson = value; } };
  }

  it('serves the chunk runtime by default (no flags, as on a fresh database) and for on, shadow or an invalid value', () => {
    for (const flags of [null, '{}', '{"chunkAuthority":"on"}', '{"chunkAuthority":"shadow"}', '{"chunkAuthority":"banana"}', 'not json']) {
      const w = world(flags);
      expect((w.functions.liveIslandCollisionRuntime(w.ctx) as ChunkLiveIslandRuntime).source, String(flags)).toBe('chunks');
    }
  });

  it('off is a maintenance freeze: no runtime, no chunk reads, and the solid base alone (fail safe)', () => {
    const w = world('{"chunkAuthority":"off"}');
    expect(w.functions.liveIslandCollisionRuntime(w.ctx)).toBeNull();
    expect(w.reads).toEqual([`flag:${TOPSIDE_SPACE_ID}`]);
    for (const medium of ['ground', 'water'] as const) expect(w.functions.liveMapCollisionForSpace(w.ctx, TOPSIDE_SPACE_ID, medium, base)).toBe(base);
    expect(w.functions.liveIslandCombatPolicy(w.ctx)).toBeUndefined();
    expect(w.functions.liveIslandGeneratedResources(w.ctx)).toEqual([]);
    // Switching back serves again.
    w.setFlags('{"chunkAuthority":"on"}');
    expect((w.functions.liveIslandCollisionRuntime(w.ctx) as ChunkLiveIslandRuntime).source).toBe('chunks');
  });

  it('nothing published (a fresh database) is unservable: null, never a generated or compiled island', () => {
    const w = world(null, 'host', { manifest }, { revision: 3, contentHash: 'map-3' }, false);
    expect(w.functions.liveIslandCollisionRuntime(w.ctx)).toBeNull();
    expect(w.dispatcher.status().fallbacks).toEqual({ shadow_missing: 1 });
    expect(w.functions.liveIslandGeneratedResources(w.ctx)).toEqual([]);
  });

  it('composes the publication\'s static base group ahead of the live rows, exactly as over the precomputed base before', () => {
    const w = world(null);
    const runtime = w.functions.liveIslandCollisionRuntime(w.ctx) as ChunkLiveIslandRuntime;
    // Before S3-final: the precomputed base carried the static obstacles (the base group) ahead of the
    // live rows, and the runtime added none.
    const legacyBase: CollisionMap = { ...base, obstacles: [...runtime.baseObstacles.ground, live] };
    const legacyRuntime = { ...runtime, baseObstacles: { ground: [], water: [] } };
    for (const medium of ['ground', 'water'] as const) {
      const legacy: CollisionMap = { ...legacyBase, obstacles: medium === 'ground' ? [...runtime.baseObstacles.ground, live] : [...runtime.baseObstacles.water, live] };
      expect(w.functions.liveMapCollisionForSpace(w.ctx, TOPSIDE_SPACE_ID, medium, base))
        .toEqual(w.functions.liveMapCollisionForSpace(w.ctx, TOPSIDE_SPACE_ID, medium, legacy, legacyRuntime));
      expect(w.functions.liveMapCollisionForSpace(w.ctx, TOPSIDE_SPACE_ID, medium, base))
        .toEqual(composeChunkIslandCollision(runtime, medium, [live]));
    }
    expect(runtime.baseObstacles.ground).toEqual([box(2, 1)]);
    expect(w.functions.liveMapCollisionForSpace(w.ctx, 7, 'ground', base)).toBe(base);
  });

  it('reads host-shaped Uint8Array blob rows without a per-element copy, and number[] rows too', () => {
    const from = vi.spyOn(Uint8Array, 'from');
    try {
      const host = world(null, 'host');
      const runtime = host.functions.liveIslandCollisionRuntime(host.ctx) as ChunkLiveIslandRuntime;
      expect(runtime.source).toBe('chunks');
      expect(runtime.stats.decodedChunks).toBe(2);
      const instances = new Set<unknown>(hostBlobs.values());
      expect(from.mock.calls.some(([argument]) => instances.has(argument)), 'host bytes are not copied element by element').toBe(false);
      const array = world(null, 'array');
      const fromArray = array.functions.liveIslandCollisionRuntime(array.ctx) as ChunkLiveIslandRuntime;
      expect(compareLiveIslandRuntime(fromArray, runtime).equal).toBe(true);
    } finally {
      from.mockRestore();
    }
  });

  describe('combat policy (static-world S3a)', () => {
    const arena = { id: 'arena', spaceId: TOPSIDE_SPACE_ID, minX: 4, minY: 0, maxX: 80, maxY: 40, policy: 'hostile' as const };
    const camp = { id: 'arena-camp', spaceId: TOPSIDE_SPACE_ID, minX: 60, minY: 10, maxX: 70, maxY: 20, policy: 'sanctuary' as const, parentId: 'arena' };
    const combatManifest: WorldChunkManifest = { ...manifest, metadata: { ...manifest.metadata,
      document: { ...(manifest.metadata['document'] as object), combatRegions: [arena, camp] },
      authority: { ...(manifest.metadata['authority'] as object), combatRegions: [arena, camp] } } as WorldChunkManifest['metadata'] };
    const combatCompiled = compiledFor(combatManifest, hash => store.get(hash));
    const probes = (policy: CombatRegionPolicy | undefined) => {
      const out: (string | null)[] = [];
      for (let tileY = 0; tileY < WORLD.height; tileY++) for (let tileX = 0; tileX < WORLD.width; tileX++) {
        out.push(policy?.regionAt({ spaceId: TOPSIDE_SPACE_ID, tileX: tileX + .5, tileY: tileY + .5 })?.id ?? null);
      }
      return out;
    };

    it('returns the chunk-built policy, equal at every tile to the compiled reference, cached with the runtime', () => {
      const on = world(null, 'host', { manifest: combatManifest });
      const runtime = on.functions.liveIslandCollisionRuntime(on.ctx) as ChunkLiveIslandRuntime;
      const policy = on.functions.liveIslandCombatPolicy(on.ctx);
      expect(policy).toBe(runtime.combatPolicy);
      expect(runtime.combatRegions).toEqual(combatCompiled.combatRegions);
      const chunkProbes = probes(policy);
      expect(chunkProbes).toEqual(probes(combatCompiled.combatPolicy));
      expect(new Set(chunkProbes)).toEqual(new Set([null, 'arena', 'arena-camp']));
      const decoded = on.reads.filter(read => read === 'blob').length;
      expect(on.functions.liveIslandCombatPolicy(on.ctx)).toBe(policy);
      expect(on.reads.filter(read => read === 'blob')).toHaveLength(decoded);
    });

    it('keeps the pinned chunk policy when the live map moved on (SW-D2 lag)', () => {
      const stale = world(null, 'host', { manifest: combatManifest }, { revision: 4, contentHash: 'map-4' });
      expect(probes(stale.functions.liveIslandCombatPolicy(stale.ctx))).toEqual(probes(combatCompiled.combatPolicy));
      expect(stale.dispatcher.status().fallbacks).toEqual({});
      expect(stale.dispatcher.status().lastResolution).toMatchObject({ ok: true, lag: ['map'] });
    });

    it('an undeclared map stays undeclared through the chunks', () => {
      const on = world(null);
      const runtime = on.functions.liveIslandCollisionRuntime(on.ctx) as ChunkLiveIslandRuntime;
      expect(runtime.combatRegions).toBeUndefined();
      expect(probes(runtime.combatPolicy).every(id => id === null)).toBe(true);
    });

    it('no server combat-policy read bypasses the dispatcher, and stepWorld reuses its collision runtime', () => {
      const text = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
      const functionText = (name: string) => {
        const start = text.indexOf(`\nfunction ${name}(`);
        expect(start, name).toBeGreaterThan(0);
        return text.slice(start, text.indexOf('\n}\n', start) + 3);
      };
      // Outside: the map publication path, which validates and preserves the document's authored
      // regions (a write, not a combat read).
      const outside = ['validatedLiveMapDocument', 'commitLiveMapSnapshot']
        .reduce((rest, name) => rest.replace(functionText(name), ''), text);
      expect(outside).not.toMatch(/\.document\.combatRegions/u);
      expect(outside).not.toMatch(/new CombatRegionPolicy\(/u);
      const receivers = [...outside.matchAll(/([\w?.()]+)\.(combatPolicy|combatRegions)\b/gu)].map(match => `${match[1]}.${match[2]}`);
      expect(new Set(receivers)).toEqual(new Set(['runtime?.combatPolicy', 'runtime?.combatRegions', 'liveIslandCollisionRuntime(ctx)?.combatPolicy',
        'topsideLiveMapRuntime?.combatPolicy', 'tickLiveMapRuntime?.combatPolicy']));
      const tick = text.slice(text.indexOf('export const stepWorld ='));
      expect(tick).toContain('if(authorityTick%20n===0n)settleTownStreetlamps(ctx,calendarTick,prefetchedTopsideRuntime=liveIslandCollisionRuntime(ctx));');
      expect(tick).toContain('stepOutdoorEncounters(ctx, authorityTick, outdoorPlayers, tickLiveMapRuntime?.combatPolicy);');
      expect(tick).not.toContain('liveIslandCombatPolicy(ctx)');
      expect(tick).not.toContain('sampleRuntime(');
    });
  });

  describe('static document consumers and generated resources (S3b, S3c)', () => {
    const suppressedManifest: WorldChunkManifest = { ...manifest, metadata: { ...manifest.metadata,
      document: { ...(manifest.metadata['document'] as object), generatedSuppressions: ['resource-7'] },
      authority: { ...(manifest.metadata['authority'] as object), generatedSuppressions: ['resource-7'] } } as WorldChunkManifest['metadata'] };
    const suppressedCompiled = compiledFor(suppressedManifest, hash => store.get(hash));

    it('serves the chunk runtime\'s static view and suppression, equal to the compiled reference', () => {
      const on = world(null, 'host', { manifest: suppressedManifest });
      const runtime = on.functions.liveIslandCollisionRuntime(on.ctx) as ChunkLiveIslandRuntime;
      expect(compareLiveIslandRuntime(runtime, suppressedCompiled).equal).toBe(true);
      expect([7n, 8n].map(id => on.functions.liveMapGeneratedResourceSuppressed(on.ctx, TOPSIDE_SPACE_ID, id))).toEqual([true, false]);
      expect(on.functions.liveMapGeneratedResourceSuppressed(on.ctx, 7, 7n)).toBe(false);
      expect((on.functions.liveIslandCollisionRuntime(on.ctx) as ChunkLiveIslandRuntime).staticView).toBe(runtime.staticView);
      expect(mapStreetlampPlans(runtime.staticView)).toBe(mapStreetlampPlans(runtime.staticView));
      for (const [spaceId, id] of [[TOPSIDE_SPACE_ID, 7n], [TOPSIDE_SPACE_ID, 8n], [7, 7n]] as const) {
        expect(on.functions.liveMapRuntimeResourceSuppressed(runtime, spaceId, id)).toBe(on.functions.liveMapGeneratedResourceSuppressed(on.ctx, spaceId, id));
      }
      expect(on.functions.liveMapRuntimeResourceSuppressed(null, TOPSIDE_SPACE_ID, 7n)).toBe(false);
    });

    it('serves the verified chunk records, and no resources at all while unservable', () => {
      const on = world(null);
      const runtime = on.functions.liveIslandCollisionRuntime(on.ctx) as ChunkLiveIslandRuntime;
      expect(on.functions.liveIslandGeneratedResources(on.ctx)).toBe(runtime.generatedResources());
      const tampered: WorldChunkManifest = { ...manifest, metadata: { ...manifest.metadata,
        authority: { ...(manifest.metadata['authority'] as object), resources: { count: 1, hash: NO_RESOURCES_DIGEST.hash } } } as WorldChunkManifest['metadata'] };
      const w = world(null, 'host', { manifest: tampered });
      expect(w.functions.liveIslandGeneratedResources(w.ctx)).toEqual([]);
      expect(w.dispatcher.status().fallbacks).toEqual({ incomplete: 1 });
    });

    it('the server no longer compiles the map or runs the generator; reconcile never runs unservable', () => {
      const text = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
      const functionText = (name: string) => {
        const start = text.indexOf(`\nfunction ${name}(`);
        expect(start, name).toBeGreaterThan(0);
        return text.slice(start, text.indexOf('\n}\n', start) + 3);
      };
      expect(text).not.toMatch(/\bcompiledLiveIslandRuntime\(|\bgenerateSurvivalResources\(|\bcompileMapDocument\(|precomputed-survival-collision/u);
      expect(functionText('liveIslandGeneratedResources')).toContain('runtime === null ? [] : runtime.generatedResources()');
      const reconcile = functionText('reconcileGeneratedSurvivalResources');
      expect(reconcile.indexOf('if (liveMapRuntime === null) return;')).toBeGreaterThan(reconcile.indexOf('liveIslandCollisionRuntime(ctx)'));
      expect(reconcile.indexOf('if (liveMapRuntime === null) return;')).toBeLessThan(reconcile.indexOf('ctx.db.world_resource.id.delete'));
      expect(functionText('seedTopsideResourcesOnce')).toContain('if (liveIslandCollisionRuntime(ctx) === null) return;');
      const tick = text.slice(text.indexOf('export const stepWorld ='));
      expect(tick).toContain('seedTopsideResourcesOnce(ctx);');
      expect(functionText('settleTownStreetlamps')).toContain('mapStreetlampPlans(runtime.staticView)');
      const stash = functionText('hearthStashWithinReach');
      expect(stash.match(/liveIslandCollisionRuntime\(ctx\)/gu)).toHaveLength(1);
      const swing = functionText('applyToolSwingLifecycle');
      expect(swing.match(/liveIslandCollisionRuntime\(ctx\)/gu)).toHaveLength(1);
    });
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

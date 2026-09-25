import { beforeAll, describe, expect, it } from 'vitest';
import { TILE_SIZE_FIXED, TOPSIDE_SPACE_ID, generateSurvivalResources, SURVIVAL_WORLD_SEED,
  type CollisionMap, type CollisionObstacle, type ContentRegistry } from '@orchard/sim';
import type { LiveMapDocumentRow } from '@orchard/engine/live-map-runtime';
import { authorityObstacleKey } from '@orchard/sim/chunk-runtime';
import { canonicalChunkJson } from '@orchard/sim/world-chunk';
import { createAuthoritySpaceCollisionMap } from '../packages/world/src/world-rules.js';
import { assembleChunkLiveIslandRuntime, compareLiveIslandRuntime, composeChunkIslandCollision, type ChunkLiveIslandRuntime } from '../packages/world/src/content/chunk-authority-runtime.js';
import { captureWorldChunkSnapshot, materializeWorldChunks, type MaterializedWorldChunks, type WorldChunkSnapshot } from './materialize-world-chunks.js';
import { serverLiveIslandReference, type ServerLiveCollisionRows, type ServerLiveIslandReference } from './world-chunk-server-reference.js';

/** One oracle run, one snapshot, one published chunk set and its blob store (static-world S1b). */
export interface ChunkRuntimeParityFixture {
  readonly server: ServerLiveIslandReference;
  readonly snapshot: WorldChunkSnapshot;
  readonly published: MaterializedWorldChunks;
  readonly blobs: ReadonlyMap<string, Uint8Array>;
  readonly readBlob: (hash: string) => Uint8Array | undefined;
  readonly assemble: () => ChunkLiveIslandRuntime;
}

export function chunkRuntimeParityFixture(row: LiveMapDocumentRow, registry: ContentRegistry): ChunkRuntimeParityFixture {
  const server = serverLiveIslandReference(row, registry);
  const snapshot = captureWorldChunkSnapshot(row, registry, undefined, server);
  const published = materializeWorldChunks(snapshot, row, registry);
  const blobs = new Map(published.manifest.chunks.map((head, index) => [head.contentHash, published.blobs[index]!]));
  const readBlob = (hash: string): Uint8Array | undefined => blobs.get(hash);
  return { server, snapshot, published, blobs, readBlob,
    assemble: () => assembleChunkLiveIslandRuntime(published.manifest, readBlob, registry, { shadowRevision: 1, shadowContentHash: registry.contentHash }) };
}

/** Deterministic canonical form of a whole CollisionMap (typed arrays, booleans and record order included). */
export function collisionJson(collision: CollisionMap): string { return canonicalChunkJson(collision); }

function tileBox(tileX: number, tileY: number): CollisionObstacle {
  return { left: tileX * TILE_SIZE_FIXED, top: tileY * TILE_SIZE_FIXED, right: (tileX + 1) * TILE_SIZE_FIXED - 1, bottom: (tileY + 1) * TILE_SIZE_FIXED - 1 };
}

export interface LiveRowsFixture {
  readonly rows: ServerLiveCollisionRows;
  /** Live boxes that equal a suppressed decoration key: the server drops them (finding B). */
  readonly suppressedLiveBoxes: readonly CollisionObstacle[];
  /** Live boxes on ordinary tiles: the server keeps them. */
  readonly keptLiveBoxes: readonly CollisionObstacle[];
}

/** Live resource, chest and placeable rows that exercise every branch of the base composition:
 * blocking/depleted resources (including any runtime-suppressed generated id), a carried chest,
 * a non-blocking placeable, and chest/placeable boxes that coincide with suppressed decoration
 * keys, which `liveMapCollisionForSpace` drops together with the static decorations. */
export function liveRowsFixture(server: ServerLiveIslandReference, registry: ContentRegistry): LiveRowsFixture {
  const suppressedTiles = [...server.suppressedDecorationObstacleKeys.ground].map(key => key.split(':').map(Number) as [number, number, number, number])
    .filter(([left, top, right, bottom]) => left % TILE_SIZE_FIXED === 0 && top % TILE_SIZE_FIXED === 0
      && right === left + TILE_SIZE_FIXED - 1 && bottom === top + TILE_SIZE_FIXED - 1)
    .map(([left, top]) => ({ tileX: left / TILE_SIZE_FIXED, tileY: top / TILE_SIZE_FIXED }));
  if (suppressedTiles.length < 2) throw new Error('Fixture needs two full-tile suppressed decoration keys');
  const [chestTile, placeableTile] = suppressedTiles as [{ tileX: number; tileY: number }, { tileX: number; tileY: number }];
  const generated = generateSurvivalResources(SURVIVAL_WORLD_SEED, registry);
  const effective = new Map(server.resources.map(resource => [resource.id, resource.effectiveTile]));
  const suppressedIds = generated.filter(resource => server.generatedSuppressions.has(`resource-${resource.id}`)).map(({ id }) => id);
  const picked = [...new Set([...generated.slice(0, 48).map(({ id }) => id), ...suppressedIds])];
  const resources = picked.map((id, index) => {
    const resource = generated.find(candidate => candidate.id === id)!;
    const tile = effective.get(id) ?? { tileX: resource.tileX, tileY: resource.tileY };
    return { id: BigInt(id), kind: resource.kind, tileX: tile.tileX, tileY: tile.tileY, depleted: index === 1 };
  });
  const open = { tileX: 420, tileY: 420 }, openPlaceable = { tileX: 421, tileY: 422 };
  return {
    rows: {
      resources,
      chests: [{ ...chestTile }, { ...open }, { tileX: 430, tileY: 430, carriedBy: 'player' }],
      placeables: [{ ...placeableTile, blocksMovement: true }, { ...openPlaceable, blocksMovement: true }, { tileX: 431, tileY: 431, blocksMovement: false }],
    },
    suppressedLiveBoxes: [tileBox(chestTile.tileX, chestTile.tileY), tileBox(placeableTile.tileX, placeableTile.tileY)],
    keptLiveBoxes: [tileBox(open.tileX, open.tileY), tileBox(openPlaceable.tileX, openPlaceable.tileY)],
  };
}

/** The live base obstacles the real `createAuthoritySpaceCollisionMap` appends after the static
 * base for these rows (resources filtered by the runtime's generated suppressions, as collisionForSpace does). */
export function liveBaseObstacles(registry: ContentRegistry, runtime: ChunkLiveIslandRuntime, medium: 'ground' | 'water',
  rows: ServerLiveCollisionRows): { readonly staticBase: readonly CollisionObstacle[]; readonly live: readonly CollisionObstacle[] } {
  const base = medium === 'ground'
    ? createAuthoritySpaceCollisionMap(registry, TOPSIDE_SPACE_ID, rows.resources.filter(resource => !runtime.generatedSuppressions.has(`resource-${resource.id}`)),
      rows.chests, 'ground', rows.placeables, null, [])
    : createAuthoritySpaceCollisionMap(registry, TOPSIDE_SPACE_ID, [], [], 'water', [], null);
  const empty = createAuthoritySpaceCollisionMap(registry, TOPSIDE_SPACE_ID, [], [], medium, [], null, medium === 'ground' ? [] : undefined);
  const all = base.obstacles ?? [], staticCount = empty.obstacles?.length ?? 0;
  return { staticBase: all.slice(0, staticCount), live: all.slice(staticCount) };
}

export const obstacleKeys = (obstacles: readonly CollisionObstacle[] | undefined): Set<string> => new Set((obstacles ?? []).map(authorityObstacleKey));

/** The S1b parity suite shared by the bootstrap and authored fixtures (one snapshot per file). */
export function describeChunkRuntimeParity(label: string, setup: () => { readonly row: LiveMapDocumentRow; readonly registry: ContentRegistry },
  extra?: (context: () => ChunkRuntimeParityContext) => void): void {
  describe(`chunk runtime assembler parity: ${label}`, () => {
    let context: ChunkRuntimeParityContext;
    beforeAll(() => {
      const { row, registry } = setup();
      const fixture = chunkRuntimeParityFixture(row, registry);
      const started = performance.now();
      const runtime = fixture.assemble();
      context = { ...fixture, row, registry, runtime, assembleMs: performance.now() - started, live: liveRowsFixture(fixture.server, registry) };
    }, 120_000);

    it('assembles a complete runtime equal to compiledLiveIslandRuntime (collision, combat, suppression, static view)', () => {
      const { runtime, server, published } = context;
      expect(runtime.issues).toEqual([]);
      expect(runtime.complete).toBe(true);
      expect(runtime.stale).toBe(false);
      expect(runtime.stats).toMatchObject({ expectedChunks: 169, decodedChunks: 169 });
      const diff = compareLiveIslandRuntime(runtime, server.runtime);
      expect(diff.fields).toEqual({});
      expect(diff.equal).toBe(true);
      // Stronger than the diff: the drop-in overlay is byte-identical as a CollisionMap (field set,
      // array kinds and obstacle order), so liveMapCollisionForSpace spreads it identically.
      for (const medium of ['ground', 'water'] as const) expect(collisionJson(runtime[medium]), medium).toBe(collisionJson(server.runtime[medium]));
      expect(runtime.key).toBe(`chunks:0:1:${published.manifest.sourceRevision}:${published.manifest.sourceHash}:${context.registry.contentHash}`);
    }, 120_000);

    it('composes the static base identically through the real liveMapCollisionForSpace, with and without the precomputed base', () => {
      const { runtime, server } = context;
      const empty = { resources: [], chests: [], placeables: [] };
      for (const medium of ['ground', 'water'] as const) {
        const expected = collisionJson(server.composed[medium]);
        expect(collisionJson(server.composeWithLiveRows(medium, server.runtime, empty)), medium).toBe(expected);
        expect(collisionJson(server.composeWithLiveRows(medium, runtime, empty)), medium).toBe(expected);
        expect(collisionJson(composeChunkIslandCollision(runtime, medium)), medium).toBe(expected);
      }
    }, 120_000);

    it('reproduces the server composition WITH live resource, chest and placeable base obstacles (finding B)', () => {
      const { runtime, server, registry, live } = context;
      for (const medium of ['ground', 'water'] as const) {
        const expected = server.composeWithLiveRows(medium, server.runtime, live.rows);
        // S2b path: the real server composition over the precomputed base, runtime swapped.
        expect(collisionJson(server.composeWithLiveRows(medium, runtime, live.rows)), medium).toBe(collisionJson(expected));
        // S3-final path: chunk base records + live rows, no precomputed module.
        const { staticBase, live: liveObstacles } = liveBaseObstacles(registry, runtime, medium, live.rows);
        expect(canonicalChunkJson(runtime.baseObstacles[medium]), `${medium} chunk base group equals the precomputed base`).toBe(canonicalChunkJson(staticBase));
        expect(collisionJson(composeChunkIslandCollision(runtime, medium, liveObstacles)), medium).toBe(collisionJson(expected));
        if (medium === 'water') { expect(liveObstacles).toEqual([]); continue; }
        // The live rows really reached the composition, and the quirk is exercised:
        // The retained base part precedes the authored group (landmarks re-author some suppressed boxes).
        const retained = expected.obstacles!.slice(0, expected.obstacles!.length - (runtime.ground.obstacles?.length ?? 0));
        const composed = obstacleKeys(retained), liveKeys = obstacleKeys(liveObstacles);
        expect(liveObstacles.length).toBeGreaterThan(live.keptLiveBoxes.length + live.suppressedLiveBoxes.length);
        for (const box of live.keptLiveBoxes) expect(composed.has(authorityObstacleKey(box))).toBe(true);
        for (const box of live.suppressedLiveBoxes) {
          expect(liveKeys.has(authorityObstacleKey(box)), 'live row produced the box').toBe(true);
          expect(runtime.suppressedDecorationObstacleKeys.ground.has(authorityObstacleKey(box))).toBe(true);
          expect(composed.has(authorityObstacleKey(box)), 'suppressed-AABB filter dropped the LIVE box').toBe(false);
        }
        // Chunk-only composition without the suppression filter would differ: the check is not vacuous.
        const unfiltered = [...runtime.baseObstacles.ground, ...liveObstacles, ...(runtime.ground.obstacles ?? [])];
        expect(unfiltered.length).toBeGreaterThan(expected.obstacles!.length);
      }
    }, 120_000);

    extra?.(() => context);
  });
}
export interface ChunkRuntimeParityContext extends ChunkRuntimeParityFixture {
  readonly row: LiveMapDocumentRow;
  readonly registry: ContentRegistry;
  readonly runtime: ChunkLiveIslandRuntime;
  readonly assembleMs: number;
  readonly live: LiveRowsFixture;
}

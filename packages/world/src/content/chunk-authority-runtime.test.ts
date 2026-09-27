import { describe, expect, it } from 'vitest';
import { canonicalChunkJson, decodeWorldChunk, encodeWorldChunk, worldChunkHash, WORLD_CHUNK_STRIDE, WORLD_CHUNK_VOID, type ChunkArray, type WorldChunkManifest,
  type WorldChunkRecord } from '@orchard/sim/world-chunk';
import { createLiveIslandMapDocument, resolvedMapBiomeAt } from '@orchard/sim';
import { assembleChunkLiveIslandRuntime, compareLiveIslandRuntime, composeChunkIslandCollision, documentStaticView,
  LIVE_ISLAND_OUTSIDE_MAP_BIOME } from './chunk-authority-runtime.js';

const CELLS = WORLD_CHUNK_STRIDE ** 2;
const T = 256;
const box = (tileX: number, tileY: number) => ({ left: tileX * T, top: tileY * T, right: tileX * T + T - 1, bottom: tileY * T + T - 1 });
const obstacle = (ordinal: number, group: 'base' | 'authored', groupOrdinal: number, tileX: number, sourceId: string): WorldChunkRecord =>
  ({ kind: 'authority.ground.obstacle', ordinal, tileX, tileY: 1, value: { group, ordinal: groupOrdinal, ...box(tileX, 1), sourceId } });

/** Two generated resources (static world S3c): one plain in chunk 1 (lower ordinal than it anchors
 * suggest), one mined, moved and suppressed in chunk 0. Global ordinals interleave across chunks. */
const RESOURCES = [
  { id: 7, kind: 'tree_oak', generatedTile: { tileX: 70, tileY: 3 }, effectiveTile: { tileX: 70, tileY: 3 }, suppressed: false },
  { id: 9, kind: 'ore_copper', generatedTile: { tileX: 12, tileY: 5 }, effectiveTile: { tileX: 13, tileY: 5 }, suppressed: true,
    nodeClass: 'mixed', richness: 2, spawnSiteId: 44, activationOrdinal: 0 },
];
const resourceRecord = (ordinal: number): WorldChunkRecord => ({ kind: 'authority.resource', ordinal,
  tileX: RESOURCES[ordinal]!.effectiveTile.tileX, tileY: RESOURCES[ordinal]!.effectiveTile.tileY, value: RESOURCES[ordinal]! });
const resourceDigest = (values: readonly unknown[]) => ({ count: values.length, hash: worldChunkHash(new TextEncoder().encode(canonicalChunkJson(values))) });

/** A 100x64 island: chunk 0 is full width, chunk 1 is clipped to 36 columns. */
function island(recordsFor: (cx: number) => WorldChunkRecord[] = defaultRecords, authoritySchema: 1 | 2 = 1,
  resources: unknown = resourceDigest(RESOURCES)) {
  const blobs = [0, 1].map(cx => {
    const walk = new Uint8Array(CELLS), water = new Uint8Array(CELLS).fill(1);
    return encodeWorldChunk({ schema: 1, mediumSchema: 1, authoritySchema, spaceId: 0, cx, cy: 0, assetRevision: 'assets-1',
      arrays: { medium: new Uint8Array(CELLS), solidBlocked: new Uint8Array(CELLS), biomes: new Uint8Array(CELLS).fill(cx),
        'authority.ground.blocked': walk, 'authority.ground.elevations': new Int16Array(CELLS).fill(cx + 1),
        'authority.ground.terrainPlaneBlocked': new Uint8Array(CELLS * 2), 'authority.ground.horseJumpableTerrain': new Uint8Array(CELLS),
        'authority.water.blocked': water, 'authority.combatRegion': new Uint8Array(CELLS) } satisfies Record<string, ChunkArray>,
      records: recordsFor(cx), assetIds: [], atlasPackIds: [] });
  });
  const manifest: WorldChunkManifest = { schema: 1, chunkSize: 64, spaceId: 0, width: 100, height: 64, assetRevision: 'assets-1',
    sourceRevision: 3, sourceHash: 'map-3', metadata: {
      channels: { 'authority.ground.terrainPlaneBlocked': { type: 'u8', planes: 2 } },
      biomePalette: ['meadow', 'forest'],
      document: { id: 'live-island', prefabs: [] },
      authority: { schema: 1, combatRegions: [{ id: 'arena', spaceId: 0, minX: 0, minY: 0, maxX: 10, maxY: 10, policy: 'hostile' }],
        generatedSuppressions: ['resource-7'], resources: resources as never,
        collisions: { ground: { hasTraversalChannels: true, terrainMinimumElevation: 0, terrainTransitions: [] }, water: { hasTraversalChannels: true } } },
    },
    chunks: blobs.map((bytes, cx) => ({ cx, cy: 0, contentHash: decodeWorldChunk(bytes).contentHash, byteLength: bytes.length })) };
  const store = new Map(manifest.chunks.map((head, index) => [head.contentHash, blobs[index]!]));
  return { manifest, readBlob: (hash: string) => store.get(hash) };
}
function defaultRecords(cx: number): WorldChunkRecord[] {
  // Global record ordinals interleave across chunks; group ordinals restart per group.
  return cx === 0
    ? [obstacle(0, 'base', 0, 2, 'decoration:1'), obstacle(2, 'authored', 0, 3, 'landmark:a'),
      { kind: 'authority.suppressedObstacleKey', ordinal: 0, tileX: 5, tileY: 1, value: { medium: 'ground', ...box(5, 1) } },
      { kind: 'objects', ordinal: 0, tileX: 4, tileY: 4, value: { id: 'crate-1', prefabId: 'crate', tileX: 4, tileY: 4 } }, resourceRecord(1)]
    : [obstacle(1, 'base', 1, 70, 'decoration:2'), resourceRecord(0)];
}
const registry = { contentHash: 'content-1' };

describe('assembleChunkLiveIslandRuntime', () => {
  it('assembles whole-island channels, ordered obstacle groups, suppression, combat and the static view', () => {
    const { manifest, readBlob } = island();
    const runtime = assembleChunkLiveIslandRuntime(manifest, readBlob, registry, { shadowRevision: 4 });
    expect(runtime.issues).toEqual([]);
    expect(runtime.key).toBe('chunks:0:4:3:map-3:content-1');
    expect(runtime.ground.blocked).toHaveLength(6400);
    expect(runtime.ground.blocked.every(value => !value)).toBe(true);
    expect([runtime.ground.elevations![0], runtime.ground.elevations![99]]).toEqual([1, 2]);
    expect(runtime.ground.terrainPlaneBlocked).toHaveLength(12_800);
    expect(runtime.water.blocked.every(Boolean)).toBe(true);
    expect(runtime.ground.traversalChannels).toBe(runtime.water.traversalChannels);
    expect(runtime.ground.terrainTransitions).toEqual([]);
    expect(runtime.baseObstacles.ground).toEqual([box(2, 1), box(70, 1)]);
    expect(runtime.ground.obstacles).toEqual([box(3, 1)]);
    expect([...runtime.suppressedDecorationObstacleKeys.ground]).toEqual([`${box(5, 1).left}:${T}:${box(5, 1).right}:${2 * T - 1}`]);
    expect(runtime.generatedSuppressions.has('resource-7')).toBe(true);
    expect(runtime.combatPolicy.allowsHostileDamage({ spaceId: 0, tileX: 5, tileY: 5 })).toBe(true);
    expect([runtime.staticView.biomeAt(0, 0), runtime.staticView.biomeAt(99, 63), runtime.staticView.biomeAt(100, 0)]).toEqual(['meadow', 'forest', undefined]);
    expect(runtime.staticView.objects.map(({ id }) => id)).toEqual(['crate-1']);
    // Live base boxes are filtered by the suppressed keys too (finding B), before the authored group.
    const composed = composeChunkIslandCollision(runtime, 'ground', [box(5, 1), box(6, 1)]);
    expect(composed.obstacles).toEqual([box(2, 1), box(70, 1), box(6, 1), box(3, 1)]);
  });

  it('assembles the identical runtime from authority schema 2 (obstacle table) blobs (BUG-044)', () => {
    const v1 = island(), v2 = island(defaultRecords, 2);
    expect(v2.manifest.chunks.map(({ contentHash }) => contentHash)).not.toEqual(v1.manifest.chunks.map(({ contentHash }) => contentHash));
    const a = assembleChunkLiveIslandRuntime(v1.manifest, v1.readBlob, registry), b = assembleChunkLiveIslandRuntime(v2.manifest, v2.readBlob, registry);
    expect(b.issues).toEqual([]);
    expect(compareLiveIslandRuntime(b, a).equal).toBe(true);
    for (const medium of ['ground', 'water'] as const) expect(composeChunkIslandCollision(b, medium, [box(5, 1)])).toEqual(composeChunkIslandCollision(a, medium, [box(5, 1)]));
  });

  it('leaves missing and corrupt chunks void and solid, reports them, and bounds the diff', () => {
    const { manifest, readBlob } = island();
    const complete = assembleChunkLiveIslandRuntime(manifest, readBlob, registry);
    const missing = assembleChunkLiveIslandRuntime(manifest, hash => hash === manifest.chunks[1]!.contentHash ? undefined : readBlob(hash), registry);
    expect(missing.complete).toBe(false);
    expect(missing.issues).toEqual([{ kind: 'blob_missing', cx: 1, cy: 0, detail: manifest.chunks[1]!.contentHash }]);
    expect(missing.ground.blocked[99]).toBe(1);
    expect(missing.ground.traversalChannels!.medium[99]).toBe(WORLD_CHUNK_VOID);
    expect(missing.ground.traversalChannels!.solidBlocked[99]).toBe(1);
    expect(missing.ground.terrainPlaneBlocked![6400 + 99]).toBe(1);
    expect(missing.staticView.biomeAt(99, 0)).toBeUndefined();
    expect(missing.ground.blocked[63]).toBe(0);
    const diff = compareLiveIslandRuntime(missing, complete, 3);
    expect(diff.equal).toBe(false);
    expect(diff.fields['ground.blocked']).toMatchObject({ count: 36 * 64 });
    expect(diff.fields['ground.blocked']!.samples).toEqual([
      { index: 64, plane: 0, tileX: 64, tileY: 0, a: 1, b: 0 },
      { index: 65, plane: 0, tileX: 65, tileY: 0, a: 1, b: 0 },
      { index: 66, plane: 0, tileX: 66, tileY: 0, a: 1, b: 0 },
    ]);
    expect(Object.values(diff.fields).every(field => field.samples.length <= 3)).toBe(true);
    expect(compareLiveIslandRuntime(complete, assembleChunkLiveIslandRuntime(manifest, readBlob, registry)).equal).toBe(true);

    const corrupt = assembleChunkLiveIslandRuntime(manifest, hash => {
      const bytes = readBlob(hash)!.slice();
      if (hash === manifest.chunks[0]!.contentHash) bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1;
      return bytes;
    }, registry);
    expect(corrupt.issues).toEqual([{ kind: 'blob_invalid', cx: 0, cy: 0, detail: 'World chunk hash mismatch' }]);
    expect(corrupt.ground.blocked[0]).toBe(1);
    const headless = assembleChunkLiveIslandRuntime({ ...manifest, chunks: manifest.chunks.slice(0, 1) }, readBlob, registry);
    expect(headless.issues).toEqual([{ kind: 'head_missing', cx: 1, cy: 0 }]);
  });

  it('S3a: carries the combat policy and its declared regions, and the diff catches any combat difference', () => {
    const { manifest, readBlob } = island();
    const withCombat = (combatRegions: unknown[], documentRegions?: unknown[]): WorldChunkManifest => ({ ...manifest, metadata: { ...manifest.metadata,
      document: { id: 'live-island', prefabs: [], ...(documentRegions === undefined ? {} : { combatRegions: documentRegions }) },
      authority: { ...(manifest.metadata['authority'] as object), combatRegions } } as WorldChunkManifest['metadata'] });
    const arena = { id: 'arena', spaceId: 0, minX: 0, minY: 0, maxX: 10, maxY: 10, policy: 'hostile' };
    const camp = { id: 'camp', spaceId: 0, minX: 2, minY: 2, maxX: 3, maxY: 3, policy: 'sanctuary', parentId: 'arena' };
    // The policy's regions always win when set, even if metadata.document lost its key.
    const runtime = assembleChunkLiveIslandRuntime(manifest, readBlob, registry);
    expect(runtime.combatRegions).toEqual([arena]);
    expect(runtime.combatRegions).toBe(runtime.staticView.combatRegions);
    // A map that declares no regions stays undeclared (the compiled `document.combatRegions` is undefined);
    // one that declares an empty list stays declared.
    const undeclared = assembleChunkLiveIslandRuntime(withCombat([]), readBlob, registry);
    const declaredEmpty = assembleChunkLiveIslandRuntime(withCombat([], []), readBlob, registry);
    expect(undeclared.combatRegions).toBeUndefined();
    expect(declaredEmpty.combatRegions).toEqual([]);
    for (const empty of [undeclared, declaredEmpty]) expect(empty.combatPolicy.regionAt({ spaceId: 0, tileX: 5, tileY: 5 })).toBeNull();
    expect(compareLiveIslandRuntime(undeclared, declaredEmpty).fields).toEqual({ 'combatRegions.declared': { count: 1, samples: [{ a: false, b: true }] } });
    // A nested sanctuary: the policy answers per tile centre, and a differing policy is caught per tile.
    const nested = assembleChunkLiveIslandRuntime(withCombat([arena, camp], [arena, camp]), readBlob, registry);
    expect([[5.5, 5.5], [2.5, 3.5], [11.5, 5.5]].map(([tileX, tileY]) => nested.combatPolicy.regionAt({ spaceId: 0, tileX: tileX!, tileY: tileY! })?.id ?? null))
      .toEqual(['arena', 'camp', null]);
    expect(nested.combatPolicy.allowsHostileSegment({ spaceId: 0, tileX: 1.5, tileY: 2.5 }, { spaceId: 0, tileX: 5.5, tileY: 2.5 })).toBe(false);
    const diff = compareLiveIslandRuntime(nested, runtime, 2);
    expect(diff.fields['combatPolicy.regionAt']).toEqual({ count: 4, samples: [{ tileX: 2, tileY: 2, a: 'camp', b: 'arena' }, { tileX: 3, tileY: 2, a: 'camp', b: 'arena' }] });
    expect([diff.fields['combatRegions']?.count, diff.fields['combatRegions.length']?.count]).toEqual([1, 1]);
    expect(compareLiveIslandRuntime(nested, assembleChunkLiveIslandRuntime(withCombat([arena, camp], [arena, camp]), readBlob, registry)).equal).toBe(true);
  });

  it('S3b: the compiled static view answers resolvedMapBiomeAt inside the map, and the outside fallback equals it outside', () => {
    const document = createLiveIslandMapDocument();
    const view = documentStaticView(document);
    const size = document.width;
    for (const [tileX, tileY] of [[0, 0], [3, 3], [416, 416], [300, 500], [size - 1, size - 1], [size - 4, 200]]) {
      expect(view.biomeAt(tileX!, tileY!), `${tileX},${tileY}`).toBe(resolvedMapBiomeAt(document, tileX!, tileY!));
    }
    for (const [tileX, tileY] of [[-1, 0], [0, -1], [size, 0], [0, size], [size + 40, size + 40]]) {
      expect(view.biomeAt(tileX!, tileY!)).toBeUndefined();
      expect(view.biomeAt(tileX!, tileY!) ?? LIVE_ISLAND_OUTSIDE_MAP_BIOME, `${tileX},${tileY}`).toBe(resolvedMapBiomeAt(document, tileX!, tileY!));
    }
  });

  it('S3c: rebuilds the generated resources from authority.resource records (generator shape, generated tiles)', () => {
    const { manifest, readBlob } = island();
    const runtime = assembleChunkLiveIslandRuntime(manifest, readBlob, registry);
    expect(runtime.issues).toEqual([]);
    const resources = runtime.generatedResources();
    // Exactly the generator's objects: generated tiles (placements apply in reconcile), optional fields only when set.
    expect(resources).toStrictEqual([
      { id: 7, kind: 'tree_oak', tileX: 70, tileY: 3 },
      { id: 9, kind: 'ore_copper', tileX: 12, tileY: 5, nodeClass: 'mixed', richness: 2, spawnSiteId: 44, activationOrdinal: 0 },
    ]);
    expect(runtime.generatedResources()).toBe(resources);
    expect(Object.isFrozen(resources)).toBe(true);
  });

  it('S3c: fails closed when the resource records do not match the published count and hash', () => {
    for (const [digest, detail] of [
      [null, 'digest missing'],
      [{ count: 3, hash: resourceDigest(RESOURCES).hash }, 'count 2, published 3'],
      [resourceDigest(RESOURCES.slice(0, 1).concat({ ...RESOURCES[1]!, richness: 3 })), 'hash'],
    ] as const) {
      const { manifest, readBlob } = island(defaultRecords, 1, digest);
      const runtime = assembleChunkLiveIslandRuntime(manifest, readBlob, registry);
      expect(runtime.complete).toBe(false);
      expect(runtime.issues).toEqual([{ kind: 'resource_digest', detail: expect.stringContaining(detail) }]);
      expect(() => runtime.generatedResources()).toThrow('chunk_resources_incomplete');
    }
    // A missing chunk loses its records: incomplete for the chunk, and no resource set either.
    const { manifest, readBlob } = island();
    const missing = assembleChunkLiveIslandRuntime(manifest, hash => hash === manifest.chunks[1]!.contentHash ? undefined : readBlob(hash), registry);
    expect(missing.issues.map(({ kind }) => kind)).toEqual(['blob_missing']);
    expect(() => missing.generatedResources()).toThrow('chunk_resources_incomplete');
  });

  it('reports a gap in a complete record stream instead of composing a wrong order', () => {
    const { manifest, readBlob } = island(cx => cx === 0 ? [obstacle(0, 'base', 0, 2, 'decoration:1')] : [obstacle(2, 'base', 1, 70, 'decoration:2')],
      1, resourceDigest([]));
    const runtime = assembleChunkLiveIslandRuntime(manifest, readBlob, registry);
    expect(runtime.complete).toBe(false);
    expect(runtime.issues).toEqual([{ kind: 'record_order', detail: 'authority.ground.obstacle' }]);
  });
});

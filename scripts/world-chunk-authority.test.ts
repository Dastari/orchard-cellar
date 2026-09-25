import { beforeAll, describe, expect, it } from 'vitest';
import { activeSurvivalLandmarks, bootstrapContentRegistry, createLiveIslandMapDocument, createMapPrefabDocument, generateSurvivalResources,
  LIVE_ISLAND_MAP_ID, serializeMapDocumentV3, SURVIVAL_WORLD_SEED, TOPSIDE_SPACE_ID, type CombatRegion,
  type ContentRegistry, type MapDocumentV3, type MapPrefabDocumentV2 } from '@orchard/sim';
import { ChunkTerrainStore } from '@orchard/engine/chunk-terrain-store';
import { authorityObstacleKey, sampleChunkCollision } from '@orchard/sim/chunk-runtime';
import type { WorldChunkAuthorityObstacle, WorldChunkAuthorityResource, WorldChunkAuthoritySuppressedObstacle } from '@orchard/sim/world-chunk';
import { captureWorldChunkSnapshot, materializeWorldChunks, verifyAuthorityParity, verifyWorldChunkParity,
  type MaterializedWorldChunks, type WorldChunkSnapshot } from './materialize-world-chunks.js';

/** An authored island exercising the authority inputs the bootstrap map leaves empty:
 * nested combat regions, a solid prefab object, a resource suppression, a moved resource and cell parts. */
describe('static island authority channels for an authored document', () => {
  const parts = [{ slot: 'water' as const, exact: { frame: 4 } }];
  const regions: readonly CombatRegion[] = [
    { id: 'arena', spaceId: TOPSIDE_SPACE_ID, minX: 300, minY: 300, maxX: 340, maxY: 340, policy: 'hostile' },
    { id: 'arena-camp', spaceId: TOPSIDE_SPACE_ID, minX: 310, minY: 310, maxX: 315, maxY: 315, policy: 'sanctuary', parentId: 'arena' },
  ];
  let registry: ContentRegistry;
  let document: MapDocumentV3;
  let snapshot: WorldChunkSnapshot;
  let published: MaterializedWorldChunks;
  let store: ChunkTerrainStore;
  let suppressedResourceId: number;
  let placed: { id: number; tileX: number; tileY: number };
  beforeAll(() => {
    registry = bootstrapContentRegistry();
    const base = createLiveIslandMapDocument({ landmarks: activeSurvivalLandmarks(registry, TOPSIDE_SPACE_ID) });
    const crate: MapPrefabDocumentV2 = { ...createMapPrefabDocument({ id: 'crate', title: 'Crate', width: 1, height: 1 }),
      pivot: { tileX: 0, tileY: 0 }, cells: [{ id: 'cell', tileX: 0, tileY: 0, elevation: 0, collisionMask: 0x0660 }] };
    const [first, second] = generateSurvivalResources(SURVIVAL_WORLD_SEED, registry);
    suppressedResourceId = first!.id;
    placed = { id: second!.id, tileX: second!.tileX + 1, tileY: second!.tileY };
    document = { ...base, cells: { ...base.cells, '400,400': { parts } }, combatRegions: regions,
      prefabs: [...base.prefabs, crate],
      objects: [...base.objects, { id: 'crate-1', prefabId: 'crate', prefabRevision: crate.revision, tileX: 402, tileY: 404, elevation: 0,
        layer: 'ground', enabled: true, quarterTurns: 0, flipX: false }],
      generatedSuppressions: [...base.generatedSuppressions, `resource-${first!.id}`],
      resourcePlacements: [{ id: String(second!.id), originTileX: second!.tileX, originTileY: second!.tileY, tileX: placed.tileX, tileY: placed.tileY }] };
    const row = { mapId: LIVE_ISLAND_MAP_ID, revision: document.revision, contentHash: 'authority-authored', documentJson: serializeMapDocumentV3(document) };
    snapshot = captureWorldChunkSnapshot(row, registry);
    published = materializeWorldChunks(snapshot, row, registry);
    store = new ChunkTerrainStore(published.manifest, snapshot.terrain.tilesets);
    for (const bytes of published.blobs) store.install(bytes);
  }, 120_000);

  it('rebuilds the server composition, suppressions, regions and resources from published chunks', () => {
    verifyWorldChunkParity(snapshot, published);
    const metadata = published.manifest.metadata['authority'] as unknown as { combatRegions: CombatRegion[]; generatedSuppressions: string[] };
    expect(metadata.combatRegions.map(({ id }) => id)).toEqual(['arena', 'arena-camp']);
    expect(metadata.generatedSuppressions).toEqual([`resource-${suppressedResourceId}`]);
    // Base decoration boxes stay in the ordered base group; the server's suppression filter removes
    // every ground one (landmarks re-author them) and keeps three of four water ones.
    const suppressed = new Set(store.records('authority.suppressedObstacleKey')
      .map(record => record.value as unknown as WorldChunkAuthoritySuppressedObstacle).map(row => `${row.medium}:${authorityObstacleKey(row)}`));
    for (const medium of ['ground', 'water'] as const) {
      const rows = store.records(`authority.${medium}.obstacle`).map(record => record.value as unknown as WorldChunkAuthorityObstacle);
      const kept = rows.filter(row => row.group === 'base' && !suppressed.has(`${medium}:${authorityObstacleKey(row)}`));
      expect(rows.filter(row => row.group === 'base').every(row => row.sourceId.startsWith('decoration:'))).toBe(true);
      expect(snapshot.authority.composed[medium].obstacles!.slice(0, kept.length).map(authorityObstacleKey)).toEqual(kept.map(authorityObstacleKey));
      expect(kept.length).toBe(medium === 'ground' ? 0 : 3);
    }
    // Authored prefab objects precede landmarks and carry the object id; 0x0660 is four sub-cells.
    const authored = store.records('authority.ground.obstacle').map(record => record.value as unknown as WorldChunkAuthorityObstacle).filter(row => row.group === 'authored');
    expect(authored.slice(0, 4).map(row => [row.sourceId, row.ordinal])).toEqual([0, 1, 2, 3].map(ordinal => ['object:crate-1', ordinal]));
    expect(authored.slice(4).every(row => row.sourceId.startsWith('landmark:'))).toBe(true);
    const resources = store.records('authority.resource').map(record => record.value as unknown as WorldChunkAuthorityResource);
    expect(resources.find(({ id }) => id === suppressedResourceId)).toMatchObject({ suppressed: true });
    expect(resources.find(({ id }) => id === placed.id)).toMatchObject({ suppressed: false, effectiveTile: { tileX: placed.tileX, tileY: placed.tileY } });
    const sample = (x: number, y: number) => sampleChunkCollision(store.chunkAt(Math.floor(x / 64), Math.floor(y / 64)), x, y).authority?.combatRegion;
    expect([sample(320, 320), sample(312, 312), sample(300, 300), sample(341, 320), sample(200, 200)]).toEqual([1, 2, 1, 0, 0]);
  }, 120_000);

  it('rejects reordered obstacles, resources and suppressions (parity is ordered, not set-based)', () => {
    const { authority } = snapshot;
    const reversed = [...authority.composed.ground.obstacles!].reverse();
    expect(() => verifyAuthorityParity(store, published.manifest, { ...authority, composed: { ...authority.composed, ground: { ...authority.composed.ground, obstacles: reversed } } }))
      .toThrow(/collision parity failed: ground/u);
    expect(() => verifyAuthorityParity(store, published.manifest, { ...authority, resources: [...authority.resources].reverse() })).toThrow(/resource parity/u);
    expect(() => verifyAuthorityParity(store, published.manifest, { ...authority, suppressedObstacleKeys: { ...authority.suppressedObstacleKeys, ground: [...authority.suppressedObstacleKeys.ground].reverse() } }))
      .toThrow(/suppression parity failed: ground/u);
  }, 120_000);

  it('preserves authored cell-part stacks through the chunk TerrainArray adapter', () => {
    expect(snapshot.terrain.cellParts?.get(400 * snapshot.terrain.width + 400)).toEqual(parts);
    // This regression follows the authored part through the actual target-chunk adapter.
    const headIndex = published.manifest.chunks.findIndex(head => head.cx === 6 && head.cy === 6);
    expect(headIndex).toBeGreaterThanOrEqual(0);
    const single = new ChunkTerrainStore(published.manifest, snapshot.terrain.tilesets);
    single.install(published.blobs[headIndex]!);
    expect(single.hasTile(400, 400)).toBe(true);
    expect(single.cellParts?.get(400 * single.width + 400)).toEqual(parts);
    expect(single.chunkAt(6, 6)?.cellParts?.[String(16 * 64 + 16)]).toEqual(parts);
  });
});

import { expect, it } from 'vitest';
import { activeSurvivalLandmarks, bootstrapContentRegistry, collisionTileIsBlocked, createLiveIslandMapDocument, createMapPrefabDocument,
  generateSurvivalResources, LIVE_ISLAND_MAP_ID, serializeMapDocumentV3, SURVIVAL_WORLD_SEED, TILE_SIZE_FIXED, TOPSIDE_SPACE_ID,
  type CombatRegion, type MapDocumentV3, type MapPrefabDocumentV2 } from '@orchard/sim';
import { WORLD_CHUNK_SIZE } from '@orchard/sim/world-chunk';
import { describeChunkCollisionParity } from './chunk-collision-parity.js';

/** The authored document of world-chunk-runtime-assembler-authored.test.ts: nested combat regions,
 * a solid prefab object, a suppressed and a moved generated resource, an orphan placement, cell parts. */
function authoredFixture() {
  const registry = bootstrapContentRegistry();
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
  return { registry,
    row: { mapId: LIVE_ISLAND_MAP_ID, revision: document.revision, contentHash: 'collision-authored', documentJson: serializeMapDocumentV3(document) } };
}

describeChunkCollisionParity('authored document', authoredFixture, context => {
  it('exercises authored inputs, so the generic comparisons above are not vacuous', () => {
    const { server, serverGround, registry, live } = context();
    // Compared with the client's manifest copies in 'carries the manifest combat regions ...'.
    expect(server.combatRegions.map(({ id }) => id)).toEqual(['arena', 'arena-camp']);
    const suppressed = generateSurvivalResources(SURVIVAL_WORLD_SEED, registry)[0]!.id;
    expect(server.generatedSuppressions.has(`resource-${suppressed}`)).toBe(true);
    expect(live.rows.resources.some(({ id }) => id === BigInt(suppressed))).toBe(true);
    // The authored crate is solid on the server; the tiling parity proves the client agrees.
    const centre = { x: 402 * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2, y: 404 * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2 };
    const crate = serverGround.obstacles!.some(box => box.left <= centre.x && box.right >= centre.x && box.top <= centre.y && box.bottom >= centre.y);
    expect(crate || collisionTileIsBlocked(serverGround, 402, 404)).toBe(true);
  }, 120_000);
});

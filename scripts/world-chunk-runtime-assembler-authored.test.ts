import { expect, it } from 'vitest';
import { activeSurvivalLandmarks, bootstrapContentRegistry, createLiveIslandMapDocument, createMapPrefabDocument, generateSurvivalResources,
  LIVE_ISLAND_MAP_ID, mapStreetlampPlans, serializeMapDocumentV3, SURVIVAL_WORLD_SEED, TOPSIDE_SPACE_ID,
  type CombatRegion, type MapDocumentV3, type MapPrefabDocumentV2 } from '@orchard/sim';
import { WORLD_CHUNK_SIZE } from '@orchard/sim/world-chunk';
import { compareLiveIslandRuntime, documentStaticView } from '../packages/world/src/content/chunk-authority-runtime.js';
import { describeChunkRuntimeParity } from './world-chunk-runtime-parity.js';

/** The authored-document fixture of world-chunk-authority.test.ts: nested combat regions, a solid
 * prefab object, a suppressed and a moved generated resource, an orphan placement and cell parts. */
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
    row: { mapId: LIVE_ISLAND_MAP_ID, revision: document.revision, contentHash: 'runtime-authored', documentJson: serializeMapDocumentV3(document) } };
}

describeChunkRuntimeParity('authored document', authoredFixture, context => {
  it('carries the authored inputs through the assembled runtime', () => {
    const { runtime, server, live, registry } = context();
    const suppressedResourceId = generateSurvivalResources(SURVIVAL_WORLD_SEED, registry)[0]!.id;
    expect(runtime.staticView.combatRegions.map(({ id }) => id)).toEqual(['arena', 'arena-camp']);
    expect([[320, 320], [312.5, 312.5], [341, 320]].map(([tileX, tileY]) => runtime.combatPolicy.regionAt({ spaceId: TOPSIDE_SPACE_ID, tileX: tileX!, tileY: tileY! })?.id))
      .toEqual(['arena', 'arena-camp', undefined]);
    expect(runtime.generatedSuppressions.has(`resource-${suppressedResourceId}`)).toBe(true);
    // The runtime-suppressed generated resource is among the live rows and is filtered out of collision.
    expect(live.rows.resources.some(({ id }) => id === BigInt(suppressedResourceId))).toBe(true);
    expect(runtime.staticView.objects.map(({ id }) => id)).toContain('crate-1');
    expect(runtime.staticView.prefabs.map(({ id }) => id)).toContain('crate');
    expect(runtime.staticView.resourcePlacements.map(({ id }) => id)).toContain('999999999999');
    expect(runtime.ground.obstacles!.slice(0, 4)).toEqual(server.runtime.ground.obstacles!.slice(0, 4));
    // Static document consumers see identical inputs through either view.
    const compiled = documentStaticView(server.runtime.document);
    expect(mapStreetlampPlans(runtime.staticView as unknown as MapDocumentV3)).toEqual(mapStreetlampPlans(compiled as unknown as MapDocumentV3));
    expect(compareLiveIslandRuntime(runtime, { ...server.runtime, staticView: compiled } as never).equal).toBe(true);
  }, 120_000);
});

import { expect, it } from 'vitest';
import {HEARTH_RESOURCE_SITES,TILE_SIZE_FIXED,bootstrapContentRegistry,collisionMapForCompiledMapDocument,
  compileMapDocument,createLiveIslandMapDocument,hearthResourceInstallationGeometry,hearthResourceInstallationRoutes,
  initialHearthResourceState,runtimeResourceObstacle,terrainDocumentForMapV3} from '@orchard/sim';
import {composeHearthArchipelago} from './hearth-archipelago-authoring.js';
const document = composeHearthArchipelago(createLiveIslandMapDocument()).document;
const compiled = compileMapDocument(terrainDocumentForMapV3(document));
const base = collisionMapForCompiledMapDocument(compiled);
const ids = HEARTH_RESOURCE_SITES.map(site => site.id);
const registry = bootstrapContentRegistry();
it('adds all six exact bases together while retaining connected harvest and retreat stances', () => {
  const result = hearthResourceInstallationGeometry(base, ids);
  expect(result).not.toBeNull();
  expect(result!.obstacles?.slice(-6)).toEqual(HEARTH_RESOURCE_SITES.map((site) => runtimeResourceObstacle(
    registry, { kind: site.kind, definitionId: site.definitionId }, site.tileX, site.tileY,
  )));
  expect(base.obstacles).not.toBe(result!.obstacles);
});
it('rejects a foreign overlapping base, wrong plane, blocked approach, duplicate or unknown identity', () => {
  const site = HEARTH_RESOURCE_SITES[0]!;
  const obstacle = runtimeResourceObstacle(
    registry, { kind: site.kind, definitionId: site.definitionId }, site.tileX, site.tileY,
  )!;
  expect(hearthResourceInstallationGeometry({ ...base, obstacles: [obstacle] }, ids)).toBeNull();
  const elevations = new Int16Array(base.elevations!); elevations[site.tileY * base.width + site.tileX] = 2;
  expect(hearthResourceInstallationGeometry({ ...base, elevations }, ids)).toBeNull();
  const blocked = [...base.blocked]; blocked[(site.tileY - 1) * base.width + site.tileX] = true;
  expect(hearthResourceInstallationGeometry({ ...base, blocked }, ids)).toBeNull();
  const fence = { left: (site.tileX + 1) * TILE_SIZE_FIXED, right: (site.tileX + 1) * TILE_SIZE_FIXED + 1,
    top: (site.tileY - 1) * TILE_SIZE_FIXED, bottom: (site.tileY + 2) * TILE_SIZE_FIXED };
  expect(hearthResourceInstallationGeometry({ ...base, obstacles: [fence] }, ids)).toBeNull();
  expect(hearthResourceInstallationGeometry(base, [site.id, site.id])).toBeNull();
  expect(hearthResourceInstallationGeometry(base, [1n])).toBeNull();
});
it('uses explicit authored richness without random generator defaults', () => {
  for (const site of HEARTH_RESOURCE_SITES) {
    expect(initialHearthResourceState(site.id)).toMatchObject({ spawnSiteId: site.id, activationOrdinal: 1,
      definitionId: site.definitionId, depleted: false, health: site.health,
      richness: site.richness, miningClass: site.nodeClass, miningClaimUntilTick: 0n });
  }
  expect(initialHearthResourceState(1n)).toBeNull();
});

it('proves ferry access on the combined map and rejects a locally clear but enclosed node', () => {
  const start = { x: 652.5 * TILE_SIZE_FIXED, y: 211.5 * TILE_SIZE_FIXED };
  const combined = hearthResourceInstallationGeometry(base, ids)!;
  const authority = { spaceId: 0, regions: document.combatRegions ?? [] };
  expect(hearthResourceInstallationRoutes(combined, ids, start, authority)).toBe(true);
  const hostile = authority.regions.find(region => region.policy === 'hostile')!;
  const renamedAndRepositioned = authority.regions.map(region => region.id === hostile.id
    ? { ...region, id: 'renamed-resource-route', minX: region.minX - 1, minY: region.minY - 1,
      maxX: region.maxX + 1, maxY: region.maxY + 1 }
    : region.parentId === hostile.id ? { ...region, parentId: 'renamed-resource-route' } : region);
  expect(hearthResourceInstallationRoutes(combined, ids, start, {
    spaceId: 0, regions: renamedAndRepositioned,
  })).toBe(true);
  expect(hearthResourceInstallationRoutes(combined, ids, start, {
    spaceId: 0, regions: [...renamedAndRepositioned, {
      ...renamedAndRepositioned.find(region => region.policy === 'hostile')!, id: 'ambiguous-resource-route',
    }],
  })).toBe(false);
  const site = HEARTH_RESOURCE_SITES[0]!, blocked = [...base.blocked];
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
    if (Math.abs(dx) === 3 || Math.abs(dy) === 3) blocked[(site.tileY + dy) * base.width + site.tileX + dx] = true;
  }
  const enclosed = hearthResourceInstallationGeometry({ ...base, blocked }, [site.id]);
  expect(enclosed).not.toBeNull();
  expect(hearthResourceInstallationRoutes(enclosed!, [site.id], start, authority)).toBe(false);
}, 30_000);

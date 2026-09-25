import { expect, it } from 'vitest';
import { HEARTH_RESOURCE_SITES, HEARTH_COMBAT_REGIONS, CombatRegionPolicy, TILE_SIZE_FIXED,
  bootstrapContentRegistry, type CollisionMap } from '@orchard/sim';
import { createClientCollisionMap } from '@orchard/engine/collision';
import type { TerrainArray } from '@orchard/engine/terrain';
import { hearthResourceTargetAllowed } from './hearth-resource-targeting.js';
const policy = new CombatRegionPolicy(HEARTH_COMBAT_REGIONS);
const registry = bootstrapContentRegistry();
function fixture(index = 0) {
  const site = HEARTH_RESOURCE_SITES[index]!;
  const resource = { ...site, spawnSiteId: BigInt(site.id), spaceId: 0, growthStage: 3, depleted: false,
    chunkX: Math.floor(site.tileX / 16), chunkY: Math.floor(site.tileY / 16) };
  const size = 832 * 832;
  const terrain: TerrainArray = { spaceId: 30000, seed: 1, version: 1, width: 832, height: 832,
    blocked: new Uint8Array(size), elevations: new Int16Array(size).fill(site.elevation), biomes: new Uint8Array(size),
    horseJumpableTerrain: new Uint8Array(size), dirtCliffRoles: new Uint8Array(size), dirtTerraces: new Uint8Array(size) };
  const collision = createClientCollisionMap(terrain, [resource], [], 'ground', [], new Set(), undefined, registry,
    { width: 832, height: 832, blocked: terrain.blocked, elevations: terrain.elevations });
  const player = { x: (site.tileX + .5) * TILE_SIZE_FIXED, y: (site.tileY + 2) * TILE_SIZE_FIXED };
  return { resource, player, collision, terrain,
    check: (map: CollisionMap = collision, row = resource, permissions: readonly string[] = [site.kind]) =>
      hearthResourceTargetAllowed(row, player, 0, map, collision.resourceObstacles, permissions, policy, true, registry) };
}
it('uses actual engine obstacle provenance to target all six nodes through their own body', () => {
  for (let index = 0; index < HEARTH_RESOURCE_SITES.length; index++) {
    const f = fixture(index);
    expect(f.collision.obstacles).toContain(f.collision.resourceObstacles.get(f.resource.id));
    expect(f.check()).toBe(true);
    expect(f.check(f.collision, { ...f.resource, depleted: true })).toBe(false);
  }
});
it('retains a separate obstacle with identical bounds and rejects wrong planes', () => {
  const f = fixture();
  const own = f.collision.resourceObstacles.get(f.resource.id)!;
  expect(f.check({ ...f.collision, obstacles: [...f.collision.obstacles!, { ...own }] })).toBe(false);
  const raised = fixture(4);
  raised.terrain.elevations[Math.floor(raised.player.y / TILE_SIZE_FIXED) * 832 + raised.resource.tileX] = 0;
  expect(raised.check()).toBe(false);
});
it('rejects missing collision provenance, mismatched identities, wrong tools and young ashwood', () => {
  const f = fixture();
  expect(hearthResourceTargetAllowed(f.resource, f.player, 0, f.collision, new Map(), [f.resource.kind], policy, true, registry)).toBe(false);
  expect(f.check({ ...f.collision, obstacles: [] })).toBe(false);
  expect(f.check(f.collision, { ...f.resource, spawnSiteId: 0n })).toBe(false);
  expect(f.check(f.collision, f.resource, [])).toBe(false);
  const tree = fixture(2); expect(tree.check(tree.collision, { ...tree.resource, growthStage: 2 })).toBe(false);
});

it('stops targeting immediately when the public expedition policy is absent', () => {
  const f = fixture();
  expect(hearthResourceTargetAllowed(f.resource, f.player, 0, f.collision,
    f.collision.resourceObstacles, [f.resource.kind], new CombatRegionPolicy([]), true, registry)).toBe(false);
});

it('hides invalid-content Hearth targets without disabling legacy resource targeting', () => {
  const f = fixture();
  const check = (row: Parameters<typeof hearthResourceTargetAllowed>[0] = f.resource) => hearthResourceTargetAllowed(row, f.player, 0, f.collision,
    f.collision.resourceObstacles, [f.resource.kind], policy, false, registry);
  expect(check()).toBe(false);
  expect(check({ ...f.resource, id: 1n, kind: 'tree_oak', definitionId: '' })).toBe(true);
});

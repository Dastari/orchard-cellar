import { describe, expect, it } from 'vitest';
import { SURVIVAL_BIOMES, SURVIVAL_WORLD_SEED, TOPSIDE_SPACE_ID, projectileTraversalCollision, type CollisionMap } from '@orchard/sim';
import { createClientCollisionMap } from '@orchard/engine/collision';
import { createLightOcclusionMap, type LightTrunkOccluder } from '@orchard/engine/light-occlusion';
import type { TerrainArray } from '@orchard/engine/terrain';
import type { LoadedAsset } from '@orchard/ui';
import { WorldStaticProjectionCache } from './world-static-projection.js';

function terrain(): TerrainArray {
  return {
    spaceId: 42, seed: SURVIVAL_WORLD_SEED, version: 1, width: 3, height: 3,
    projectionStyle: 'interior', baseDatum: 0,
    biomes: new Uint8Array(9).fill(SURVIVAL_BIOMES.indexOf('plains')),
    blocked: [true, false, false, false, false, false, false, false, false],
    horseJumpableTerrain: Array<boolean>(9).fill(false), elevations: new Int16Array(9),
    dirtCliffRoles: new Uint8Array(9), dirtTerraces: new Uint8Array(9),
  };
}

describe('instance-owned static world projection', () => {
  it('Basic omits light preparation and releases it without rebuilding shared collision', () => {
    const source = terrain();
    const cache = new WorldStaticProjectionCache();
    const basic = cache.prepare(source, '1', undefined, undefined, false);
    expect(basic.light).toBeUndefined();
    const dynamic = cache.prepare(source, '1');
    expect(dynamic.light).toBeDefined();
    expect(dynamic.ground).toBe(basic.ground);
    expect(dynamic.water).toBe(basic.water);
    cache.releaseLighting();
    const restored = cache.prepare(source, '1', undefined, undefined, false);
    expect(restored.light).toBeUndefined();
    expect(restored.ground).toBe(basic.ground);
    expect(restored.water).toBe(basic.water);
  });

  it('matches uncached collision and lighting while rebuilding live resources, custody and sorted trunks', () => {
    const source = terrain();
    const cache = new WorldStaticProjectionCache();
    const prepared = cache.prepare(source, 'head1');
    const resource = { id: 1n, kind: 'tree_oak', tileX: 1, tileY: 1, depleted: false };
    const chest = { tileX: 2, tileY: 1, carriedBy: undefined as unknown };
    const first = createClientCollisionMap(source, [resource], [chest], 'ground', [], new Set(), undefined, undefined, prepared.ground);
    expect(first).toEqual(createClientCollisionMap(source, [resource], [chest]));
    const next = createClientCollisionMap(source, [{ ...resource, depleted: true }], [{ ...chest, carriedBy: 'owner' }], 'ground', [], new Set(), undefined, undefined, prepared.ground);
    expect(next.obstacles).toEqual([]);
    expect(next.obstacles).not.toBe(first.obstacles);
    expect(next.blocked).toBe(first.blocked);
    const trunk = (footY: number): LightTrunkOccluder => ({ obstacle: { left: 1, top: 1, right: 2, bottom: 2 }, receiver: null, footY });
    const liveTrunks = [trunk(9), trunk(2)];
    const light = createLightOcclusionMap(source, [], [], liveTrunks, undefined, prepared.light);
    expect(light).toEqual(createLightOcclusionMap(source, [], [], liveTrunks));
    expect(light.trunkOccluders.map(row => row.footY)).toEqual([2, 9]);
    expect(createLightOcclusionMap(source, [], [], [], undefined, prepared.light).trunkOccluders).toEqual([]);
    expect(cache.prepare(source, 'head1')).toBe(prepared);
  });

  it('invalidates for explicit revisions, terrain replacement and asset replacement', () => {
    const cache = new WorldStaticProjectionCache();
    const source = terrain();
    const original = cache.prepare(source, 'head1');
    (source.blocked as boolean[])[1] = true;
    const revised = cache.prepare(source, 'head2');
    expect(revised).not.toBe(original);
    expect(revised.light!.hardBlocked[1]).toBe(1);
    const replaced = cache.prepare({ ...source, blocked: Array<boolean>(9).fill(false) }, 'head2');
    expect(replaced).not.toBe(revised);
    expect(replaced.light!.hardBlocked[1]).toBe(0);
    const asset = {} as LoadedAsset;
    const withAsset = cache.prepare(source, 'head2', undefined, asset);
    expect(cache.prepare(source, 'head2', undefined, asset)).toBe(withAsset);
    expect(cache.prepare(source, 'head2', undefined, {} as LoadedAsset)).not.toBe(withAsset);
  });

  it('distinguishes generated docks, no authored docks, and changed dock coordinates', () => {
    const source = { ...terrain(), spaceId: TOPSIDE_SPACE_ID, terrainPlaneBlocked: new Uint8Array(9) };
    const cache = new WorldStaticProjectionCache();
    const generated = cache.prepare(source, 'head1');
    const empty = cache.prepare(source, 'head1', []);
    expect(empty).not.toBe(generated);
    const dock = cache.prepare(source, 'head1', [{ tileX: 0, tileY: 0 }]);
    expect(dock.ground.blocked[0]).toBe(false);
    expect(empty.ground.blocked[0]).toBe(true);
    expect(cache.prepare(source, 'head1', [{ tileX: 0, tileY: 0 }])).toBe(dock);
    const moved = cache.prepare(source, 'head1', [{ tileX: 1, tileY: 0 }]);
    expect(moved.ground.blocked[0]).toBe(true);
  });

  it('reuses only projectile terrain bits and preserves every fresh live map field', () => {
    const cache = new WorldStaticProjectionCache();
    const ground: CollisionMap = { width: 2, height: 1, blocked: [true, false], obstacles: [] };
    const water: CollisionMap = { width: 2, height: 1, blocked: [false, true] };
    const first = cache.projectile(ground, water);
    expect(first).toEqual(projectileTraversalCollision(ground, water));
    const live = { ...ground, obstacles: [{ left: 1, top: 2, right: 3, bottom: 4 }], elevations: new Int16Array([1, 2]) };
    const next = cache.projectile(live, water);
    expect(next.blocked).toBe(first.blocked);
    expect(next.obstacles).toBe(live.obstacles);
    expect(next.elevations).toBe(live.elevations);
    const changed = cache.projectile(live, { ...water, blocked: [true, true] });
    expect(changed.blocked).toEqual([true, false]);
    expect(changed.blocked).not.toBe(first.blocked);
    expect(() => cache.projectile(live, { ...water, width: 3 })).toThrow('collision_map_size_mismatch');
  });

  it('does not share caches between game instances or silently cache generic editor calls', () => {
    const source = terrain();
    expect(new WorldStaticProjectionCache().prepare(source, '1')).not.toBe(new WorldStaticProjectionCache().prepare(source, '1'));
    const before = createLightOcclusionMap(source);
    (source.blocked as boolean[])[1] = true;
    expect(createLightOcclusionMap(source).hardBlocked[1]).toBe(1);
    expect(before.hardBlocked[1]).toBe(0);
  });
});

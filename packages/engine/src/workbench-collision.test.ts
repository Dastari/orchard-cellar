import { expect, it } from 'vitest';
import { bootstrapContentRegistry, TILE_SIZE_FIXED } from '@orchard/sim';
import { createClientCollisionMap } from './collision.js';
import type { TerrainArray } from './terrain.js';

it('blocks both workbench tiles and removes both obstacles while carried', () => {
  const terrain: TerrainArray = { spaceId: 10, seed: 1, version: 1, width: 20, height: 20,
    blocked: new Uint8Array(400), horseJumpableTerrain: new Uint8Array(400),
    biomes: new Uint8Array(400).fill(1), elevations: new Int16Array(400),
    dirtCliffRoles: new Uint8Array(400), dirtTerraces: new Uint8Array(400) };
  const prepared = { width: 20, height: 20, blocked: terrain.blocked };
  const bench = { kind: 'workbench', tileX: 10, tileY: 10, open: false };
  const collision = createClientCollisionMap(terrain, [], [], 'ground', [bench], new Set(), undefined, bootstrapContentRegistry(), prepared);
  expect(collision.obstacles).toEqual([10, 11].map(x => ({ left: x * TILE_SIZE_FIXED,
    top: 10 * TILE_SIZE_FIXED, right: (x + 1) * TILE_SIZE_FIXED - 1, bottom: 11 * TILE_SIZE_FIXED - 1 })));
  expect(createClientCollisionMap(terrain, [], [], 'ground', [{ ...bench, carriedBy: 'player' }],
    new Set(), undefined, bootstrapContentRegistry(), prepared).obstacles).toEqual([]);
});

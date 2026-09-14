import { describe, expect, it } from 'vitest';
import { SURVIVAL_CHUNK_TILES, TILE_SIZE_FIXED, type CollisionMap } from '@orchard/sim';
import {
  TICK_COLLISION_SCOPE_RADIUS_CHUNKS,
  collisionWithinChunkScope,
  tickCollisionChunkScope,
} from './tick-collision-scope.js';

describe('scheduled collision spatial scope', () => {
  it('covers the wildlife radius plus a one-chunk collision margin', () => {
    const scope = tickCollisionChunkScope([{ chunkX: 10, chunkY: 20 }], []);
    const diameter = TICK_COLLISION_SCOPE_RADIUS_CHUNKS * 2 + 1;
    expect(scope.size).toBe(diameter * diameter);
    expect(scope.has('6:16')).toBe(true);
    expect(scope.has('14:24')).toBe(true);
    expect(scope.has('5:20')).toBe(false);
  });

  it('unions projectile sweep neighbours without duplicate chunk probes', () => {
    const scope = tickCollisionChunkScope(
      [{ chunkX: 0, chunkY: 0 }],
      [{ chunkX: 20, chunkY: 30 }, { chunkX: 20, chunkY: 30 }],
    );
    expect(scope.has('19:29')).toBe(true);
    expect(scope.has('21:31')).toBe(true);
    expect(scope.size).toBe(81 + 9);
  });

  it('preserves signed chunk coordinates around players and projectiles', () => {
    const scope = tickCollisionChunkScope(
      [{ chunkX: -2, chunkY: -3 }],
      [{ chunkX: -20, chunkY: 4 }],
    );
    expect(scope.has('-6:-7')).toBe(true);
    expect(scope.has('2:1')).toBe(true);
    expect(scope.has('-21:3')).toBe(true);
    expect(scope.has('-19:5')).toBe(true);
  });

  it('retains obstacles crossing any selected chunk while sharing terrain arrays', () => {
    const chunkSize = SURVIVAL_CHUNK_TILES * TILE_SIZE_FIXED;
    const collision: CollisionMap = {
      width: 32,
      height: 32,
      blocked: Array<boolean>(32 * 32).fill(false),
      obstacles: [
        { left: 0, top: 0, right: 10, bottom: 10 },
        { left: chunkSize - 2, top: 0, right: chunkSize + 2, bottom: 10 },
        { left: chunkSize * 3, top: 0, right: chunkSize * 3 + 10, bottom: 10 },
      ],
    };
    const scoped = collisionWithinChunkScope(collision, new Set(['1:0']));
    expect(scoped.blocked).toBe(collision.blocked);
    expect(scoped.obstacles).toEqual([collision.obstacles![1]]);
  });

  it('retains an obstacle crossing a negative chunk edge', () => {
    const chunkSize = SURVIVAL_CHUNK_TILES * TILE_SIZE_FIXED;
    const crossing = {
      left: -chunkSize - 2,
      top: -10,
      right: -chunkSize + 2,
      bottom: 10,
    };
    const collision: CollisionMap = {
      width: 1,
      height: 1,
      blocked: [false],
      obstacles: [crossing],
    };
    expect(collisionWithinChunkScope(collision, new Set(['-1:0'])).obstacles).toEqual([crossing]);
    expect(collisionWithinChunkScope(collision, new Set(['-2:-1'])).obstacles).toEqual([crossing]);
  });
});

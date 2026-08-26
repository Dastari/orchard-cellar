import { describe, expect, it } from 'vitest';
import { TILE_SIZE_FIXED, type CollisionMap } from './state.js';
import { playerHitboxBounds } from './movement.js';
import {
  facedTileTarget,
  tileTargetAtFixedPoint,
  tileTargetInReach,
  tileTargetIsBlocked,
} from './tile-targeting.js';

describe('shared tile targeting', () => {
  const playerX = 10 * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
  const playerY = 10 * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;

  it('retains adjacent facing targets and accepts mouse targets up to three tiles away', () => {
    expect(facedTileTarget(playerX, playerY, 'upLeft')).toEqual({ tileX: 9, tileY: 9 });
    expect(tileTargetInReach(playerX, playerY, { tileX: 13, tileY: 10 })).toBe(true);
    expect(tileTargetInReach(playerX, playerY, { tileX: 13, tileY: 11 })).toBe(false);
    expect(tileTargetAtFixedPoint(playerX, playerY, 13 * TILE_SIZE_FIXED, 10 * TILE_SIZE_FIXED, 192))
      .toEqual({ tileX: 13, tileY: 10 });
    expect(tileTargetAtFixedPoint(playerX, playerY, 14 * TILE_SIZE_FIXED, 10 * TILE_SIZE_FIXED, 192)).toBeNull();
  });

  it('rejects terrain cells and any movement obstacle overlapping the tile', () => {
    const map: CollisionMap = {
      width: 20,
      height: 20,
      blocked: Array.from({ length: 400 }, (_, index) => index === 10 * 20 + 11),
      obstacles: [{
        left: 12 * TILE_SIZE_FIXED + 4,
        top: 10 * TILE_SIZE_FIXED + 4,
        right: 12 * TILE_SIZE_FIXED + 8,
        bottom: 10 * TILE_SIZE_FIXED + 8,
      }],
    };
    expect(tileTargetIsBlocked(map, { tileX: 10, tileY: 10 })).toBe(false);
    expect(tileTargetIsBlocked(map, { tileX: 11, tileY: 10 })).toBe(true);
    expect(tileTargetIsBlocked(map, { tileX: 12, tileY: 10 })).toBe(true);
    expect(tileTargetIsBlocked(map, { tileX: -1, tileY: 10 })).toBe(true);
    expect(tileTargetIsBlocked(
      map,
      { tileX: 10, tileY: 10 },
      [playerHitboxBounds({ x: playerX, y: playerY })],
    )).toBe(true);
  });
});

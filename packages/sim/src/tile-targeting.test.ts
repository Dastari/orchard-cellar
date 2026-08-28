import { describe, expect, it } from 'vitest';
import { TILE_SIZE_FIXED, type CollisionMap } from './state.js';
import { playerHitboxBounds } from './movement.js';
import {
  AXE_SWING_REACH_TILES,
  FORWARD_SWING_OFFSET_TILES,
  facedTileTarget,
  forwardSwingTargetInReach,
  isForwardSwingToolKind,
  resourceToolForwardOffsetFixed,
  resourceToolReachFixed,
  tileTargetAtFixedPoint,
  tileTargetInReach,
  nearestTileTarget,
  tileTargetIsBlocked,
} from './tile-targeting.js';

describe('shared tile targeting', () => {
  const playerX = 10 * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
  const playerY = 10 * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;

  it('uses a smaller forward-offset area for contact tools', () => {
    expect(AXE_SWING_REACH_TILES).toBe(1);
    expect(FORWARD_SWING_OFFSET_TILES).toBe(1);
    expect(resourceToolReachFixed('axe')).toBe(TILE_SIZE_FIXED);
    expect(resourceToolReachFixed('pickaxe')).toBe(TILE_SIZE_FIXED);
    expect(resourceToolForwardOffsetFixed('axe')).toBe(TILE_SIZE_FIXED);
    expect(resourceToolForwardOffsetFixed('pickaxe')).toBe(TILE_SIZE_FIXED);
    expect(resourceToolForwardOffsetFixed('hoe')).toBe(0);
    expect(isForwardSwingToolKind('sword')).toBe(true);
    expect(isForwardSwingToolKind('watering_can')).toBe(false);
  });

  it('keeps sword contact inside the forward attack area', () => {
    expect(forwardSwingTargetInReach(
      playerX, playerY, 'right', playerX + TILE_SIZE_FIXED, playerY, 'sword',
    )).toBe(true);
    expect(forwardSwingTargetInReach(
      playerX, playerY, 'right', playerX - 1, playerY, 'sword',
    )).toBe(false);
    expect(forwardSwingTargetInReach(
      playerX, playerY, 'right', playerX + 2 * TILE_SIZE_FIXED + 1, playerY, 'sword',
    )).toBe(false);
  });

  it('selects the nearest tile interaction inside a radial reach without requiring facing', () => {
    const playerX = 10 * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
    const playerY = 10 * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
    const farther = { id: 2n, tileX: 12, tileY: 10 };
    const nearer = { id: 3n, tileX: 10, tileY: 9 };
    const outOfRange = { id: 1n, tileX: 14, tileY: 10 };
    expect(nearestTileTarget(playerX, playerY, [farther, outOfRange, nearer], 2 * TILE_SIZE_FIXED)).toBe(nearer);
  });

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

  it('rejects blockers owned by a space-fixed terrain plane', () => {
    const terrainPlaneBlocked = new Uint8Array(4);
    terrainPlaneBlocked[1] = 1;
    const map: CollisionMap = {
      width: 2,
      height: 2,
      blocked: [false, false, false, false],
      fixedTerrainPlane: 0,
      terrainPlaneBlocked,
    };
    expect(tileTargetIsBlocked(map, { tileX: 0, tileY: 0 })).toBe(false);
    expect(tileTargetIsBlocked(map, { tileX: 1, tileY: 0 })).toBe(true);
  });
});

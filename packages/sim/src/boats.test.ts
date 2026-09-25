import { describe, expect, it } from 'vitest';
import { BOAT_MAX_HEALTH, boatFacingForDirection, boatProjectileBounds, findBoatDismountPosition, projectileTraversalCollision } from './boats.js';
import { TILE_SIZE_FIXED, type CollisionMap } from './state.js';
import { cellFlags } from './cell-flags.js';

describe('boats', () => {
  it('preserves eight-way steering for directional boat presentation', () => {
    expect(boatFacingForDirection('upLeft')).toBe('upLeft');
    expect(boatFacingForDirection('downRight')).toBe('downRight');
    expect(boatFacingForDirection('left')).toBe('left');
  });

  it('lets arrows cross land or water but not terrain blocked to both', () => {
    const ground: CollisionMap = { width: 3, height: 1, blocked: cellFlags([false, true, true]) };
    const water: CollisionMap = { width: 3, height: 1, blocked: cellFlags([true, false, true]) };
    expect(projectileTraversalCollision(ground, water).blocked).toEqual(cellFlags([false, false, true]));
  });

  it('uses a long hull hitbox matching its cardinal orientation', () => {
    const horizontal = boatProjectileBounds({ x: 0, y: 0, facing: 'right' });
    const vertical = boatProjectileBounds({ x: 0, y: 0, facing: 'up' });
    const diagonal = boatProjectileBounds({ x: 0, y: 0, facing: 'upRight' });
    expect(horizontal.right - horizontal.left).toBeGreaterThan(horizontal.bottom - horizontal.top);
    expect(vertical.bottom - vertical.top).toBeGreaterThan(vertical.right - vertical.left);
    expect(diagonal).toEqual(horizontal);
    expect(BOAT_MAX_HEALTH).toBe(3);
  });

  it('only offers collision-free ground as a dismount location', () => {
    const ground: CollisionMap = {
      width: 7,
      height: 7,
      blocked: cellFlags(Array.from({ length: 49 }, (_, index) => ![2 * 7 + 5, 3 * 7 + 5].includes(index))),
    };
    expect(findBoatDismountPosition(
      { x: 3 * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2, y: 3 * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2 },
      'right',
      ground,
    )).toEqual({ x: 5 * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2, y: 3 * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2 });
  });
});

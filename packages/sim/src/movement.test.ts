import { describe, expect, it } from 'vitest';
import { FIXED_UNITS_PER_PIXEL, TILE_SIZE_FIXED } from './state.js';
import { movePlayer, movePlayerAtSpeed, playerHitboxBounds, positionCollides } from './movement.js';

describe('player movement collision', () => {
  const open = { width: 4, height: 4, blocked: Array<boolean>(16).fill(false) };

  it('uses a compact foot box that can pass visually behind canopies', () => {
    const position = { x: TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2, y: TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2 };
    expect(playerHitboxBounds(position)).toEqual({
      left: position.x - 4 * FIXED_UNITS_PER_PIXEL,
      right: position.x + 4 * FIXED_UNITS_PER_PIXEL - 1,
      top: position.y - 12 * FIXED_UNITS_PER_PIXEL,
      bottom: position.y - 6 * FIXED_UNITS_PER_PIXEL - 1,
    });
    expect(positionCollides(position, open)).toBe(false);
  });

  it('slides one axis when diagonal travel meets a blocked base tile', () => {
    const blocked = [...open.blocked];
    blocked[2 * open.width + 2] = true;
    const start = {
      position: { x: 2 * TILE_SIZE_FIXED - 5 * FIXED_UNITS_PER_PIXEL, y: 2 * TILE_SIZE_FIXED - 4 * FIXED_UNITS_PER_PIXEL },
      facing: 'down' as const,
      moving: false,
      location: 'estate' as const,
    };
    const moved = movePlayer(start, 'downRight', { ...open, blocked });
    expect(moved.moving).toBe(true);
    expect(moved.position).not.toEqual(start.position);
    expect(positionCollides(moved.position, { ...open, blocked })).toBe(false);
  });

  it('collides with a sub-tile trunk but can pass beside it', () => {
    const obstacle = {
      left: 2 * TILE_SIZE_FIXED + 4 * FIXED_UNITS_PER_PIXEL,
      right: 2 * TILE_SIZE_FIXED + 12 * FIXED_UNITS_PER_PIXEL - 1,
      top: 3 * TILE_SIZE_FIXED - 10 * FIXED_UNITS_PER_PIXEL,
      bottom: 3 * TILE_SIZE_FIXED - 4 * FIXED_UNITS_PER_PIXEL - 1,
    };
    expect(positionCollides({ x: 2 * TILE_SIZE_FIXED + 8 * FIXED_UNITS_PER_PIXEL, y: 3 * TILE_SIZE_FIXED }, {
      ...open,
      obstacles: [obstacle],
    })).toBe(true);
    expect(positionCollides({ x: 2 * TILE_SIZE_FIXED - FIXED_UNITS_PER_PIXEL, y: 3 * TILE_SIZE_FIXED }, {
      ...open,
      obstacles: [obstacle],
    })).toBe(false);
  });

  it('applies mounted speed as repeated collision-safe steps', () => {
    const start = {
      position: { x: 2 * TILE_SIZE_FIXED, y: 2 * TILE_SIZE_FIXED },
      facing: 'down' as const,
      moving: false,
      location: 'estate' as const,
    };
    const walking = movePlayer(start, 'right', open);
    const riding = movePlayerAtSpeed(start, 'right', open, 2);
    expect(riding.position.x - start.position.x).toBe(2 * (walking.position.x - start.position.x));
  });
});

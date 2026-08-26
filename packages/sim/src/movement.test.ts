import { describe, expect, it } from 'vitest';
import { FIXED_UNITS_PER_PIXEL, TILE_SIZE_FIXED, type PlayerState } from './state.js';
import {
  movePlayer,
  movePlayerAtSpeed,
  movePlayerAtSpeedPermille,
  movementPositionAllowed,
  PLAYER_HITBOX_FOOT_OFFSET,
  playerHitboxBounds,
  playerInteractionOrigin,
  positionCollides,
  terrainPlaneAtPosition,
} from './movement.js';

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
    expect(playerInteractionOrigin(position)).toEqual({
      x: position.x,
      y: position.y - 9 * FIXED_UNITS_PER_PIXEL,
    });
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

  it('applies the baseline sprint as exactly 125% cardinal speed', () => {
    const start = {
      position: { x: 2 * TILE_SIZE_FIXED, y: 2 * TILE_SIZE_FIXED },
      facing: 'down' as const,
      moving: false,
      location: 'estate' as const,
    };
    const walking = movePlayer(start, 'right', open);
    const sprinting = movePlayerAtSpeedPermille(start, 'right', open, 1_250);
    expect(sprinting.position.x - start.position.x).toBe(
      (walking.position.x - start.position.x) * 1.25,
    );
  });

  it('30§3 rejects a height step unless a walkable contour transition connects it', () => {
    const start = {
      position: { x: TILE_SIZE_FIXED - 1, y: TILE_SIZE_FIXED },
      facing: 'right' as const,
      moving: false,
      location: 'estate' as const,
    };
    const elevations = Uint8Array.from([0, 1]);
    const legacy = { width: 2, height: 1, blocked: [false, false], elevations };
    expect(movePlayer(start, 'right', legacy).position.x).toBeGreaterThan(start.position.x);
    const cliff = { ...legacy, terrainTransitions: [] };
    expect(movePlayer(start, 'right', cliff).position).toEqual(start.position);
    const slope = {
      ...cliff,
      terrainTransitions: [{
        contourLevel: 1,
        kind: 'slope' as const,
        direction: 'right' as const,
        lowerTileX: 0,
        lowerTileY: 0,
        upperTileX: 1,
        upperTileY: 0,
      }],
    };
    expect(movePlayer(start, 'right', slope).position.x).toBeGreaterThan(start.position.x);
  });

  it('30§5 exposes the same per-height edge guard to every grounded actor', () => {
    const from = {
      x: TILE_SIZE_FIXED - 1,
      y: TILE_SIZE_FIXED / 2 + 6 * FIXED_UNITS_PER_PIXEL,
    };
    const to = { ...from, x: from.x + FIXED_UNITS_PER_PIXEL };
    expect(movementPositionAllowed(from, to, {
      width: 2,
      height: 1,
      blocked: [false, false],
      elevations: Uint8Array.from([0, 1]),
      terrainTransitions: [],
    })).toBe(false);
  });

  it('30§5 keeps the complete foot width on its plane at walking and sprint speeds', () => {
    const map = {
      width: 2,
      height: 1,
      blocked: [false, false],
      elevations: Uint8Array.from([0, 1]),
      terrainTransitions: [],
    };
    const start = {
      position: {
        x: TILE_SIZE_FIXED / 2,
        y: TILE_SIZE_FIXED / 2 + PLAYER_HITBOX_FOOT_OFFSET + 1,
      },
      facing: 'right' as const,
      moving: false,
      location: 'estate' as const,
    };
    let walking: PlayerState = start;
    let sprinting: PlayerState = start;
    for (let step = 0; step < 32; step += 1) {
      walking = movePlayer(walking, 'right', map);
      sprinting = movePlayerAtSpeedPermille(sprinting, 'right', map, 1_250);
    }
    expect(playerHitboxBounds(walking.position).right).toBeLessThan(TILE_SIZE_FIXED);
    expect(playerHitboxBounds(sprinting.position).right).toBeLessThan(TILE_SIZE_FIXED);
    expect(terrainPlaneAtPosition(walking.position, map)).toBe(0);
    expect(terrainPlaneAtPosition(sprinting.position, map)).toBe(0);

    const escaped = movePlayerAtSpeedPermille({
      ...sprinting,
      position: { ...sprinting.position, x: TILE_SIZE_FIXED - 1 },
    }, 'left', map, 1_250);
    expect(escaped.position.x).toBeLessThan(TILE_SIZE_FIXED - 1);
  });

  it('30§5 derives the terrain plane from coordinates without traversal history', () => {
    const map = {
      width: 3,
      height: 1,
      blocked: [false, false, false],
      elevations: Uint8Array.from([0, 1, 2]),
      terrainTransitions: [],
    };
    const positionAt = (tileX: number) => ({
      x: tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
      y: TILE_SIZE_FIXED / 2 + 6 * FIXED_UNITS_PER_PIXEL + 1,
    });
    expect(terrainPlaneAtPosition(positionAt(0), map)).toBe(0);
    expect(terrainPlaneAtPosition(positionAt(1), map)).toBe(1);
    expect(terrainPlaneAtPosition(positionAt(2), map)).toBe(2);
  });
});

import { describe, expect, it } from 'vitest';
import { FIXED_UNITS_PER_PIXEL, TILE_SIZE_FIXED, type PlayerState } from './state.js';
import { caveTerrainPlaneCollisionBytes } from './cave-autotile.js';
import { terrainPlaneCollisionBytesForElevationGrid } from './map-compiler.js';
import { generateRogueRoomLayout } from './roguelike.js';
import {
  movePlayer,
  movePlayerAtSpeed,
  movePlayerAtSpeedPermille,
  collisionTileIsBlockedAtPlane,
  findPlayerJumpLanding,
  movementPositionAllowed,
  PLAYER_HITBOX_FOOT_OFFSET,
  PLAYER_HITBOX_HALF_WIDTH,
  playerHitboxBounds,
  playerInteractionOrigin,
  positionCollides,
  terrainPlaneAtPosition,
} from './movement.js';
import { cellFlags } from './cell-flags.js';

describe('player movement collision', () => {
  const open = { width: 4, height: 4, blocked: new Uint8Array(16) };

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
    const blocked = open.blocked.slice();
    blocked[2 * open.width + 2] = 1;
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

  it('World/Map & Terrain: rejects a height step unless a walkable contour transition connects it', () => {
    const start = {
      position: { x: TILE_SIZE_FIXED - 1, y: TILE_SIZE_FIXED },
      facing: 'right' as const,
      moving: false,
      location: 'estate' as const,
    };
    const elevations = Uint8Array.from([0, 1]);
    const legacy = { width: 2, height: 1, blocked: cellFlags([false, false]), elevations };
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

  it('World/Map & Terrain: exposes the same per-height edge guard to every grounded actor', () => {
    const from = {
      x: TILE_SIZE_FIXED - 1,
      y: TILE_SIZE_FIXED / 2 + 6 * FIXED_UNITS_PER_PIXEL,
    };
    const to = { ...from, x: from.x + FIXED_UNITS_PER_PIXEL };
    expect(movementPositionAllowed(from, to, {
      width: 2,
      height: 1,
      blocked: cellFlags([false, false]),
      elevations: Uint8Array.from([0, 1]),
      terrainTransitions: [],
    })).toBe(false);
  });

  it('World/Map & Terrain: resolves projected wall and cap blockers only on their owning plane', () => {
    const stride = 4;
    const terrainPlaneBlocked = new Uint8Array(stride * 2);
    terrainPlaneBlocked[1] = 1;
    terrainPlaneBlocked[stride + 2] = 1;
    const map = {
      width: 4,
      height: 1,
      blocked: cellFlags([false, false, false, false]),
      elevations: Uint8Array.from([0, 0, 1, 1]),
      terrainTransitions: [],
      terrainPlaneBlocked,
    };
    expect(collisionTileIsBlockedAtPlane(map, 1, 0, 0)).toBe(true);
    expect(collisionTileIsBlockedAtPlane(map, 1, 0, 1)).toBe(false);
    expect(collisionTileIsBlockedAtPlane(map, 2, 0, 0)).toBe(false);
    expect(collisionTileIsBlockedAtPlane(map, 2, 0, 1)).toBe(true);
  });

  it('blocks movement through roguelike wall art on the lower terrain plane', () => {
    const layout = generateRogueRoomLayout(42, 1, 'combat');
    const map = {
      width: layout.width,
      height: layout.height,
      blocked: layout.blocked,
      elevations: layout.elevations,
      terrainMinimumElevation: 0,
      terrainTransitions: layout.terrainTransitions,
      terrainPlaneBlocked: terrainPlaneCollisionBytesForElevationGrid(
        layout.width,
        layout.height,
        layout.elevations,
        layout.terrainTransitions,
        'cave',
      ),
    };
    // The dais at rows 13..15 is raised terrain reached only by its stairs:
    // the floor in front of its displaced wall art is open, and stepping onto
    // the dais footprint from the lower plane is an illegal height change.
    expect(collisionTileIsBlockedAtPlane(map, 14, 16, 0)).toBe(false);
    expect(layout.blocked[16 * layout.width + 14]).toBe(0);
    const from = {
      x: 14 * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
      y: 17 * TILE_SIZE_FIXED + PLAYER_HITBOX_FOOT_OFFSET + 1,
    };
    expect(movementPositionAllowed(from, { ...from, x: from.x + 1 }, map)).toBe(true);
    let player: PlayerState = {
      position: from, facing: 'up', moving: false, location: 'cellar',
    };
    for (let step = 0; step < 100; step += 1) player = movePlayer(player, 'up', map);
    expect(player.position.y - PLAYER_HITBOX_FOOT_OFFSET).toBeGreaterThanOrEqual(16 * TILE_SIZE_FIXED);
  });

  it('indexes collision planes from the signed minimum elevation', () => {
    const stride = 3;
    const terrainPlaneBlocked = new Uint8Array(stride * 3);
    terrainPlaneBlocked[0] = 1;
    terrainPlaneBlocked[stride + 1] = 1;
    terrainPlaneBlocked[stride * 2 + 2] = 1;
    const map = {
      width: 3,
      height: 1,
      blocked: cellFlags([false, false, false]),
      elevations: Int16Array.from([-1, 0, 1]),
      terrainMinimumElevation: -1,
      terrainTransitions: [],
      terrainPlaneBlocked,
    };
    expect(collisionTileIsBlockedAtPlane(map, 0, 0, -1)).toBe(true);
    expect(collisionTileIsBlockedAtPlane(map, 1, 0, 0)).toBe(true);
    expect(collisionTileIsBlockedAtPlane(map, 2, 0, 1)).toBe(true);
    expect(collisionTileIsBlockedAtPlane(map, 0, 0, 0)).toBe(false);
  });

  it('keeps an underground actor on L0 beneath projected L1 geometry', () => {
    const map = {
      width: 2,
      height: 1,
      blocked: cellFlags([false, false]),
      elevations: Uint8Array.from([0, 1]),
      terrainTransitions: [],
      fixedTerrainPlane: 0,
    };
    const from = {
      x: TILE_SIZE_FIXED / 2,
      y: TILE_SIZE_FIXED / 2 + PLAYER_HITBOX_FOOT_OFFSET + 1,
    };
    expect(terrainPlaneAtPosition({ ...from, x: TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2 }, map)).toBe(0);
    expect(movementPositionAllowed(from, { ...from, x: from.x + FIXED_UNITS_PER_PIXEL }, map)).toBe(true);
  });

  it('stops a cellar actor at an ordinary solid side wall', () => {
    const width = 7;
    const height = 7;
    const elevations = new Uint8Array(width * height).fill(1);
    for (let tileY = 1; tileY < height - 1; tileY += 1) {
      for (let tileX = 1; tileX <= 2; tileX += 1) elevations[tileY * width + tileX] = 0;
    }
    const map = {
      width,
      height,
      blocked: new Uint8Array(width * height),
      elevations,
      terrainTransitions: [],
      fixedTerrainPlane: 0,
      terrainPlaneBlocked: caveTerrainPlaneCollisionBytes(elevations, width, height),
    };
    let player: PlayerState = {
      position: {
        x: 2 * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
        y: 3 * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2 + PLAYER_HITBOX_FOOT_OFFSET + 1,
      },
      facing: 'right',
      moving: false,
      location: 'cellar',
    };
    for (let step = 0; step < 100; step += 1) player = movePlayer(player, 'right', map);
    expect(player.position.x).toBeLessThan(3 * TILE_SIZE_FIXED);
  });

  it('stops at projected cave front faces and side walls while adjacent floor stays open', () => {
    const width = 7;
    const height = 9;
    const elevations = new Uint8Array(width * height).fill(1);
    for (let tileY = 3; tileY < height - 1; tileY += 1) {
      for (let tileX = 2; tileX < width - 1; tileX += 1) elevations[tileY * width + tileX] = 0;
    }
    const map = {
      width,
      height,
      blocked: new Uint8Array(width * height),
      elevations,
      terrainTransitions: [],
      fixedTerrainPlane: 0,
      terrainPlaneBlocked: caveTerrainPlaneCollisionBytes(elevations, width, height),
    };
    let player: PlayerState = {
      position: {
        x: 2 * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
        y: 4 * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2 + PLAYER_HITBOX_FOOT_OFFSET + 1,
      },
      facing: 'left',
      moving: false,
      location: 'cellar',
    };
    // Rows one and two are the projected front-wall courses on L0. Row three
    // is the first floor row, while the west side stays solid.
    expect(map.terrainPlaneBlocked[0 * width + 3]).toBe(1);
    expect(map.terrainPlaneBlocked[1 * width + 3]).toBe(1);
    expect(map.terrainPlaneBlocked[2 * width + 3]).toBe(1);
    expect(map.terrainPlaneBlocked[3 * width + 3]).toBe(0);
    expect(map.terrainPlaneBlocked[6 * width + 3]).toBe(0);
    expect(map.terrainPlaneBlocked[4 * width + 1]).toBe(1);
    for (let step = 0; step < 100; step += 1) player = movePlayer(player, 'left', map);
    expect(player.position.x).toBeGreaterThanOrEqual(2 * TILE_SIZE_FIXED);
    for (let step = 0; step < 100; step += 1) player = movePlayer(player, 'up', map);
    expect(player.position.y - PLAYER_HITBOX_FOOT_OFFSET).toBeGreaterThanOrEqual(3 * TILE_SIZE_FIXED);
    expect(player.position.y - PLAYER_HITBOX_FOOT_OFFSET).toBeLessThan(4 * TILE_SIZE_FIXED);
  });

  it('lets a persisted actor escape newly-solid terrain without moving farther through it', () => {
    const map = { width: 2, height: 1, blocked: cellFlags([true, false]) };
    const embedded = {
      x: TILE_SIZE_FIXED - PLAYER_HITBOX_HALF_WIDTH / 2,
      y: TILE_SIZE_FIXED / 2 + PLAYER_HITBOX_FOOT_OFFSET + 1,
    };
    expect(positionCollides(embedded, map)).toBe(true);
    expect(movementPositionAllowed(embedded, {
      ...embedded, x: embedded.x + FIXED_UNITS_PER_PIXEL,
    }, map)).toBe(true);
    expect(movementPositionAllowed(embedded, {
      ...embedded, x: embedded.x - FIXED_UNITS_PER_PIXEL,
    }, map)).toBe(false);
  });

  describe('recovery from newly solid object obstacles', () => {
    const pixel = FIXED_UNITS_PER_PIXEL;
    const at = { x: 2 * TILE_SIZE_FIXED, y: 2 * TILE_SIZE_FIXED };
    const bounds = playerHitboxBounds(at);
    const rightObstacle = {
      left: bounds.right - pixel + 1, right: bounds.right + TILE_SIZE_FIXED,
      top: 0, bottom: 4 * TILE_SIZE_FIXED - 1,
    };
    const step = (dx: number, dy = 0) => ({ x: at.x + dx * pixel, y: at.y + dy * pixel });

    it('walks out from fully inside a chest-sized obstacle without teleporting', () => {
      const obstacle = {
        left: TILE_SIZE_FIXED, right: 2 * TILE_SIZE_FIXED - 1,
        top: TILE_SIZE_FIXED, bottom: 2 * TILE_SIZE_FIXED - 1,
      };
      const map = { ...open, obstacles: [obstacle] };
      let player: PlayerState = {
        position: {
          x: TILE_SIZE_FIXED * 1.5,
          y: TILE_SIZE_FIXED * 1.5 + PLAYER_HITBOX_FOOT_OFFSET,
        },
        facing: 'up', moving: false, location: 'estate',
      };
      const initial = player.position;
      expect(positionCollides(initial, map)).toBe(true);
      expect(movePlayer(player, null, map).position).toEqual(initial);
      for (let tick = 0; tick < 8; tick += 1) {
        const previous = player.position;
        player = movePlayer(player, 'up', map);
        expect(player.position).toEqual({ x: previous.x, y: previous.y - pixel });
      }
      expect(positionCollides(player.position, map)).toBe(false);
      expect(movePlayer(player, 'down', map).position).toEqual(player.position);
    });

    it('allows a partial corner to separate but rejects deeper or sideways overlap', () => {
      const obstacle = { ...rightObstacle, top: bounds.bottom - pixel + 1 };
      const map = { ...open, obstacles: [obstacle] };
      expect(movementPositionAllowed(at, step(-1), map)).toBe(true);
      expect(movementPositionAllowed(at, step(0, -1), map)).toBe(true);
      expect(movementPositionAllowed(at, step(1, 1), map)).toBe(false);
      expect(movementPositionAllowed(at, step(1), map)).toBe(false);
      expect(movementPositionAllowed(at, at, map)).toBe(false);
    });

    it('requires progress without increasing overlap with any other obstacle', () => {
      const secondRight = { ...rightObstacle, left: rightObstacle.left + pixel / 2 };
      expect(movementPositionAllowed(at, step(-1), {
        ...open, obstacles: [rightObstacle, secondRight],
      })).toBe(true);
      const leftObstacle = { ...rightObstacle, left: bounds.left - TILE_SIZE_FIXED, right: bounds.left + pixel };
      expect(movementPositionAllowed(at, step(-1), {
        ...open, obstacles: [rightObstacle, leftObstacle],
      })).toBe(false);
    });

    it('does not enter a new wall while escaping another object', () => {
      const newWall = { ...rightObstacle, left: 0, right: bounds.left - 1 };
      expect(positionCollides(at, { ...open, obstacles: [newWall] })).toBe(false);
      expect(movementPositionAllowed(at, step(-1), {
        ...open, obstacles: [rightObstacle, newWall],
      })).toBe(false);
    });

    it('preserves terrain and elevation restrictions during object recovery', () => {
      const blocked = open.blocked.slice();
      blocked[1 * open.width + 1] = 1;
      expect(movementPositionAllowed(at, step(-1), {
        ...open, blocked, obstacles: [rightObstacle],
      })).toBe(false);
      const elevations = Uint8Array.from({ length: 16 }, (_, index) => index % 4 >= 2 ? 1 : 0);
      expect(movementPositionAllowed(at, step(-1), {
        ...open, elevations, terrainTransitions: [], obstacles: [rightObstacle],
      })).toBe(false);
    });

    it('keeps ordinary unobstructed movement free and blocks entry into solid objects', () => {
      expect(movementPositionAllowed(at, step(-1), open)).toBe(true);
      const wall = { ...rightObstacle, left: bounds.right + 1 };
      const map = { ...open, obstacles: [wall] };
      expect(movementPositionAllowed(at, step(-1), map)).toBe(true);
      expect(movementPositionAllowed(at, step(1), map)).toBe(false);
    });
  });

  it('World/Map & Terrain: keeps the complete foot width on its plane at walking and sprint speeds', () => {
    const map = {
      width: 2,
      height: 1,
      blocked: cellFlags([false, false]),
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

  it('World/Map & Terrain: derives the terrain plane from coordinates without traversal history', () => {
    const map = {
      width: 3,
      height: 1,
      blocked: cellFlags([false, false, false]),
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

  it('gates one-to-three gap tiles and cliff levels independently', () => {
    const width = 6;
    const height = 3;
    const start = {
      x: TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2,
      y: TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2 + PLAYER_HITBOX_FOOT_OFFSET + 1,
    };
    const blocked = new Uint8Array(width * height);
    const jumpable = new Uint8Array(width * height);
    blocked[width + 2] = 1;
    jumpable[width + 2] = 1;
    const oneGap = { width, height, blocked, horseJumpableTerrain: jumpable };
    expect(findPlayerJumpLanding(start, 'right', oneGap, 0, 0)).toBeNull();
    expect(findPlayerJumpLanding(start, 'right', oneGap, 1, 0)).toEqual({
      x: start.x + 2 * TILE_SIZE_FIXED, y: start.y,
    });

    const threeGapBlocked = new Uint8Array(width * height);
    const threeGapJumpable = new Uint8Array(width * height);
    for (const tileX of [2, 3, 4]) {
      threeGapBlocked[width + tileX] = 1;
      threeGapJumpable[width + tileX] = 1;
    }
    const threeGaps = {
      width, height, blocked: threeGapBlocked, horseJumpableTerrain: threeGapJumpable,
    };
    expect(findPlayerJumpLanding(start, 'right', threeGaps, 2, 0)).toBeNull();
    expect(findPlayerJumpLanding(start, 'right', threeGaps, 3, 0)).toEqual({
      x: start.x + 4 * TILE_SIZE_FIXED, y: start.y,
    });

    const elevations = new Uint8Array(width * height);
    elevations[width + 2] = 1;
    const cliff = {
      width, height, blocked: new Uint8Array(width * height),
      elevations, terrainTransitions: [],
    };
    expect(findPlayerJumpLanding(start, 'right', cliff, 3, 0)).toBeNull();
    expect(findPlayerJumpLanding(start, 'right', cliff, 0, 1)).toEqual({
      x: start.x + TILE_SIZE_FIXED, y: start.y,
    });
    elevations[width + 2] = 3;
    expect(findPlayerJumpLanding(start, 'right', cliff, 0, 2)).toBeNull();
    expect(findPlayerJumpLanding(start, 'right', cliff, 0, 3)).toEqual({
      x: start.x + TILE_SIZE_FIXED, y: start.y,
    });
    expect(findPlayerJumpLanding(start, 'right', {
      width, height, blocked: new Uint8Array(width * height),
    }, 3, 3)).toBeNull();
  });
});

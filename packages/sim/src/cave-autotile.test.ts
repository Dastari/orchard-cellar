import { describe, expect, it } from 'vitest';
import {
  CAVE_RAISED_CLIFF_TILE_SET,
  caveProjectedRowsPerLevel,
  caveSupportFitsAt,
  caveWallSupportAnchorAt,
  caveTerrainPlaneCollisionBytes,
} from './cave-autotile.js';
import { cellarExcavationFootprint } from './cellar-excavation.js';
import { resolveRaisedTerrainContoursAt } from './raised-terrain-autotile.js';

describe('cave elevation-plane collision', () => {
  it('only places a five-tile cave support against a continuous raised row', () => {
    const solid = new Set(['3:2', '4:2', '5:2', '6:2', '7:2']);
    const solidAt = (tileX: number, tileY: number): boolean => solid.has(`${tileX}:${tileY}`);
    expect(caveSupportFitsAt(solidAt, 5, 2)).toBe(true);
    expect(caveSupportFitsAt(solidAt, 4, 2)).toBe(false);
    solid.delete('6:2');
    expect(caveSupportFitsAt(solidAt, 5, 2)).toBe(false);
  });

  it('centres generated wall supports within exposed face runs without hanging posts', () => {
    const wall = new Set(Array.from({ length: 12 }, (_, index) => `${3 + index}:4`));
    const wallAt = (tileX: number, tileY: number): boolean => wall.has(`${tileX}:${tileY}`);
    expect(Array.from({ length: 12 }, (_, index) => 3 + index).filter(
      (tileX) => caveWallSupportAnchorAt(wallAt, tileX, 4),
    )).toEqual([5, 12]);
    wall.delete('13:4');
    expect(caveWallSupportAnchorAt(wallAt, 12, 4)).toBe(false);
    expect(caveWallSupportAnchorAt(() => false, 5, 4)).toBe(false);
  });

  it('keeps every unexcavated rock cell solid on the raised plane', () => {
    const width = 17;
    const height = 13;
    const elevations = Uint8Array.from({ length: width * height }, (_, index) => {
      const tileX = index % width;
      const tileY = Math.floor(index / width);
      if (tileX === 0 || tileY === 0 || tileX === width - 1 || tileY === height - 1) return 1;
      return ((tileX * 17 + tileY * 31 + tileX * tileY) % 5) < 2 ? 0 : 1;
    });
    const blocked = caveTerrainPlaneCollisionBytes(elevations, width, height);
    for (let index = 0; index < elevations.length; index += 1) {
      if (elevations[index] === 1) expect(blocked[width * height + index]).toBe(1);
    }
  });

  it('keeps an ordinary side wall solid on both excavation and datum planes', () => {
    const width = 7;
    const height = 7;
    const stride = width * height;
    const elevations = new Uint8Array(stride).fill(1);
    for (let tileY = 1; tileY < height - 1; tileY += 1) {
      for (let tileX = 1; tileX <= 2; tileX += 1) elevations[tileY * width + tileX] = 0;
    }
    const blocked = caveTerrainPlaneCollisionBytes(elevations, width, height);
    const sideWall = 3 * width + 3;
    expect(elevations[sideWall]).toBe(1);
    expect(blocked[sideWall]).toBe(1);
    expect(blocked[stride + sideWall]).toBe(1);
    expect(blocked[3 * width + 4]).toBe(1);
  });

  it('blocks both projected front-face courses and keeps the floor in front open', () => {
    const width = 7;
    const height = 9;
    const stride = width * height;
    const elevations = new Uint8Array(stride).fill(1);
    for (let tileY = 3; tileY < height - 3; tileY += 1) {
      for (let tileX = 1; tileX < width - 1; tileX += 1) elevations[tileY * width + tileX] = 0;
    }
    const blocked = caveTerrainPlaneCollisionBytes(elevations, width, height);
    expect(caveProjectedRowsPerLevel()).toBe(2);
    // The north wall is projected two rows north. Its two visible face courses
    // occupy rows one and two and block; the logical receiving rows three and
    // four are excavated floor and must not become phantom blockers.
    expect(blocked[2 * width + 3]).toBe(1);
    expect(blocked[1 * width + 3]).toBe(1);
    expect(blocked[0 * width + 3]).toBe(1);
    expect(blocked[3 * width + 3]).toBe(0);
    expect(blocked[4 * width + 3]).toBe(0);
    expect(blocked[5 * width + 3]).toBe(0);
    expect(blocked[6 * width + 3]).toBe(1);
    expect(blocked[stride + 2 * width + 3]).toBe(1);
    expect(blocked[stride + 3 * width + 3]).toBe(0);
  });

  it('keeps an invalid imported one-tile breach collision-safe without fabricating a face', () => {
    const width = 7;
    const height = 7;
    const elevations = new Uint8Array(width * height).fill(1);
    for (let tileY = 1; tileY < height - 1; tileY += 1) {
      for (let tileX = 2; tileX < width - 1; tileX += 1) elevations[tileY * width + tileX] = 0;
    }
    const breachX = 1;
    const breachY = 3;
    elevations[breachY * width + breachX] = 0;
    const elevationAt = (tileX: number, tileY: number): number => (
      tileX < 0 || tileY < 0 || tileX >= width || tileY >= height
        ? 1
        : elevations[tileY * width + tileX] ?? 1
    );
    const breachPlan = resolveRaisedTerrainContoursAt(
      elevationAt,
      1,
      CAVE_RAISED_CLIFF_TILE_SET,
      'tall',
      breachX,
      breachY,
    )[0]?.plan;
    const blocked = caveTerrainPlaneCollisionBytes(elevations, width, height);
    expect(breachPlan?.faceLayers.some((face) => face.direct)).not.toBe(true);
    expect(blocked[breachY * width + breachX]).toBe(0);
    expect(blocked[breachY * width]).toBe(1);
  });

  it('turns a lateral manual dig into two rounded corners and both front-face courses', () => {
    const width = 8;
    const height = 8;
    const elevations = new Uint8Array(width * height).fill(1);
    for (let tileY = 2; tileY < height - 2; tileY += 1) {
      for (let tileX = 4; tileX < width - 2; tileX += 1) elevations[tileY * width + tileX] = 0;
    }
    for (const tile of cellarExcavationFootprint(3, 4, width, height)) {
      elevations[tile.tileY * width + tile.tileX] = 0;
    }
    const elevationAt = (tileX: number, tileY: number): number => (
      tileX < 0 || tileY < 0 || tileX >= width || tileY >= height
        ? 1
        : elevations[tileY * width + tileX] ?? 1
    );
    const planAt = (tileX: number, tileY: number) => resolveRaisedTerrainContoursAt(
      elevationAt, 1, CAVE_RAISED_CLIFF_TILE_SET, 'tall', tileX, tileY,
    )[0]?.plan;
    // The aligned macro-cell dig opens (2..3, 4..5) beside the room, so the
    // pocket ceiling gets a two-wide capped face, the room's wall turns with a
    // rounded convex corner, and the pocket's own corners are concave arcs.
    expect(planAt(3, 3)).toMatchObject({ edgeRole: 'bottom_right', edgeFrame: 33 });
    expect(planAt(1, 3)).toMatchObject({ insetRoles: ['inner_bottom_right'], insetFrames: [4] });
    expect(planAt(1, 6)).toMatchObject({ insetRoles: ['inner_top_right'], insetFrames: [18] });
    expect(planAt(2, 6)).toMatchObject({ edgeRole: 'top', edgeFrame: 19 });
    expect(planAt(2, 4)?.faceLayers.find((face) => face.direct)).toEqual(expect.objectContaining({
      rowId: 'wall', join: 'left', frame: 46,
    }));
    expect(planAt(3, 4)?.faceLayers.find((face) => face.direct)).toEqual(expect.objectContaining({
      rowId: 'wall', join: 'right', frame: 47,
    }));
    expect(planAt(2, 5)?.faceLayers.find((face) => face.direct)).toEqual(expect.objectContaining({
      rowId: 'lower_wall', join: 'left', frame: 53,
    }));
    expect(planAt(3, 5)?.faceLayers.find((face) => face.direct)).toEqual(expect.objectContaining({
      rowId: 'lower_wall', join: 'right', frame: 54,
    }));
  });

  it('rebuilds both wall courses behind a two-row northward excavation', () => {
    const width = 7;
    const height = 8;
    const elevations = new Uint8Array(width * height).fill(1);
    for (let tileY = 3; tileY < height - 1; tileY += 1) {
      for (let tileX = 1; tileX < width - 1; tileX += 1) elevations[tileY * width + tileX] = 0;
    }
    const elevationAt = (tileX: number, tileY: number): number => (
      tileX < 0 || tileY < 0 || tileX >= width || tileY >= height
        ? 1
        : elevations[tileY * width + tileX] ?? 1
    );
    const wallRow = resolveRaisedTerrainContoursAt(
      elevationAt, 1, CAVE_RAISED_CLIFF_TILE_SET, 'tall', 3, 3,
    )[0]?.plan.faceLayers.find((face) => face.direct);
    const lowerRow = resolveRaisedTerrainContoursAt(
      elevationAt, 1, CAVE_RAISED_CLIFF_TILE_SET, 'tall', 3, 4,
    )[0]?.plan.faceLayers.find((face) => face.direct);
    expect(wallRow?.rowId).toBe('wall');
    expect(lowerRow?.rowId).toBe('lower_wall');
  });

  it('keeps a rounded cave turn on solid rock and caps the wall beside it', () => {
    const width = 7;
    const height = 8;
    const elevations = new Uint8Array(width * height).fill(0);
    const rows = [
      '.......',
      '..###..',
      '...##..',
      '...##..',
      '...##..',
      '.......',
      '.......',
      '.......',
    ];
    rows.forEach((row, tileY) => [...row].forEach((cell, tileX) => {
      elevations[tileY * width + tileX] = cell === '#' ? 1 : 0;
    }));
    const elevationAt = (tileX: number, tileY: number): number => (
      tileX < 0 || tileY < 0 || tileX >= width || tileY >= height
        ? 1
        : elevations[tileY * width + tileX] ?? 1
    );
    const planAt = (tileX: number, tileY: number) => resolveRaisedTerrainContoursAt(
      elevationAt, 1, CAVE_RAISED_CLIFF_TILE_SET, 'tall', tileX, tileY,
    )[0]?.plan;

    // The solid cell keeps its authored cap and never stacks the diagonal
    // inset arc over that opaque frame.
    expect(planAt(3, 1)).toMatchObject({
      edgeRole: 'top', edgeFrame: 19, insetRoles: [], insetFrames: [],
    });
    expect(planAt(2, 1)).toMatchObject({ edgeRole: 'top_left', edgeFrame: 25 });
    // The open cell below the turn is wall face, not a projected rounded
    // corner: the rim's rounded turn stays on the rock, and the face ends in
    // its authored dark-outlined cap.
    expect(planAt(2, 2)?.edgeRole).toBeNull();
    expect(planAt(2, 2)?.faceLayers).toEqual([expect.objectContaining({
      rowId: 'wall', join: 'left', frame: 46, direct: true, blocksMovement: true,
    })]);
    expect(planAt(2, 3)?.faceLayers).toEqual([expect.objectContaining({
      rowId: 'lower_wall', join: 'left', frame: 53, direct: true,
    })]);
    expect(planAt(2, 4)).toBeUndefined();
    // The continuing side wall draws only its opaque rim; interior banks emit
    // no hidden rear face beneath it.
    expect(planAt(3, 2)).toMatchObject({ edgeRole: 'left', edgeFrame: 13, faceLayers: [] });

    // Face courses block at their projected destinations, including the row
    // beyond this irregular corner; their logical receiver cells stay floor.
    const blocked = caveTerrainPlaneCollisionBytes(elevations, width, height);
    expect(blocked[0 * width + 2]).toBe(1);
    expect(blocked[1 * width + 2]).toBe(1);
    expect(blocked[width * height + 1 * width + 2]).toBe(1);
    expect(blocked[2 * width + 2]).toBe(0);
    expect(blocked[3 * width + 2]).toBe(0);
  });

  it('caps a front wall where it meets a side rim instead of joining seamlessly', () => {
    const width = 6;
    const height = 6;
    const elevations = new Uint8Array(width * height).fill(1);
    for (let tileY = 2; tileY < height - 1; tileY += 1) {
      for (let tileX = 2; tileX < width - 1; tileX += 1) elevations[tileY * width + tileX] = 0;
    }
    const elevationAt = (tileX: number, tileY: number): number => (
      tileX < 0 || tileY < 0 || tileX >= width || tileY >= height
        ? 1
        : elevations[tileY * width + tileX] ?? 1
    );
    const planAt = (tileX: number, tileY: number) => resolveRaisedTerrainContoursAt(
      elevationAt, 1, CAVE_RAISED_CLIFF_TILE_SET, 'tall', tileX, tileY,
    )[0]?.plan;
    expect(planAt(1, 1)).toMatchObject({ insetRoles: ['inner_bottom_right'], insetFrames: [4] });
    expect(planAt(2, 1)).toMatchObject({ edgeRole: 'bottom', edgeFrame: 5 });
    expect(planAt(1, 2)).toMatchObject({ edgeRole: 'right', edgeFrame: 11, faceLayers: [] });
    expect(planAt(2, 2)?.faceLayers).toEqual([expect.objectContaining({
      rowId: 'wall', join: 'left', frame: 46,
    })]);
    expect(planAt(2, 3)?.faceLayers).toEqual([expect.objectContaining({
      rowId: 'lower_wall', join: 'left', frame: 53,
    })]);
    expect(planAt(4, 2)?.faceLayers).toEqual([expect.objectContaining({
      rowId: 'wall', join: 'right', frame: 47,
    })]);
    expect(planAt(4, 3)?.faceLayers).toEqual([expect.objectContaining({
      rowId: 'lower_wall', join: 'right', frame: 54,
    })]);
  });

  it('caps a one-cell rock step on the side that faces open floor', () => {
    const width = 8;
    const height = 8;
    const elevations = new Uint8Array(width * height).fill(1);
    const carve = (minX: number, minY: number, maxX: number, maxY: number): void => {
      for (let tileY = minY; tileY <= maxY; tileY += 1) {
        for (let tileX = minX; tileX <= maxX; tileX += 1) elevations[tileY * width + tileX] = 0;
      }
    };
    carve(3, 1, 6, 6);
    carve(2, 3, 6, 6);
    const elevationAt = (tileX: number, tileY: number): number => (
      tileX < 0 || tileY < 0 || tileX >= width || tileY >= height
        ? 1
        : elevations[tileY * width + tileX] ?? 1
    );
    const planAt = (tileX: number, tileY: number) => resolveRaisedTerrainContoursAt(
      elevationAt, 1, CAVE_RAISED_CLIFF_TILE_SET, 'tall', tileX, tileY,
    )[0]?.plan;
    expect(planAt(2, 2)).toMatchObject({ edgeRole: 'bottom_right', edgeFrame: 33 });
    expect(planAt(2, 3)?.faceLayers).toEqual([expect.objectContaining({
      rowId: 'wall', join: 'right', frame: 47,
    })]);
    expect(planAt(2, 4)?.faceLayers).toEqual([expect.objectContaining({
      rowId: 'lower_wall', join: 'right', frame: 54,
    })]);
  });

  it('inserts the protruding column variant into long runs with both courses agreeing', () => {
    const width = 64;
    const height = 6;
    const elevations = new Uint8Array(width * height).fill(1);
    for (let tileY = 2; tileY < height - 1; tileY += 1) {
      for (let tileX = 1; tileX < width - 1; tileX += 1) elevations[tileY * width + tileX] = 0;
    }
    const elevationAt = (tileX: number, tileY: number): number => (
      tileX < 0 || tileY < 0 || tileX >= width || tileY >= height
        ? 1
        : elevations[tileY * width + tileX] ?? 1
    );
    const frameAt = (tileX: number, tileY: number): number | undefined => resolveRaisedTerrainContoursAt(
      elevationAt, 1, CAVE_RAISED_CLIFF_TILE_SET, 'tall', tileX, tileY,
    )[0]?.plan.faceLayers.find((face) => face.direct)?.frame;
    let variants = 0;
    for (let tileX = 2; tileX < width - 2; tileX += 1) {
      const wall = frameAt(tileX, 2);
      const lowerWall = frameAt(tileX, 3);
      expect([43, 44]).toContain(wall);
      expect([50, 51]).toContain(lowerWall);
      expect(wall === 44).toBe(lowerWall === 51);
      if (wall === 44) variants += 1;
    }
    expect(variants).toBeGreaterThan(0);
    expect(variants).toBeLessThan(width / 3);
    expect(frameAt(1, 2)).toBe(46);
    expect(frameAt(width - 2, 2)).toBe(47);
  });
});

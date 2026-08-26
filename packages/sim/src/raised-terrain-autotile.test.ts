import { describe, expect, it } from 'vitest';
import {
  raisedTerrainEdgeRoleAt,
  raisedTerrainContourGrid,
  raisedTerrainInsetRolesAt,
  resolveRaisedTerrainContoursAt,
  resolveRaisedTerrainTile,
  type RaisedTerrainGrid,
  type RaisedTerrainRampRole,
  type RaisedTerrainTileSet,
} from './raised-terrain-autotile.js';

function gridFrom(rows: readonly string[], ramps: ReadonlyMap<string, RaisedTerrainRampRole> = new Map()): RaisedTerrainGrid {
  return {
    raisedAt: (tileX, tileY) => rows[tileY]?.[tileX] === '#',
    rampRoleAt: (tileX, tileY) => ramps.get(`${tileX},${tileY}`) ?? null,
  };
}

const TILE_SET: RaisedTerrainTileSet = {
  edgeFrames: {
    top_left: 1, top: 2, top_right: 3,
    left: 4, right: 5,
    bottom_left: 6, bottom: 7, bottom_right: 8,
  },
  insetFrames: {
    inner_top_left: 101,
    inner_top_right: 102,
    inner_bottom_left: 103,
    inner_bottom_right: 104,
  },
  rampFrames: {
    ramp_top_left: 201,
    ramp_top_right: 202,
    ramp_bottom_left: 203,
    ramp_bottom_right: 204,
  },
  faceProfiles: {
    tall: {
      rows: [
        { id: 'wall', frames: [10, 11, 12], blocksMovement: true, blocksLight: true },
        { id: 'lower', frames: [20, 21, 22], blocksMovement: true, blocksLight: true },
        { id: 'foot', frames: [30, 31, 32], blocksMovement: false, blocksLight: false },
      ],
    },
    short: {
      rows: [{ id: 'short_wall', frames: [40, 41, 42], blocksMovement: true, blocksLight: true }],
    },
  },
};

describe('shared raised terrain autotile utility', () => {
  it('adapts integer editor elevations into independently resolved contours', () => {
    const elevations = [
      [0, 1, 0],
      [1, 2, 1],
      [0, 1, 0],
    ] as const;
    const elevationAt = (tileX: number, tileY: number): number => elevations[tileY]?.[tileX] ?? 0;
    const firstLevel = raisedTerrainContourGrid(elevationAt, 1);
    const secondLevel = raisedTerrainContourGrid(elevationAt, 2);
    expect(firstLevel.raisedAt(1, 0)).toBe(true);
    expect(secondLevel.raisedAt(1, 0)).toBe(false);
    expect(secondLevel.raisedAt(1, 1)).toBe(true);
    expect(() => raisedTerrainContourGrid(elevationAt, 0)).toThrow('positive integer');
  });

  it('30§3 resolves a cliff inside a cliff at every nested contour', () => {
    const elevations = [
      [0, 0, 0, 0, 0],
      [0, 1, 1, 1, 0],
      [0, 1, 2, 1, 0],
      [0, 1, 3, 1, 0],
      [0, 0, 0, 0, 0],
    ] as const;
    const elevationAt = (tileX: number, tileY: number): number => elevations[tileY]?.[tileX] ?? 0;
    const plans = resolveRaisedTerrainContoursAt(elevationAt, 3, TILE_SET, 'tall', 2, 3);
    expect(plans.map(({ contourLevel }) => contourLevel)).toEqual([1, 2, 3]);
    expect(plans[0]?.plan.edgeRole).toBe('bottom');
    expect(plans[1]?.plan.edgeRole).toBe('bottom_left');
    expect(plans[2]?.plan.edgeRole).toBe('top_left');
  });

  it('30§3 applies an authored opening to only its named contour', () => {
    const elevationAt = (tileX: number, tileY: number): number => (
      tileX >= 0 && tileX <= 2 && tileY === 0 ? 2 : 0
    );
    const plans = resolveRaisedTerrainContoursAt(
      elevationAt,
      2,
      TILE_SET,
      'tall',
      1,
      0,
      (level, tileX, tileY) => level === 2 && tileX === 1 && tileY === 0
        ? 'ramp_top_left'
        : null,
    );
    expect(plans.find(({ contourLevel }) => contourLevel === 1)?.plan.edgeFrame).toBe(2);
    expect(plans.find(({ contourLevel }) => contourLevel === 2)?.plan.rampFrame).toBe(201);
  });

  it('derives caps, sides, and all diagonal insets from occupancy alone', () => {
    const rectangle = gridFrom([
      '.....',
      '.###.',
      '.###.',
      '.###.',
      '.....',
    ]);
    expect(raisedTerrainEdgeRoleAt(rectangle, 1, 1)).toBe('top_left');
    expect(raisedTerrainEdgeRoleAt(rectangle, 2, 1)).toBe('top');
    expect(raisedTerrainEdgeRoleAt(rectangle, 3, 2)).toBe('right');
    expect(raisedTerrainEdgeRoleAt(rectangle, 1, 3)).toBe('bottom_left');

    const inset = gridFrom([
      '.##',
      '###',
      '###',
    ]);
    expect(raisedTerrainInsetRolesAt(inset, 1, 1)).toEqual(['inner_top_left']);
  });

  it('changes wall height by selecting a face profile rather than changing topology code', () => {
    const ridge = gridFrom(['###']);
    expect(resolveRaisedTerrainTile(ridge, TILE_SET, 'tall', 1, 1).faceLayers).toEqual([
      {
        depth: 1,
        rowId: 'wall',
        join: 'middle',
        frame: 11,
        blocksMovement: true,
        blocksLight: true,
        direct: true,
      },
    ]);
    expect(resolveRaisedTerrainTile(ridge, TILE_SET, 'tall', 1, 2).faceLayers[0]?.frame).toBe(21);
    const tallFoot = resolveRaisedTerrainTile(ridge, TILE_SET, 'tall', 1, 3);
    expect(tallFoot.faceLayers[0]?.frame).toBe(31);
    expect(tallFoot.blocksMovement).toBe(false);

    expect(resolveRaisedTerrainTile(ridge, TILE_SET, 'short', 1, 1).faceLayers[0]?.frame).toBe(41);
    expect(resolveRaisedTerrainTile(ridge, TILE_SET, 'short', 1, 2).faceLayers).toEqual([]);
  });

  it('makes ramps replace structural edges and remain walkable', () => {
    const ramps = new Map<string, RaisedTerrainRampRole>([['1,0', 'ramp_top_left']]);
    const plan = resolveRaisedTerrainTile(gridFrom(['###'], ramps), TILE_SET, 'tall', 1, 0);
    expect(plan.edgeRole).toBeNull();
    expect(plan.edgeFrame).toBeNull();
    expect(plan.rampRole).toBe('ramp_top_left');
    expect(plan.rampFrame).toBe(201);
    expect(plan.blocksMovement).toBe(false);
  });

  it('rejects an undeclared face-height profile', () => {
    expect(() => resolveRaisedTerrainTile(gridFrom(['#']), TILE_SET, 'missing', 0, 0)).toThrow(
      'Unknown raised-terrain face profile: missing',
    );
  });
});

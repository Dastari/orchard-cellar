import { describe, expect, it } from 'vitest';
import { SURVIVAL_RAISED_CLIFF_TILE_SET } from './survival-world.js';
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
  assetId: 'test_cliff',
  projectionStyle: 'raised',
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
  rampBank: null,
  stairFrames: null,
  ladderFrames: null,
  faceProfiles: {
    tall: {
      rows: [
        { id: 'wall', frames: [10, 11, 12], blocksMovement: true, blocksLight: true },
        { id: 'lower', frames: [20, 21, 22], blocksMovement: true, blocksLight: true },
        {
          id: 'foot', frames: [30, 31, 32], blocksMovement: false, blocksLight: false,
          contributesHeight: false,
        },
      ],
    },
    short: {
      rows: [{ id: 'short_wall', frames: [40, 41, 42], blocksMovement: true, blocksLight: true }],
    },
  },
};

describe('shared raised terrain autotile utility', () => {
  const rectangularElevation = (width: number, elevation: number) => (
    tileX: number,
    tileY: number,
  ): number => tileX >= 0 && tileX < width && tileY >= 0 && tileY < 2 ? elevation : 0;
  const roleRow = (
    width: number,
    elevation: number,
    tileY: number,
    contourLevel: number,
  ): readonly string[] => Array.from({ length: width }, (_, tileX) => {
    const plan = resolveRaisedTerrainContoursAt(
      rectangularElevation(width, elevation),
      elevation,
      SURVIVAL_RAISED_CLIFF_TILE_SET,
      'tall',
      tileX,
      tileY,
    ).find((candidate) => candidate.contourLevel === contourLevel)?.plan;
    const face = plan?.faceLayers.find((layer) => layer.direct);
    return face === undefined
      ? `edge.${plan?.edgeRole ?? 'none'}`
      : `face.${face.rowId}.${face.join}`;
  });

  it('composes one structural course per level with one terminal foot', () => {
    expect(roleRow(2, 1, 0, 1)).toEqual(['edge.top_left', 'edge.top_right']);
    expect(roleRow(2, 1, 1, 1)).toEqual(['edge.bottom_left', 'edge.bottom_right']);
    expect(roleRow(2, 1, 2, 1)).toEqual([
      'face.lower_wall.left', 'face.lower_wall.right',
    ]);
    expect(roleRow(2, 1, 3, 1)).toEqual(['face.foot.left', 'face.foot.right']);

    expect(roleRow(2, 2, 2, 2)).toEqual(['face.wall.left', 'face.wall.right']);
    expect(roleRow(2, 2, 2, 1)).toEqual([
      'face.lower_wall.left', 'face.lower_wall.right',
    ]);
    expect(roleRow(2, 2, 3, 1)).toEqual(['face.foot.left', 'face.foot.right']);
    expect(resolveRaisedTerrainContoursAt(
      rectangularElevation(2, 2), 2, SURVIVAL_RAISED_CLIFF_TILE_SET, 'tall', 0, 3,
    ).some(({ contourLevel, plan }) => contourLevel === 2
      && plan.faceLayers.some((face) => face.direct && face.rowId === 'foot'))).toBe(false);
  });

  it('uses left, repeatable middle, and right joins across wider cliffs', () => {
    expect(roleRow(4, 2, 0, 2)).toEqual([
      'edge.top_left', 'edge.top', 'edge.top', 'edge.top_right',
    ]);
    expect(roleRow(4, 2, 1, 2)).toEqual([
      'edge.bottom_left', 'edge.bottom', 'edge.bottom', 'edge.bottom_right',
    ]);
    expect(roleRow(4, 2, 2, 2)).toEqual([
      'face.wall.left', 'face.wall.middle', 'face.wall.middle', 'face.wall.right',
    ]);
    expect(roleRow(4, 2, 2, 1)).toEqual([
      'face.lower_wall.left', 'face.lower_wall.middle',
      'face.lower_wall.middle', 'face.lower_wall.right',
    ]);
    expect(roleRow(4, 2, 3, 1)).toEqual([
      'face.foot.left', 'face.foot.middle', 'face.foot.middle', 'face.foot.right',
    ]);
  });

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
    expect(raisedTerrainContourGrid(elevationAt, 0).raisedAt(0, 0)).toBe(true);
    expect(() => raisedTerrainContourGrid(elevationAt, 0.5)).toThrow('integer');
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

  it('resolves five-level rises, drops, and a signed pit inside a plateau', () => {
    const peak = (tileX: number): number => tileX === 1 ? 5 : 0;
    expect(resolveRaisedTerrainContoursAt(
      peak, 5, TILE_SET, 'tall', 1, 0,
    ).map(({ contourLevel }) => contourLevel)).toEqual([1, 2, 3, 4, 5]);

    const drop = (tileX: number): number => tileX === 1 ? 0 : 5;
    expect(resolveRaisedTerrainContoursAt(
      drop, 5, TILE_SET, 'tall', 0, 0,
    ).map(({ contourLevel }) => contourLevel)).toEqual([1, 2, 3, 4, 5]);

    const pitInsidePlateau = (tileX: number, tileY: number): number => (
      tileX === 2 && tileY === 2 ? -2 : 1
    );
    expect(resolveRaisedTerrainContoursAt(
      pitInsidePlateau, 1, TILE_SET, 'tall', 2, 1, undefined, -1,
    ).map(({ contourLevel }) => contourLevel)).toEqual([-1, 0, 1]);
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

  it('does not stack an opposite inset corner over a cell that already owns an edge', () => {
    const caveNotch = gridFrom([
      '...',
      '###',
      '.##',
    ]);
    expect(raisedTerrainEdgeRoleAt(caveNotch, 1, 1)).toBe('top');
    expect(raisedTerrainInsetRolesAt(caveNotch, 1, 1)).toEqual(['inner_bottom_left']);
    expect(resolveRaisedTerrainTile(caveNotch, {
      ...TILE_SET, edgeInsetMode: 'exclusive',
    }, 'tall', 1, 1)).toMatchObject({
      edgeRole: 'top', insetRoles: [], insetFrames: [],
    });
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

  it('fills only the open side of a diagonally continuing face gutter', () => {
    const unsupportedLeft = gridFrom([
      '.##.',
      '.#..',
    ]);
    expect(resolveRaisedTerrainTile(unsupportedLeft, TILE_SET, 'tall', 1, 2).faceLayers
      .find((face) => face.direct)).toMatchObject({
      join: 'left', frame: 10,
    });
    expect(resolveRaisedTerrainTile(unsupportedLeft, TILE_SET, 'tall', 1, 2).faceLayers
      .find((face) => face.direct)?.seamUnderlayFrame).toBeUndefined();

    const supportedLeft = gridFrom([
      '##..',
      '.#..',
    ]);
    expect(resolveRaisedTerrainTile(supportedLeft, TILE_SET, 'tall', 1, 2).faceLayers
      .find((face) => face.direct)).toMatchObject({
      join: 'left', frame: 10, seamUnderlayFrame: 11,
    });

    const supportedRight = gridFrom([
      '...#',
      '.##.',
    ]);
    expect(resolveRaisedTerrainTile(supportedRight, TILE_SET, 'tall', 2, 2).faceLayers
      .find((face) => face.direct)).toMatchObject({
      join: 'right', frame: 12, seamUnderlayFrame: 11,
    });

    const footOnlyRight = gridFrom([
      '###',
      '##.',
      '...',
    ]);
    expect(resolveRaisedTerrainTile(footOnlyRight, TILE_SET, 'tall', 1, 3).faceLayers
      .find((face) => face.direct && face.rowId === 'lower')).toMatchObject({
      join: 'right', frame: 22,
    });
    expect(resolveRaisedTerrainTile(footOnlyRight, TILE_SET, 'tall', 1, 3).faceLayers
      .find((face) => face.direct && face.rowId === 'lower')?.seamUnderlayFrame)
      .toBeUndefined();

    const projectedFoot = resolveRaisedTerrainTile(supportedLeft, TILE_SET, 'tall', 1, 4).faceLayers
      .find((face) => face.direct && face.rowId === 'foot');
    expect(projectedFoot).toBeDefined();
    expect(projectedFoot?.seamUnderlayFrame).toBeUndefined();
    const terminal = resolveRaisedTerrainTile(gridFrom(['.#.']), TILE_SET, 'tall', 1, 1).faceLayers;
    expect(terminal.find((face) => face.direct)).toMatchObject({ join: 'left', frame: 10 });
    expect(terminal.find((face) => face.direct)?.seamUnderlayFrame).toBeUndefined();
  });

  it('fills a side-cap gutter only at an internal staircase join', () => {
    const internal = gridFrom([
      '.##',
      '##.',
      '.#.',
    ]);
    expect(resolveRaisedTerrainTile(internal, TILE_SET, 'tall', 1, 1)).toMatchObject({
      edgeRole: 'right',
      edgeSeamUnderlayFrame: 11,
    });

    const internalLeft = gridFrom([
      '##.',
      '.##',
      '.#.',
    ]);
    expect(resolveRaisedTerrainTile(internalLeft, TILE_SET, 'tall', 1, 1)).toMatchObject({
      edgeRole: 'left',
      edgeSeamUnderlayFrame: 11,
    });

    // A diagonal continuation below a terminal side cap does not occupy the
    // cap's open-side projected slot. Treating the diagonal alone as support
    // produces a stray middle-wall tile beneath both right and left caps.
    const trailingRight = gridFrom([
      '##.',
      '##.',
      '.##',
    ]);
    expect(resolveRaisedTerrainTile(trailingRight, TILE_SET, 'tall', 1, 1)).toMatchObject({
      edgeRole: 'right',
    });
    expect(resolveRaisedTerrainTile(trailingRight, TILE_SET, 'tall', 1, 1)
      .edgeSeamUnderlayFrame).toBeUndefined();

    const trailingLeft = gridFrom([
      '.##',
      '.##',
      '##.',
    ]);
    expect(resolveRaisedTerrainTile(trailingLeft, TILE_SET, 'tall', 1, 1)).toMatchObject({
      edgeRole: 'left',
    });
    expect(resolveRaisedTerrainTile(trailingLeft, TILE_SET, 'tall', 1, 1)
      .edgeSeamUnderlayFrame).toBeUndefined();

    const outside = gridFrom([
      '##.',
      '##.',
      '##.',
    ]);
    expect(resolveRaisedTerrainTile(outside, TILE_SET, 'tall', 1, 1)).toMatchObject({
      edgeRole: 'right',
    });
    expect(resolveRaisedTerrainTile(outside, TILE_SET, 'tall', 1, 1).edgeSeamUnderlayFrame)
      .toBeUndefined();

    // Rear-facing top corners remain transparent even when a staircase
    // continues diagonally. An opaque wall underlay here becomes a visible
    // stone square in the legacy overworld's back cliff rim.
    const cornerStep = gridFrom([
      '.##',
      '##.',
    ]);
    expect(resolveRaisedTerrainTile(cornerStep, TILE_SET, 'tall', 1, 0)).toMatchObject({
      edgeRole: 'top_left',
    });
    expect(resolveRaisedTerrainTile(cornerStep, TILE_SET, 'tall', 1, 0).edgeSeamUnderlayFrame)
      .toBeUndefined();

    const outsideCorner = gridFrom([
      '.#.',
      '.#.',
    ]);
    expect(resolveRaisedTerrainTile(outsideCorner, TILE_SET, 'tall', 1, 0)).toMatchObject({
      edgeRole: 'top_left',
    });
    expect(resolveRaisedTerrainTile(outsideCorner, TILE_SET, 'tall', 1, 0).edgeSeamUnderlayFrame)
      .toBeUndefined();
  });

  it('uses the matching rocky face beneath a translucent side cap', () => {
    const staggeredWall = gridFrom([
      '#####..',
      '#####..',
      '####...',
      '####...',
      '####...',
      '###....',
      '.......',
    ]);
    const plan = resolveRaisedTerrainTile(staggeredWall, TILE_SET, 'tall', 3, 3);
    expect(plan.edgeRole).toBe('right');
    expect(plan.faceLayers).toContainEqual(expect.objectContaining({
      rowId: 'lower', direct: false,
    }));
    expect(plan.edgeSeamUnderlayFrame).toBe(21);
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

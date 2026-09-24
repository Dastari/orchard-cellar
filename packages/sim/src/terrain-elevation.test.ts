import { describe, expect, it } from 'vitest';
import {
  rampPlacementFindings,
  maximumTerrainElevation,
  minimumTerrainElevation,
  retainMinimumTerrainFootprint,
  expandStairRun,
  terrainElevationAt,
  terrainProjectedDepthOffset,
  terrainTransitionConnects,
  terrainTransitionValid,
  terrainWalkingStepAllowed,
  type TerrainTransition,
} from './terrain-elevation.js';

describe('World/Map & Terrain: integer terrain elevation', () => {
  it('retains only cells belonging to a complete 2x2 contour footprint', () => {
    const mask = Uint8Array.from([
      1, 0, 0, 0, 0, 0,
      0, 1, 1, 0, 1, 1,
      0, 1, 1, 1, 1, 1,
      0, 0, 0, 0, 1, 1,
    ]);
    expect([...retainMinimumTerrainFootprint(mask, 6, 4)]).toEqual([
      0, 0, 0, 0, 0, 0,
      0, 1, 1, 0, 1, 1,
      0, 1, 1, 0, 1, 1,
      0, 0, 0, 0, 1, 1,
    ]);
    expect(() => retainMinimumTerrainFootprint(mask, 5, 4)).toThrow('dimensions');
  });

  it('samples arbitrary nested levels with a zero-height outside apron', () => {
    const elevations = Uint8Array.from([
      0, 1, 1,
      0, 2, 3,
      0, 1, 2,
    ]);
    expect(maximumTerrainElevation(elevations)).toBe(3);
    expect(terrainElevationAt(elevations, 3, 3, 2, 1)).toBe(3);
    expect(terrainElevationAt(elevations, 3, 3, -1, 1)).toBe(0);
  });

  it('keeps logical level independent from a tileset projection profile', () => {
    expect(terrainProjectedDepthOffset(3, 3, 16)).toBe(144);
    expect(terrainProjectedDepthOffset(3, 1, 16)).toBe(48);
    expect(terrainProjectedDepthOffset(-3, 2, 16)).toBe(-96);
    expect(terrainProjectedDepthOffset(-3, 2, 16, 1)).toBe(-128);
    expect(minimumTerrainElevation(Int16Array.from([2, -3, 5]))).toBe(-3);
  });

  it('connects only the named contour endpoints in either direction', () => {
    const transition: TerrainTransition = {
      contourLevel: 2,
      kind: 'ladder',
      direction: 'up',
      lowerTileX: 4,
      lowerTileY: 6,
      upperTileX: 4,
      upperTileY: 5,
    };
    expect(terrainTransitionConnects(transition, 4, 6, 1, 4, 5, 2)).toBe(true);
    expect(terrainTransitionConnects(transition, 4, 5, 2, 4, 6, 1)).toBe(true);
    expect(terrainTransitionConnects(transition, 4, 6, 0, 4, 5, 1)).toBe(false);
    expect(terrainTransitionValid({ ...transition, upperTileX: 5 })).toBe(false);
  });

  it('allows walking only over slope/stair crossings while ladders stay interaction-driven', () => {
    const elevations = Uint8Array.from([0, 1]);
    const base = {
      contourLevel: 1,
      direction: 'right' as const,
      lowerTileX: 0,
      lowerTileY: 0,
      upperTileX: 1,
      upperTileY: 0,
    };
    expect(terrainWalkingStepAllowed(
      elevations, 2, 1, [{ ...base, kind: 'slope' }], 0, 0, 1, 0,
    )).toBe(true);
    expect(terrainWalkingStepAllowed(
      elevations, 2, 1, [{ ...base, kind: 'ladder' }], 0, 0, 1, 0,
    )).toBe(false);
  });

  it('treats a two-lane slope as an axial corridor instead of a side-entry teleport tile', () => {
    const elevations = Uint8Array.from([
      1, 1, 1, 1,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ]);
    const transitions: TerrainTransition[] = [1, 2].map((tileX) => ({
      contourLevel: 1,
      kind: 'slope',
      direction: 'up',
      lowerTileX: tileX,
      lowerTileY: 1,
      upperTileX: tileX,
      upperTileY: 0,
    }));
    expect(terrainWalkingStepAllowed(elevations, 4, 3, transitions, 1, 2, 1, 1)).toBe(true);
    expect(terrainWalkingStepAllowed(elevations, 4, 3, transitions, 1, 1, 1, 0)).toBe(true);
    expect(terrainWalkingStepAllowed(elevations, 4, 3, transitions, 1, 1, 2, 1)).toBe(true);
    expect(terrainWalkingStepAllowed(elevations, 4, 3, transitions, 0, 1, 1, 1)).toBe(false);
    expect(terrainWalkingStepAllowed(elevations, 4, 3, transitions, 1, 0, 0, 0)).toBe(false);
  });

  it('expands a three-level stair run into two ordinary lanes per contour', () => {
    const transitions = expandStairRun({
      x: 0, y: 3, direction: 'up', fromLevel: 0, toLevel: 3,
    });
    expect(transitions).toHaveLength(6);
    expect(transitions.map(({ contourLevel }) => contourLevel)).toEqual([1, 1, 2, 2, 3, 3]);
    const elevations = Int16Array.from([
      3, 3,
      2, 2,
      1, 1,
      0, 0,
    ]);
    for (let y = 3; y > 0; y -= 1) {
      expect(terrainWalkingStepAllowed(elevations, 2, 4, transitions, 0, y, 0, y - 1)).toBe(true);
      expect(terrainWalkingStepAllowed(elevations, 2, 4, transitions, 1, y, 1, y - 1)).toBe(true);
    }
  });

  it('expands an arbitrary-width ramp bank without changing its one-row-per-level course', () => {
    const transitions = expandStairRun({
      x: 3, y: 8, direction: 'up', fromLevel: 1, toLevel: 4, width: 4,
    });
    expect(transitions).toHaveLength(12);
    for (const contourLevel of [2, 3, 4]) {
      const course = transitions.filter((transition) => transition.contourLevel === contourLevel);
      expect(course.map(({ lowerTileX }) => lowerTileX)).toEqual([3, 4, 5, 6]);
      expect(new Set(course.map(({ lowerTileY }) => lowerTileY))).toEqual(new Set([10 - contourLevel]));
    }
  });
});

describe('rampPlacementFindings (owner stair rule: straight cliff edges only)', () => {
  const grid = (rows: readonly string[]) => (x: number, y: number) => Number(rows[y]?.[x] ?? '0');
  const slope = (x: number, lowerY: number, width = 2, contourLevel = 1): TerrainTransition[] =>
    Array.from({ length: width }, (_, lane) => ({ contourLevel, kind: 'slope' as const, direction: 'up' as const,
      lowerTileX: x + lane, lowerTileY: lowerY, upperTileX: x + lane, upperTileY: lowerY - 1 }));
  const issues = (rows: readonly string[], transitions: readonly TerrainTransition[]) =>
    rampPlacementFindings(transitions, grid(rows)).map((f) => f.issue);
  const plateau = ['0000000000', '0111111110', '0111111110', '0111111110', '0000000000', '0000000000'];

  it('accepts a run with the same cliff continuing two cells on both sides', () => {
    expect(issues(plateau, slope(4, 4))).toEqual([]);
  });
  it('refuses a run one column from a corner, at a plateau end, or on the corner itself', () => {
    expect(issues(plateau, slope(6, 4))).toEqual(['ramp_beside_corner']);
    expect(issues(plateau, slope(7, 4))).toEqual(['ramp_beside_cliff_end']);
    expect(issues(plateau, slope(1, 4))).toEqual(['ramp_beside_cliff_end']);
  });
  it('refuses a notch, a narrow spur and a carved corridor', () => {
    // Notch: the cells beside the run are raised, so no cliff face continues past it.
    expect(issues(['000000000', '011111110', '011111110', '011100110', '000000000'], slope(4, 3))).toEqual(['ramp_without_cliff']);
    expect(issues(['00000000', '01111110', '01111110', '00011000', '00000000'], slope(3, 4))).toEqual(['ramp_without_cliff']);
    // Corridor: the run climbs between raised walls that continue south of it.
    expect(issues(['0000000000', '0111111110', '0111111110', '0111111110', '0111001110', '0111001110', '0000000000'], slope(4, 4))).toEqual(['ramp_without_cliff']);
  });
  it('refuses stairs onto a ledge only one row deep', () => {
    expect(issues(['0000000000', '0000000000', '0111111110', '0000000000'], slope(4, 3))).toEqual(['ramp_cliff_too_shallow']);
  });
  it('checks every level of a multi-level stair run on a straight terrace', () => {
    const terrace = ['0000000000', '0222222220', '0222222220', '0111111110', '0000000000'];
    expect(rampPlacementFindings(expandStairRun({ x: 4, y: 4, direction: 'up', fromLevel: 0, toLevel: 2, width: 2 }), grid(terrace))).toEqual([]);
    // Upper level ends beside the run (its east flank is the corner block), and
    // where it ends the level-1 ledge is only one row deep.
    const corner = ['0000000000', '0222220000', '0222220000', '0111111110', '0000000000'];
    expect(rampPlacementFindings(expandStairRun({ x: 3, y: 4, direction: 'up', fromLevel: 0, toLevel: 2, width: 2 }), grid(corner)).map((f) => [f.contourLevel, f.issue]))
      .toEqual([[1, 'ramp_cliff_too_shallow'], [2, 'ramp_beside_corner']]);
  });
});

import { describe, expect, it } from 'vitest';
import {
  maximumTerrainElevation,
  terrainElevationAt,
  terrainProjectedDepthOffset,
  terrainTransitionConnects,
  terrainTransitionValid,
  terrainWalkingStepAllowed,
  type TerrainTransition,
} from './terrain-elevation.js';

describe('30§3 integer terrain elevation', () => {
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
});

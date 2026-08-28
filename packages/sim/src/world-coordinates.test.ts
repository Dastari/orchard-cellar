import { describe, expect, it } from 'vitest';
import {
  chunkLocalToTile,
  chunkTileBounds,
  floorDiv,
  floorMod,
  proceduralWorldCoordinateInExtent,
  spaceTileBoundsContains,
  tileChunkCoordinate,
  tileToChunkPoint,
} from './world-coordinates.js';

describe('signed world coordinate kernel', () => {
  it.each([
    [-17, -2, 15],
    [-16, -1, 0],
    [-1, -1, 15],
    [0, 0, 0],
    [15, 0, 15],
    [16, 1, 0],
  ] as const)('maps tile %i to chunk %i local %i', (tile, chunk, local) => {
    expect(floorDiv(tile, 16)).toBe(chunk);
    expect(floorMod(tile, 16)).toBe(local);
    expect(tileChunkCoordinate(tile)).toEqual({ chunk, local });
    expect(chunkLocalToTile(chunk, local)).toBe(tile);
  });

  it('round-trips both axes without assuming zero is a world edge', () => {
    expect(tileToChunkPoint({ spaceId: 7, tileX: -33, tileY: 32 })).toEqual({
      spaceId: 7,
      chunkX: -3,
      chunkY: 2,
      localX: 15,
      localY: 0,
    });
    const bounds = chunkTileBounds(-3, 2);
    expect(bounds).toEqual({ minTileX: -48, minTileY: 32, width: 16, height: 16 });
    expect(spaceTileBoundsContains(bounds, -33, 47)).toBe(true);
    expect(spaceTileBoundsContains(bounds, -32, 47)).toBe(false);
  });

  it('enforces the first signed procedural extent independently per axis', () => {
    expect(proceduralWorldCoordinateInExtent(-32_000, 32_000)).toBe(true);
    expect(proceduralWorldCoordinateInExtent(-32_001, 0)).toBe(false);
    expect(proceduralWorldCoordinateInExtent(0, 32_001)).toBe(false);
  });

  it('rejects unsafe or invalid coordinate arithmetic', () => {
    expect(() => floorDiv(1, 0)).toThrow('positive');
    expect(() => floorMod(Number.MAX_SAFE_INTEGER + 1, 16)).toThrow('safe integer');
    expect(() => chunkLocalToTile(0, 16)).toThrow('between 0 and 15');
  });
});

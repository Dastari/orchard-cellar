import type {TerrainArray} from './terrain.js';
import {terrainIndexAt} from './terrain-index.js';
/** Native16×48 wall ends at the blocked tile immediately north of a floor.
 * Never project its upper courses across another room or outside the map. */
export function residenceWallAt(terrain: Pick<TerrainArray, 'width' | 'height' | 'originX' | 'originY' | 'blocked'>, x: number, y: number): boolean {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  // The floor below and the top wall course (two rows up) must both lie in the map.
  const below = terrainIndexAt(terrain, x, y + 1);
  if (below < 0 || terrainIndexAt(terrain, x, y - 2) < 0) return false;
  return !terrain.blocked[below]
    && [0,1,2].every(offset => terrain.blocked[terrainIndexAt(terrain, x, y - offset)]);
}

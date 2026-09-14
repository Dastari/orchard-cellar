import type {TerrainArray} from './terrain.js';
/** Native16×48 wall ends at the blocked tile immediately north of a floor.
 * Never project its upper courses across another room or outside the map. */
export function residenceWallAt(terrain: Pick<TerrainArray, 'width' | 'height' | 'blocked'>, x: number, y: number): boolean {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= terrain.width || y < 2 || y + 1 >= terrain.height) return false;
  return !terrain.blocked[(y + 1) * terrain.width + x]
    && [0,1,2].every(offset => terrain.blocked[(y-offset)*terrain.width+x]);
}

import type { MapObjectTerrainSampler } from './map-object-presentation.js';
import {
  terrainElevationAtWorldFoot, terrainProjectedDepthAtFoot, terrainProjectedElevationAtFoot, terrainProjectedSortOffset, type TerrainArray,
} from './terrain-sampling.js';

/** Samples a `TerrainArray` (a whole map or a chunk window) for map-object light occluders.
 * Generator-free (static world S6): `live-map-runtime.ts` re-exports it for Studio. */
export const TERRAIN_ARRAY_MAP_OBJECT_SAMPLER: MapObjectTerrainSampler<TerrainArray> = Object.freeze({
  elevationAtWorldFoot: (terrain: TerrainArray, worldX: number, worldFootY: number) => terrainElevationAtWorldFoot(terrain, worldX, worldFootY),
  projectedDepthAtFoot: (terrain: TerrainArray, worldX: number, worldFootY: number) => terrainProjectedDepthAtFoot(terrain, worldX, worldFootY),
  projectedElevationAtFoot: (terrain: TerrainArray, worldX: number, worldFootY: number) => terrainProjectedElevationAtFoot(terrain, worldX, worldFootY),
  projectedSortOffset: (elevation: number) => terrainProjectedSortOffset(elevation),
});

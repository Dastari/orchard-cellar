import {terrainProjectedElevationAtFoot,terrainProjectedSortOffset,terrainProjectedDepthAtFoot,type TerrainArray} from '@orchard/engine/terrain';
import type {LightTrunkOccluder} from '@orchard/engine/light-occlusion';

export function lightCasterPainterOrder(
  terrain: TerrainArray, worldX: number, contactY: number, painterFootY: number, tie: string,
): NonNullable<LightTrunkOccluder['painterOrder']> {
  const elevation = terrainProjectedElevationAtFoot(terrain, worldX, contactY);
  return {
    footY: painterFootY - terrainProjectedDepthAtFoot(terrain, worldX, contactY),
    depthOffset: terrainProjectedSortOffset(elevation),
    elevationLayer: Math.ceil(Math.max(0, elevation - 0.001)),
    depthPhase: 'entity', tie,
  };
}

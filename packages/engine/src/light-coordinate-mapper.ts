import { LIGHT_HEIGHT_SUBUNITS_PER_LEVEL } from './lighting-types.js';
import { terrainProjectedDepthForElevation, terrainVisualProjectionRowsPerLevel, type TerrainArray } from './terrain.js';

/** All height conversions use the terrain's existing projection scale. */
export class LightCoordinateMapper {
  readonly pixelsPerHeightSubunit: number;
  constructor(readonly terrain: TerrainArray) {
    this.pixelsPerHeightSubunit = terrainVisualProjectionRowsPerLevel(terrain) * 16 / LIGHT_HEIGHT_SUBUNITS_PER_LEVEL;
  }
  heightAtLevel(level: number): number { return level * LIGHT_HEIGHT_SUBUNITS_PER_LEVEL; }
  heightForPixels(pixels: number): number { return Math.max(0, Math.round(pixels / this.pixelsPerHeightSubunit)); }
  projectionAtLevel(level: number): number { return terrainProjectedDepthForElevation(this.terrain, level); }
  projectedY(logicalY: number, level: number): number { return logicalY - this.projectionAtLevel(level); }
  logicalY(projectedY: number, level: number): number { return projectedY + this.projectionAtLevel(level); }
}

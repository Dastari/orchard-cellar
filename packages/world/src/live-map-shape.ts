import {
 MAP_SURFACE_KINDS, MAP_FEATURE_KINDS, MAP_COLLISION_OVERRIDES, TERRAIN_SURFACE_FAMILY_IDS,
 cellPartContourLevel, parseCellParts, type MapDocumentV3,
} from '@orchard/sim';

const height = (value: unknown): boolean => Number.isInteger(value) && Number(value) >= -32 && Number(value) <= 32;
const family = (value: unknown): boolean => typeof value === 'string' && /^[a-z0-9]+(?:_[a-z0-9]+)*$/u.test(value);

/** Validate bounded data, not terrain design. No contour compilation, neighbour
 * repair, art/topology matching, or map-wide footprint check belongs here. */
export function validateLiveMapShape(document: MapDocumentV3): void {
 if (!height(document.baseElevation)) throw new Error('map_height_invalid');
 for (const [key, cell] of Object.entries(document.cells)) {
  const [x,y] = key.split(',').map(Number);
  if (!/^\d+,\d+$/u.test(key) || !Number.isInteger(x) || !Number.isInteger(y)
   || x! < 0 || y! < 0 || x! >= document.width || y! >= document.height
   || (cell.elevation !== undefined && !height(cell.elevation))
   || (cell.surface !== undefined && !MAP_SURFACE_KINDS.includes(cell.surface))
   || (cell.feature !== undefined && !MAP_FEATURE_KINDS.includes(cell.feature))
   || (cell.collision !== undefined && !MAP_COLLISION_OVERRIDES.includes(cell.collision))
   || (cell.surfaceFamily !== undefined && !TERRAIN_SURFACE_FAMILY_IDS.includes(cell.surfaceFamily))
   || (cell.cliffFamily !== undefined && !family(cell.cliffFamily))) throw new Error('map_cell_invalid');
  const override = cell.terrainOverride;
  if (override !== undefined && (typeof override !== 'object' || override === null
   || !height(override.contourLevel)
   || (override.family !== undefined && !family(override.family))
   || (override.frameIndex !== undefined && (!Number.isInteger(override.frameIndex) || override.frameIndex < 0)))) throw new Error('map_override_invalid');
  // Cell part stack: bounded shape only. Frames are not matched to topology.
  if (cell.parts !== undefined) {
   const parts = parseCellParts(cell.parts);
   if (parts === null || (override !== undefined
    && parts.some(({slot}) => cellPartContourLevel(slot) !== null))) throw new Error('map_parts_invalid');
  }
 }
}

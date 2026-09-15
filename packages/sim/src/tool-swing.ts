import { directionUnitVector } from './tile-targeting.js';
import { SURVIVAL_CHUNK_TILES } from './survival-world.js';
import { TILE_SIZE_FIXED, type Direction, type Vec2Fixed } from './state.js';

export interface ToolSwingGeometry {
  readonly rangeFixed: number;
  readonly arcDegrees: number;
}

/** A sector anchored at the actor, independent of cursor or selected target. */
export function toolSwingContains(
  origin: Vec2Fixed, facing: Direction, target: Vec2Fixed, swing: ToolSwingGeometry,
): boolean {
  const dx = target.x - origin.x, dy = target.y - origin.y;
  const distance = Math.hypot(dx, dy);
  if (distance > swing.rangeFixed) return false;
  if (distance === 0) return true;
  const [x, y] = directionUnitVector(facing);
  return (dx * x + dy * y) / distance + 1e-12 >= Math.cos(swing.arcDegrees * Math.PI / 360);
}

export function toolSwingChunks(origin: Vec2Fixed, rangeFixed: number): readonly (readonly [number, number])[] {
  const size = SURVIVAL_CHUNK_TILES * TILE_SIZE_FIXED;
  const result: (readonly [number, number])[] = [];
  for (let y = Math.floor((origin.y - rangeFixed) / size); y <= Math.floor((origin.y + rangeFixed) / size); y += 1) {
    for (let x = Math.floor((origin.x - rangeFixed) / size); x <= Math.floor((origin.x + rangeFixed) / size); x += 1) result.push([x, y]);
  }
  return result;
}

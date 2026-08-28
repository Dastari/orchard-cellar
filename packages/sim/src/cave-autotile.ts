/** Frame order extracted from Cave_Walls.png's authored 3x3 excavation ring. */
export const CAVE_WALL_NORTH = 0;
export const CAVE_WALL_EAST = 1;
export const CAVE_WALL_SOUTH = 2;
export const CAVE_WALL_WEST = 3;
export const CAVE_WALL_NORTH_EAST = 4;
export const CAVE_WALL_SOUTH_EAST = 5;
export const CAVE_WALL_SOUTH_WEST = 6;
export const CAVE_WALL_NORTH_WEST = 7;

/** Cave_Walls.png's dark-solid-background ring. The excavated side is drawn
 * independently with Cave_Floor_Middle, so the dark half always faces out. */
export const CAVE_WALL_ATLAS_FRAMES = [19, 11, 5, 13, 18, 6, 4, 20] as const;

export type CaveExcavationSampler = (offsetX: number, offsetY: number) => boolean;

/** Resolve a solid cell bordering excavation to one authored wall face/corner. */
export function caveWallFrameFor(isDug: CaveExcavationSampler): number | null {
  if (isDug(0, 0)) return null;
  const north = isDug(0, -1);
  const east = isDug(1, 0);
  const south = isDug(0, 1);
  const west = isDug(-1, 0);
  if (north && east) return CAVE_WALL_NORTH_EAST;
  if (south && east) return CAVE_WALL_SOUTH_EAST;
  if (south && west) return CAVE_WALL_SOUTH_WEST;
  if (north && west) return CAVE_WALL_NORTH_WEST;
  if (north) return CAVE_WALL_NORTH;
  if (east) return CAVE_WALL_EAST;
  if (south) return CAVE_WALL_SOUTH;
  if (west) return CAVE_WALL_WEST;
  if (isDug(1, -1)) return CAVE_WALL_NORTH_EAST;
  if (isDug(1, 1)) return CAVE_WALL_SOUTH_EAST;
  if (isDug(-1, 1)) return CAVE_WALL_SOUTH_WEST;
  if (isDug(-1, -1)) return CAVE_WALL_NORTH_WEST;
  return null;
}

/** Selects the authored atlas frame while preserving the distinction between
 * a cardinal inset (excavation touches two sides) and a diagonal-only outset.
 * They share a topology role but require opposite-facing corner artwork. */
export function caveWallAtlasFrameFor(isDug: CaveExcavationSampler): number | null {
  if (isDug(0, 0)) return null;
  const north = isDug(0, -1);
  const east = isDug(1, 0);
  const south = isDug(0, 1);
  const west = isDug(-1, 0);
  // The lower-right 2x2 group supplies the matching dark exterior corners.
  if (north && east) return 26;
  if (south && east) return 33;
  if (south && west) return 32;
  if (north && west) return 25;
  if (north) return 19;
  if (east) return 11;
  if (south) return 5;
  if (west) return 13;
  if (isDug(1, -1)) return 18;
  if (isDug(1, 1)) return 6;
  if (isDug(-1, 1)) return 4;
  if (isDug(-1, -1)) return 20;
  return null;
}

export function caveFloorFrame(tileX: number, tileY: number, seed: number): number {
  return Math.abs(Math.imul(tileX + seed, 73_856_093) ^ Math.imul(tileY - seed, 19_349_663)) % 4;
}

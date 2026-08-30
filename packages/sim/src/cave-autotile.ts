import type { RaisedTerrainTileSet } from './raised-terrain-autotile.js';

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

/** Cave_Walls mapped onto the same semantic contour roles as Stone Cliff 1.
 * The dark side is untouched solid rock; the transparent/light side faces the
 * excavation. One logical elevation projects two height-bearing face rows. */
export const CAVE_RAISED_CLIFF_TILE_SET: RaisedTerrainTileSet = {
  edgeFrames: {
    top_left: 25,
    top: 19,
    top_right: 26,
    left: 13,
    right: 11,
    bottom_left: 32,
    bottom: 5,
    bottom_right: 33,
  },
  insetFrames: {
    inner_top_left: 20,
    inner_top_right: 18,
    inner_bottom_left: 6,
    inner_bottom_right: 4,
  },
  rampFrames: {},
  faceProfiles: {
    tall: {
      rows: [
        {
          id: 'wall',
          frames: [42, 43, 44],
          blocksMovement: true,
          blocksLight: true,
        },
        {
          id: 'lower_wall',
          frames: [49, 50, 51],
          blocksMovement: true,
          blocksLight: true,
        },
      ],
    },
  },
  edgeBlocksMovement: false,
  edgeBlocksLight: false,
  faceClearanceRows: 2,
};

/** Number of authored visual wall courses used to project one cellar contour. */
export function caveProjectedRowsPerLevel(): number {
  return CAVE_RAISED_CLIFF_TILE_SET.faceProfiles.tall?.rows
    .filter((row) => row.contributesHeight !== false).length ?? 0;
}

/** Builds the inverse of the outdoor elevation collision mask from a mutable
 * cellar excavation height field. Uncut rock is solid on both represented
 * planes; an excavated tile is open on the fixed cellar floor plane.
 *
 * The two authored south-wall courses overlap lower floor cells visually in
 * the same way that a cliff face can overlap an actor walking behind it. They
 * are not two additional floor blockers. Keeping collision owned by the
 * source rock cell means a one-tile lateral breach is immediately traversable
 * and gives the client and authority one unambiguous excavation rule. */
export function caveTerrainPlaneCollisionBytes(
  elevations: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const stride = width * height;
  if (elevations.length !== stride) {
    throw new Error(`Cave elevation field has ${elevations.length} cells; expected ${stride}`);
  }
  const blocked = new Uint8Array(stride * 2);
  for (let index = 0; index < stride; index += 1) {
    if ((elevations[index] ?? 1) < 1) continue;
    blocked[index] = 1;
    blocked[stride + index] = 1;
  }
  return blocked;
}

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
  const edge = CAVE_RAISED_CLIFF_TILE_SET.edgeFrames;
  const inset = CAVE_RAISED_CLIFF_TILE_SET.insetFrames;
  // Cardinal openings are the convex edge roles of this solid cell.
  if (north && east) return edge.top_right ?? null;
  if (south && east) return edge.bottom_right ?? null;
  if (south && west) return edge.bottom_left ?? null;
  if (north && west) return edge.top_left ?? null;
  if (north) return edge.top ?? null;
  if (east) return edge.right ?? null;
  if (south) return edge.bottom ?? null;
  if (west) return edge.left ?? null;
  // A diagonal opening with cardinal rock intact is a concave/inset role.
  if (isDug(1, -1)) return inset.inner_top_right ?? null;
  if (isDug(1, 1)) return inset.inner_bottom_right ?? null;
  if (isDug(-1, 1)) return inset.inner_bottom_left ?? null;
  if (isDug(-1, -1)) return inset.inner_top_left ?? null;
  return null;
}

export function caveFloorFrame(tileX: number, tileY: number, seed: number): number {
  return Math.abs(Math.imul(tileX + seed, 73_856_093) ^ Math.imul(tileY - seed, 19_349_663)) % 4;
}

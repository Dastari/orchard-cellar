import type { RaisedTerrainTileSet } from './raised-terrain-autotile.js';

/** Cave_Walls mapped onto the same semantic contour roles as Stone Cliff 1.
 * The dark side is untouched solid rock; the transparent/light side faces the
 * excavation. Rock is raised terrain at elevation one above the floor datum:
 * its rim and two face courses are displaced north by the face height, so a
 * player walks behind rock exactly as behind an outdoor cliff. */
export const CAVE_RAISED_CLIFF_TILE_SET: RaisedTerrainTileSet = {
  assetId: 'tile_cf_cave_wall',
  projectionStyle: 'interior',
  fixedPlane: 0,
  baseDatum: 0,
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
  rampFrames: {}, rampBank: null,
  stairFrames: null,
  ladderAssetId: 'tile_cf_cave_floor_ladder',
  ladderFrames: [0],
  faceProfiles: {
    tall: {
      rows: [
        // Cave_Walls columns 4-5 of rows 6-7 are the dark-outlined end caps;
        // column 1 is the seamless run and column 2 the protruding column.
        {
          id: 'wall',
          frames: [46, 43, 47],
          middleVariants: [44],
          blocksMovement: true,
          blocksLight: true,
        },
        {
          id: 'lower_wall',
          frames: [53, 50, 54],
          middleVariants: [51],
          blocksMovement: true,
          blocksLight: true,
        },
      ],
    },
  },
  edgeBlocksMovement: false,
  edgeBlocksLight: false,
  edgeInsetMode: 'exclusive',
  faceClearanceRows: 2,
};

/** Number of authored visual wall courses used to project one cellar contour. */
export function caveProjectedRowsPerLevel(): number {
  return CAVE_RAISED_CLIFF_TILE_SET.faceProfiles.tall?.rows
    .filter((row) => row.contributesHeight !== false).length ?? 0;
}

/** The authored cave support is five tiles wide and centred on its terrain
 * anchor. Only place it where the entire beam is backed by one continuous
 * raised row; otherwise it floats beyond small pillars and broken ridges. */
export function caveSupportFitsAt(
  solidAt: (tileX: number, tileY: number) => boolean,
  tileX: number,
  tileY: number,
): boolean {
  for (let offsetX = -2; offsetX <= 2; offsetX += 1) {
    if (!solidAt(tileX + offsetX, tileY)) return false;
  }
  return true;
}

const CAVE_WALL_SUPPORT_WIDTH_TILES = 5;
const CAVE_WALL_SUPPORT_GAP_TILES = 2;

/** Selects non-overlapping authored 5x2 wall supports from the complete run
 * of generated south-facing cave wall. Callers key the run on the lower wall
 * course, so the beam sits across the upper course and the posts reach the
 * floor. Placement is centred within the run,
 * so neither post can hang over a notch and the result is stable after cache
 * rebuilds. The wall callback deliberately describes resolved face topology,
 * not merely solid rock behind the sprite. */
export function caveWallSupportAnchorAt(
  wallFaceAt: (tileX: number, tileY: number) => boolean,
  tileX: number,
  tileY: number,
): boolean {
  if (!wallFaceAt(tileX, tileY)) return false;
  let firstTileX = tileX;
  let lastTileX = tileX;
  while (wallFaceAt(firstTileX - 1, tileY)) firstTileX -= 1;
  while (wallFaceAt(lastTileX + 1, tileY)) lastTileX += 1;
  const runLength = lastTileX - firstTileX + 1;
  if (runLength < CAVE_WALL_SUPPORT_WIDTH_TILES) return false;
  const supportCount = Math.max(1, Math.floor(
    (runLength + CAVE_WALL_SUPPORT_GAP_TILES)
      / (CAVE_WALL_SUPPORT_WIDTH_TILES + CAVE_WALL_SUPPORT_GAP_TILES),
  ));
  const occupiedWidth = supportCount * CAVE_WALL_SUPPORT_WIDTH_TILES
    + (supportCount - 1) * CAVE_WALL_SUPPORT_GAP_TILES;
  const firstAnchorX = firstTileX + Math.floor((runLength - occupiedWidth) / 2)
    + Math.floor(CAVE_WALL_SUPPORT_WIDTH_TILES / 2);
  const stride = CAVE_WALL_SUPPORT_WIDTH_TILES + CAVE_WALL_SUPPORT_GAP_TILES;
  return tileX >= firstAnchorX
    && (tileX - firstAnchorX) % stride === 0
    && tileX <= lastTileX - Math.floor(CAVE_WALL_SUPPORT_WIDTH_TILES / 2);
}

/** Builds the elevation-plane collision mask for a cellar excavation field.
 * Uncut rock remains solid on its raised plane. On the fixed cellar-floor
 * plane, its south boundary is projected north with the artwork: vacated rock
 * coverage is cleared first, then every blocking direct face course is written
 * at its projected destination. The visible two-course front wall therefore
 * blocks, while the first excavated floor row south of it remains open. */
export function caveTerrainPlaneCollisionBytes(
  elevations: Int16Array | Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const stride = width * height;
  if (elevations.length !== stride) {
    throw new Error(`Cave elevation field has ${elevations.length} cells; expected ${stride}`);
  }
  const blocked = new Uint8Array(stride * 2);
  for (let index = 0; index < stride; index += 1) {
    if ((elevations[index] ?? 1) >= 1) {
      blocked[index] = 1;
      blocked[stride + index] = 1;
    }
  }
  const projectionRows = caveProjectedRowsPerLevel();
  const faceRows = CAVE_RAISED_CLIFF_TILE_SET.faceProfiles.tall?.rows ?? [];
  const clearanceRows = Math.max(0, Math.trunc(
    CAVE_RAISED_CLIFF_TILE_SET.faceClearanceRows ?? 0,
  ));
  const solidAt = (tileX: number, tileY: number): boolean => tileX >= 0 && tileY >= 0
    && tileX < width && tileY < height
    && (elevations[tileY * width + tileX] ?? 1) >= 1;
  for (let tileY = 0; tileY < height; tileY += 1) {
    for (let tileX = 0; tileX < width; tileX += 1) {
      if (!solidAt(tileX, tileY)) continue;
      let ownsSouthFace = true;
      for (let depth = 1; depth <= clearanceRows; depth += 1) {
        if (solidAt(tileX, tileY + depth)) {
          ownsSouthFace = false;
          break;
        }
      }
      if (!ownsSouthFace) continue;
      for (let depth = 0; depth < projectionRows; depth += 1) {
        const underhangY = tileY - depth;
        if (underhangY >= 0 && solidAt(tileX, underhangY)) {
          blocked[underhangY * width + tileX] = 0;
        }
      }
      for (let depth = 1; depth <= faceRows.length; depth += 1) {
        if (faceRows[depth - 1]?.blocksMovement !== true) continue;
        const projectedFaceY = tileY + depth - projectionRows;
        if (projectedFaceY >= 0 && projectedFaceY < height) {
          blocked[projectedFaceY * width + tileX] = 1;
        }
      }
    }
  }
  return blocked;
}

export function caveFloorFrame(tileX: number, tileY: number, seed: number): number {
  return Math.abs(Math.imul(tileX + seed, 73_856_093) ^ Math.imul(tileY - seed, 19_349_663)) % 4;
}

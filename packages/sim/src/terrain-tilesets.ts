import { CAVE_RAISED_CLIFF_TILE_SET } from './cave-autotile.js';
import type {
  RaisedTerrainFaceProfile,
  RaisedTerrainLedgeBank,
  RaisedTerrainRampBank,
  RaisedTerrainTileSet,
} from './raised-terrain-autotile.js';

export type TerrainLedgeBank = RaisedTerrainLedgeBank;
import { SURVIVAL_RAISED_CLIFF_TILE_SET } from './survival-tileset.js';

export const TERRAIN_CLIFF_FAMILY_IDS = [
  'basic',
  'stone_1',
  'stone_2',
  'stone_3',
  'stone_4',
  'desert_1',
  'desert_2',
  'desert_3',
  'cave',
  'shroomlands',
  'volcanic',
  'volcanic_interior',
  'dungeon_1',
  'dungeon_2',
  'snow',
] as const;
export type CliffFamilyId = typeof TERRAIN_CLIFF_FAMILY_IDS[number];

export const TERRAIN_SURFACE_FAMILY_IDS = [
  'grass_1',
  'grass_2',
  'grass_3',
  'grass_4',
] as const;
export type TerrainSurfaceFamilyId = typeof TERRAIN_SURFACE_FAMILY_IDS[number];

export interface TerrainSurfaceFamily {
  /** Opaque continuous fill used beneath topology pieces. */
  readonly assetId: string;
  /** Full authored 16x10 family sheet. */
  readonly sheetAssetId: string;
  readonly fringeFrames: Readonly<Record<
    'top_left' | 'top' | 'top_right' | 'left' | 'right' | 'bottom_left' | 'bottom' | 'bottom_right',
    number
  >>;
  /** Both authored crossing materials from this grass palette. Cliff
   * families select the stone bank; tools may expose the wood alternative. */
  readonly rampBanks: {
    readonly wood: RaisedTerrainRampBank;
    readonly stone: RaisedTerrainRampBank;
  };
  readonly ledgeBank: TerrainLedgeBank;
}

function extractedRampBank(
  assetId: string,
  columns: number,
  rows: number,
  laneColumns = columns,
  intentionalRoleFrameReuse: readonly number[] = [],
): RaisedTerrainRampBank {
  if (laneColumns < 3 || laneColumns > columns || rows < 3) {
    throw new RangeError('Ramp-bank crops require left/middle/right lanes and a tread');
  }
  const course = (row: number) => ({
    left: row * columns,
    middle: Array.from({ length: laneColumns - 2 }, (_, column) => row * columns + column + 1),
    right: row * columns + laneColumns - 1,
  });
  return {
    assetId,
    crest: course(0),
    treads: Array.from({ length: rows - 2 }, (_, row) => course(row + 1)),
    base: course(rows - 1),
    intentionalRoleFrameReuse,
  };
}

function extractedLedgeBank(
  assetId: string,
  intentionalRoleFrameReuse: readonly number[] = [],
): RaisedTerrainLedgeBank {
  return {
    assetId,
    edgeFrames: {
      top_left: 0, top: 1, top_right: 2,
      left: 3, right: 4,
      bottom_left: 5, bottom: 6, bottom_right: 7,
    },
    insetFrames: {
      inner_bottom_right: 8, inner_bottom_left: 9,
      inner_top_right: 10, inner_top_left: 11,
    },
    intentionalRoleFrameReuse,
  };
}

function grassSurfaceFamily(variant: 1 | 2 | 3 | 4): TerrainSurfaceFamily {
  return {
    assetId: `tile_cf_grass_${variant}_middle`,
    sheetAssetId: `tile_cf_grass_${variant}_sheet`,
    // The first 3x3 bank is the authored grass fringe. The wide banks are
    // extracted from columns 8-11 (wood) and 12-15 (stone), rows 6-9.
    fringeFrames: {
      top_left: 0, top: 1, top_right: 2,
      left: 16, right: 18,
      bottom_left: 32, bottom: 33, bottom_right: 34,
    },
    rampBanks: {
      // Each source row is left rail | repeatable middle | right rail |
      // standalone one-lane bank. Cliff crossings intentionally remain at
      // least two lanes wide, so the standalone fourth column is extracted
      // for provenance but is not part of the composable bank.
      wood: extractedRampBank(`tile_cf_grass_${variant}_ramp_bank_wood`, 4, 4, 3, [12, 13, 14]),
      stone: extractedRampBank(`tile_cf_grass_${variant}_ramp_bank_stone`, 4, 4, 3, [12, 13, 14]),
    },
    // The source sheet's dedicated 2x2 inverse quartet is at columns 6-7,
    // rows 2-3 and follows the same ordering as the cliff inverse banks.
    ledgeBank: extractedLedgeBank(`tile_cf_grass_${variant}_ledge`),
  };
}

/** Surface artwork is independent from cliff-family topology. Keeping this
 * registry separate lets an authored grass palette coexist with any cliff. */
export const TERRAIN_SURFACE_FAMILIES = {
  grass_1: grassSurfaceFamily(1),
  grass_2: grassSurfaceFamily(2),
  grass_3: grassSurfaceFamily(3),
  grass_4: grassSurfaceFamily(4),
} as const satisfies Record<TerrainSurfaceFamilyId, TerrainSurfaceFamily>;

export function surfaceFamilyIndex(familyId: TerrainSurfaceFamilyId): number {
  return TERRAIN_SURFACE_FAMILY_IDS.indexOf(familyId) + 1;
}

export function surfaceFamilyAtIndex(index: number): TerrainSurfaceFamilyId | null {
  return index === 0 ? null : TERRAIN_SURFACE_FAMILY_IDS[index - 1] ?? null;
}

export interface TerrainCliffSubstrateRef {
  readonly assetId: string;
  readonly frame: number;
}

export interface TerrainCliffSubstrate {
  /** Native ground surrounding the formation; this is artwork guidance, not a biome restriction. */
  readonly surrounding: TerrainCliffSubstrateRef;
  /** Native continuous top material used underneath the rim and inside a plateau. */
  readonly cap: TerrainCliffSubstrateRef | null;
}

export interface AvailableTerrainCliffFamily {
  readonly available: true;
  readonly tileSet: RaisedTerrainTileSet;
  readonly substrate?: TerrainCliffSubstrate;
  /** A source gap is advisory: stable saved family IDs still resolve. */
  readonly sourceReview?: { readonly status: 'unverified'; readonly reason: string };
}

export interface ReservedTerrainCliffFamily {
  readonly available: false;
  readonly reason: string;
}

export type TerrainCliffFamily = AvailableTerrainCliffFamily | ReservedTerrainCliffFamily;

const solidProfile = (
  wall: readonly [number, number, number],
  lowerWall: readonly [number, number, number],
  foot: readonly [number, number, number],
): RaisedTerrainFaceProfile => ({
  rows: [
    { id: 'lower_wall', frames: lowerWall, blocksMovement: true, blocksLight: true },
    {
      id: 'foot',
      frames: foot,
      blocksMovement: false,
      blocksLight: false,
      contributesHeight: false,
    },
  ],
  repeatRow: { id: 'wall', frames: wall, blocksMovement: true, blocksLight: true },
});

function stoneFamily(assetId: string, grassVariant: 1 | 2 | 3 | 4): RaisedTerrainTileSet {
  const rampBank = TERRAIN_SURFACE_FAMILIES[`grass_${grassVariant}`].rampBanks.stone;
  return {
    ...SURVIVAL_RAISED_CLIFF_TILE_SET,
    assetId,
    insetAssetId: `tile_cf_stone_cliff_${grassVariant}_inverse_overlay`,
    rampFrames: {},
    rampBank,
    ledgeBank: TERRAIN_SURFACE_FAMILIES[`grass_${grassVariant}`].ledgeBank,
    stairFrames: null,
  };
}

function outdoorFamily(
  assetId: string,
  frames: {
    readonly top: readonly [number, number, number];
    readonly sides: readonly [number, number];
    readonly bottom: readonly [number, number, number];
    readonly wall: readonly [number, number, number];
    readonly lowerWall: readonly [number, number, number];
    readonly foot: readonly [number, number, number];
  },
): RaisedTerrainTileSet {
  return {
    assetId,
    projectionStyle: 'raised',
    baseDatum: 0,
    edgeFrames: {
      top_left: frames.top[0], top: frames.top[1], top_right: frames.top[2],
      left: frames.sides[0], right: frames.sides[1],
      bottom_left: frames.bottom[0], bottom: frames.bottom[1], bottom_right: frames.bottom[2],
    },
    insetFrames: {},
    rampFrames: {},
    rampBank: null,
    ledgeBank: null,
    stairFrames: null,
    ladderFrames: null,
    faceProfiles: { tall: solidProfile(frames.wall, frames.lowerWall, frames.foot) },
    edgeBlocksMovement: false,
    edgeBlocksLight: false,
  };
}

function interiorFamily(
  assetId: string,
  width: number,
  firstColumn: number,
): RaisedTerrainTileSet {
  const frame = (row: number, column: number): number => row * width + firstColumn + column;
  return {
    assetId,
    projectionStyle: 'interior',
    fixedPlane: 0,
    baseDatum: 1,
    edgeFrames: {
      top_left: frame(0, 0), top: frame(0, 1), top_right: frame(0, 2),
      left: frame(1, 0), right: frame(1, 2),
      bottom_left: frame(2, 0), bottom: frame(2, 1), bottom_right: frame(2, 2),
    },
    insetFrames: {},
    rampFrames: {},
    rampBank: null,
    ledgeBank: null,
    stairFrames: null,
    ladderFrames: null,
    faceProfiles: {
      tall: {
        rows: [
          { id: 'wall', frames: [frame(3, 0), frame(3, 1), frame(3, 2)], blocksMovement: true, blocksLight: true },
          { id: 'lower_wall', frames: [frame(4, 0), frame(4, 1), frame(4, 2)], blocksMovement: true, blocksLight: true },
        ],
      },
    },
    edgeBlocksMovement: false,
    edgeBlocksLight: false,
    faceClearanceRows: 2,
  };
}

const BASIC: RaisedTerrainTileSet = {
  assetId: 'tile_cf_basic_cliff', projectionStyle: 'raised', baseDatum: 0,
  projectionRowsPerLevel: 0,
  edgeFrames: {
    top_left: 0, top: 1, top_right: 2, left: 3, right: 5,
    bottom_left: 6, bottom: 7, bottom_right: 8,
  },
  insetFrames: {
    inner_bottom_right: 9, inner_bottom_left: 10,
    inner_top_right: 12, inner_top_left: 13,
  },
  rampFrames: {}, rampBank: null, ledgeBank: TERRAIN_SURFACE_FAMILIES.grass_1.ledgeBank,
  stairFrames: null, ladderFrames: null,
  // The free 3x6 sheet is a flat surface rim with no authored vertical wall
  // bank. Keep its projection contract at zero instead of emitting invisible
  // face rows or reusing its bottom cap as a fake cliff face.
  faceProfiles: { tall: { rows: [] } },
  edgeBlocksMovement: false, edgeBlocksLight: false,
};
const DESERT_BASE = outdoorFamily('tile_cf_desert_cliff', {
  // Source courses are rim, sides, crest, repeat wall, terminal wall.
  // The next source row begins a separate compact lip bank, not a foot.
  top: [14, 15, 16], sides: [27, 29], bottom: [40, 41, 42],
  wall: [53, 54, 55], lowerWall: [66, 67, 68], foot: [79, 80, 81],
});
function desertFamily(variant: 1 | 2 | 3): RaisedTerrainTileSet {
  return {
    ...DESERT_BASE,
    faceProfiles: {
      tall: {
        rows: [{ id: 'lower_wall', frames: [66, 67, 68], blocksMovement: true, blocksLight: true }],
        repeatRow: { id: 'wall', frames: [53, 54, 55], blocksMovement: true, blocksLight: true },
      },
    },
    assetId: `tile_cf_desert_cliff${variant === 1 ? '' : `_${variant}`}`,
    insetFrames: {
      inner_bottom_right: 95, inner_bottom_left: 96,
      inner_top_right: 108, inner_top_left: 109,
    },
    rampFrames: {},
    rampBank: extractedRampBank(`tile_cf_desert_${variant}_ramp_bank`, 3, 3),
    ledgeBank: extractedLedgeBank(`tile_cf_desert_${variant}_ledge`),
    stairFrames: null,
    waterfallAssetId: `tile_cf_desert_waterfall_${variant}`,
    // The compact lip bank deliberately shares its top and inverse quadrants
    // with these authored primary-sheet roles.
    intentionalRoleFrameReuse: [14, 15, 16, 79, 80, 81, 95, 96, 108, 109],
  };
}
const SHROOMLANDS_BASE = outdoorFamily('tile_cf_shroomlands_cliff', {
  top: [0, 1, 2], sides: [9, 11], bottom: [18, 19, 20],
  wall: [27, 28, 29], lowerWall: [36, 37, 38], foot: [45, 46, 47],
});
const SHROOMLANDS: RaisedTerrainTileSet = {
  ...SHROOMLANDS_BASE,
  // The native inverse cliff quartet is columns 3–4, rows 0–1. The
  // similarly arranged salmon path quartet much farther below is unrelated.
  insetFrames: {
    inner_bottom_right: 3, inner_bottom_left: 4,
    inner_top_right: 12, inner_top_left: 13,
  },
  rampFrames: {},
  // As on the grass sheets, source column four is a standalone one-lane
  // bank and is not a composable lane in the minimum-two-wide crossing.
  rampBank: extractedRampBank('tile_cf_shroomlands_ramp_bank', 4, 3, 3),
  ledgeBank: extractedLedgeBank('tile_cf_shroomlands_ledge'),
  stairFrames: null,
  waterfallAssetId: 'tile_cf_shroomlands_waterfall',
  intentionalRoleFrameReuse: [0, 1, 9, 11, 45, 46, 47],
};
const VOLCANIC_BASE = outdoorFamily('tile_cf_volcanic_cliff', {
  top: [0, 1, 2], sides: [3, 5], bottom: [6, 7, 8],
  wall: [6, 7, 8], lowerWall: [9, 10, 11], foot: [12, 13, 14],
});
const VOLCANIC: RaisedTerrainTileSet = {
  ...VOLCANIC_BASE,
  // The last native course is solid column material, not a transparent foot
  // shadow. It participates in height and collision like the course above.
  faceProfiles: {
    tall: {
      rows: [
        { id: 'wall', frames: [9, 10, 11], blocksMovement: true, blocksLight: true },
        { id: 'lower_wall', frames: [12, 13, 14], blocksMovement: true, blocksLight: true },
      ],
      repeatRow: { id: 'wall', frames: [6, 7, 8], blocksMovement: true, blocksLight: true },
    },
  },
  insetFrames: {
    inner_bottom_right: 15, inner_bottom_left: 16,
    inner_top_right: 17, inner_top_left: 18,
  },
  rampFrames: {},
  rampBank: extractedRampBank('tile_cf_volcanic_ramp_bank', 3, 3),
  // The pack has no separate volcanic lip bank. These four corner lips are
  // explicit copies of volcanic_interior_wall frames 15..18.
  ledgeBank: extractedLedgeBank('tile_cf_volcanic_ledge', [0, 2, 5, 7]),
  stairFrames: null,
  waterfallAssetId: 'tile_cf_volcanic_lavafall',
  intentionalRoleFrameReuse: [6, 7, 8, 12, 13, 14, 15, 16, 17, 18],
};

function dungeonFamily(assetId: string, insetRow: 9 | 10): RaisedTerrainTileSet {
  const frame = (row: number, column: number): number => row * 13 + column;
  const dungeonTwo = assetId === 'tile_cf_dungeon_2_wall';
  return {
    ...interiorFamily(assetId, 13, 4),
    ...(dungeonTwo ? {
      edgeFrames: {
        ...interiorFamily(assetId, 13, 4).edgeFrames,
        // The dark ring's source bottom is byte-identical to its top. The
        // authored masonry contact strip on row 4 is the distinct lower cap.
        bottom_left: 62, bottom: 63, bottom_right: 64,
      },
    } : {}),
    insetFrames: {
      inner_bottom_right: frame(insetRow, 4), inner_bottom_left: frame(insetRow, 6),
      inner_top_right: frame(insetRow + 2, 4), inner_top_left: frame(insetRow + 2, 6),
    },
    ladderAssetId: 'tile_cf_cave_floor_ladder',
    ladderFrames: [0],
    faceProfiles: {
      tall: {
        rows: [
          { id: 'wall', frames: [82, 83, 84], blocksMovement: true, blocksLight: true },
          { id: 'lower_wall', frames: dungeonTwo ? [88, 89, 90] : [95, 96, 97], blocksMovement: true, blocksLight: true },
        ],
      },
    },
  };
}

function cliffSubstrate(assetId: string, capFrame = 0, surroundingFrame = capFrame): TerrainCliffSubstrate {
  return {
    surrounding: { assetId, frame: surroundingFrame },
    cap: { assetId, frame: capFrame },
  };
}

/** Every supported cliff sheet has one semantic entry. Snow deliberately
 * remains a reserved id because the checked Christmas pack contains ground
 * overlays but no cliff source sheet. */
export const TERRAIN_CLIFF_FAMILIES = {
  basic: { available: true, tileSet: BASIC, substrate: cliffSubstrate('tile_cf_grass_1_middle') },
  stone_1: { available: true, tileSet: stoneFamily('tile_cf_stone_cliff_variants', 1), substrate: cliffSubstrate('tile_cf_grass_1_middle') },
  stone_2: { available: true, tileSet: stoneFamily('tile_cf_stone_cliff_2', 2), substrate: cliffSubstrate('tile_cf_grass_2_middle') },
  stone_3: { available: true, tileSet: stoneFamily('tile_cf_stone_cliff_3', 3), substrate: cliffSubstrate('tile_cf_grass_3_middle') },
  stone_4: { available: true, tileSet: stoneFamily('tile_cf_stone_cliff_4', 4), substrate: cliffSubstrate('tile_cf_grass_4_middle') },
  desert_1: { available: true, tileSet: desertFamily(1), substrate: cliffSubstrate('tile_cf_desert_cliff', 139, 128) },
  desert_2: { available: true, tileSet: desertFamily(2), substrate: cliffSubstrate('tile_cf_desert_cliff_2', 139, 128) },
  desert_3: { available: true, tileSet: desertFamily(3), substrate: cliffSubstrate('tile_cf_desert_cliff_3', 139, 128) },
  cave: {
    available: true,
    tileSet: CAVE_RAISED_CLIFF_TILE_SET,
    substrate: { surrounding: { assetId: 'tile_cf_cave_floor_middle', frame: 0 }, cap: null },
  },
  shroomlands: { available: true, tileSet: SHROOMLANDS, substrate: cliffSubstrate('tile_cf_shroomlands_cliff', 39) },
  volcanic: { available: true, tileSet: VOLCANIC, substrate: cliffSubstrate('tile_cf_volcanic_cliff', 4) },
  volcanic_interior: {
    available: true,
    substrate: { surrounding: { assetId: 'tile_cf_rogue_volcanic_floor', frame: 4 }, cap: null },
    sourceReview: {
      status: 'unverified',
      reason: 'Legacy primary bank imports staircase columns 22–24 from Volcano_Tiles.png. A complete inverse wall assembly has not been verified; preserve saved IDs without advertising this as a valid authoring bank.',
    },
    tileSet: {
      ...interiorFamily('tile_cf_volcanic_interior_wall', 3, 0),
      faceProfiles: {
        tall: {
          rows: [
            { id: 'wall', frames: [12, 13, 14], blocksMovement: true, blocksLight: true },
            { id: 'lower_wall', frames: [6, 7, 8], blocksMovement: true, blocksLight: true },
          ],
        },
      },
      intentionalRoleFrameReuse: [6, 7, 8, 15, 16, 17, 18],
      insetFrames: {
        inner_bottom_right: 15, inner_bottom_left: 16,
        inner_top_right: 17, inner_top_left: 18,
      },
      ladderAssetId: 'tile_cf_cave_floor_ladder', ladderFrames: [0],
    },
  },
  dungeon_1: { available: true, tileSet: dungeonFamily('tile_cf_dungeon_1_wall', 10), substrate: { surrounding: { assetId: 'tile_cf_dungeon_1_wall', frame: 24 }, cap: null } },
  dungeon_2: { available: true, tileSet: dungeonFamily('tile_cf_dungeon_2_wall', 9), substrate: { surrounding: { assetId: 'tile_cf_dungeon_2_wall', frame: 24 }, cap: null } },
  snow: {
    available: false,
    reason: 'Reserved: the checked Christmas reference pack contains no snow cliff sheet.',
  },
} as const satisfies Record<CliffFamilyId, TerrainCliffFamily>;

export function terrainCliffTileSet(familyId: string): RaisedTerrainTileSet | null {
  const family = (TERRAIN_CLIFF_FAMILIES as Readonly<Record<string, TerrainCliffFamily>>)[familyId];
  return family?.available === true ? family.tileSet : null;
}

export function cliffFamilyIndex(familyId: CliffFamilyId): number {
  // Zero is reserved for "unset" so sparse/zero-filled per-cell channels
  // inherit the declared map family instead of silently selecting `basic`.
  return TERRAIN_CLIFF_FAMILY_IDS.indexOf(familyId) + 1;
}

export function cliffFamilyAtIndex(index: number): CliffFamilyId | null {
  return index === 0 ? null : TERRAIN_CLIFF_FAMILY_IDS[index - 1] ?? null;
}

export function cliffFamilyForProceduralFamily(family: string): CliffFamilyId {
  if (family === 'desert_cliff_1' || family === 'desert_1') return 'desert_1';
  if (family === 'desert_cliff_2' || family === 'desert_2') return 'desert_2';
  if (family === 'desert_cliff_3' || family === 'desert_3') return 'desert_3';
  if (family === 'shroomlands' || family.startsWith('shroom_')) return 'shroomlands';
  if (family === 'volcanic') return 'volcanic';
  if (family === 'snow_highland') return 'snow';
  if (family === 'temperate_woodland') return 'stone_2';
  if (family === 'temperate_plains') return 'stone_3';
  if (family === 'temperate_highland') return 'stone_4';
  return 'stone_1';
}

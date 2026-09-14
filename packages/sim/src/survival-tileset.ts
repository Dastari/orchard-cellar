import type { RaisedTerrainTileSet } from './raised-terrain-autotile.js';

/** Stone Cliff 1's topology and collision profile is shared by authority and
 * client. Frame ids remain tileset data; logical elevation never depends on
 * them. */
export const SURVIVAL_RAISED_CLIFF_TILE_SET: RaisedTerrainTileSet = {
  assetId: 'tile_cf_stone_cliff_variants',
  insetAssetId: 'tile_cf_stone_cliff_inverse_overlay',
  waterfallAssetId: 'tile_cf_waterfall',
  projectionStyle: 'raised',
  baseDatum: 0,
  edgeFrames: {
    top_left: 1, top: 2, top_right: 3,
    left: 15, right: 17,
    bottom_left: 29, bottom: 30, bottom_right: 31,
  },
  faceProfiles: {
    tall: {
      rows: [
        { id: 'lower_wall', frames: [57, 58, 59], blocksMovement: true, blocksLight: true },
        {
          id: 'foot', frames: [71, 72, 73], blocksMovement: false, blocksLight: false,
          contributesHeight: false,
        },
      ],
      repeatRow: { id: 'wall', frames: [43, 44, 45], blocksMovement: true, blocksLight: true },
    },
  },
  // Each elevation level contributes one physical wall course. The terminal
  // course uses lower_wall + foot; higher exposed levels repeat wall.
  edgeBlocksMovement: false,
  edgeBlocksLight: false,
  insetFrames: {
    inner_bottom_right: 0,
    inner_bottom_left: 1,
    inner_top_right: 2,
    inner_top_left: 3,
  },
  rampFrames: {},
  rampBank: {
    assetId: 'tile_cf_grass_1_ramp_bank_stone',
    crest: { left: 0, middle: [1, 2], right: 3 },
    treads: [{ left: 4, middle: [5, 6], right: 7 }],
    base: { left: 8, middle: [9, 10], right: 11 },
  },
  stairFrames: null,
  ladderFrames: null,
};

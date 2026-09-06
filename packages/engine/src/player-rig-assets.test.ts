import { describe, expect, it } from 'vitest';
import {
  PLAYER_RIG_CORE_ASSETS,
  PLAYER_RIG_HAIR_ASSETS,
  PLAYER_RIG_PANTS_ASSETS,
  PLAYER_RIG_SHIRT_ASSETS,
  PLAYER_RIG_SHOE_ASSETS,
  playerRigAssetEntry,
} from './player-rig-assets.js';

describe('shared player rig asset contract', () => {
  it('contains the live default layers used by character tools', () => {
    expect(PLAYER_RIG_CORE_ASSETS.base[2]).toBe('action_cf_base');
    expect(playerRigAssetEntry(PLAYER_RIG_HAIR_ASSETS, 'hair_1_brown')[1]).toBe('player_cf_hair');
    expect(playerRigAssetEntry(PLAYER_RIG_SHIRT_ASSETS, 'farmer_green')[3]).toBe('action_cf_shirt_farmer_green');
    expect(playerRigAssetEntry(PLAYER_RIG_PANTS_ASSETS, 'farmer_white_brown')[1]).toBe('player_cf_farmer_pants');
    expect(playerRigAssetEntry(PLAYER_RIG_SHOE_ASSETS, 'brown')[3]).toBe('action_cf_shoes_brown');
  });
});

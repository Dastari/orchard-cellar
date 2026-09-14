export type PlayerRigAssetTuple = readonly [
  standing: string,
  mounted: string,
  action: string,
];
export type PlayerRigAssetEntry = readonly [appearance: string, ...assets: PlayerRigAssetTuple];

/**
 * Generated-asset contract shared by the live player renderer and isolated
 * character tools. This describes asset identity only; experimental armor
 * equipment remains outside the live-game model.
 */
export const PLAYER_RIG_CORE_ASSETS = {
  base: ['player_cf_base', 'rider_cf_base', 'action_cf_base'],
  hands: ['player_cf_hands', 'rider_cf_hands', 'action_cf_hands'],
} as const satisfies Readonly<Record<string, PlayerRigAssetTuple>>;

export const PLAYER_RIG_HAIR_ASSETS = [
  ['hair_1_brown', 'player_cf_hair', 'rider_cf_hair', 'action_cf_hair_1_brown'],
  ['hair_2_black', 'player_cf_hair_2_black', 'rider_cf_hair_2_black', 'action_cf_hair_2_black'],
  ['hair_3_blonde', 'player_cf_hair_3_blonde', 'rider_cf_hair_3_blonde', 'action_cf_hair_3_blonde'],
  ['hair_4_ginger', 'player_cf_hair_4_ginger', 'rider_cf_hair_4_ginger', 'action_cf_hair_4_ginger'],
  ['hair_5_grey', 'player_cf_hair_5_grey', 'rider_cf_hair_5_grey', 'action_cf_hair_5_grey'],
  ['hair_6_brown', 'player_cf_hair_6_brown', 'rider_cf_hair_6_brown', 'action_cf_hair_6_brown'],
] as const satisfies readonly PlayerRigAssetEntry[];

export const PLAYER_RIG_SHIRT_ASSETS = [
  ['farmer_green', 'player_cf_farmer_shirt', 'rider_cf_farmer_shirt', 'action_cf_shirt_farmer_green'],
  ['farmer_blue', 'player_cf_shirt_farmer_blue', 'rider_cf_shirt_farmer_blue', 'action_cf_shirt_farmer_blue'],
  ['farmer_orange', 'player_cf_shirt_farmer_orange', 'rider_cf_shirt_farmer_orange', 'action_cf_shirt_farmer_orange'],
  ['farmer_purple', 'player_cf_shirt_farmer_purple', 'rider_cf_shirt_farmer_purple', 'action_cf_shirt_farmer_purple'],
  ['farmer_red', 'player_cf_shirt_farmer_red', 'rider_cf_shirt_farmer_red', 'action_cf_shirt_farmer_red'],
  ['farmer_white_brown', 'player_cf_shirt_farmer_white_brown', 'rider_cf_shirt_farmer_white_brown', 'action_cf_shirt_farmer_white_brown'],
] as const satisfies readonly PlayerRigAssetEntry[];

export const PLAYER_RIG_PANTS_ASSETS = [
  ['farmer_white_brown', 'player_cf_farmer_pants', 'rider_cf_farmer_pants', 'action_cf_pants_farmer_white_brown'],
  ['farmer_black', 'player_cf_pants_farmer_black', 'rider_cf_pants_farmer_black', 'action_cf_pants_farmer_black'],
  ['farmer_blue', 'player_cf_pants_farmer_blue', 'rider_cf_pants_farmer_blue', 'action_cf_pants_farmer_blue'],
  ['farmer_green', 'player_cf_pants_farmer_green', 'rider_cf_pants_farmer_green', 'action_cf_pants_farmer_green'],
  ['farmer_red', 'player_cf_pants_farmer_red', 'rider_cf_pants_farmer_red', 'action_cf_pants_farmer_red'],
] as const satisfies readonly PlayerRigAssetEntry[];

export const PLAYER_RIG_SHOE_ASSETS = [
  ['brown', 'player_cf_shoes', 'rider_cf_shoes', 'action_cf_shoes_brown'],
  ['black', 'player_cf_shoes_black', 'rider_cf_shoes_black', 'action_cf_shoes_black'],
  ['blue', 'player_cf_shoes_blue', 'rider_cf_shoes_blue', 'action_cf_shoes_blue'],
  ['green', 'player_cf_shoes_green', 'rider_cf_shoes_green', 'action_cf_shoes_green'],
  ['red', 'player_cf_shoes_red', 'rider_cf_shoes_red', 'action_cf_shoes_red'],
] as const satisfies readonly PlayerRigAssetEntry[];

export function playerRigAssetEntry(
  entries: readonly PlayerRigAssetEntry[],
  appearance: string,
): PlayerRigAssetEntry {
  const entry = entries.find(([kind]) => kind === appearance);
  if (entry === undefined) throw new Error(`Missing generated player rig appearance: ${appearance}`);
  return entry;
}

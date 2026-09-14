/** Single-sprite legacy landmark sources shared by rendering and map export.
 * Procedural lines, crops, fences, animals and variant families need separate bounds. */
export const LEGACY_LANDMARK_ASSET_NAMES={
  poi_flowers_pink:'prop_cf_flowers_pink',poi_flowers_gold:'prop_cf_flowers_gold',
  poi_stump:'prop_cf_poi_stump',poi_fallen_log:'prop_cf_poi_fallen_log',poi_rock_small:'prop_cf_poi_rock_small',
  camp_tent:'prop_cf_camp_tent',homestead_tent_marker:'prop_cf_homestead_tent_marker',homestead_tent_large:'prop_cf_homestead_tent_large',
  camp_campfire:'prop_cf_campfire',camp_round_stool:'prop_cf_camp_round_stool',camp_bench:'prop_cf_camp_bench',
  camp_stump_seat:'prop_cf_camp_stump_seat',camp_chair:'prop_cf_camp_chair',camp_fishing_rod:'prop_cf_camp_fishing_rod',
  camp_pond:'prop_cf_pond',camp_rock:'prop_cf_poi_rock_small',camp_flowers:'prop_cf_flowers_pink',
  farm_house:'building_cf_farmhouse',farm_hay_bale:'prop_cf_farm_hay_bale',farm_hay_stack:'prop_cf_farm_hay_stack',
  farm_potted_flowers:'prop_cf_farm_potted_flowers',farm_grave:'prop_farmer_jane_grave',
  fisher_hut:'building_cf_fisherman_hut',fisher_dock:'prop_cf_fishing_dock',
  farm_stump:'prop_cf_poi_stump',farm_fallen_log:'prop_cf_poi_fallen_log',
  residence_trapdoor:'prop_cf_trapdoor',residence_door:'prop_cf_interior_door',residence_bed:'prop_cf_interior_bed',
  residence_bookshelf:'prop_cf_interior_bookshelf',marlow_tent_table:'prop_cf_interior_table',
  cellar_ladder:'prop_cf_cellar_ladder',cellar_support:'prop_cf_cave_support',
} as const;

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

it('keeps procedural runtime-kind catalogs out of survival-world source', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../../sim/src/survival-world.ts'), 'utf8');
  for (const runtimeKind of [
    'tree_oak', 'tree_birch', 'tree_spruce', 'tree_acacia', 'tree_palm',
    'tree_apple', 'tree_pear', 'tree_peach', 'tree_cherry',
    'ore_iron', 'ore_copper', 'ore_gold', 'ore_emerald',
    'ore_sapphire', 'ore_topaz', 'ore_ruby', 'ore_amethyst',
    'rock_large', 'loose_stone', 'fallen_branch', 'fish_pool',
  ]) {
    expect(source).not.toMatch(new RegExp(`['"]${runtimeKind}['"]`, 'u'));
  }
  expect(source).not.toContain('SURFACE_GEM_KINDS');
});

it('keeps retired landmark coordinate catalogs out of simulation source', () => {
  const source = readFileSync(resolve(import.meta.dirname, '../../sim/src/survival-world.ts'), 'utf8');
  for (const retired of [
    'MARLOW_CAMP', 'MARLOW_CAMPFIRE_TILE', 'FARMER_BOB_FARM', 'FARMER_JANE_GRAVE_TILE',
    'FARMER_BOB_HAY_TILES', 'FARMER_BOB_COW_SPAWNS', 'FISHERMAN_CAMP',
    'FISHERMAN_DOCK_WALKABLE_TILES', 'SURVIVAL_AUTHORED_LANDMARK_GROUP_IDS',
    'SurvivalAuthoredLandmarkGroupId', 'survivalMarlowCampReservedAt',
    'survivalFarmerBobFarmReservedAt', 'survivalFishermanCampReservedAt',
    'generateMarlowCampDecorations', 'generateFarmerBobFarmDecorations',
    'generateFishermanCampDecorations',
  ]) expect(source).not.toContain(retired);
});

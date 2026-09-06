import { describe, expect, it } from 'vitest';
import {
  CAMPFIRE_COOKING_RECIPES,
  CROP_DEFINITIONS,
  DEBUG_SPACE_ID,
  EFFECT_DEFINITIONS,
  HOMESTEAD_UPGRADE_DEFINITIONS,
  ITEM_DEFINITIONS,
  ITEM_ECONOMY,
  MERCHANT_OFFERS,
  PLAYER_STATISTIC_DEFINITIONS,
  RECIPES,
  SMELTING_RECIPES,
  SKILL_NODE_DEFINITIONS,
  SPACES,
  TOOL_DURABILITY_BALANCE,
  TOOL_VIGOUR_BALANCE,
  TILE_SIZE_FIXED,
  WILDLIFE_DEFINITIONS,
  WILDLIFE_SPAWN_PLANS,
} from '../index.js';
import { bootstrapContentRows } from './bootstrap-registry.js';
import { buildContentRegistry } from './registry.js';
import {
  runtimeCookingRecipe,
  runtimeCreatureDefinition,
  runtimeCropDefinition,
  runtimeCropDefinitionForSeed,
  runtimeEffectDefinition,
  runtimeFoodRestoreCenti,
  runtimeFuelSmelts,
  runtimeDurabilityDefinition,
  runtimeNormalizeDurability,
  runtimeWearTool,
  runtimeVigourDefinition,
  runtimeCanUseToolWithSkillRanks,
  runtimeItemAvatarAction,
  runtimeIsRecoverableProjectileItem,
  runtimeToolDefinition,
  runtimeToolQualityRequiredRanks,
  runtimeToolReachFixed,
  runtimeToolSpecialization,
  runtimeToolTier,
  runtimeItemHasTag,
  runtimeItemDefinition,
  runtimeItemEconomy,
  runtimeItemInventoryCapacity,
  runtimeItemIsDroppable,
  runtimeItemPurchaseGrant,
  runtimeItemPurchaseRequirement,
  runtimeItemSalePremium,
  runtimeMaxStack,
  runtimeMerchantOffers,
  runtimeMatchingRecipeId,
  runtimeCraftingRecipeOutput,
  runtimeRecipeIdsUnlockedByBook,
  runtimeRecipeDefinition,
  runtimeRangedWeaponDefinition,
  runtimeSkillNodes,
  runtimeSmeltingOutput,
  runtimeSpaceDefinition,
  runtimeSpawnPlans,
  runtimeStatisticDefinition,
  runtimeUpgradeDefinition,
} from './runtime.js';

describe('live content runtime projection', () => {
  const registry = buildContentRegistry(bootstrapContentRows()).registry;

  it('replaces item, economy, and recipe literal lookups without changing bootstrap behavior', () => {
    expect(runtimeItemDefinition(registry, 'wood')).toEqual(ITEM_DEFINITIONS.wood);
    expect(runtimeMaxStack(registry, 'wood')).toBe(ITEM_DEFINITIONS.wood!.maxStack);
    expect(runtimeItemEconomy(registry, 'wood')).toEqual(ITEM_ECONOMY.wood);
    expect(runtimeRecipeDefinition(registry, 'planks')).toEqual(RECIPES.planks);
    expect(runtimeFoodRestoreCenti(registry, 'beetroot')).toBeGreaterThan(0);
    expect(runtimeFoodRestoreCenti(registry, 'wood')).toBeNull();
  });

  it('adopts published recipe and item-lifecycle revisions for matching, output, and unlocks', () => {
    const rows = bootstrapContentRows().map((row) => {
      const definition = JSON.parse(String(row.json)) as Record<string, unknown>;
      if (row.id === 'recipe:planks') return { ...row, json: JSON.stringify({
        ...definition, output: { item: 'item:plank', count: 7 },
      }) };
      if (row.id === 'item:fishing_handbook') return { ...row, json: JSON.stringify({
        ...definition,
        onUse: [{
          id: 'read', prompt: 'READ', conditions: [],
          effects: [
            { learnRecipes: ['recipe:fishing_rod', 'recipe:planks', 'process:cook_fish'] },
            { consumeSelected: 1 },
          ],
        }],
      }) };
      return row;
    });
    const published = buildContentRegistry(rows).registry;
    const grid = { id: 'crafting', capacity: 9, slots: [
      { itemKind: 'wood', quantity: 1 }, null, null,
      null, null, null, null, null, null,
    ] };
    expect(runtimeMatchingRecipeId(published, grid)).toBe('planks');
    expect(runtimeCraftingRecipeOutput(published, 'planks')).toEqual({ itemKind: 'plank', quantity: 7 });
    expect(runtimeRecipeIdsUnlockedByBook(published, 'fishing_handbook')).toContain('planks');
  });

  it('replaces shop, smelting, and cooking literal lookups', () => {
    expect(runtimeMerchantOffers(registry, 'general_tools')).toEqual(MERCHANT_OFFERS.general_tools);
    expect(runtimeMerchantOffers(registry, 'missing')).toEqual([]);
    expect(runtimeSmeltingOutput(registry, 'copper_ore')).toBe(SMELTING_RECIPES.copper_ore);
    const cooking = Object.values(CAMPFIRE_COOKING_RECIPES)[0]!;
    expect(runtimeCookingRecipe(registry, cooking.id)).toMatchObject(cooking);
  });

  it('projects fuel, durability, vigour, and tags from the same live revision', () => {
    expect(runtimeFuelSmelts(registry, 'wood')).toBe(1);
    expect(runtimeFuelSmelts(registry, 'stick')).toBe(0);
    expect(runtimeDurabilityDefinition(registry, 'axe')).toEqual({
      maximum: TOOL_DURABILITY_BALANCE.axe.maximum,
      repairItemKind: TOOL_DURABILITY_BALANCE.axe.repairItemKind,
      repairCostBronze: expect.any(Number),
    });
    expect(runtimeNormalizeDurability(registry, 'axe')).toBe(TOOL_DURABILITY_BALANCE.axe.maximum);
    expect(runtimeNormalizeDurability(registry, 'axe', 0)).toBe(0);
    expect(runtimeWearTool(registry, 'axe', 2)).toEqual({ durability: 1, broken: false });
    expect(runtimeVigourDefinition(registry, 'pickaxe')).toEqual(TOOL_VIGOUR_BALANCE.pickaxe);
    expect(runtimeItemHasTag(registry, 'axe', 'item.tool')).toBe(true);
  });

  it('resolves commerce and capacity policy by authored fields, not legacy item ids or descriptive tags', () => {
    const wood = bootstrapContentRows().find(({ id }) => id === 'item:wood');
    if (wood === undefined) throw new Error('missing wood fixture');
    const base = JSON.parse(String(wood.json)) as Record<string, unknown>;
    const policyRows = [
      {
        id: 'item:renamed_irrigator',
        economy: {
          buy: 50000, sell: 20000,
          purchaseRequirement: { skillNode: 'sprinkler_engineering', minimumRank: 1 },
        },
      },
      {
        id: 'item:renamed_title',
        economy: { buy: 50000, sell: 1, purchaseGrant: 'homestead_claim' },
        droppable: false,
      },
      {
        id: 'item:renamed_vintage',
        economy: { buy: null, sell: 5000, salePremium: 'estate_vintage' },
      },
      {
        id: 'item:renamed_satchel',
        economy: { buy: 1500, sell: 600 },
        equip: { slot: 'back', inventoryCapacity: 17 },
      },
      {
        id: 'item:metadata_only',
        economy: { buy: 50000, sell: 20000 },
        tags: ['build.sprinkler', 'item.homestead_deed', 'cellar.bottles', 'container.backpack'],
        equip: { slot: 'back' },
      },
    ].map((overrides) => ({
      ...wood,
      id: overrides.id,
      slug: overrides.id.slice('item:'.length),
      json: JSON.stringify({
        ...base,
        ...overrides,
        displayName: overrides.id,
      }),
    }));
    const renamed = buildContentRegistry([...bootstrapContentRows(), ...policyRows]).registry;

    expect(runtimeItemPurchaseRequirement(renamed, 'renamed_irrigator')).toEqual({
      skillNode: 'sprinkler_engineering', minimumRank: 1,
    });
    expect(runtimeItemPurchaseGrant(renamed, 'renamed_title')).toBe('homestead_claim');
    expect(runtimeItemIsDroppable(renamed, 'renamed_title')).toBe(false);
    expect(runtimeItemSalePremium(renamed, 'renamed_vintage')).toBe('estate_vintage');
    expect(runtimeItemInventoryCapacity(renamed, 'renamed_satchel')).toBe(17);

    expect(runtimeItemPurchaseRequirement(renamed, 'metadata_only')).toBeNull();
    expect(runtimeItemPurchaseGrant(renamed, 'metadata_only')).toBeNull();
    expect(runtimeItemSalePremium(renamed, 'metadata_only')).toBeNull();
    expect(runtimeItemInventoryCapacity(renamed, 'metadata_only')).toBeNull();
    expect(runtimeItemIsDroppable(renamed, 'metadata_only')).toBe(true);
  });

  it('resolves renamed tool parameters from the supplied live revision without granting a use path', () => {
    const axe = bootstrapContentRows().find(({ id }) => id === 'item:axe');
    if (axe === undefined) throw new Error('missing axe fixture');
    const definition = JSON.parse(String(axe.json)) as Record<string, unknown>;
    const renamed = buildContentRegistry([...bootstrapContentRows(), {
      ...axe,
      id: 'item:survey_pick',
      slug: 'survey_pick',
      json: JSON.stringify({
        ...definition,
        id: 'item:survey_pick',
        displayName: 'Survey Pick',
        quality: 'rare',
        tool: { specialization: 'mining', tier: 2, reachTiles: 4, swingTicks: 12 },
        equip: { slot: 'hand', avatarAction: 'swing_pickaxe' },
        onUse: [],
      }),
    }]).registry;
    expect(runtimeToolDefinition(renamed, 'survey_pick')).toEqual({
      specialization: 'mining', tier: 2, reachTiles: 4, swingTicks: 12,
      avatarAction: 'swing_pickaxe',
    });
    expect(runtimeToolSpecialization(renamed, 'survey_pick')).toBe('mining');
    expect(runtimeToolTier(renamed, 'survey_pick')).toBe(2);
    expect(runtimeToolReachFixed(renamed, 'survey_pick')).toBe(4 * TILE_SIZE_FIXED);
    expect(runtimeItemAvatarAction(renamed, 'survey_pick')).toBe('swing_pickaxe');
    expect(runtimeToolQualityRequiredRanks(renamed, 'survey_pick')).toBe(6);
    expect(runtimeCanUseToolWithSkillRanks(renamed, 'survey_pick', {})).toBe(false);
    expect(runtimeCanUseToolWithSkillRanks(renamed, 'survey_pick', {
      efficient_strikes: 2, ore_dressing: 2, prospector: 2,
    })).toBe(true);
    expect(renamed.items.get('item:survey_pick')?.onUse).toEqual([]);
    expect(runtimeToolDefinition(renamed, 'wood')).toBeNull();
    expect(runtimeToolReachFixed(renamed, 'wood')).toBeNull();
  });

  it('resolves a renamed ranged weapon and its ammunition from the live revision', () => {
    const bow = bootstrapContentRows().find(({ id }) => id === 'item:bow');
    const arrow = bootstrapContentRows().find(({ id }) => id === 'item:arrow');
    if (bow === undefined || arrow === undefined) throw new Error('missing ranged fixtures');
    const definition = JSON.parse(String(bow.json)) as Record<string, unknown>;
    const arrowDefinition = JSON.parse(String(arrow.json)) as Record<string, unknown>;
    const renamed = buildContentRegistry([...bootstrapContentRows(), {
      ...arrow,
      id: 'item:orchard_arrow',
      slug: 'orchard_arrow',
      json: JSON.stringify({
        ...arrowDefinition,
        id: 'item:orchard_arrow',
        displayName: 'Orchard Arrow',
        onUse: [],
      }),
    }, {
      ...bow,
      id: 'item:orchard_longbow',
      slug: 'orchard_longbow',
      json: JSON.stringify({
        ...definition,
        id: 'item:orchard_longbow',
        displayName: 'Orchard Longbow',
        ranged: { ammunition: 'item:orchard_arrow', projectile: 'arrow' },
        equip: { slot: 'hand', avatarAction: 'ranged_weapon' },
        onUse: [],
      }),
    }]).registry;
    expect(runtimeRangedWeaponDefinition(renamed, 'orchard_longbow')).toEqual({
      tier: 0,
      reachTiles: 1,
      swingTicks: 6,
      ammunitionItemKind: 'orchard_arrow',
      projectileKind: 'arrow',
      avatarAction: 'ranged_weapon',
    });
    expect(renamed.items.get('item:orchard_longbow')?.onUse).toEqual([]);
    expect(runtimeIsRecoverableProjectileItem(renamed, 'orchard_arrow', 45)).toBe(true);
    expect(runtimeIsRecoverableProjectileItem(renamed, 'arrow', 45)).toBe(true);
    expect(runtimeIsRecoverableProjectileItem(renamed, 'orchard_arrow', 0)).toBe(false);
    expect(runtimeRangedWeaponDefinition(renamed, 'wood')).toBeNull();
  });

  it('projects world tables from the same revision without changing compiled behavior', () => {
    expect(runtimeCropDefinition(registry, 'wheat')).toEqual(CROP_DEFINITIONS.find(({ kind }) => kind === 'wheat'));
    expect(runtimeCropDefinitionForSeed(registry, 'wheat_seeds')).toEqual(runtimeCropDefinition(registry, 'wheat'));
    expect(runtimeCropDefinitionForSeed(registry, 'bob_fast_strawberry_seeds')).toEqual(
      runtimeCropDefinition(registry, 'bob_fast_strawberry'),
    );
    expect(runtimeCropDefinition(registry, 'bob_fast_strawberry')).toMatchObject({
      kind: 'bob_fast_strawberry',
      harvestItemKind: 'strawberry',
      growthTicks: 600n,
      seasonless: true,
      tags: ['crop.quest'],
    });
    expect(runtimeCreatureDefinition(registry, 'bee')).toEqual(WILDLIFE_DEFINITIONS.bee);
    expect(Object.fromEntries(runtimeSpawnPlans(registry).map((plan) => [plan.species, plan])))
      .toEqual(Object.fromEntries(WILDLIFE_SPAWN_PLANS.map((plan) => [plan.species, plan])));
    expect(runtimeSpaceDefinition(registry, SPACES[0]!.spaceId)).toEqual(SPACES[0]);
    expect(runtimeSkillNodes(registry, 'farming')).toEqual(SKILL_NODE_DEFINITIONS.filter(({ track }) => track === 'farming'));
    expect(runtimeEffectDefinition(registry, 'winded')).toEqual(EFFECT_DEFINITIONS.winded);
    expect(runtimeStatisticDefinition(registry, 'items_obtained')).toEqual(PLAYER_STATISTIC_DEFINITIONS.items_obtained);
    expect(runtimeUpgradeDefinition(registry, 'rich_soil')).toEqual(HOMESTEAD_UPGRADE_DEFINITIONS.rich_soil);
  });

  it('does not resurrect a static space removed from the supplied live revision', () => {
    const withoutDebug = buildContentRegistry(
      bootstrapContentRows().filter(({ id }) => id !== 'space:debug_flat'),
    ).registry;
    expect(runtimeSpaceDefinition(withoutDebug, DEBUG_SPACE_ID)).toBeUndefined();
  });

  it('still resolves persisted dynamic spaces outside the static live registry', () => {
    expect(runtimeSpaceDefinition(registry, 50_104, {
      spaceId: 50_104,
      instanceKind: 'roguelike',
      seed: 42,
      roomNumber: 3,
      roomKind: 'combat',
      theme: 'dungeon',
    })).toMatchObject({
      spaceId: 50_104,
      generator: 'roguelike',
      sizeTiles: 32,
    });
  });
});

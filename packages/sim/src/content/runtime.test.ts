import { describe, expect, it } from 'vitest';
import {
  CAMPFIRE_COOKING_RECIPES,
  CROP_DEFINITIONS,
  DEBUG_SPACE_ID,
  HOMESTEAD_UPGRADE_DEFINITIONS,
  ITEM_DEFINITIONS,
  ITEM_ECONOMY,
  MERCHANT_OFFERS,
  PLAYER_STATISTIC_DEFINITIONS,
  RECIPES,
  SMELTING_RECIPES,
  SKILL_NODE_DEFINITIONS,
  SPACES,
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
  runtimeHomesteadUpgradeQuote,
  runtimeHomesteadUpgradeRank,
  runtimeUpgradeDefinition,
  runtimeUpgradeDefinitionForMechanic,
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

  it('never resurrects retired item or shop policy from the bootstrap projection', () => {
    const retired = buildContentRegistry(bootstrapContentRows().map((row) => {
      if (row.id !== 'item:wood' && row.id !== 'shop:general_tools') return row;
      return {
        ...row,
        json: JSON.stringify({ ...JSON.parse(String(row.json)) as object, retired: true }),
      };
    })).registry;
    expect(runtimeItemDefinition(retired, 'wood')).toBeNull();
    expect(runtimeItemEconomy(retired, 'wood')).toBeNull();
    expect(runtimeMaxStack(retired, 'wood')).toBeNull();
    expect(runtimeItemHasTag(retired, 'wood', 'material.wood')).toBe(false);
    expect(runtimeItemIsDroppable(retired, 'wood')).toBe(false);
    expect(runtimeMerchantOffers(retired, 'general_tools')).toEqual([]);
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
    const axe = registry.items.get('item:axe')!;
    const pickaxe = registry.items.get('item:pickaxe')!;
    expect(runtimeDurabilityDefinition(registry, 'axe')).toEqual({
      maximum: axe.durability!.max,
      repairItemKind: axe.durability!.repairMaterial.slice('item:'.length),
      repairCostBronze: axe.durability!.repairCost,
    });
    expect(runtimeNormalizeDurability(registry, 'axe')).toBe(axe.durability!.max);
    expect(runtimeNormalizeDurability(registry, 'axe', 0)).toBe(0);
    expect(runtimeWearTool(registry, 'axe', 2)).toEqual({ durability: 1, broken: false });
    expect(runtimeVigourDefinition(registry, 'pickaxe')).toEqual(pickaxe.vigour);
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
        durability: { max: 777, repairMaterial: 'item:stone', repairCost: 321 },
        vigour: { costCenti: 876, minimumSwingTicks: 12 },
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
    expect(runtimeDurabilityDefinition(renamed, 'survey_pick')).toEqual({
      maximum: 777, repairItemKind: 'stone', repairCostBronze: 321,
    });
    expect(runtimeNormalizeDurability(renamed, 'survey_pick')).toBe(777);
    expect(runtimeNormalizeDurability(renamed, 'survey_pick', 87)).toBe(87);
    expect(runtimeVigourDefinition(renamed, 'survey_pick')).toEqual({
      costCenti: 876, minimumSwingTicks: 12,
    });
    expect(runtimeToolQualityRequiredRanks(renamed, 'survey_pick')).toBe(6);
    expect(runtimeCanUseToolWithSkillRanks(renamed, 'survey_pick', {})).toBe(false);
    expect(runtimeCanUseToolWithSkillRanks(renamed, 'survey_pick', {
      efficient_strikes: 2, ore_dressing: 3, prospector: 1,
    })).toBe(true);
    expect(renamed.items.get('item:survey_pick')?.onUse).toEqual([]);
    expect(runtimeToolDefinition(renamed, 'wood')).toBeNull();
    expect(runtimeToolReachFixed(renamed, 'wood')).toBeNull();
  });

  it('has complete authored hand-tool metadata and fails closed for retired definitions', () => {
    const handTools = [...registry.items.values()].filter((item) => (
      item.retired !== true && item.tags.includes('gear.hand')
      && (item.tags.includes('item.tool') || item.tags.includes('item.weapon'))
    ));
    expect(handTools.length).toBeGreaterThan(0);
    for (const item of handTools) {
      expect(item.tool, `${item.id} tool`).toBeDefined();
      expect(item.durability, `${item.id} durability`).toBeDefined();
      expect(item.vigour, `${item.id} vigour`).toBeDefined();
      expect(item.tool?.swingTicks, `${item.id} swing/vigour parity`)
        .toBe(item.vigour?.minimumSwingTicks);
    }
    for (const item of registry.items.values()) {
      if (item.durability !== undefined || item.vigour !== undefined) {
        expect(item.tool, `${item.id} durable/vigour tool`).toBeDefined();
      }
    }

    const axe = bootstrapContentRows().find(({ id }) => id === 'item:axe');
    if (axe === undefined) throw new Error('missing axe fixture');
    const definition = JSON.parse(String(axe.json)) as Record<string, unknown>;
    const retired = buildContentRegistry([...bootstrapContentRows(), {
      ...axe,
      id: 'item:retired_axe',
      slug: 'retired_axe',
      json: JSON.stringify({
        ...definition, id: 'item:retired_axe', retired: true, replacement: 'item:axe',
      }),
    }]).registry;
    expect(runtimeToolDefinition(retired, 'retired_axe')).toBeNull();
    expect(runtimeDurabilityDefinition(retired, 'retired_axe')).toBeNull();
    expect(runtimeVigourDefinition(retired, 'retired_axe')).toBeNull();
    expect(runtimeCanUseToolWithSkillRanks(retired, 'retired_axe', {})).toBe(false);
    expect(runtimeCanUseToolWithSkillRanks(retired, 'missing_tool', {})).toBe(false);
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
    expect(runtimeCreatureDefinition(registry, 'bee')).toMatchObject({
      ...WILDLIFE_DEFINITIONS.bee,
    });
    expect(Object.fromEntries(runtimeSpawnPlans(registry).map((plan) => [plan.species, plan])))
      .toEqual(Object.fromEntries(WILDLIFE_SPAWN_PLANS.map((plan) => [plan.species, plan])));
    expect(runtimeSpaceDefinition(registry, SPACES[0]!.spaceId)).toEqual(SPACES[0]);
    expect(runtimeSkillNodes(registry, 'farming')).toEqual(SKILL_NODE_DEFINITIONS.filter(({ track }) => track === 'farming'));
    expect(runtimeEffectDefinition(registry, 'winded')).toEqual(registry.compiled.effects.winded);
    expect(runtimeEffectDefinition(registry, 'winded')).toMatchObject({
      name: 'Winded', durationTicks: 1_800,
    });
    expect(runtimeStatisticDefinition(registry, 'items_obtained')).toEqual(PLAYER_STATISTIC_DEFINITIONS.items_obtained);
    expect(runtimeUpgradeDefinition(registry, 'rich_soil')).toMatchObject({
      id: 'upgrade:rich_soil',
      maximumRank: HOMESTEAD_UPGRADE_DEFINITIONS.rich_soil.maximumRank,
      baseCostGold: HOMESTEAD_UPGRADE_DEFINITIONS.rich_soil.baseCostGold,
      costGrowth: HOMESTEAD_UPGRADE_DEFINITIONS.rich_soil.costGrowth,
    });
  });

  it('does not resurrect a static space removed from the supplied live revision', () => {
    const withoutDebug = buildContentRegistry(
      bootstrapContentRows().filter(({ id }) => id !== 'space:debug_flat'),
    ).registry;
    expect(runtimeSpaceDefinition(withoutDebug, DEBUG_SPACE_ID)).toBeUndefined();
  });

  it('quotes arbitrary active homestead upgrades and fails closed for retired definitions', () => {
    const renamedRows = [
      ...bootstrapContentRows().filter(({ id }) => id !== 'upgrade:rich_soil'),
      {
        id: 'upgrade:moon_soil',
        kind: 'upgrade',
        slug: 'moon_soil',
        json: JSON.stringify({
          id: 'upgrade:moon_soil', kind: 'upgrade', schemaVersion: 1,
          mechanic: ['soil', 'rich_soil'],
          displayName: 'Moon Soil', description: 'A renamed upgrade fixture.',
          maximumRank: 2, baseCostGold: 7, costGrowth: 2,
        }),
      },
    ];
    const active = buildContentRegistry(renamedRows).registry;
    expect(runtimeUpgradeDefinition(active, 'moon_soil')).toBeNull();
    expect(runtimeUpgradeDefinition(active, 'rich_soil')).toMatchObject({ id: 'upgrade:moon_soil' });
    expect(runtimeUpgradeDefinitionForMechanic(active, 'soil')).toMatchObject({
      id: 'upgrade:moon_soil', mechanic: ['soil', 'rich_soil'],
    });
    expect(runtimeHomesteadUpgradeRank(active, [
      { upgradeKind: 'moon_soil', rank: 3 },
      { upgradeKind: 'rich_soil', rank: 2 },
    ], 'soil')).toBe(2);
    expect(runtimeHomesteadUpgradeRank(active, [{ upgradeKind: 'rich_soil', rank: 3 }], 'soil')).toBe(0);
    expect(runtimeHomesteadUpgradeQuote(active, 'rich_soil', 1)).toMatchObject({
      currentRank: 1, nextRank: 2, costBronze: 140_000n,
    });
    expect(runtimeHomesteadUpgradeQuote(active, 'rich_soil', 2)).toBeNull();

    const retired = buildContentRegistry(renamedRows.map((row) => row.id !== 'upgrade:moon_soil'
      ? row
      : { ...row, json: JSON.stringify({ ...JSON.parse(String(row.json)) as object, retired: true }) })).registry;
    expect(runtimeUpgradeDefinition(retired, 'rich_soil')).toBeNull();
    expect(runtimeUpgradeDefinitionForMechanic(retired, 'soil')).toBeNull();
    expect(runtimeHomesteadUpgradeRank(retired, [{ upgradeKind: 'rich_soil', rank: 2 }], 'soil')).toBe(0);
    expect(runtimeHomesteadUpgradeQuote(retired, 'rich_soil', 0)).toBeNull();
    expect(retired.compiled.upgrades.rich_soil).toBeUndefined();

    const missing = buildContentRegistry(bootstrapContentRows().filter((row) => (
      row.id !== 'upgrade:rich_soil'
    ))).registry;
    expect(runtimeUpgradeDefinitionForMechanic(missing, 'soil')).toBeNull();
    expect(runtimeHomesteadUpgradeRank(missing, [{ upgradeKind: 'rich_soil', rank: 3 }], 'soil')).toBe(0);

    const duplicateRows = [...renamedRows, {
      id: 'upgrade:other_soil', kind: 'upgrade', slug: 'other_soil',
      json: JSON.stringify({
        id: 'upgrade:other_soil', kind: 'upgrade', schemaVersion: 1,
        mechanic: ['soil', 'other_soil'],
        displayName: 'Other Soil', description: 'An ambiguous fixture.',
        maximumRank: 3, baseCostGold: 1, costGrowth: 2,
      }),
    }];
    const duplicate = buildContentRegistry(duplicateRows);
    expect(duplicate.report.errors).toContainEqual(expect.objectContaining({
      code: 'ambiguous_interaction', definitionId: 'upgrade:other_soil', path: 'mechanic[0]',
    }));
    expect(runtimeUpgradeDefinitionForMechanic(duplicate.registry, 'soil')).toBeNull();
    expect(runtimeHomesteadUpgradeRank(duplicate.registry, [
      { upgradeKind: 'rich_soil', rank: 2 }, { upgradeKind: 'other_soil', rank: 3 },
    ], 'soil')).toBe(0);
  });

  it('keeps legacy authority defaults exclusive to the Stage-A pack lineage', () => {
    const stripped=bootstrapContentRows().map(row=>{
      const value=JSON.parse(String(row.json)) as Record<string,unknown>;
      if(row.id==='upgrade:rich_soil'){
        const {mechanic,...legacy}=value;void mechanic;
        return {...row,json:JSON.stringify(legacy)};
      }
      if(row.id==='creature:bee'){
        const {presentation,combat,panic,...legacy}=value;void presentation;void combat;void panic;
        return {...row,json:JSON.stringify(legacy)};
      }
      if(row.id==='npc:fisherman_fin')return {...row,json:JSON.stringify({...value,ai:{kind:'fishing_cycle'}})};
      return row;
    });
    const report=buildContentRegistry(stripped).report;
    for(const id of ['upgrade:rich_soil','creature:bee','npc:fisherman_fin']){
      expect(report.errors).toContainEqual(expect.objectContaining({
        code:'invalid_world_definition',definitionId:id,path:'legacyCompatibility',
      }));
    }
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

import { describe, expect, it } from 'vitest';
import { CAMPFIRE_COOKING_RECIPES } from '../food.js';
import { ITEM_DEFINITIONS, TRADE_UNSELLABLE_ITEM_TAG } from '../item-containers.js';
import { ITEM_ECONOMY, MERCHANT_OFFERS } from '../commerce.js';
import { RECIPES } from '../recipes.js';
import { BARREL_CURE_TICKS } from '../barreling.js';
import {
  FERMENTATION_CYCLE_TICKS,
  FERMENTATION_MUST_PER_BOTTLE,
  PRESS_CYCLE_TICKS,
} from '../cellar-production.js';
import { ANVIL_REPAIR_COST_BRONZE } from '../crafting.js';
import { FURNACE_SMELT_TICKS, SMELTING_RECIPES } from '../smelting.js';
import { TILE_SIZE_FIXED } from '../state.js';
import { miningPickaxeTierForItem } from '../mining.js';
import { resourceToolReachFixed } from '../tile-targeting.js';
import {
  bootstrapContentRows,
} from './bootstrap-registry.js';
import { buildContentRegistry } from './registry.js';
import { runtimeDurabilityDefinition, runtimeVigourDefinition } from './runtime.js';

describe('Phase-0 content registry', () => {
  it('projects the bootstrap pack back to every migrated compiled table', () => {
    const { registry, report } = buildContentRegistry(bootstrapContentRows());
    expect(report.errors).toEqual([]);
    expect(report.valid).toBe(true);
    expect(registry.compiled.itemDefinitions).toEqual(ITEM_DEFINITIONS);
    expect(registry.compiled.itemEconomy).toEqual(ITEM_ECONOMY);
    expect(registry.compiled.recipes).toEqual(RECIPES);
    expect(registry.compiled.smeltingRecipes).toEqual(SMELTING_RECIPES);
    expect(registry.compiled.campfireCookingRecipes).toEqual(CAMPFIRE_COOKING_RECIPES);
    expect(registry.compiled.merchantOffers).toEqual(MERCHANT_OFFERS);

    const durableItems = [...registry.items.values()].filter(({ durability }) => durability !== undefined);
    expect(durableItems).not.toHaveLength(0);
    for (const item of durableItems) {
      const durability = item.durability!;
      expect(runtimeDurabilityDefinition(registry, item.id.slice('item:'.length))).toEqual({
        maximum: durability.max,
        repairItemKind: durability.repairMaterial.slice('item:'.length),
        repairCostBronze: durability.repairCost,
      });
      expect(durability.repairCost).toBe(ANVIL_REPAIR_COST_BRONZE);
    }
    for (const item of registry.items.values()) {
      expect(runtimeVigourDefinition(registry, item.id.slice('item:'.length)))
        .toEqual(item.vigour ?? null);
    }
    for (const input of Object.keys(SMELTING_RECIPES)) {
      expect(registry.processes.get(`process:smelt_${input}`)?.ticksPerUnit)
        .toBe(Number(FURNACE_SMELT_TICKS));
    }
    expect(registry.processes.get('process:press_apple')?.ticksPerUnit).toBe(Number(PRESS_CYCLE_TICKS));
    expect(registry.processes.get('process:ferment_must')).toMatchObject({
      input: { item: 'item:must', count: FERMENTATION_MUST_PER_BOTTLE },
      ticksPerUnit: Number(FERMENTATION_CYCLE_TICKS),
    });
    expect(registry.processes.get('process:preserve_grape')?.ticksPerUnit).toBe(Number(BARREL_CURE_TICKS));
  });

  it('projects changed and newly authored vigour from the supplied registry revision', () => {
    const rows = bootstrapContentRows();
    const swordRow = rows.find(({ id }) => id === 'item:sword');
    if (swordRow === undefined) throw new Error('missing sword fixture');
    const sword = JSON.parse(String(swordRow.json)) as Record<string, unknown>;
    const revisedVigour = { costCenti: 4_321, minimumSwingTicks: 11 };
    const addedVigour = { costCenti: 876, minimumSwingTicks: 13 };
    const original = buildContentRegistry(rows).registry;
    const { registry, report } = buildContentRegistry([
      ...rows.map((row) => row.id !== swordRow.id ? row : {
        ...row,
        json: JSON.stringify({ ...sword, vigour: revisedVigour }),
      }),
      {
        ...swordRow,
        id: 'item:survey_blade',
        slug: 'survey_blade',
        json: JSON.stringify({ ...sword, id: 'item:survey_blade', vigour: addedVigour }),
      },
    ]);
    expect(report.errors).toEqual([]);
    expect(runtimeVigourDefinition(registry, 'sword')).toEqual(revisedVigour);
    expect(runtimeVigourDefinition(registry, 'survey_blade')).toEqual(addedVigour);
    expect(runtimeVigourDefinition(original, 'sword')).toEqual(sword.vigour);
    expect(runtimeVigourDefinition(original, 'survey_blade')).toBeNull();
  });

  it('is order-independent and exposes maps without mutation methods', () => {
    const rows = bootstrapContentRows();
    const first = buildContentRegistry(rows).registry;
    const reversed = buildContentRegistry([...rows].reverse()).registry;
    expect(reversed.contentHash).toBe(first.contentHash);
    expect([...reversed.definitions.keys()]).toEqual([...first.definitions.keys()]);
    expect('set' in first.items).toBe(false);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.items.get('item:wood')?.tags)).toBe(true);
  });

  it('preserves §11 item fuel, mining tier, reach/swing, and unsellable metadata', () => {
    const { registry, report } = buildContentRegistry(bootstrapContentRows());
    expect(report.valid).toBe(true);
    expect(registry.items.get('item:wood')?.fuel?.smelts).toBe(1);
    expect(registry.items.get('item:plank')?.fuel?.smelts).toBe(1);
    expect(registry.items.get('item:stick')?.fuel).toBeUndefined();
    expect(registry.items.get('item:pickaxe')?.tool?.tier)
      .toBe(miningPickaxeTierForItem('pickaxe'));
    for (const kind of ['axe', 'pickaxe', 'fishing_rod', 'sword']) {
      expect(registry.items.get(`item:${kind}`)?.tool?.reachTiles)
        .toBe(resourceToolReachFixed(kind) / TILE_SIZE_FIXED);
      expect(registry.items.get(`item:${kind}`)?.tool?.swingTicks)
        .toBe(registry.items.get(`item:${kind}`)?.vigour?.minimumSwingTicks);
    }
    expect(registry.items.get('item:homestead_deed')?.tags)
      .toContain(TRADE_UNSELLABLE_ITEM_TAG);
    expect(registry.items.get('item:homestead_deed')).toMatchObject({
      economy: { purchaseGrant: 'homestead_claim' }, droppable: false,
    });
    expect(registry.items.get('item:sprinkler')?.economy.purchaseRequirement).toEqual({
      skillNode: 'sprinkler_engineering', minimumRank: 1,
    });
    expect(registry.items.get('item:bottles')?.economy.salePremium).toBe('estate_vintage');
    expect(registry.items.get('item:backpack')?.equip?.inventoryCapacity).toBe(20);
    expect(registry.items.get('item:fishing_handbook')?.onUse[0]).toMatchObject({
      id: 'read', verb: 'secondary', prompt: 'READ',
      effects: [{ learnRecipes: ['recipe:fishing_rod', 'process:cook_fish'] }, { consumeSelected: 1 }],
    });
  });

  it('authors direct use only for edible foods, tea, and recipe books', () => {
    const { registry } = buildContentRegistry(bootstrapContentRows());
    const edible = [...registry.items.values()].filter(({ food }) => food !== undefined);

    expect(edible).toHaveLength(29);
    expect(edible.every(({ onUse }) => onUse.some(({ id }) => id === 'eat'))).toBe(true);
    expect(edible.every((definition) => definition.onUse.some(({ id, effects }) => id === 'eat'
      && effects.some((effect) => 'restoreHunger' in effect
        && effect.restoreHunger === definition.food?.restoreCenti)
      && effects.some((effect) => 'statistic' in effect
        && typeof effect.statistic !== 'string'
        && effect.statistic.kind === 'food_eaten'
        && effect.statistic.subject === definition.id.slice('item:'.length))
      && !effects.some((effect) => 'applyEffect' in effect
        && effect.applyEffect.effectId === 'hunger')))).toBe(true);
    expect(registry.items.get('item:orchard_tea')?.onUse).toEqual([
      expect.objectContaining({
        id: 'drink', verb: 'secondary', prompt: 'DRINK ORCHARD TEA',
        effects: [
          { applyEffect: { effectId: 'orchard_tea' } },
          { consumeSelected: 1 },
          { statistic: 'orchard_tea_consumed' },
        ],
      }),
    ]);

    const deliberatelyInedibleFoodTags = [...registry.items.values()].filter((definition) => (
      definition.tags.includes('item.food')
      && definition.food === undefined
      && definition.id !== 'item:orchard_tea'
    ));
    expect(deliberatelyInedibleFoodTags).toHaveLength(29);
    expect(deliberatelyInedibleFoodTags.every(({ onUse }) => onUse.length === 0)).toBe(true);
  });

  it('validates every explicit recipe-book unlock against the same live pack', () => {
    const rows = bootstrapContentRows().map((row) => row.id !== 'item:fishing_handbook' ? row : {
      ...row,
      json: JSON.stringify({
        ...(JSON.parse(String(row.json)) as object),
        onUse: [{
          id: 'read', conditions: [],
          effects: [{ learnRecipes: ['recipe:not_real', 'process:not_real'] }],
        }],
      }),
    });
    const { report } = buildContentRegistry(rows);
    expect(report.valid).toBe(false);
    expect(report.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'unresolved_reference', definitionId: 'item:fishing_handbook',
        path: 'onUse[0].effects[0].learnRecipes[0]',
      }),
      expect.objectContaining({
        code: 'unresolved_reference', definitionId: 'item:fishing_handbook',
        path: 'onUse[0].effects[0].learnRecipes[1]',
      }),
    ]));
  });

  it('reports row identity and unresolved-reference errors with stable codes', () => {
    const rows = bootstrapContentRows();
    const brokenRecipe = {
      id: 'recipe:missing_item',
      kind: 'recipe',
      slug: 'wrong_slug',
      json: JSON.stringify({
        id: 'recipe:missing_item', kind: 'recipe', schemaVersion: 1,
        recipeKind: 'shapeless', inputs: [{ item: 'item:not_real', count: 1 }],
        output: { item: 'item:also_not_real', count: 1 },
      }),
    };
    const { report } = buildContentRegistry([...rows, brokenRecipe]);
    expect(report.valid).toBe(false);
    expect(report.errors.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'kind_slug_mismatch',
      'unresolved_reference',
    ]));
  });

  it('rejects a purchase requirement whose authored skill node is absent', () => {
    const rows = bootstrapContentRows().map((row) => row.id !== 'item:sprinkler' ? row : {
      ...row,
      json: JSON.stringify({
        ...(JSON.parse(String(row.json)) as object),
        economy: {
          ...(JSON.parse(String(row.json)) as { economy: object }).economy,
          purchaseRequirement: { skillNode: 'not_a_skill', minimumRank: 1 },
        },
      }),
    });
    const { report } = buildContentRegistry(rows);
    expect(report.errors).toContainEqual(expect.objectContaining({
      code: 'unresolved_reference',
      definitionId: 'item:sprinkler',
      path: 'economy.purchaseRequirement.skillNode',
    }));
  });
});

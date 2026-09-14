import {
  parseItemDefinition,
  parseRecipeDefinition,
  type ItemContentDefinition,
  type RecipeContentDefinition,
} from '@orchard/sim';

const units: Readonly<Record<string, number>> = {
  sword: 3, bow: 3, shield: 2, head: 2, body: 4, hands: 1, legs: 3, feet: 2,
};
const planPrices: Readonly<Record<string, number>> = {
  common: 75, uncommon: 200, rare: 400, epic: 850,
};

/** Deterministic authoring source; emitted content remains the runtime catalogue.
 * A recipe unlock is reusable; its separately authored exchange pays only for
 * the unlock, never for each subsequent copy of the equipment. */
export function buildHearthEquipmentAcquisition(items: ReadonlyMap<string, ItemContentDefinition>) {
  const gear = [...items.values()]
    .filter((item) => item.id.startsWith('item:hearth_') && item.equip !== undefined)
    .sort((left, right) => left.id.localeCompare(right.id));
  if (gear.length !== 45) throw new Error('hearth_equipment_catalogue_incomplete');
  const recipes: RecipeContentDefinition[] = [];
  const plans: ItemContentDefinition[] = [];
  const smithPlans: string[] = [];
  const guildPlans: string[] = [];
  const legendaryRecipes: string[] = [];
  for (const item of gear) {
    const id = item.id.slice(5);
    const slot = id.slice(id.lastIndexOf('_') + 1);
    const utility = slot === 'pendant';
    const unitCount = units[slot];
    if (!utility && unitCount === undefined) throw new Error(`unknown_hearth_equipment_slot:${id}`);
    const materials: Record<string, number> = utility
      ? { iron_bar: 1, wood: 10, fiber: 10 }
      : slot === 'bow'
        ? { wood: 20 * unitCount!, fiber: 7 * unitCount! }
        : { stone: 12 * unitCount!, wood: 6 * unitCount!, fiber: 8 };
    if (!utility) {
      if (item.quality === 'uncommon') {
        materials.ashwood = unitCount! >= 3 ? 4 : 2;
        materials.basalt = unitCount! >= 3 ? 4 : 2;
      } else if (item.quality === 'rare') {
        materials.iron_bar = 1;
        materials.ashwood = 2;
        materials.basalt = 2;
      } else if (item.quality === 'epic' || item.quality === 'legendary') {
        materials.iron_bar = 1;
        const advanced = item.quality === 'legendary' ? 4 : 2;
        materials.cinder_ore = advanced;
        materials.emberglass = advanced;
        if (item.quality === 'legendary') materials.ashwood = 4;
      }
    }
    const saleValue = Object.entries(materials).reduce((sum, [kind, count]) => {
      const material = items.get(`item:${kind}`);
      if (material === undefined || material.retired === true) {
        throw new Error(`missing_hearth_crafting_material:${kind}`);
      }
      return sum + material.economy.sell * count;
    }, 0);
    if (saleValue <= item.economy.sell) throw new Error(`hearth_equipment_resale_loop:${id}`);
    const legendary = item.quality === 'legendary';
    const recipe = parseRecipeDefinition({
      id: `recipe:${id}`,
      kind: 'recipe',
      schemaVersion: 1,
      output: { item: item.id, count: 1 },
      recipeKind: 'shapeless',
      inputs: Object.entries(materials).map(([kind, count]) => ({ item: `item:${kind}`, count })),
      stationRequirement: { objectTag: 'station.workbench' },
      ...(item.quality === 'common' ? {} : { requiresKnowledge: true }),
      ...(legendary ? {} : { unlockHint: { book: `item:${id}_plan` } }),
    });
    recipes.push(recipe);
    if (legendary) {
      legendaryRecipes.push(id);
      continue;
    }
    const plan = parseItemDefinition({
      id: `item:${id}_plan`,
      kind: 'item',
      schemaVersion: 1,
      displayName: `${item.displayName} Plan`,
      icon: { asset: 'icon_cf_marlow_book' },
      quality: item.quality,
      maxStack: 1,
      tags: ['item.document', 'equipment.plan', 'content.hearth'],
      economy: { buy: utility ? 350 : planPrices[item.quality], sell: 0 },
      onUse: [{
        id: 'read', verb: 'secondary', prompt: 'LEARN PLAN', conditions: [],
        effects: [{ learnRecipes: [recipe.id] }, { consumeSelected: 1 }],
      }],
    });
    plans.push(plan);
    (utility ? guildPlans : smithPlans).push(plan.id);
  }
  return { recipes, plans, smithPlans, guildPlans, legendaryRecipes };
}

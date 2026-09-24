import {
  parseItemDefinition,
  parseRecipeDefinition,
  type ItemContentDefinition,
  type RecipeContentDefinition,
} from '@orchard/sim';

/** Shaped patterns (owner request 2026-09-24: Minecraft-style shapes with the
 * core material swapped per tier; each shaped cell consumes one item).
 * Common gear is made from scratch; every higher quality upgrades the piece one
 * quality below (`W`) in a ring of that quality's signature materials, so each
 * pattern is unique per slot and quality and the cost is cumulative. */
const COMMON_PATTERNS: Readonly<Record<string, readonly string[]>> = {
  sword: ['.I.', '.I.', 'TST'], // iron blade, stone crossguard, stick grip
  bow: ['.AR', 'ISR', '.AR'], // ashwood limbs, iron-bound stick grip, string
  shield: ['PIP', 'PPP', '.P.'], // plank face with an iron boss
  head: ['LLL', 'L.L'],
  body: ['L.L', 'LLL', 'LLL'],
  legs: ['LLL', 'L.L', 'L.L'],
  feet: ['L.L', 'L.L'],
  hands: ['L.L'],
};
const UPGRADE_PATTERNS: Readonly<Record<string, readonly string[]>> = {
  uncommon: ['.B.', 'BWB', '.B.'], // basalt plates
  rare: ['AIA', '.W.', 'A.A'], // ashwood and an iron bar
  epic: ['C.C', 'EWE', 'C.C'], // cinder ore and emberglass
  legendary: ['ECE', 'CWC', 'ECE'],
};
const PREVIOUS_QUALITY: Readonly<Record<string, string>> = { uncommon: 'common', rare: 'uncommon', epic: 'rare', legendary: 'epic' };
/** Pendants: a string loop holding an iron setting and a charm for its trade. */
const PENDANT_PATTERN = ['RRR', 'RXR', '.I.'];
const PENDANT_CHARMS: Readonly<Record<string, string>> = {
  angler: 'raw_fish', forester: 'ashwood', harvest: 'wheat', prospector: 'copper_piece', wayfarer: 'leather',
};
const SYMBOLS: Readonly<Record<string, string>> = {
  I: 'iron_bar', T: 'stone', S: 'stick', A: 'ashwood', R: 'string', P: 'plank', L: 'leather',
  B: 'basalt', C: 'cinder_ore', E: 'emberglass',
};
const SLOTS = new Set(['sword', 'bow', 'shield', 'head', 'body', 'hands', 'legs', 'feet']);

function patternFor(item: ItemContentDefinition, id: string, slot: string): (string | null)[][] {
  const symbols: Record<string, string> = { ...SYMBOLS };
  let rows: readonly string[];
  if (slot === 'pendant') {
    const charm = PENDANT_CHARMS[id.slice('hearth_'.length, -'_pendant'.length)];
    if (charm === undefined) throw new Error(`unknown_hearth_pendant:${id}`);
    symbols.X = charm;
    rows = PENDANT_PATTERN;
  } else if (item.quality === 'common') {
    rows = COMMON_PATTERNS[slot]!;
  } else {
    const previous = PREVIOUS_QUALITY[item.quality ?? ''];
    if (previous === undefined) throw new Error(`unknown_hearth_quality:${id}`);
    symbols.W = `hearth_${previous}_${slot}`;
    rows = UPGRADE_PATTERNS[item.quality!]!;
  }
  return rows.map((row) => [...row].map((cell) => {
    if (cell === '.') return null;
    const material = symbols[cell];
    if (material === undefined) throw new Error(`unknown_pattern_symbol:${cell}`);
    return `item:${material}`;
  }));
}
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
    if (!utility && !SLOTS.has(slot)) throw new Error(`unknown_hearth_equipment_slot:${id}`);
    const pattern = patternFor(item, id, slot);
    const saleValue = pattern.flat().reduce((sum, kind) => {
      if (kind === null) return sum;
      const material = items.get(kind);
      if (material === undefined || material.retired === true) {
        throw new Error(`missing_hearth_crafting_material:${kind}`);
      }
      return sum + material.economy.sell;
    }, 0);
    if (saleValue <= item.economy.sell) throw new Error(`hearth_equipment_resale_loop:${id}`);
    const legendary = item.quality === 'legendary';
    const recipe = parseRecipeDefinition({
      id: `recipe:${id}`,
      kind: 'recipe',
      schemaVersion: 1,
      output: { item: item.id, count: 1 },
      recipeKind: 'shaped',
      pattern,
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

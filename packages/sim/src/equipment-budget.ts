import type { Modifier, ModifierLayer, StatTarget } from './modifiers.js';

/** One equipment budget rule, keyed by (target, layer). `minimum`/`maximum`
 * bound a single authored item modifier; `loadoutMinimum`/`loadoutMaximum`
 * bound the summed equipment bucket for the whole loadout. `key` names the
 * compiled loadout modifier (`equipment.budget.<key>`). */
export interface EquipmentStatBudget {
  readonly key: string;
  readonly target: StatTarget;
  readonly layer: ModifierLayer;
  readonly minimum: number;
  readonly maximum: number;
  readonly loadoutMinimum: number;
  readonly loadoutMaximum: number;
}

/** A rule whose single-item range equals its loadout range (the original
 * Hearth budgets). */
function shared(target: StatTarget, layer: ModifierLayer, minimum: number, maximum: number): EquipmentStatBudget {
  return { key: target, target, layer, minimum, maximum, loadoutMinimum: minimum, loadoutMaximum: maximum };
}

/** A non-negative bonus with a tighter per-item cap than its loadout cap, so
 * one item cannot spend the whole allowance (Gear-D3). */
function bonus(key: string, target: StatTarget, layer: ModifierLayer, item: number, loadout: number): EquipmentStatBudget {
  return { key, target, layer, minimum: 0, maximum: item, loadoutMinimum: 0, loadoutMaximum: loadout };
}

/* Gear-D3 placeholder caps, pending the owner's balance review. Item level
 * tops out at 60 (Gear-D1); each per-item cap admits the design's affix size at
 * item level 60 and each loadout cap is roughly 2.5 such affixes.
 * - Attributes (flat points): +1 per 8 item levels = +8 at 60. Per item 8,
 *   loadout 20; base 10 + 20 reaches exactly the 1-30 attribute clamp.
 * - maxMana (pctAdd basis points): 0.4% per item level = 24% at 60. Per item
 *   2500 bp, loadout 4000 bp (matches maxVigour's loadout cap).
 * - Regeneration (flat centi per second, like the stats.ts profile values):
 *   0.02/s per item level = 1.2/s = 120 centi/s at 60. Per item 150, loadout
 *   400 for each of health, mana and vigour.
 * - Flat Health (centi, like maxHealthCenti): +2 Health per item level = +120 =
 *   12000 centi at 60. Per item 12000, loadout 30000. */
const ATTRIBUTE_ITEM_POINTS = 8;
const ATTRIBUTE_LOADOUT_POINTS = 20;
const MAX_MANA_ITEM_BP = 2500;
const MAX_MANA_LOADOUT_BP = 4000;
const REGEN_ITEM_CENTI_PER_SECOND = 150;
const REGEN_LOADOUT_CENTI_PER_SECOND = 400;
const HEALTH_ITEM_CENTI = 12_000;
const HEALTH_LOADOUT_CENTI = 30_000;

const attribute = (target: StatTarget) => bonus(target, target, 'flat', ATTRIBUTE_ITEM_POINTS, ATTRIBUTE_LOADOUT_POINTS);
const regen = (target: StatTarget) => bonus(target, target, 'flat', REGEN_ITEM_CENTI_PER_SECOND, REGEN_LOADOUT_CENTI_PER_SECOND);

/** Equipment-only budgets (wiki: History/Hearth Harbour and Embers, Gear-D3).
 * Skills/effects/Delve boons never pass through this compiler. Positive
 * benefits share one additive bucket per (target, layer); no multiplicative or
 * override modifier, and no layer without a rule, can bypass the loadout
 * budget. */
export const EQUIPMENT_STAT_BUDGETS: readonly EquipmentStatBudget[] = Object.freeze([
  shared('attackPower', 'pctAdd', 0, 3000),
  shared('rangedPower', 'pctAdd', 0, 3000),
  shared('maxHealth', 'pctAdd', 0, 2000),
  shared('criticalChance', 'flat', 0, 1000),
  shared('swingSpeed', 'pctAdd', -2500, 0),
  shared('toolVigourCost', 'pctAdd', -3000, 0),
  shared('sprintVigourCost', 'pctAdd', -3000, 0),
  // Additional bounded launch reserves/mitigation; no generic movement bonus.
  shared('maxVigour', 'pctAdd', 0, 4000),
  shared('armor', 'flat', 0, 350),
  shared('armorPct', 'flat', 0, 1000),
  // Gear-D3: attributes, maximum mana, regeneration and flat Health.
  attribute('str'), attribute('dex'), attribute('con'),
  attribute('int'), attribute('wis'), attribute('cha'),
  bonus('maxMana', 'maxMana', 'pctAdd', MAX_MANA_ITEM_BP, MAX_MANA_LOADOUT_BP),
  regen('healthRegen'), regen('manaRegen'), regen('vigourRegen'),
  bonus('maxHealth.flat', 'maxHealth', 'flat', HEALTH_ITEM_CENTI, HEALTH_LOADOUT_CENTI),
]);

export function equipmentStatBudget(target: StatTarget, layer: ModifierLayer): EquipmentStatBudget | undefined {
  return EQUIPMENT_STAT_BUDGETS.find(rule => rule.target === target && rule.layer === layer);
}

/** Authored single-item check used by content validation. */
export function equipmentModifierAllowed(modifier: Modifier): boolean {
  const rule = equipmentStatBudget(modifier.target, modifier.layer);
  return rule !== undefined && modifier.source === 'equipment'
    && modifier.family === undefined && Number.isSafeInteger(modifier.value)
    && modifier.value >= rule.minimum && modifier.value <= rule.maximum;
}

/** Authored whole-item check used by content validation: an item's modifiers,
 * summed per (target, layer), must stay within the per-item range. Without it,
 * several same-stat modifiers could each pass `equipmentModifierAllowed` and
 * together exceed the per-item cap. Returns the rules the item breaks. */
export function equipmentItemBudgetViolations(modifiers: readonly Modifier[]): readonly EquipmentStatBudget[] {
  const sums = new Map<EquipmentStatBudget, number>();
  for (const modifier of modifiers) {
    if (!equipmentModifierAllowed(modifier)) continue;
    const rule = equipmentStatBudget(modifier.target, modifier.layer)!;
    sums.set(rule, (sums.get(rule) ?? 0) + modifier.value);
  }
  return [...sums].filter(([rule, value]) => value < rule.minimum || value > rule.maximum).map(([rule]) => rule);
}

export function cappedEquipmentModifiers(modifiers: readonly Modifier[]): readonly Modifier[] {
  const sums = new Map<EquipmentStatBudget,number>();
  for (const modifier of modifiers) {
    // Computed skill deltas can exceed one item's budget. Retain valid
    // direction/shape and clamp them into the shared loadout bucket instead of
    // dropping an earned benefit. Authored item validation remains stricter.
    const rule = equipmentStatBudget(modifier.target, modifier.layer);
    if (rule === undefined || modifier.source !== 'equipment'
      || modifier.family !== undefined || !Number.isSafeInteger(modifier.value)
      || (rule.loadoutMinimum === 0 ? modifier.value < 0 : rule.loadoutMaximum === 0 && modifier.value > 0)) continue;
    sums.set(rule, Math.max(rule.loadoutMinimum,Math.min(rule.loadoutMaximum,(sums.get(rule)??0)+modifier.value)));
  }
  return [...sums].sort(([a],[b]) => a.key<b.key?-1:a.key>b.key?1:0).map(([rule,value]) => ({
    id:`equipment.budget.${rule.key}`, target:rule.target, value, layer:rule.layer, source:'equipment',
  }));
}

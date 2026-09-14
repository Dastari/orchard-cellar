import type { Modifier, StatTarget } from './modifiers.js';

/** Doc 60 equipment-only budgets. Skills/effects/Delve boons never pass through
 * this compiler. Positive benefits share one additive bucket; no multiplicative
 * or override modifier can bypass the catalogue's loadout budget. */
export const EQUIPMENT_STAT_BUDGETS = {
  attackPower: {layer:'pctAdd',minimum:0,maximum:3000},
  rangedPower: {layer:'pctAdd',minimum:0,maximum:3000},
  maxHealth: {layer:'pctAdd',minimum:0,maximum:2000},
  criticalChance: {layer:'flat',minimum:0,maximum:1000},
  swingSpeed: {layer:'pctAdd',minimum:-2500,maximum:0},
  toolVigourCost: {layer:'pctAdd',minimum:-3000,maximum:0},
  sprintVigourCost: {layer:'pctAdd',minimum:-3000,maximum:0},
  // Additional bounded launch reserves/mitigation; no generic movement bonus.
  maxVigour: {layer:'pctAdd',minimum:0,maximum:4000},
  armor: {layer:'flat',minimum:0,maximum:350},
  armorPct: {layer:'flat',minimum:0,maximum:1000},
} as const satisfies Partial<Record<StatTarget,{layer:Modifier['layer'];minimum:number;maximum:number}>>;

export function equipmentModifierAllowed(modifier: Modifier): boolean {
  const rule = EQUIPMENT_STAT_BUDGETS[modifier.target as keyof typeof EQUIPMENT_STAT_BUDGETS];
  return rule !== undefined && modifier.source === 'equipment' && modifier.layer === rule.layer
    && modifier.family === undefined && Number.isSafeInteger(modifier.value)
    && modifier.value >= rule.minimum && modifier.value <= rule.maximum;
}

export function cappedEquipmentModifiers(modifiers: readonly Modifier[]): readonly Modifier[] {
  const sums = new Map<keyof typeof EQUIPMENT_STAT_BUDGETS,number>();
  for (const modifier of modifiers) {
    // Computed skill deltas can exceed one item's budget. Retain valid
    // direction/shape and clamp them into the shared bucket instead of dropping
    // an earned benefit. Authored item validation remains stricter above.
    const budget = EQUIPMENT_STAT_BUDGETS[modifier.target as keyof typeof EQUIPMENT_STAT_BUDGETS];
    if (budget === undefined || modifier.source !== 'equipment' || modifier.layer !== budget.layer
      || modifier.family !== undefined || !Number.isSafeInteger(modifier.value)
      || (budget.minimum === 0 ? modifier.value < 0 : budget.maximum === 0 && modifier.value > 0)) continue;
    const target = modifier.target as keyof typeof EQUIPMENT_STAT_BUDGETS;
    const rule = EQUIPMENT_STAT_BUDGETS[target];
    sums.set(target, Math.max(rule.minimum,Math.min(rule.maximum,(sums.get(target)??0)+modifier.value)));
  }
  return [...sums].sort(([a],[b]) => a<b?-1:a>b?1:0).map(([target,value]) => ({
    id:`equipment.budget.${target}`, target, value, layer:EQUIPMENT_STAT_BUDGETS[target].layer, source:'equipment',
  }));
}

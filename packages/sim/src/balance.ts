export const RESOURCE_SCALE = 1_000;

export const TREE_COST_GROWTH = 1.18;
export const PRESS_COST_GROWTH = 1.35;
export const CASK_COST_GROWTH = 1.35;
export const TREE_BUFFER_SECONDS = 4 * 60 * 60;
export const SAPLING_GROWTH_DAYS = 1;
export const YOUNG_GROWTH_DAYS = 2;
export const YOUNG_PRODUCTION_MULTIPLIER = 0.25;
export const SPRING_GROWTH_MULTIPLIER = 2;
export const FEATURED_SEASON_MULTIPLIER = 1.6;
export const OFF_SEASON_MULTIPLIER = 0.85;
export const SEASON_TRAIT_MULTIPLIER = 1.8;
export const SUMMER_PRESS_MULTIPLIER = 1.6;
export const WINTER_AGING_MULTIPLIER = 1.6;

export type TreeSpeciesId =
  | 'seedlingApple'
  | 'orchardApple'
  | 'pear'
  | 'quince'
  | 'plum'
  | 'fig'
  | 'cherry'
  | 'heritageGrafts'
  | 'frostMedlar'
  | 'valeMedlar';

export interface TreeBalance {
  readonly id: TreeSpeciesId;
  readonly name: string;
  readonly saplingCost: number;
  readonly fruitPerSecond: number;
  readonly trait: 'none' | 'lifts' | 'feedsPress' | 'feedsCellar' | 'season';
  readonly traitValue: number;
  readonly featuredSeason?: 'summer' | 'autumn' | 'winter';
}

export const TREE_BALANCE: readonly TreeBalance[] = [
  { id: 'seedlingApple', name: 'Seedling Apple', saplingCost: 15, fruitPerSecond: 0.1, trait: 'none', traitValue: 0 },
  { id: 'orchardApple', name: 'Orchard Apple', saplingCost: 120, fruitPerSecond: 0.6, trait: 'lifts', traitValue: 0.015 },
  { id: 'pear', name: 'Pear', saplingCost: 900, fruitPerSecond: 3.2, trait: 'season', traitValue: SEASON_TRAIT_MULTIPLIER, featuredSeason: 'autumn' },
  { id: 'quince', name: 'Quince', saplingCost: 6_500, fruitPerSecond: 15, trait: 'feedsPress', traitValue: 0.02 },
  { id: 'plum', name: 'Plum', saplingCost: 48_000, fruitPerSecond: 70, trait: 'lifts', traitValue: 0.012 },
  { id: 'fig', name: 'Fig', saplingCost: 360_000, fruitPerSecond: 330, trait: 'season', traitValue: SEASON_TRAIT_MULTIPLIER, featuredSeason: 'summer' },
  { id: 'cherry', name: 'Cherry', saplingCost: 2_800_000, fruitPerSecond: 1_600, trait: 'season', traitValue: SEASON_TRAIT_MULTIPLIER, featuredSeason: 'summer' },
  { id: 'heritageGrafts', name: 'Heritage Grafts', saplingCost: 22_000_000, fruitPerSecond: 7_500, trait: 'lifts', traitValue: 0.02 },
  { id: 'frostMedlar', name: 'Frost Medlar', saplingCost: 170_000_000, fruitPerSecond: 36_000, trait: 'season', traitValue: SEASON_TRAIT_MULTIPLIER, featuredSeason: 'winter' },
  { id: 'valeMedlar', name: 'Vale Medlar', saplingCost: 1_300_000_000, fruitPerSecond: 170_000, trait: 'feedsCellar', traitValue: 0.025 },
] as const;

export interface EquipmentBalance {
  readonly tier: number;
  readonly name: string;
  readonly cost: number;
  readonly ratePerSecond: number;
  readonly pads?: number;
}

export const PRESS_BALANCE: readonly EquipmentBalance[] = [
  { tier: 1, name: 'Basket Press', cost: 25, ratePerSecond: 0.5, pads: 1 },
  { tier: 2, name: 'Screw Press', cost: 180, ratePerSecond: 3, pads: 1 },
  { tier: 3, name: 'Hydraulic Press', cost: 1_400, ratePerSecond: 18, pads: 1 },
  { tier: 4, name: 'Belt Line', cost: 12_000, ratePerSecond: 120, pads: 1 },
  { tier: 5, name: 'Pressing Works', cost: 100_000, ratePerSecond: 900, pads: 2 },
] as const;

export const CASK_BALANCE: readonly EquipmentBalance[] = [
  { tier: 1, name: 'Demijohn shelf', cost: 80, ratePerSecond: 0.2 },
  { tier: 2, name: 'Oak Barrels', cost: 300, ratePerSecond: 1.2 },
  { tier: 3, name: 'Foudre', cost: 2_400, ratePerSecond: 7 },
  { tier: 4, name: 'Stone Vault', cost: 20_000, ratePerSecond: 40 },
  { tier: 5, name: 'Cellar Cathedral', cost: 170_000, ratePerSecond: 240 },
] as const;

export const FIRST_PRESS_REPAIR_FRUIT = 50;
export const PRESS_MUST_YIELD = 0.5;
export const POMACE_YIELD = 0.15;
export const BOTTLE_VALUE = 0.1;
export const YARD_MUST_CAPACITY = 100;
export const CELLAR_DIG_COSTS = [0, 500, 25_000] as const;
export const MULCH_POMACE_COST = 5;

export type UpgradeCurrency = 'fruit' | 'pomace' | 'must' | 'bottles';
export type WorkbenchUpgradeId =
  | 'pruningShears' | 'tallLadders' | 'irrigation' | 'beeBoost' | 'cartMule'
  | 'copperPipe' | 'yardExpansion1' | 'yardExpansion2'
  | 'corkBench' | 'blendingBench' | 'cellarBook';

export interface WorkbenchUpgradeBalance {
  readonly id: WorkbenchUpgradeId;
  readonly name: string;
  readonly currency: UpgradeCurrency;
  readonly cost: number;
  readonly effect: number;
}

export const WORKBENCH_UPGRADES: readonly WorkbenchUpgradeBalance[] = [
  { id: 'pruningShears', name: 'Pruning Shears', currency: 'fruit', cost: 75, effect: 3 },
  { id: 'tallLadders', name: 'Tall Ladders', currency: 'fruit', cost: 450, effect: 4 },
  { id: 'irrigation', name: 'Irrigation', currency: 'fruit', cost: 3_000, effect: 0.5 },
  { id: 'beeBoost', name: 'Bee Boost', currency: 'fruit', cost: 20_000, effect: 0.1 },
  { id: 'cartMule', name: 'Cart & Mule', currency: 'fruit', cost: 140_000, effect: 1 },
  { id: 'copperPipe', name: 'Copper Pipe', currency: 'pomace', cost: 75, effect: 1 },
  { id: 'yardExpansion1', name: 'Yard Expansion I', currency: 'pomace', cost: 500, effect: 3 },
  { id: 'yardExpansion2', name: 'Yard Expansion II', currency: 'pomace', cost: 4_000, effect: 4 },
  { id: 'corkBench', name: 'Cork Bench', currency: 'must', cost: 250, effect: 0.15 },
  { id: 'blendingBench', name: 'Blending Bench', currency: 'must', cost: 1_800, effect: 0.25 },
  { id: 'cellarBook', name: 'Cellar Book', currency: 'must', cost: 13_000, effect: 0.4 },
] as const;

export const PLOT_CLEARINGS = [
  { plots: 15, fruitCost: 0 },
  { plots: 30, fruitCost: 2_000 },
  { plots: 60, fruitCost: 16_000 },
  { plots: 90, fruitCost: 130_000 },
  { plots: 120, fruitCost: 1_000_000 },
] as const;
export const CARE_MULTIPLIERS = [1, 1.25, 1.5, 2] as const;
export const CARE_DECAY_DAYS = 2;
export const MULCH_HOLD_DAYS = 3;
export const FED_BONUS_CAP = 0.5;

export const VIGOUR_CHARGE_PER_SECOND = 0.04;
export const AUTUMN_VIGOUR_MULTIPLIER = 4;
export const VIGOUR_BURST_POWER = 2;
export const VIGOUR_PARTIAL_SECONDS = [2, 5, 9, 15] as const;
export const AUTUMN_CHAIN_WINDOW_SECONDS = 8;
export const AUTUMN_CHAIN_STEP = 0.1;
export const AUTUMN_CHAIN_CAP = 2;

export const OFFLINE_CAP_SECONDS = 8 * 60 * 60;
export const OFFLINE_EFFICIENCY = 0.6;
export const OFFLINE_CHUNKS = 60;

/** Public ground drops persist for 20 real minutes at the 20 Hz authority rate. */
export const ITEM_DESPAWN_TICKS = 24_000;

/** New characters search this ring radius around the established island spawn area. */
export const SURVIVAL_SPAWN_SEARCH_RADIUS_TILES = 60;

/** Character stats/vitals (docs/25 and docs/06 §11). Vitals and tool costs use
 * centi-units so every authority calculation remains integer-only. */
export const BASE_ATTRIBUTE = 10;
export const MIN_ATTRIBUTE = 1;
export const MAX_ATTRIBUTE = 30;
export const BASIS_POINTS = 10_000;
export const CENTI_UNITS_PER_DISPLAY_UNIT = 100;
export const HEALTH_CENTI_PER_STRENGTH = 10 * CENTI_UNITS_PER_DISPLAY_UNIT;
export const MANA_CENTI_PER_INTELLIGENCE = 10 * CENTI_UNITS_PER_DISPLAY_UNIT;
export const VIGOUR_CENTI_PER_CONSTITUTION = 10 * CENTI_UNITS_PER_DISPLAY_UNIT;
export const HEALTH_REGEN_CENTI_PER_SECOND = 20;
export const MANA_REGEN_CENTI_PER_WISDOM = 10;
export const VIGOUR_REGEN_CENTI_PER_CONSTITUTION = 80;
export const REGEN_SWEEP_TICKS = 10;

export const TOOL_VIGOUR_BALANCE = {
  watering_can: { costCenti: 800, minimumSwingTicks: 6 },
  hoe: { costCenti: 1_000, minimumSwingTicks: 6 },
  fishing_rod: { costCenti: 600, minimumSwingTicks: 6 },
  bow: { costCenti: 1_000, minimumSwingTicks: 6 },
  sword: { costCenti: 1_200, minimumSwingTicks: 7 },
  axe: { costCenti: 1_500, minimumSwingTicks: 8 },
  pickaxe: { costCenti: 2_000, minimumSwingTicks: 10 },
  shovel: { costCenti: 1_200, minimumSwingTicks: 7 },
  hammer: { costCenti: 1_800, minimumSwingTicks: 9 },
} as const;

export type VitalsToolKind = keyof typeof TOOL_VIGOUR_BALANCE;

/** Durability is measured in successful authority-approved uses. A broken tool
 * remains an item and can always be repaired from renewable surface resources. */
export const TOOL_DURABILITY_BALANCE = {
  axe: { maximum: 200, repairItemKind: 'wood' },
  pickaxe: { maximum: 250, repairItemKind: 'stone' },
  hoe: { maximum: 180, repairItemKind: 'wood' },
  watering_can: { maximum: 160, repairItemKind: 'stone' },
  bow: { maximum: 300, repairItemKind: 'wood' },
  shovel: { maximum: 220, repairItemKind: 'stone' },
  hammer: { maximum: 300, repairItemKind: 'stone' },
  fishing_rod: { maximum: 160, repairItemKind: 'wood' },
  sword: { maximum: 250, repairItemKind: 'stone' },
} as const;

export type DurableToolKind = keyof typeof TOOL_DURABILITY_BALANCE;

export function repeatCost(base: number, owned: number, growth: number): number {
  return Math.ceil(base * growth ** owned);
}

export function treeMilestoneMultiplier(count: number): number {
  if (count >= 25) return 24;
  if (count >= 15) return 8;
  if (count >= 10) return 4;
  if (count >= 5) return 2;
  return 1;
}

export function equipmentMilestoneMultiplier(count: number): number {
  if (count >= 10) return 12;
  if (count >= 6) return 4;
  if (count >= 3) return 2;
  return 1;
}

export function vintageTerroir(bottles: number, terroirGain = 0): number {
  if (bottles < 100) return 0;
  return Math.floor((bottles / 100) ** 0.45 * 6 * (1 + terroirGain));
}

export function successionHeirlooms(terroirEver: number, heirloomsHeld: number): number {
  return Math.max(0, Math.floor((terroirEver / 500) ** 0.5) - heirloomsHeld);
}

export function lineageSeeds(heirloomsEver: number, seedsClaimed: number): number {
  return Math.max(0, Math.floor((heirloomsEver / 20) ** 0.5) - seedsClaimed);
}

export function soften(cap: number, base: number, sum: number): number {
  return cap - (cap - base) * Math.exp(-sum / (cap - base));
}

/** Vocabulary consumed by the deterministic legacy pacing simulator.
 * Authoring values live in @orchard/tools; simulation accepts this data as an
 * explicit input and never selects a species, upgrade, price, or rate by ID. */
export type TreeSpeciesId = string;
export type WorkbenchUpgradeId = string;
export type UpgradeCurrency = 'fruit' | 'pomace' | 'must' | 'bottles';

export interface TreeBalance {
  readonly id: TreeSpeciesId;
  readonly name: string;
  readonly saplingCost: number;
  readonly fruitPerSecond: number;
  readonly trait: 'none' | 'lifts' | 'feedsPress' | 'feedsCellar' | 'season';
  readonly traitValue: number;
  readonly featuredSeason?: 'summer' | 'autumn' | 'winter';
}

export interface EquipmentBalance {
  readonly tier: number;
  readonly name: string;
  readonly cost: number;
  readonly ratePerSecond: number;
  readonly pads?: number;
}

export interface WorkbenchUpgradeBalance {
  readonly id: WorkbenchUpgradeId;
  readonly name: string;
  readonly currency: UpgradeCurrency;
  readonly cost: number;
  readonly effect: number;
  /** Runtime value for the semantic mechanic when its authored display effect differs. */
  readonly mechanicValue?: number;
  readonly mechanic: 'care_decay_days' | 'care_level' | 'off_season_multiplier'
    | 'nearby_tree_multiplier' | 'auto_haul_fruit' | 'pipe_must'
    | 'press_pads' | 'bottle_yield';
}

export interface LegacyEconomyCatalog {
  readonly trees: readonly TreeBalance[];
  readonly presses: readonly EquipmentBalance[];
  readonly casks: readonly EquipmentBalance[];
  readonly upgrades: readonly WorkbenchUpgradeBalance[];
  readonly plotClearings: readonly { readonly plots: number; readonly fruitCost: number }[];
  readonly orchardPlots: readonly (readonly [number, number])[];
  readonly initialTree: { readonly species: TreeSpeciesId; readonly x: number; readonly y: number };
  readonly treeCostGrowth: number;
  readonly pressCostGrowth: number;
  readonly caskCostGrowth: number;
  readonly treeBufferSeconds: number;
  readonly saplingGrowthDays: number;
  readonly youngGrowthDays: number;
  readonly youngProductionMultiplier: number;
  readonly springGrowthMultiplier: number;
  readonly featuredSeasonMultiplier: number;
  readonly offSeasonMultiplier: number;
  readonly seasonTraitMultiplier: number;
  readonly summerPressMultiplier: number;
  readonly winterAgingMultiplier: number;
  readonly firstPressRepairFruit: number;
  readonly pressMustYield: number;
  readonly pomaceYield: number;
  readonly bottleValue: number;
  readonly yardMustCapacity: number;
  readonly cellarDigCosts: readonly number[];
  readonly mulchPomaceCost: number;
  readonly careMultipliers: readonly number[];
  readonly careDecayDays: number;
  readonly mulchHoldDays: number;
  readonly fedBonusCap: number;
  readonly vigourChargePerSecond: number;
  readonly autumnVigourMultiplier: number;
  readonly vigourBurstPower: number;
  readonly vigourPartialSeconds: readonly number[];
  readonly autumnChainWindowSeconds: number;
  readonly autumnChainStep: number;
  readonly autumnChainCap: number;
  readonly offlineCapSeconds: number;
  readonly offlineEfficiency: number;
  readonly offlineChunks: number;
  readonly vintageMinimumBottles: number;
  readonly vintageBottleDivisor: number;
  readonly vintageExponent: number;
  readonly vintageScale: number;
  readonly successionTerroirDivisor: number;
  readonly successionExponent: number;
  readonly lineageHeirloomDivisor: number;
  readonly lineageExponent: number;
}

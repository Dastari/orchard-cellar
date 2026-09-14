import type { LegacyEconomyCatalog, TreeSpeciesId, WorkbenchUpgradeId } from './economy-catalog.js';

export type TreeStage = 'sapling' | 'young' | 'mature';

export interface OrchardTreeState {
  readonly id: number;
  readonly species: TreeSpeciesId;
  readonly x: number;
  readonly y: number;
  readonly stage: TreeStage;
  readonly stageAgeTicks: number;
  readonly care: 0 | 1 | 2 | 3;
  readonly nextCareDecayTick: number;
  readonly mulchUntilTick: number;
  readonly bufferMicro: number;
  readonly productionRemainder: number;
}

export interface RunResources {
  readonly fruit: number;
  readonly pomace: number;
  readonly must: number;
  readonly bottles: number;
}

export interface EconomyState {
  readonly legacyMultiplier: number;
  readonly resources: RunResources;
  readonly trees: readonly OrchardTreeState[];
  readonly nextTreeId: number;
  readonly hopperFruitMicro: number;
  readonly yardMustMicro: number;
  readonly cellarMustMicro: number;
  readonly presses: readonly number[];
  readonly casks: readonly number[];
  readonly firstPressRepaired: boolean;
  readonly upgrades: readonly WorkbenchUpgradeId[];
  readonly plotsUnlocked: number;
  readonly vigour: number;
  readonly vigourRemainder: number;
  readonly autumnChain: number;
  readonly lastFullTendTick: number | null;
  readonly pressRemainder: number;
  readonly pomaceMicro: number;
  readonly caskRemainder: number;
  readonly bottleMicro: number;
  readonly knowledge: Readonly<Record<'grove' | 'press' | 'cellar' | 'estate', number>>;
  readonly firsts: {
    readonly harvested: boolean;
    readonly harvestedSpecies: readonly TreeSpeciesId[];
    readonly pressRun: boolean;
    readonly bottle: boolean;
  };
}

export type EconomyAction =
  | { readonly type: 'plant'; readonly species: TreeSpeciesId; readonly x: number; readonly y: number }
  | { readonly type: 'tend'; readonly treeId: number }
  | { readonly type: 'harvest'; readonly treeId: number }
  | { readonly type: 'haulFruit'; readonly amount?: number }
  | { readonly type: 'repairPress' }
  | { readonly type: 'buyPress'; readonly tier: number }
  | { readonly type: 'haulMust'; readonly destination: 'bank' | 'casks'; readonly amount?: number }
  | { readonly type: 'rackMust'; readonly amount?: number }
  | { readonly type: 'mulch'; readonly treeId: number }
  | { readonly type: 'buyUpgrade'; readonly id: WorkbenchUpgradeId }
  | { readonly type: 'clearPlots' }
  | { readonly type: 'buyCask'; readonly tier: number };

export function createInitialEconomy(catalog: LegacyEconomyCatalog): EconomyState {
  return {
    legacyMultiplier: 1,
    resources: { fruit: 0, pomace: 0, must: 0, bottles: 0 },
    trees: [{
      id: 1,
      species: catalog.initialTree.species,
      x: catalog.initialTree.x,
      y: catalog.initialTree.y,
      stage: 'sapling',
      stageAgeTicks: 0,
      care: 0,
      nextCareDecayTick: 0,
      mulchUntilTick: 0,
      bufferMicro: 0,
      productionRemainder: 0,
    }],
    nextTreeId: 2,
    hopperFruitMicro: 0,
    yardMustMicro: 0,
    cellarMustMicro: 0,
    presses: catalog.presses.map(() => 0),
    casks: catalog.casks.map(() => 0),
    firstPressRepaired: false,
    upgrades: [],
    plotsUnlocked: catalog.plotClearings[0]?.plots ?? 0,
    vigour: 0,
    vigourRemainder: 0,
    autumnChain: 0,
    lastFullTendTick: null,
    pressRemainder: 0,
    pomaceMicro: 0,
    caskRemainder: 0,
    bottleMicro: 0,
    knowledge: { grove: 0, press: 0, cellar: 0, estate: 0 },
    firsts: { harvested: false, harvestedSpecies: [], pressRun: false, bottle: false },
  };
}

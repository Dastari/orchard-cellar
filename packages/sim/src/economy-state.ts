import type { TreeSpeciesId, WorkbenchUpgradeId } from './balance.js';

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
    readonly pressRun: boolean;
    readonly bottle: boolean;
  };
}

export type EconomyAction =
  | { readonly type: 'plant'; readonly species: TreeSpeciesId }
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

const initialPlots: readonly (readonly [number, number])[] = [
  [12, 17], [16, 17], [20, 17],
  [12, 22], [16, 22], [20, 22],
  [12, 27], [16, 27], [20, 27],
  [12, 32], [16, 32], [20, 32],
  [12, 37], [16, 37], [20, 37],
] as const;
const expansionPlots = Array.from({ length: 10 }, (_, row) => [16 + row * 3, 0] as const)
  .flatMap(([y]) => [4, 7, 10, 13, 16, 19, 22, 25, 32, 35, 38, 41].map((x) => [x, y] as const));
const initialKeys = new Set(initialPlots.map(([x, y]) => `${x},${y}`));
export const ORCHARD_PLOTS: readonly (readonly [number, number])[] = [
  ...initialPlots,
  ...expansionPlots.filter(([x, y]) => !initialKeys.has(`${x},${y}`)),
].slice(0, 120);

export function createInitialEconomy(): EconomyState {
  return {
    resources: { fruit: 0, pomace: 0, must: 0, bottles: 0 },
    trees: [{
      id: 1,
      species: 'seedlingApple',
      x: 20,
      y: 17,
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
    presses: [0, 0, 0, 0, 0],
    casks: [0, 0, 0, 0, 0],
    firstPressRepaired: false,
    upgrades: [],
    plotsUnlocked: 15,
    vigour: 0,
    vigourRemainder: 0,
    autumnChain: 0,
    lastFullTendTick: null,
    pressRemainder: 0,
    pomaceMicro: 0,
    caskRemainder: 0,
    bottleMicro: 0,
    knowledge: { grove: 0, press: 0, cellar: 0, estate: 0 },
    firsts: { harvested: false, pressRun: false, bottle: false },
  };
}

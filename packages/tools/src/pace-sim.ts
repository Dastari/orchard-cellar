import {
  ORCHARD_PLOTS,
  CASK_BALANCE,
  TREE_COST_GROWTH,
  advanceTick,
  createInitialState,
  repeatCost,
  type Action,
  type FarmState,
} from '@orchard/sim';

const SECOND_TICKS = 60;
const MAX_SECONDS = 90 * 60;
// One minute includes the 64×64 map's grove/press/cellar travel and handling.
const ACTION_INTERVAL_SECONDS = 60;

export interface PaceResult {
  readonly firstPressSeconds: number | null;
  readonly firstBottleSeconds: number | null;
  readonly state: FarmState;
}

function chooseAction(state: FarmState): Action | null {
  const economy = state.economy;
  const tree = economy.trees[0];
  if (!tree) return null;
  if (!economy.firstPressRepaired) {
    if (economy.resources.fruit >= 50) return { type: 'repairPress' };
    if (tree.bufferMicro >= 5_000_000) return { type: 'harvest', treeId: tree.id };
    if (economy.vigour >= 10_000) return { type: 'tend', treeId: tree.id };
    return null;
  }
  const nextSeedlingCost = repeatCost(15, economy.trees.length, TREE_COST_GROWTH);
  // A sensible first grove reaches and slightly passes the five-tree milestone
  // before diverting all Fruit into pressing capital.
  if (economy.trees.length < 6 && economy.resources.fruit >= nextSeedlingCost) {
    const occupied = new Set(economy.trees.map((candidate) => `${candidate.x},${candidate.y}`));
    const plot = ORCHARD_PLOTS.slice(0, economy.plotsUnlocked).find(([x, y]) => !occupied.has(`${x},${y}`));
    if (plot) return { type: 'plant', species: 'seedlingApple', x: plot[0], y: plot[1] };
  }
  if (economy.resources.fruit > 0) return { type: 'haulFruit' };
  if (economy.casks.every((count) => count === 0) && economy.resources.must >= (CASK_BALANCE[0]?.cost ?? 40)) return { type: 'buyCask', tier: 1 };
  if (economy.casks.some((count) => count > 0) && economy.resources.must > 0) return { type: 'rackMust' };
  if (economy.yardMustMicro >= 1_000_000) return { type: 'haulMust', destination: 'bank' };
  if (tree.bufferMicro >= 5_000_000) return { type: 'harvest', treeId: tree.id };
  if (economy.vigour >= 10_000) return { type: 'tend', treeId: tree.id };
  return null;
}

export function runPaceBot(): PaceResult {
  let state = createInitialState(0x0cce11a);
  let firstPressSeconds: number | null = null;
  let firstBottleSeconds: number | null = null;
  for (let second = 1; second <= MAX_SECONDS; second += 1) {
    const action = second % ACTION_INTERVAL_SECONDS === 0 ? chooseAction(state) : null;
    state = advanceTick(state, action ? [{ type: 'move', direction: null }, action] : [{ type: 'move', direction: null }], second * SECOND_TICKS);
    if (firstPressSeconds === null && state.economy.firstPressRepaired) firstPressSeconds = second;
    if (firstBottleSeconds === null && state.economy.resources.bottles > 0) {
      firstBottleSeconds = second;
      break;
    }
  }
  return { firstPressSeconds, firstBottleSeconds, state };
}

function minutes(seconds: number | null): string {
  return seconds === null ? 'not reached' : `${(seconds / 60).toFixed(2)} min`;
}

const result = runPaceBot();
console.log(`First press: ${minutes(result.firstPressSeconds)} (target 15–25 min)`);
console.log(`First bottle: ${minutes(result.firstBottleSeconds)} (target 45–70 min)`);
if (result.firstPressSeconds === null || result.firstBottleSeconds === null) process.exitCode = 1;

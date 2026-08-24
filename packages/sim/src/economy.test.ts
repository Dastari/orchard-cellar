import { describe, expect, it } from 'vitest';
import { TREE_BUFFER_SECONDS } from './balance.js';
import { createInitialEconomy, type EconomyState, type OrchardTreeState } from './economy-state.js';
import { advanceEconomy, applyEconomyAction, groveFruitPerSecond } from './economy.js';
import { createInitialState, SIM_TICKS_PER_SECOND } from './state.js';
import { advanceTick } from './tick.js';
import { TICKS_PER_DAY } from './time.js';

const MICRO = 1_000_000;

function withResources(
  economy: EconomyState,
  resources: Partial<EconomyState['resources']>,
): EconomyState {
  return { ...economy, resources: { ...economy.resources, ...resources } };
}

function matureTree(overrides: Partial<OrchardTreeState> = {}): EconomyState {
  const economy = createInitialEconomy();
  const tree = economy.trees[0];
  if (!tree) throw new Error('The starter tree fixture is missing');
  return {
    ...economy,
    trees: [{
      ...tree,
      stage: 'mature',
      stageAgeTicks: 0,
      ...overrides,
    }],
  };
}

describe('M4 deterministic orchard economy', () => {
  it('grows the starter tree at the exact Spring half-day and 1.5-day boundaries', () => {
    const halfDay = TICKS_PER_DAY / 2;
    let economy = createInitialEconomy();

    economy = advanceEconomy(economy, 0, halfDay - 1);
    expect(economy.trees[0]).toMatchObject({ stage: 'sapling', stageAgeTicks: TICKS_PER_DAY - 2 });

    economy = advanceEconomy(economy, halfDay - 1, halfDay);
    expect(economy.trees[0]).toMatchObject({ stage: 'young', stageAgeTicks: 0 });

    economy = advanceEconomy(economy, halfDay, halfDay + TICKS_PER_DAY - 1);
    expect(economy.trees[0]).toMatchObject({ stage: 'young', stageAgeTicks: TICKS_PER_DAY * 2 - 2 });

    economy = advanceEconomy(economy, halfDay + TICKS_PER_DAY - 1, halfDay + TICKS_PER_DAY);
    expect(economy.trees[0]).toMatchObject({ stage: 'mature', stageAgeTicks: 0 });
  });

  it.each([
    [2_499, 1, 0],
    [2_500, 4, 0],
    [4_999, 4, 0],
    [5_000, 8, 0],
    [7_499, 8, 0],
    [7_500, 14, 1],
    [9_999, 14, 1],
    [10_000, 28, 1],
  ])('pays the documented Vigour bracket at %i charge', (vigour, fruit, care) => {
    const economy = matureTree({ species: 'orchardApple' });
    const tended = applyEconomyAction({ ...economy, vigour }, { type: 'tend', treeId: 1 }, 0);

    expect(tended.resources.fruit).toBe(fruit);
    expect(tended.trees[0]?.care).toBe(care);
    expect(tended.vigour).toBe(0);
  });

  it('decays one Care level at each exact two-day boundary', () => {
    let economy = matureTree({
      care: 3,
      nextCareDecayTick: TICKS_PER_DAY * 2,
      mulchUntilTick: 0,
    });

    economy = advanceEconomy(economy, 0, TICKS_PER_DAY * 2 - 1);
    expect(economy.trees[0]?.care).toBe(3);

    economy = advanceEconomy(economy, TICKS_PER_DAY * 2 - 1, TICKS_PER_DAY * 2);
    expect(economy.trees[0]?.care).toBe(2);

    economy = advanceEconomy(economy, TICKS_PER_DAY * 2, TICKS_PER_DAY * 4 - 1);
    expect(economy.trees[0]?.care).toBe(2);

    economy = advanceEconomy(economy, TICKS_PER_DAY * 4 - 1, TICKS_PER_DAY * 4);
    expect(economy.trees[0]?.care).toBe(1);

    economy = advanceEconomy(economy, TICKS_PER_DAY * 4, TICKS_PER_DAY * 6);
    expect(economy.trees[0]).toMatchObject({ care: 0, nextCareDecayTick: 0 });
  });

  it('caps a mature tree at four production hours until it is harvested', () => {
    const productionTicks = (TREE_BUFFER_SECONDS + 60 * 60) * SIM_TICKS_PER_SECOND;
    let economy = advanceEconomy(matureTree(), 0, productionTicks);
    const capMicro = Math.round(0.1 * 0.85 * MICRO) * TREE_BUFFER_SECONDS;

    expect(economy.trees[0]?.bufferMicro).toBe(capMicro);

    economy = applyEconomyAction(economy, { type: 'harvest', treeId: 1 }, productionTicks);
    expect(economy.resources.fruit).toBe(1_224);
    expect(economy.trees[0]?.bufferMicro).toBe(0);
    expect(economy.knowledge.grove).toBe(1);

    const harvestedAgain = applyEconomyAction(economy, { type: 'harvest', treeId: 1 }, productionTicks);
    expect(harvestedAgain).toBe(economy);
  });

  it('manually hauls fruit through a press, banks must, fills a cask, and makes a bottle', () => {
    let economy = withResources(createInitialEconomy(), { fruit: 200 });
    economy = applyEconomyAction(economy, { type: 'repairPress' }, 0);
    economy = applyEconomyAction(economy, { type: 'haulFruit', amount: 100 }, 0);
    economy = advanceEconomy(economy, 0, 200 * SIM_TICKS_PER_SECOND);

    expect(economy.resources).toEqual({ fruit: 50, pomace: 15, must: 0, bottles: 0 });
    expect(economy.hopperFruitMicro).toBe(0);
    expect(economy.yardMustMicro).toBe(50 * MICRO);
    expect(economy.knowledge.press).toBe(1);

    economy = applyEconomyAction(economy, { type: 'haulMust', destination: 'bank', amount: 40 }, 200 * SIM_TICKS_PER_SECOND);
    expect(economy.resources.must).toBe(40);
    expect(economy.yardMustMicro).toBe(10 * MICRO);

    economy = applyEconomyAction(economy, { type: 'buyCask', tier: 1 }, 200 * SIM_TICKS_PER_SECOND);
    economy = applyEconomyAction(economy, { type: 'haulMust', destination: 'casks' }, 200 * SIM_TICKS_PER_SECOND);
    economy = advanceEconomy(economy, 200 * SIM_TICKS_PER_SECOND, 700 * SIM_TICKS_PER_SECOND);

    expect(economy.resources).toEqual({ fruit: 50, pomace: 15, must: 0, bottles: 1 });
    expect(economy.cellarMustMicro).toBe(0);
    expect(economy.knowledge.cellar).toBe(1);
    expect(economy.firsts).toEqual({ harvested: false, harvestedSpecies: [], pressRun: true, bottle: true });
  });

  it('stops presses at yard capacity and lets Copper Pipe bypass the bottleneck', () => {
    let economy: EconomyState = {
      ...createInitialEconomy(),
      firstPressRepaired: true,
      presses: [1, 0, 0, 0, 0],
      hopperFruitMicro: 300 * MICRO,
    };
    economy = advanceEconomy(economy, 0, 1_000 * SIM_TICKS_PER_SECOND);
    expect(economy.yardMustMicro).toBe(100 * MICRO);
    expect(economy.hopperFruitMicro).toBe(100 * MICRO);
    const backed = advanceEconomy(economy, 1_000 * SIM_TICKS_PER_SECOND, 2_000 * SIM_TICKS_PER_SECOND);
    expect(backed.hopperFruitMicro).toBe(economy.hopperFruitMicro);

    const piped = advanceEconomy({
      ...economy,
      hopperFruitMicro: 10 * MICRO,
      yardMustMicro: 0,
      upgrades: ['copperPipe'],
    }, 0, 10 * SIM_TICKS_PER_SECOND);
    expect(piped.resources.must).toBe(2);
    expect(piped.yardMustMicro).toBe(500_000);
  });

  it('applies Summer pressing, Winter aging, and Autumn Vigour at season boundaries', () => {
    const press = {
      ...createInitialEconomy(),
      firstPressRepaired: true,
      presses: [1, 0, 0, 0, 0],
      hopperFruitMicro: 100 * MICRO,
    };
    const tenSeconds = 10 * SIM_TICKS_PER_SECOND;
    const springPress = advanceEconomy(press, 0, tenSeconds);
    const summerStart = TICKS_PER_DAY * 7;
    const summerPress = advanceEconomy(press, summerStart, summerStart + tenSeconds);
    expect(press.hopperFruitMicro - springPress.hopperFruitMicro).toBe(5 * MICRO);
    expect(press.hopperFruitMicro - summerPress.hopperFruitMicro).toBe(8 * MICRO);

    const cask = {
      ...createInitialEconomy(),
      casks: [1, 0, 0, 0, 0],
      cellarMustMicro: 100 * MICRO,
    };
    const hundredSeconds = 100 * SIM_TICKS_PER_SECOND;
    const springAging = advanceEconomy(cask, 0, hundredSeconds);
    const winterStart = TICKS_PER_DAY * 21;
    const winterAging = advanceEconomy(cask, winterStart, winterStart + hundredSeconds);
    expect(cask.cellarMustMicro - springAging.cellarMustMicro).toBe(20 * MICRO);
    expect(cask.cellarMustMicro - winterAging.cellarMustMicro).toBe(32 * MICRO);
    expect(springAging.resources.bottles).toBe(2);
    expect(winterAging.resources.bottles).toBe(3);

    const chargeTicks = 375;
    const springCharge = advanceEconomy(createInitialEconomy(), 0, chargeTicks);
    const autumnStart = TICKS_PER_DAY * 14;
    const autumnCharge = advanceEconomy(createInitialEconomy(), autumnStart, autumnStart + chargeTicks);
    expect(springCharge.vigour).toBe(2_500);
    expect(autumnCharge.vigour).toBe(10_000);
  });

  it('uses the explicit species season trait and the irrigation-reduced off-season penalty', () => {
    const pear = matureTree({ species: 'pear' });
    const tenSeconds = 10 * SIM_TICKS_PER_SECOND;
    const summerStart = TICKS_PER_DAY * 7;
    const autumnStart = TICKS_PER_DAY * 14;

    const featured = advanceEconomy(pear, autumnStart, autumnStart + tenSeconds);
    const offSeason = advanceEconomy(pear, summerStart, summerStart + tenSeconds);
    const irrigated = advanceEconomy({ ...pear, upgrades: ['irrigation'] }, summerStart, summerStart + tenSeconds);

    expect(featured.trees[0]?.bufferMicro).toBe(57_600_000);
    expect(offSeason.trees[0]?.bufferMicro).toBe(27_200_000);
    expect(irrigated.trees[0]?.bufferMicro).toBe(29_600_000);
  });

  it('buys wallet-specific workbench upgrades and clears plots up to the authored cap', () => {
    let economy = withResources(createInitialEconomy(), { fruit: 1_200_000, pomace: 75, must: 250 });
    economy = applyEconomyAction(economy, { type: 'buyUpgrade', id: 'pruningShears' }, 0);
    economy = applyEconomyAction(economy, { type: 'buyUpgrade', id: 'copperPipe' }, 0);
    economy = applyEconomyAction(economy, { type: 'buyUpgrade', id: 'corkBench' }, 0);
    expect(economy.upgrades).toEqual(['pruningShears', 'copperPipe', 'corkBench']);
    expect(economy.resources).toMatchObject({ fruit: 1_199_925, pomace: 0, must: 0 });

    for (const expected of [30, 60, 90, 120]) {
      economy = applyEconomyAction(economy, { type: 'clearPlots' }, 0);
      expect(economy.plotsUnlocked).toBe(expected);
    }
    const capped = applyEconomyAction(economy, { type: 'clearPlots' }, 0);
    expect(capped).toBe(economy);
  });

  it('spends pomace once to hold Care decay for the documented three days', () => {
    let economy = withResources(matureTree({
      care: 3,
      nextCareDecayTick: TICKS_PER_DAY * 2,
      mulchUntilTick: 0,
    }), { pomace: 10 });

    economy = applyEconomyAction(economy, { type: 'mulch', treeId: 1 }, 0);
    expect(economy.resources.pomace).toBe(5);
    expect(economy.trees[0]).toMatchObject({
      mulchUntilTick: TICKS_PER_DAY * 3,
      nextCareDecayTick: TICKS_PER_DAY * 5,
    });
    const duplicate = applyEconomyAction(economy, { type: 'mulch', treeId: 1 }, TICKS_PER_DAY);
    expect(duplicate).toBe(economy);

    economy = advanceEconomy(economy, 0, TICKS_PER_DAY * 5 - 1);
    expect(economy.trees[0]?.care).toBe(3);
    economy = advanceEconomy(economy, TICKS_PER_DAY * 5 - 1, TICKS_PER_DAY * 5);
    expect(economy.trees[0]?.care).toBe(2);
  });

  it('applies Pruning Shears to the first Care interval after tending', () => {
    const economy = { ...matureTree(), upgrades: ['pruningShears'] as const, vigour: 10_000 };
    const tended = applyEconomyAction(economy, { type: 'tend', treeId: 1 }, 0);
    expect(tended.trees[0]?.nextCareDecayTick).toBe(TICKS_PER_DAY * 3);
    expect(advanceEconomy(tended, 0, TICKS_PER_DAY * 3 - 1).trees[0]?.care).toBe(1);
    expect(advanceEconomy(tended, 0, TICKS_PER_DAY * 3).trees[0]?.care).toBe(0);
  });

  it('chains full Autumn tends and resets the chain on a partial tend', () => {
    const autumnStart = TICKS_PER_DAY * 14;
    let economy = { ...matureTree({ species: 'orchardApple' }), vigour: 10_000 };
    economy = applyEconomyAction(economy, { type: 'tend', treeId: 1 }, autumnStart);
    expect(economy).toMatchObject({ autumnChain: 1, resources: { fruit: 15 } });
    economy = applyEconomyAction({ ...economy, vigour: 10_000 }, { type: 'tend', treeId: 1 }, autumnStart + 60);
    expect(economy).toMatchObject({ autumnChain: 2, resources: { fruit: 36 } });
    economy = applyEconomyAction({ ...economy, vigour: 5_000 }, { type: 'tend', treeId: 1 }, autumnStart + 120);
    expect(economy).toMatchObject({ autumnChain: 0, lastFullTendTick: null });
  });

  it('applies lifts, feeds, Bee Boost, and bottle-value workbench effects', () => {
    const base = matureTree();
    const starter = base.trees[0];
    if (!starter) throw new Error('Missing starter');
    const orchardTrees = Array.from({ length: 5 }, (_, index) => ({
      ...starter, id: index + 2, species: 'orchardApple' as const, x: 30 + index, y: 30,
    }));
    expect(groveFruitPerSecond({ ...base, trees: [starter, ...orchardTrees] }, 'spring')).toBeCloseTo(9.7624, 6);

    const neighbor = { ...starter, id: 2, x: starter.x + 4 };
    expect(groveFruitPerSecond({ ...base, trees: [starter, neighbor], upgrades: ['beeBoost'] }, 'spring')).toBeCloseTo(0.352, 6);
    expect(groveFruitPerSecond({ ...base, trees: [starter, { ...neighbor, x: starter.x + 5 }], upgrades: ['beeBoost'] }, 'spring')).toBeCloseTo(0.32, 6);

    const quince = Array.from({ length: 25 }, (_, index) => ({
      ...starter, id: index + 1, species: 'quince' as const, x: index % 10, y: Math.floor(index / 10),
    }));
    const press = advanceEconomy({
      ...base, trees: quince, firstPressRepaired: true, presses: [1, 0, 0, 0, 0], hopperFruitMicro: 100 * MICRO,
    }, 0, 10 * SIM_TICKS_PER_SECOND);
    expect(100 * MICRO - press.hopperFruitMicro).toBe(5_500_000);

    for (const [upgrade, bottles] of [['corkBench', 3], ['blendingBench', 5], ['cellarBook', 8]] as const) {
      const cellar = advanceEconomy({
        ...base, upgrades: [upgrade], casks: [1, 0, 0, 0, 0], cellarMustMicro: 20 * MICRO,
      }, 0, 100 * SIM_TICKS_PER_SECOND);
      expect(cellar.resources.bottles).toBe(bottles);
    }
  });

  it('plants only the requested unlocked plot and awards count milestones once', () => {
    let economy = withResources(createInitialEconomy(), { fruit: 10_000 });
    const occupied = applyEconomyAction(economy, { type: 'plant', species: 'seedlingApple', x: 20, y: 17 }, 0);
    expect(occupied).toBe(economy);
    const locked = applyEconomyAction(economy, { type: 'plant', species: 'seedlingApple', x: 4, y: 16 }, 0);
    expect(locked).toBe(economy);

    for (const [x, y] of [[12, 17], [16, 17], [12, 22], [16, 22]] as const) {
      economy = applyEconomyAction(economy, { type: 'plant', species: 'seedlingApple', x, y }, 0);
    }
    expect(economy.trees).toHaveLength(5);
    expect(economy.knowledge.grove).toBe(1);
  });

  it('awards Press and Cellar Knowledge at exact equipment count milestones', () => {
    let press = withResources({ ...createInitialEconomy(), firstPressRepaired: true, presses: [1, 0, 0, 0, 0] }, { pomace: 10_000 });
    press = applyEconomyAction(press, { type: 'buyPress', tier: 1 }, 0);
    expect(press.knowledge.press).toBe(0);
    press = applyEconomyAction(press, { type: 'buyPress', tier: 1 }, 0);
    expect(press).toMatchObject({ presses: [3, 0, 0, 0, 0], knowledge: { press: 1 } });

    let cellar = withResources(createInitialEconomy(), { must: 10_000 });
    cellar = applyEconomyAction(cellar, { type: 'buyCask', tier: 1 }, 0);
    cellar = applyEconomyAction(cellar, { type: 'buyCask', tier: 1 }, 0);
    expect(cellar.knowledge.cellar).toBe(0);
    cellar = applyEconomyAction(cellar, { type: 'buyCask', tier: 1 }, 0);
    expect(cellar).toMatchObject({ casks: [3, 0, 0, 0, 0], knowledge: { cellar: 1 } });
  });

  it('awards one Grove Knowledge for the first harvest of each species', () => {
    const economy = matureTree({ bufferMicro: MICRO });
    const starter = economy.trees[0];
    if (!starter) throw new Error('Missing starter');
    let harvested = applyEconomyAction({
      ...economy,
      trees: [starter, { ...starter, id: 2, species: 'pear', x: 16, bufferMicro: MICRO }],
    }, { type: 'harvest', treeId: 1 }, 0);
    harvested = applyEconomyAction(harvested, { type: 'harvest', treeId: 2 }, 0);
    expect(harvested.knowledge.grove).toBe(2);
    expect(harvested.firsts.harvestedSpecies).toEqual(['seedlingApple', 'pear']);
  });

  it('charges each purchase only to its documented wallet and repeat-cost count', () => {
    const wallets = { fruit: 18, pomace: 34, must: 40, bottles: 7 };
    const planted = applyEconomyAction(withResources(createInitialEconomy(), wallets), { type: 'plant', species: 'seedlingApple', x: 12, y: 17 }, 0);
    expect(planted.resources).toEqual({ ...wallets, fruit: 0 });
    expect(planted.trees).toHaveLength(2);

    const underfundedRepair = withResources(createInitialEconomy(), wallets);
    const repaired = applyEconomyAction(underfundedRepair, { type: 'repairPress' }, 0);
    expect(repaired).toBe(underfundedRepair);

    let pressEconomy = withResources(createInitialEconomy(), { fruit: 50, pomace: 34, must: 40, bottles: 7 });
    pressEconomy = applyEconomyAction(pressEconomy, { type: 'repairPress' }, 0);
    expect(pressEconomy.resources).toEqual({ fruit: 0, pomace: 34, must: 40, bottles: 7 });
    pressEconomy = applyEconomyAction(pressEconomy, { type: 'buyPress', tier: 1 }, 0);
    expect(pressEconomy.resources).toEqual({ fruit: 0, pomace: 0, must: 40, bottles: 7 });
    expect(pressEconomy.presses[0]).toBe(2);

    const caskEconomy = applyEconomyAction(withResources(createInitialEconomy(), wallets), { type: 'buyCask', tier: 1 }, 0);
    expect(caskEconomy.resources).toEqual({ fruit: 18, pomace: 34, must: 0, bottles: 7 });
    expect(caskEconomy.casks[0]).toBe(1);
  });

  it('runs the starter tree through a deterministic multi-day first-bottle chain', () => {
    const summerDayOne = TICKS_PER_DAY * 7;
    let state = createInitialState(0x0cce11a);

    state = advanceTick(state, [], summerDayOne);
    expect(state.economy.trees[0]?.stage).toBe('mature');

    state = advanceTick(state, [{ type: 'harvest', treeId: 1 }], summerDayOne);
    expect(state.economy.resources.fruit).toBe(828);
    state = advanceTick(state, [
      { type: 'repairPress' },
      { type: 'haulFruit', amount: 400 },
    ], summerDayOne);
    expect(state.economy.resources.fruit).toBe(378);

    state = advanceTick(state, [], summerDayOne + TICKS_PER_DAY);
    expect(state.economy.resources.pomace).toBe(30);
    expect(state.economy.yardMustMicro).toBe(100 * MICRO);
    expect(state.economy.hopperFruitMicro).toBe(200 * MICRO);

    state = advanceTick(state, [
      { type: 'haulMust', destination: 'bank', amount: 40 },
      { type: 'buyCask', tier: 1 },
      { type: 'haulMust', destination: 'casks' },
    ], summerDayOne + TICKS_PER_DAY);
    expect(state.economy.resources.must).toBe(0);
    expect(state.economy.cellarMustMicro).toBe(60 * MICRO);

    state = advanceTick(state, [], summerDayOne + TICKS_PER_DAY * 2);
    expect(state.economy.resources.bottles).toBe(6);
    expect(state.economy.firsts).toEqual({ harvested: true, harvestedSpecies: ['seedlingApple'], pressRun: true, bottle: true });
    expect(state.economy.knowledge).toMatchObject({ grove: 1, press: 1, cellar: 1 });
  });
});

import {
  AUTUMN_CHAIN_CAP,
  AUTUMN_CHAIN_STEP,
  AUTUMN_CHAIN_WINDOW_SECONDS,
  AUTUMN_VIGOUR_MULTIPLIER,
  BOTTLE_VALUE,
  CARE_DECAY_DAYS,
  CARE_MULTIPLIERS,
  CASK_BALANCE,
  CASK_COST_GROWTH,
  FED_BONUS_CAP,
  FEATURED_SEASON_MULTIPLIER,
  FIRST_PRESS_REPAIR_FRUIT,
  MULCH_HOLD_DAYS,
  MULCH_POMACE_COST,
  POMACE_YIELD,
  PLOT_CLEARINGS,
  PRESS_BALANCE,
  PRESS_COST_GROWTH,
  PRESS_MUST_YIELD,
  SAPLING_GROWTH_DAYS,
  SEASON_TRAIT_MULTIPLIER,
  SPRING_GROWTH_MULTIPLIER,
  SUMMER_PRESS_MULTIPLIER,
  TREE_BALANCE,
  TREE_BUFFER_SECONDS,
  TREE_COST_GROWTH,
  VIGOUR_BURST_POWER,
  VIGOUR_CHARGE_PER_SECOND,
  VIGOUR_PARTIAL_SECONDS,
  WINTER_AGING_MULTIPLIER,
  WORKBENCH_UPGRADES,
  YARD_MUST_CAPACITY,
  YOUNG_GROWTH_DAYS,
  YOUNG_PRODUCTION_MULTIPLIER,
  equipmentMilestoneMultiplier,
  repeatCost,
  treeMilestoneMultiplier,
  type TreeBalance,
  type TreeSpeciesId,
} from './balance.js';
import { ORCHARD_PLOTS, type EconomyAction, type EconomyState, type OrchardTreeState } from './economy-state.js';
import { SIM_TICKS_PER_SECOND } from './state.js';
import { calendarAtTick, nextDayTick, TICKS_PER_DAY, type Season } from './time.js';

const MICRO = 1_000_000;
const MAX_VIGOUR = 10_000;
const STARTING_PRESS_PADS = 5;
const treeById = new Map<TreeSpeciesId, TreeBalance>(TREE_BALANCE.map((entry) => [entry.id, entry]));

function treeBalance(species: TreeSpeciesId): TreeBalance {
  const entry = treeById.get(species);
  if (!entry) throw new Error(`Unknown tree species ${species}`);
  return entry;
}

function countSpecies(economy: EconomyState, species: TreeSpeciesId): number {
  return economy.trees.filter((tree) => tree.species === species).length;
}

function hasUpgrade(economy: EconomyState, id: EconomyState['upgrades'][number]): boolean {
  return economy.upgrades.includes(id);
}

function seasonMultiplier(entry: TreeBalance, season: Season, economy: EconomyState): number {
  if (entry.featuredSeason === season) return SEASON_TRAIT_MULTIPLIER;
  if (season === 'spring') return FEATURED_SEASON_MULTIPLIER;
  return hasUpgrade(economy, 'irrigation') ? 0.925 : 0.85;
}

function productionStageMultiplier(tree: OrchardTreeState): number {
  if (tree.stage === 'sapling') return 0;
  return tree.stage === 'young' ? YOUNG_PRODUCTION_MULTIPLIER : 1;
}

function liftMultiplier(tree: OrchardTreeState, economy: EconomyState): number {
  let bonus = 0;
  for (const entry of TREE_BALANCE) {
    if (entry.trait !== 'lifts' || entry.id === tree.species) continue;
    bonus += Math.floor(countSpecies(economy, entry.id) / 5) * entry.traitValue;
  }
  return 1 + bonus;
}

function treeRateMicro(tree: OrchardTreeState, economy: EconomyState, season: Season): number {
  const entry = treeBalance(tree.species);
  const count = countSpecies(economy, tree.species);
  const rate = entry.fruitPerSecond
    * productionStageMultiplier(tree)
    * (CARE_MULTIPLIERS[tree.care] ?? 1)
    * treeMilestoneMultiplier(count)
    * seasonMultiplier(entry, season, economy)
    * liftMultiplier(tree, economy)
    * economy.legacyMultiplier;
  const beeBoost = hasUpgrade(economy, 'beeBoost') && economy.trees.some((other) => other.id !== tree.id
    && Math.abs(other.x - tree.x) <= 4 && Math.abs(other.y - tree.y) <= 4) ? 1.1 : 1;
  return Math.round(rate * beeBoost * MICRO);
}

export function groveFruitPerSecond(economy: EconomyState, season: Season): number {
  return economy.trees.reduce((sum, tree) => sum + treeRateMicro(tree, economy, season), 0) / MICRO;
}

function fedCapacityMultiplier(economy: EconomyState, trait: 'feedsPress' | 'feedsCellar'): number {
  let bonus = 0;
  for (const entry of TREE_BALANCE) {
    if (entry.trait === trait) bonus += Math.floor(countSpecies(economy, entry.id) / 5) * entry.traitValue;
  }
  return 1 + Math.min(FED_BONUS_CAP, bonus);
}

function decrementCare(tree: OrchardTreeState, tick: number, economy: EconomyState): OrchardTreeState {
  if (tree.care === 0 || tree.nextCareDecayTick === 0 || tick < tree.nextCareDecayTick || tick < tree.mulchUntilTick) return tree;
  const care = Math.max(0, tree.care - 1) as OrchardTreeState['care'];
  const decayDays = hasUpgrade(economy, 'pruningShears') ? 3 : CARE_DECAY_DAYS;
  return { ...tree, care, nextCareDecayTick: care === 0 ? 0 : tree.nextCareDecayTick + decayDays * TICKS_PER_DAY };
}

function advanceTree(tree: OrchardTreeState, economy: EconomyState, startTick: number, endTick: number, season: Season, efficiency: number): OrchardTreeState {
  let current = decrementCare(tree, startTick, economy);
  let cursor = startTick;
  while (cursor < endTick) {
    const growthMultiplier = (season === 'spring' ? SPRING_GROWTH_MULTIPLIER : 1) * efficiency;
    const threshold = current.stage === 'sapling' ? SAPLING_GROWTH_DAYS * TICKS_PER_DAY
      : current.stage === 'young' ? YOUNG_GROWTH_DAYS * TICKS_PER_DAY : Number.POSITIVE_INFINITY;
    const growthTicks = Number.isFinite(threshold) ? Math.ceil((threshold - current.stageAgeTicks) / growthMultiplier) : Number.POSITIVE_INFINITY;
    const growthBoundary = cursor + Math.max(1, growthTicks);
    const careBoundary = current.nextCareDecayTick > cursor ? current.nextCareDecayTick : Number.POSITIVE_INFINITY;
    const boundary = Math.min(endTick, growthBoundary, careBoundary);
    const delta = boundary - cursor;
    const rateMicro = treeRateMicro(current, economy, season);
    const numerator = Math.floor(rateMicro * delta * efficiency) + current.productionRemainder;
    const produced = Math.floor(numerator / SIM_TICKS_PER_SECOND);
    const cap = rateMicro * TREE_BUFFER_SECONDS;
    const bufferMicro = current.bufferMicro >= cap ? current.bufferMicro : Math.min(cap, current.bufferMicro + produced);
    current = {
      ...current,
      stageAgeTicks: Number.isFinite(threshold) ? current.stageAgeTicks + delta * growthMultiplier : current.stageAgeTicks,
      bufferMicro,
      productionRemainder: numerator % SIM_TICKS_PER_SECOND,
    };
    cursor = boundary;
    if (cursor === growthBoundary) {
      current = { ...current, stage: current.stage === 'sapling' ? 'young' : 'mature', stageAgeTicks: 0 };
    }
    current = decrementCare(current, cursor, economy);
  }
  return current;
}

function equipmentRate(balance: typeof PRESS_BALANCE | typeof CASK_BALANCE, counts: readonly number[]): number {
  return balance.reduce((sum, entry, index) => {
    const count = counts[index] ?? 0;
    return sum + entry.ratePerSecond * count * equipmentMilestoneMultiplier(count);
  }, 0);
}

function advancePresses(economy: EconomyState, deltaTicks: number, season: Season, efficiency: number): EconomyState {
  const rate = equipmentRate(PRESS_BALANCE, economy.presses)
    * (season === 'summer' ? SUMMER_PRESS_MULTIPLIER : 1)
    * fedCapacityMultiplier(economy, 'feedsPress')
    * economy.legacyMultiplier;
  const numerator = Math.round(rate * MICRO * efficiency) * deltaTicks + economy.pressRemainder;
  const capacity = Math.floor(numerator / SIM_TICKS_PER_SECOND);
  const pipe = hasUpgrade(economy, 'copperPipe');
  const yardRoom = pipe ? Number.POSITIVE_INFINITY : Math.max(0, YARD_MUST_CAPACITY * MICRO - economy.yardMustMicro);
  const yardLimitedFruit = pipe ? Number.POSITIVE_INFINITY : Math.floor(yardRoom / PRESS_MUST_YIELD);
  const processed = Math.min(economy.hopperFruitMicro, capacity, yardLimitedFruit);
  if (processed <= 0) return { ...economy, pressRemainder: numerator % SIM_TICKS_PER_SECOND };
  const pomaceMicro = economy.pomaceMicro + Math.floor(processed * POMACE_YIELD);
  const pomace = Math.floor(pomaceMicro / MICRO);
  const mustOutput = Math.floor(processed * PRESS_MUST_YIELD);
  const combinedYardMust = economy.yardMustMicro + mustOutput;
  const pipedMust = pipe ? Math.floor(combinedYardMust / MICRO) : 0;
  const firstRun = !economy.firsts.pressRun;
  return {
    ...economy,
    resources: { ...economy.resources, pomace: economy.resources.pomace + pomace, must: economy.resources.must + pipedMust },
    hopperFruitMicro: economy.hopperFruitMicro - processed,
    yardMustMicro: pipe ? combinedYardMust % MICRO : combinedYardMust,
    pressRemainder: numerator % SIM_TICKS_PER_SECOND,
    pomaceMicro: pomaceMicro % MICRO,
    knowledge: firstRun ? { ...economy.knowledge, press: economy.knowledge.press + 1 } : economy.knowledge,
    firsts: firstRun ? { ...economy.firsts, pressRun: true } : economy.firsts,
  };
}

function advanceCasks(economy: EconomyState, deltaTicks: number, season: Season, efficiency: number): EconomyState {
  const rate = equipmentRate(CASK_BALANCE, economy.casks)
    * (season === 'winter' ? WINTER_AGING_MULTIPLIER : 1)
    * fedCapacityMultiplier(economy, 'feedsCellar')
    * economy.legacyMultiplier;
  const numerator = Math.round(rate * MICRO * efficiency) * deltaTicks + economy.caskRemainder;
  const capacity = Math.floor(numerator / SIM_TICKS_PER_SECOND);
  const aged = Math.min(economy.cellarMustMicro, capacity);
  if (aged <= 0) return { ...economy, caskRemainder: numerator % SIM_TICKS_PER_SECOND };
  const bottleValue = hasUpgrade(economy, 'cellarBook') ? 0.4
    : hasUpgrade(economy, 'blendingBench') ? 0.25
      : hasUpgrade(economy, 'corkBench') ? 0.15 : BOTTLE_VALUE;
  const bottleMicro = economy.bottleMicro + Math.floor(aged * bottleValue);
  const bottles = Math.floor(bottleMicro / MICRO);
  const firstBottle = bottles > 0 && !economy.firsts.bottle;
  return {
    ...economy,
    resources: { ...economy.resources, bottles: economy.resources.bottles + bottles },
    cellarMustMicro: economy.cellarMustMicro - aged,
    caskRemainder: numerator % SIM_TICKS_PER_SECOND,
    bottleMicro: bottleMicro % MICRO,
    knowledge: firstBottle ? { ...economy.knowledge, cellar: economy.knowledge.cellar + 1 } : economy.knowledge,
    firsts: firstBottle ? { ...economy.firsts, bottle: true } : economy.firsts,
  };
}

function advanceSegment(economy: EconomyState, startTick: number, endTick: number, season: Season, options: EconomyAdvanceOptions): EconomyState {
  const delta = endTick - startTick;
  const vigourPerSecond = VIGOUR_CHARGE_PER_SECOND * (season === 'autumn' ? AUTUMN_VIGOUR_MULTIPLIER : 1);
  const vigourNumerator = options.chargeVigour ? Math.round(vigourPerSecond * MAX_VIGOUR) * delta + economy.vigourRemainder : economy.vigourRemainder;
  const vigour = options.chargeVigour ? Math.min(MAX_VIGOUR, economy.vigour + Math.floor(vigourNumerator / SIM_TICKS_PER_SECOND)) : economy.vigour;
  let next: EconomyState = {
    ...economy,
    vigour,
    vigourRemainder: vigour === MAX_VIGOUR ? 0 : vigourNumerator % SIM_TICKS_PER_SECOND,
    trees: economy.trees.map((tree) => advanceTree(tree, economy, startTick, endTick, season, options.efficiency)),
  };
  next = advancePresses(next, delta, season, options.efficiency);
  return advanceCasks(next, delta, season, options.efficiency);
}

export interface EconomyAdvanceOptions {
  readonly efficiency: number;
  readonly chargeVigour: boolean;
}

const LIVE_ADVANCE: EconomyAdvanceOptions = { efficiency: 1, chargeVigour: true };

export function advanceEconomy(economy: EconomyState, startTick: number, endTick: number, options: EconomyAdvanceOptions = LIVE_ADVANCE): EconomyState {
  let next = economy;
  let cursor = startTick;
  while (cursor < endTick) {
    const boundary = Math.min(endTick, nextDayTick(cursor));
    next = advanceSegment(next, cursor, boundary, calendarAtTick(cursor).season, options);
    cursor = boundary;
  }
  return next;
}

function replaceTree(economy: EconomyState, tree: OrchardTreeState): EconomyState {
  return { ...economy, trees: economy.trees.map((candidate) => candidate.id === tree.id ? tree : candidate) };
}

function applyTend(economy: EconomyState, action: Extract<EconomyAction, { type: 'tend' }>, tick: number): EconomyState {
  const tree = economy.trees.find((candidate) => candidate.id === action.treeId);
  if (!tree || economy.vigour <= 0) return economy;
  const full = economy.vigour >= MAX_VIGOUR;
  const season = calendarAtTick(tick).season;
  const payoutIndex = economy.vigour < 2_500 ? 0 : economy.vigour < 5_000 ? 1 : economy.vigour < 7_500 ? 2 : 3;
  const recentFull = full && season === 'autumn' && economy.lastFullTendTick !== null && tick - economy.lastFullTendTick <= AUTUMN_CHAIN_WINDOW_SECONDS * SIM_TICKS_PER_SECOND;
  const chain = full && season === 'autumn' ? (recentFull ? economy.autumnChain + 1 : 1) : 0;
  const chainMultiplier = Math.min(AUTUMN_CHAIN_CAP, 1 + Math.max(0, chain - 1) * AUTUMN_CHAIN_STEP);
  const burst = full ? VIGOUR_BURST_POWER : 1;
  const payout = Math.floor(groveFruitPerSecond(economy, season) * (VIGOUR_PARTIAL_SECONDS[payoutIndex] ?? 2) * burst * chainMultiplier);
  const raisesCare = economy.vigour >= 7_500;
  const care = (raisesCare ? Math.min(3, tree.care + 1) : tree.care) as OrchardTreeState['care'];
  const decayDays = hasUpgrade(economy, 'pruningShears') ? 3 : CARE_DECAY_DAYS;
  const tended = { ...tree, care, nextCareDecayTick: raisesCare ? tick + decayDays * TICKS_PER_DAY : tree.nextCareDecayTick };
  const next = replaceTree(economy, tended);
  return {
    ...next,
    resources: { ...next.resources, fruit: next.resources.fruit + payout },
    vigour: 0,
    vigourRemainder: 0,
    autumnChain: chain,
    lastFullTendTick: full && season === 'autumn' ? tick : null,
  };
}

function applyHarvest(economy: EconomyState, action: Extract<EconomyAction, { type: 'harvest' }>): EconomyState {
  const tree = economy.trees.find((candidate) => candidate.id === action.treeId);
  if (!tree) return economy;
  const fruit = Math.floor(tree.bufferMicro / MICRO);
  if (fruit <= 0) return economy;
  const next = replaceTree(economy, { ...tree, bufferMicro: tree.bufferMicro - fruit * MICRO });
  const firstSpeciesHarvest = !economy.firsts.harvestedSpecies.includes(tree.species);
  return {
    ...next,
    resources: { ...next.resources, fruit: next.resources.fruit + (hasUpgrade(economy, 'cartMule') ? 0 : fruit) },
    hopperFruitMicro: next.hopperFruitMicro + (hasUpgrade(economy, 'cartMule') ? fruit * MICRO : 0),
    knowledge: firstSpeciesHarvest ? { ...next.knowledge, grove: next.knowledge.grove + 1 } : next.knowledge,
    firsts: firstSpeciesHarvest ? {
      ...next.firsts,
      harvested: true,
      harvestedSpecies: [...next.firsts.harvestedSpecies, tree.species],
    } : next.firsts,
  };
}

function applyPlant(economy: EconomyState, action: Extract<EconomyAction, { type: 'plant' }>, tick: number): EconomyState {
  const species = action.species;
  const occupied = new Set(economy.trees.map((tree) => `${tree.x},${tree.y}`));
  const plot = ORCHARD_PLOTS.slice(0, economy.plotsUnlocked).find(([x, y]) => x === action.x && y === action.y && !occupied.has(`${x},${y}`));
  const entry = treeBalance(species);
  const previousCount = countSpecies(economy, species);
  const cost = repeatCost(entry.saplingCost, previousCount, TREE_COST_GROWTH);
  if (!plot || economy.resources.fruit < cost) return economy;
  const reachedMilestone = [5, 10, 15, 25].includes(previousCount + 1);
  const tree: OrchardTreeState = {
    id: economy.nextTreeId, species, x: plot[0], y: plot[1], stage: 'sapling', stageAgeTicks: 0,
    care: 0, nextCareDecayTick: 0, mulchUntilTick: tick, bufferMicro: 0, productionRemainder: 0,
  };
  return {
    ...economy,
    resources: { ...economy.resources, fruit: economy.resources.fruit - cost },
    trees: [...economy.trees, tree],
    nextTreeId: economy.nextTreeId + 1,
    knowledge: reachedMilestone ? { ...economy.knowledge, grove: economy.knowledge.grove + 1 } : economy.knowledge,
  };
}

function applyRepairPress(economy: EconomyState): EconomyState {
  if (economy.firstPressRepaired || economy.resources.fruit < FIRST_PRESS_REPAIR_FRUIT) return economy;
  const presses = [...economy.presses]; presses[0] = 1;
  return { ...economy, resources: { ...economy.resources, fruit: economy.resources.fruit - FIRST_PRESS_REPAIR_FRUIT }, presses, firstPressRepaired: true };
}

function applyBuyPress(economy: EconomyState, tier: number): EconomyState {
  const entry = PRESS_BALANCE[tier - 1];
  if (!entry || !economy.firstPressRepaired) return economy;
  const usedPads = PRESS_BALANCE.reduce((sum, candidate, index) => sum + (economy.presses[index] ?? 0) * (candidate.pads ?? 1), 0);
  const pads = STARTING_PRESS_PADS + (hasUpgrade(economy, 'yardExpansion1') ? 3 : 0) + (hasUpgrade(economy, 'yardExpansion2') ? 4 : 0);
  if (usedPads + (entry.pads ?? 1) > pads) return economy;
  const owned = economy.presses[tier - 1] ?? 0;
  const cost = repeatCost(entry.cost, owned, PRESS_COST_GROWTH);
  if (economy.resources.pomace < cost) return economy;
  const presses = [...economy.presses]; presses[tier - 1] = owned + 1;
  const milestone = [3, 6, 10].includes(owned + 1);
  return {
    ...economy,
    resources: { ...economy.resources, pomace: economy.resources.pomace - cost },
    presses,
    knowledge: milestone ? { ...economy.knowledge, press: economy.knowledge.press + 1 } : economy.knowledge,
  };
}

function applyBuyCask(economy: EconomyState, tier: number): EconomyState {
  const entry = CASK_BALANCE[tier - 1];
  if (!entry) return economy;
  const owned = economy.casks[tier - 1] ?? 0;
  const cost = repeatCost(entry.cost, owned, CASK_COST_GROWTH);
  if (economy.resources.must < cost) return economy;
  const casks = [...economy.casks]; casks[tier - 1] = owned + 1;
  const milestone = [3, 6, 10].includes(owned + 1);
  return {
    ...economy,
    resources: { ...economy.resources, must: economy.resources.must - cost },
    casks,
    knowledge: milestone ? { ...economy.knowledge, cellar: economy.knowledge.cellar + 1 } : economy.knowledge,
  };
}

export function applyEconomyAction(economy: EconomyState, action: EconomyAction, tick: number): EconomyState {
  switch (action.type) {
    case 'plant': return applyPlant(economy, action, tick);
    case 'tend': return applyTend(economy, action, tick);
    case 'harvest': return applyHarvest(economy, action);
    case 'repairPress': return applyRepairPress(economy);
    case 'buyPress': return applyBuyPress(economy, action.tier);
    case 'buyCask': return applyBuyCask(economy, action.tier);
    case 'haulFruit': {
      const amount = Math.min(economy.resources.fruit, Math.max(0, action.amount ?? economy.resources.fruit));
      return { ...economy, resources: { ...economy.resources, fruit: economy.resources.fruit - amount }, hopperFruitMicro: economy.hopperFruitMicro + amount * MICRO };
    }
    case 'haulMust': {
      const available = Math.floor(economy.yardMustMicro / MICRO);
      const amount = Math.min(available, Math.max(0, action.amount ?? available));
      if (action.destination === 'bank') return {
        ...economy,
        resources: { ...economy.resources, must: economy.resources.must + amount },
        yardMustMicro: economy.yardMustMicro - amount * MICRO,
      };
      return { ...economy, yardMustMicro: economy.yardMustMicro - amount * MICRO, cellarMustMicro: economy.cellarMustMicro + amount * MICRO };
    }
    case 'rackMust': {
      const amount = Math.min(economy.resources.must, Math.max(0, action.amount ?? economy.resources.must));
      return { ...economy, resources: { ...economy.resources, must: economy.resources.must - amount }, cellarMustMicro: economy.cellarMustMicro + amount * MICRO };
    }
    case 'mulch': {
      const tree = economy.trees.find((candidate) => candidate.id === action.treeId);
      if (!tree || tick < tree.mulchUntilTick || economy.resources.pomace < MULCH_POMACE_COST) return economy;
      const mulchUntilTick = tick + MULCH_HOLD_DAYS * TICKS_PER_DAY;
      const mulched = {
        ...tree,
        mulchUntilTick,
        nextCareDecayTick: Math.max(tree.nextCareDecayTick, mulchUntilTick + CARE_DECAY_DAYS * TICKS_PER_DAY),
      };
      const next = replaceTree(economy, mulched);
      return { ...next, resources: { ...next.resources, pomace: next.resources.pomace - MULCH_POMACE_COST } };
    }
    case 'buyUpgrade': {
      const upgrade = WORKBENCH_UPGRADES.find((candidate) => candidate.id === action.id);
      if (!upgrade || hasUpgrade(economy, action.id) || economy.resources[upgrade.currency] < upgrade.cost) return economy;
      return {
        ...economy,
        resources: { ...economy.resources, [upgrade.currency]: economy.resources[upgrade.currency] - upgrade.cost },
        upgrades: [...economy.upgrades, action.id],
      };
    }
    case 'clearPlots': {
      const index = PLOT_CLEARINGS.findIndex((clearing) => clearing.plots === economy.plotsUnlocked);
      const next = PLOT_CLEARINGS[index + 1];
      if (!next || economy.resources.fruit < next.fruitCost) return economy;
      return {
        ...economy,
        resources: { ...economy.resources, fruit: economy.resources.fruit - next.fruitCost },
        plotsUnlocked: next.plots,
      };
    }
  }
}

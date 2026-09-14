import { equipmentMilestoneMultiplier, repeatCost, treeMilestoneMultiplier } from './balance.js';
import type { LegacyEconomyCatalog, TreeBalance, TreeSpeciesId } from './economy-catalog.js';
import type { EconomyAction, EconomyState, OrchardTreeState } from './economy-state.js';
import { SIM_TICKS_PER_SECOND } from './state.js';
import { calendarAtTick, nextDayTick, TICKS_PER_DAY, type Season } from './time.js';

const MICRO = 1_000_000;
const MAX_VIGOUR = 10_000;
const STARTING_PRESS_PADS = 5;
function treeBalance(catalog: LegacyEconomyCatalog, species: TreeSpeciesId): TreeBalance {
  const entry = catalog.trees.find((candidate) => candidate.id === species);
  if (!entry) throw new Error(`Unknown tree species ${species}`);
  return entry;
}

function countSpecies(economy: EconomyState, species: TreeSpeciesId): number {
  return economy.trees.filter((tree) => tree.species === species).length;
}

function hasUpgrade(economy: EconomyState, id: EconomyState['upgrades'][number]): boolean {
  return economy.upgrades.includes(id);
}

function enabledUpgrade(catalog: LegacyEconomyCatalog, economy: EconomyState,
  mechanic: LegacyEconomyCatalog['upgrades'][number]['mechanic']) {
  return catalog.upgrades.filter((upgrade) => upgrade.mechanic === mechanic && hasUpgrade(economy, upgrade.id));
}

function upgradeMechanicValue(upgrade: LegacyEconomyCatalog['upgrades'][number]): number {
  return upgrade.mechanicValue ?? upgrade.effect;
}

function seasonMultiplier(catalog: LegacyEconomyCatalog, entry: TreeBalance, season: Season,
  economy: EconomyState): number {
  if (entry.featuredSeason === season) return catalog.seasonTraitMultiplier;
  if (season === 'spring') return catalog.featuredSeasonMultiplier;
  const authoredOffSeason = enabledUpgrade(catalog, economy, 'off_season_multiplier')[0];
  return authoredOffSeason === undefined ? catalog.offSeasonMultiplier
    : upgradeMechanicValue(authoredOffSeason);
}

function productionStageMultiplier(catalog: LegacyEconomyCatalog, tree: OrchardTreeState): number {
  if (tree.stage === 'sapling') return 0;
  return tree.stage === 'young' ? catalog.youngProductionMultiplier : 1;
}

function liftMultiplier(catalog: LegacyEconomyCatalog, tree: OrchardTreeState, economy: EconomyState): number {
  let bonus = 0;
  for (const entry of catalog.trees) {
    if (entry.trait !== 'lifts' || entry.id === tree.species) continue;
    bonus += Math.floor(countSpecies(economy, entry.id) / 5) * entry.traitValue;
  }
  return 1 + bonus;
}

function treeRateMicro(catalog: LegacyEconomyCatalog, tree: OrchardTreeState,
  economy: EconomyState, season: Season): number {
  const entry = treeBalance(catalog, tree.species);
  const count = countSpecies(economy, tree.species);
  const rate = entry.fruitPerSecond
    * productionStageMultiplier(catalog, tree)
    * (catalog.careMultipliers[tree.care] ?? 1)
    * treeMilestoneMultiplier(count)
    * seasonMultiplier(catalog, entry, season, economy)
    * liftMultiplier(catalog, tree, economy)
    * economy.legacyMultiplier;
  const nearbyUpgrade = enabledUpgrade(catalog, economy, 'nearby_tree_multiplier')[0];
  const nearbyTreeBonus = nearbyUpgrade === undefined ? 0 : upgradeMechanicValue(nearbyUpgrade);
  const nearbyMultiplier = nearbyTreeBonus > 0 && economy.trees.some((other) => other.id !== tree.id
    && Math.abs(other.x - tree.x) <= 4 && Math.abs(other.y - tree.y) <= 4)
    ? 1 + nearbyTreeBonus : 1;
  return Math.round(rate * nearbyMultiplier * MICRO);
}

export function groveFruitPerSecond(catalog: LegacyEconomyCatalog,
  economy: EconomyState, season: Season): number {
  return economy.trees.reduce((sum, tree) => sum + treeRateMicro(catalog, tree, economy, season), 0) / MICRO;
}

function fedCapacityMultiplier(catalog: LegacyEconomyCatalog,
  economy: EconomyState, trait: 'feedsPress' | 'feedsCellar'): number {
  let bonus = 0;
  for (const entry of catalog.trees) {
    if (entry.trait === trait) bonus += Math.floor(countSpecies(economy, entry.id) / 5) * entry.traitValue;
  }
  return 1 + Math.min(catalog.fedBonusCap, bonus);
}

function decrementCare(catalog: LegacyEconomyCatalog, tree: OrchardTreeState,
  tick: number, economy: EconomyState): OrchardTreeState {
  if (tree.care === 0 || tree.nextCareDecayTick === 0 || tick < tree.nextCareDecayTick || tick < tree.mulchUntilTick) return tree;
  const care = Math.max(0, tree.care - 1) as OrchardTreeState['care'];
  const decayUpgrade = enabledUpgrade(catalog, economy, 'care_decay_days')[0];
  const decayDays = decayUpgrade === undefined ? catalog.careDecayDays : upgradeMechanicValue(decayUpgrade);
  return { ...tree, care, nextCareDecayTick: care === 0 ? 0 : tree.nextCareDecayTick + decayDays * TICKS_PER_DAY };
}

function advanceTree(catalog: LegacyEconomyCatalog, tree: OrchardTreeState, economy: EconomyState,
  startTick: number, endTick: number, season: Season, efficiency: number): OrchardTreeState {
  let current = decrementCare(catalog, tree, startTick, economy);
  let cursor = startTick;
  while (cursor < endTick) {
    const growthMultiplier = (season === 'spring' ? catalog.springGrowthMultiplier : 1) * efficiency;
    const threshold = current.stage === 'sapling' ? catalog.saplingGrowthDays * TICKS_PER_DAY
      : current.stage === 'young' ? catalog.youngGrowthDays * TICKS_PER_DAY : Number.POSITIVE_INFINITY;
    const growthTicks = Number.isFinite(threshold) ? Math.ceil((threshold - current.stageAgeTicks) / growthMultiplier) : Number.POSITIVE_INFINITY;
    const growthBoundary = cursor + Math.max(1, growthTicks);
    const careBoundary = current.nextCareDecayTick > cursor ? current.nextCareDecayTick : Number.POSITIVE_INFINITY;
    const boundary = Math.min(endTick, growthBoundary, careBoundary);
    const delta = boundary - cursor;
    const rateMicro = treeRateMicro(catalog, current, economy, season);
    const numerator = Math.floor(rateMicro * delta * efficiency) + current.productionRemainder;
    const produced = Math.floor(numerator / SIM_TICKS_PER_SECOND);
    const cap = rateMicro * catalog.treeBufferSeconds;
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
    current = decrementCare(catalog, current, cursor, economy);
  }
  return current;
}

function equipmentRate(balance: LegacyEconomyCatalog['presses'], counts: readonly number[]): number {
  return balance.reduce((sum, entry, index) => {
    const count = counts[index] ?? 0;
    return sum + entry.ratePerSecond * count * equipmentMilestoneMultiplier(count);
  }, 0);
}

function advancePresses(catalog: LegacyEconomyCatalog, economy: EconomyState,
  deltaTicks: number, season: Season, efficiency: number): EconomyState {
  const rate = equipmentRate(catalog.presses, economy.presses)
    * (season === 'summer' ? catalog.summerPressMultiplier : 1)
    * fedCapacityMultiplier(catalog, economy, 'feedsPress')
    * economy.legacyMultiplier;
  const numerator = Math.round(rate * MICRO * efficiency) * deltaTicks + economy.pressRemainder;
  const capacity = Math.floor(numerator / SIM_TICKS_PER_SECOND);
  const pipe = enabledUpgrade(catalog, economy, 'pipe_must').length !== 0;
  const yardRoom = pipe ? Number.POSITIVE_INFINITY
    : Math.max(0, catalog.yardMustCapacity * MICRO - economy.yardMustMicro);
  const yardLimitedFruit = pipe ? Number.POSITIVE_INFINITY : Math.floor(yardRoom / catalog.pressMustYield);
  const processed = Math.min(economy.hopperFruitMicro, capacity, yardLimitedFruit);
  if (processed <= 0) return { ...economy, pressRemainder: numerator % SIM_TICKS_PER_SECOND };
  const pomaceMicro = economy.pomaceMicro + Math.floor(processed * catalog.pomaceYield);
  const pomace = Math.floor(pomaceMicro / MICRO);
  const mustOutput = Math.floor(processed * catalog.pressMustYield);
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

function advanceCasks(catalog: LegacyEconomyCatalog, economy: EconomyState,
  deltaTicks: number, season: Season, efficiency: number): EconomyState {
  const rate = equipmentRate(catalog.casks, economy.casks)
    * (season === 'winter' ? catalog.winterAgingMultiplier : 1)
    * fedCapacityMultiplier(catalog, economy, 'feedsCellar')
    * economy.legacyMultiplier;
  const numerator = Math.round(rate * MICRO * efficiency) * deltaTicks + economy.caskRemainder;
  const capacity = Math.floor(numerator / SIM_TICKS_PER_SECOND);
  const aged = Math.min(economy.cellarMustMicro, capacity);
  if (aged <= 0) return { ...economy, caskRemainder: numerator % SIM_TICKS_PER_SECOND };
  const bottleValue = Math.max(catalog.bottleValue,
    ...enabledUpgrade(catalog, economy, 'bottle_yield').map(upgradeMechanicValue));
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

function advanceSegment(catalog: LegacyEconomyCatalog, economy: EconomyState, startTick: number,
  endTick: number, season: Season, options: EconomyAdvanceOptions): EconomyState {
  const delta = endTick - startTick;
  const vigourPerSecond = catalog.vigourChargePerSecond
    * (season === 'autumn' ? catalog.autumnVigourMultiplier : 1);
  const vigourNumerator = options.chargeVigour ? Math.round(vigourPerSecond * MAX_VIGOUR) * delta + economy.vigourRemainder : economy.vigourRemainder;
  const vigour = options.chargeVigour ? Math.min(MAX_VIGOUR, economy.vigour + Math.floor(vigourNumerator / SIM_TICKS_PER_SECOND)) : economy.vigour;
  let next: EconomyState = {
    ...economy,
    vigour,
    vigourRemainder: vigour === MAX_VIGOUR ? 0 : vigourNumerator % SIM_TICKS_PER_SECOND,
    trees: economy.trees.map((tree) => advanceTree(catalog, tree, economy, startTick, endTick,
      season, options.efficiency)),
  };
  next = advancePresses(catalog, next, delta, season, options.efficiency);
  return advanceCasks(catalog, next, delta, season, options.efficiency);
}

export interface EconomyAdvanceOptions {
  readonly efficiency: number;
  readonly chargeVigour: boolean;
}

const LIVE_ADVANCE: EconomyAdvanceOptions = { efficiency: 1, chargeVigour: true };

export function advanceEconomy(catalog: LegacyEconomyCatalog, economy: EconomyState,
  startTick: number, endTick: number, options: EconomyAdvanceOptions = LIVE_ADVANCE): EconomyState {
  let next = economy;
  let cursor = startTick;
  while (cursor < endTick) {
    const boundary = Math.min(endTick, nextDayTick(cursor));
    next = advanceSegment(catalog, next, cursor, boundary, calendarAtTick(cursor).season, options);
    cursor = boundary;
  }
  return next;
}

function replaceTree(economy: EconomyState, tree: OrchardTreeState): EconomyState {
  return { ...economy, trees: economy.trees.map((candidate) => candidate.id === tree.id ? tree : candidate) };
}

function applyTend(catalog: LegacyEconomyCatalog, economy: EconomyState,
  action: Extract<EconomyAction, { type: 'tend' }>, tick: number): EconomyState {
  const tree = economy.trees.find((candidate) => candidate.id === action.treeId);
  if (!tree || economy.vigour <= 0) return economy;
  const full = economy.vigour >= MAX_VIGOUR;
  const season = calendarAtTick(tick).season;
  const payoutIndex = economy.vigour < 2_500 ? 0 : economy.vigour < 5_000 ? 1 : economy.vigour < 7_500 ? 2 : 3;
  const recentFull = full && season === 'autumn' && economy.lastFullTendTick !== null
    && tick - economy.lastFullTendTick <= catalog.autumnChainWindowSeconds * SIM_TICKS_PER_SECOND;
  const chain = full && season === 'autumn' ? (recentFull ? economy.autumnChain + 1 : 1) : 0;
  const chainMultiplier = Math.min(catalog.autumnChainCap,
    1 + Math.max(0, chain - 1) * catalog.autumnChainStep);
  const burst = full ? catalog.vigourBurstPower : 1;
  const payout = Math.floor(groveFruitPerSecond(catalog, economy, season)
    * (catalog.vigourPartialSeconds[payoutIndex] ?? 2) * burst * chainMultiplier);
  const raisesCare = economy.vigour >= 7_500;
  const care = (raisesCare ? Math.min(3, tree.care + 1) : tree.care) as OrchardTreeState['care'];
  const decayUpgrade = enabledUpgrade(catalog, economy, 'care_decay_days')[0];
  const decayDays = decayUpgrade === undefined ? catalog.careDecayDays : upgradeMechanicValue(decayUpgrade);
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

function applyHarvest(catalog: LegacyEconomyCatalog, economy: EconomyState,
  action: Extract<EconomyAction, { type: 'harvest' }>): EconomyState {
  const tree = economy.trees.find((candidate) => candidate.id === action.treeId);
  if (!tree) return economy;
  const fruit = Math.floor(tree.bufferMicro / MICRO);
  if (fruit <= 0) return economy;
  const next = replaceTree(economy, { ...tree, bufferMicro: tree.bufferMicro - fruit * MICRO });
  const firstSpeciesHarvest = !economy.firsts.harvestedSpecies.includes(tree.species);
  return {
    ...next,
    resources: { ...next.resources, fruit: next.resources.fruit
      + (enabledUpgrade(catalog, economy, 'auto_haul_fruit').length !== 0 ? 0 : fruit) },
    hopperFruitMicro: next.hopperFruitMicro
      + (enabledUpgrade(catalog, economy, 'auto_haul_fruit').length !== 0 ? fruit * MICRO : 0),
    knowledge: firstSpeciesHarvest ? { ...next.knowledge, grove: next.knowledge.grove + 1 } : next.knowledge,
    firsts: firstSpeciesHarvest ? {
      ...next.firsts,
      harvested: true,
      harvestedSpecies: [...next.firsts.harvestedSpecies, tree.species],
    } : next.firsts,
  };
}

function applyPlant(catalog: LegacyEconomyCatalog, economy: EconomyState,
  action: Extract<EconomyAction, { type: 'plant' }>, tick: number): EconomyState {
  const species = action.species;
  const occupied = new Set(economy.trees.map((tree) => `${tree.x},${tree.y}`));
  const plot = catalog.orchardPlots.slice(0, economy.plotsUnlocked)
    .find(([x, y]) => x === action.x && y === action.y && !occupied.has(`${x},${y}`));
  const entry = treeBalance(catalog, species);
  const previousCount = countSpecies(economy, species);
  const cost = repeatCost(entry.saplingCost, previousCount, catalog.treeCostGrowth);
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

function applyRepairPress(catalog: LegacyEconomyCatalog, economy: EconomyState): EconomyState {
  if (economy.firstPressRepaired || economy.resources.fruit < catalog.firstPressRepairFruit) return economy;
  const presses = [...economy.presses]; presses[0] = 1;
  return { ...economy, resources: {
    ...economy.resources, fruit: economy.resources.fruit - catalog.firstPressRepairFruit,
  }, presses, firstPressRepaired: true };
}

function applyBuyPress(catalog: LegacyEconomyCatalog, economy: EconomyState, tier: number): EconomyState {
  const entry = catalog.presses[tier - 1];
  if (!entry || !economy.firstPressRepaired) return economy;
  const usedPads = catalog.presses.reduce((sum, candidate, index) => (
    sum + (economy.presses[index] ?? 0) * (candidate.pads ?? 1)
  ), 0);
  const pads = STARTING_PRESS_PADS
    + enabledUpgrade(catalog, economy, 'press_pads').reduce((sum, upgrade) => (
      sum + upgradeMechanicValue(upgrade)
    ), 0);
  if (usedPads + (entry.pads ?? 1) > pads) return economy;
  const owned = economy.presses[tier - 1] ?? 0;
  const cost = repeatCost(entry.cost, owned, catalog.pressCostGrowth);
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

function applyBuyCask(catalog: LegacyEconomyCatalog, economy: EconomyState, tier: number): EconomyState {
  const entry = catalog.casks[tier - 1];
  if (!entry) return economy;
  const owned = economy.casks[tier - 1] ?? 0;
  const cost = repeatCost(entry.cost, owned, catalog.caskCostGrowth);
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

export function applyEconomyAction(catalog: LegacyEconomyCatalog, economy: EconomyState,
  action: EconomyAction, tick: number): EconomyState {
  switch (action.type) {
    case 'plant': return applyPlant(catalog, economy, action, tick);
    case 'tend': return applyTend(catalog, economy, action, tick);
    case 'harvest': return applyHarvest(catalog, economy, action);
    case 'repairPress': return applyRepairPress(catalog, economy);
    case 'buyPress': return applyBuyPress(catalog, economy, action.tier);
    case 'buyCask': return applyBuyCask(catalog, economy, action.tier);
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
      if (!tree || tick < tree.mulchUntilTick
        || economy.resources.pomace < catalog.mulchPomaceCost) return economy;
      const mulchUntilTick = tick + catalog.mulchHoldDays * TICKS_PER_DAY;
      const mulched = {
        ...tree,
        mulchUntilTick,
        nextCareDecayTick: Math.max(tree.nextCareDecayTick,
          mulchUntilTick + catalog.careDecayDays * TICKS_PER_DAY),
      };
      const next = replaceTree(economy, mulched);
      return { ...next, resources: {
        ...next.resources, pomace: next.resources.pomace - catalog.mulchPomaceCost,
      } };
    }
    case 'buyUpgrade': {
      const upgrade = catalog.upgrades.find((candidate) => candidate.id === action.id);
      if (!upgrade || hasUpgrade(economy, action.id) || economy.resources[upgrade.currency] < upgrade.cost) return economy;
      return {
        ...economy,
        resources: { ...economy.resources, [upgrade.currency]: economy.resources[upgrade.currency] - upgrade.cost },
        upgrades: [...economy.upgrades, action.id],
      };
    }
    case 'clearPlots': {
      const index = catalog.plotClearings.findIndex((clearing) => clearing.plots === economy.plotsUnlocked);
      const next = catalog.plotClearings[index + 1];
      if (!next || economy.resources.fruit < next.fruitCost) return economy;
      return {
        ...economy,
        resources: { ...economy.resources, fruit: economy.resources.fruit - next.fruitCost },
        plotsUnlocked: next.plots,
      };
    }
  }
}

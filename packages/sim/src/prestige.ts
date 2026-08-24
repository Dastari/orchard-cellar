import { lineageSeeds, successionHeirlooms, vintageTerroir } from './balance.js';
import { createInitialEconomy } from './economy-state.js';
import type { PrestigeAction } from './progression-state.js';
import { TILE_SIZE_FIXED, createEstateCollisionMap, type FarmState } from './state.js';

function resetPlayer(state: FarmState): FarmState['player'] {
  return { ...state.player, location: 'estate', moving: false, facing: 'down', position: { x: 28 * TILE_SIZE_FIXED, y: 13 * TILE_SIZE_FIXED } };
}

function legacyMultiplier(state: FarmState, heirlooms: number, lineages: number): number {
  const heirloomValue = state.progression.cultivars.includes('longLineage') ? 1.4 : 1.25;
  return heirloomValue ** heirlooms * 1.5 ** lineages;
}

function resetRun(state: FarmState, multiplier: number): FarmState['economy'] {
  const fresh = createInitialEconomy();
  return {
    ...fresh,
    plotsUnlocked: state.economy.plotsUnlocked,
    knowledge: state.economy.knowledge,
    legacyMultiplier: multiplier,
  };
}

export function applyPrestigeAction(state: FarmState, action: PrestigeAction): FarmState {
  if (action.type === 'sealVintage') {
    const bottles = state.economy.resources.bottles;
    const gain = vintageTerroir(bottles);
    if (gain <= 0) return state;
    const number = state.progression.vintages + 1;
    const progression = {
      ...state.progression,
      terroir: state.progression.terroir + gain,
      lifetimeTerroir: state.progression.lifetimeTerroir + gain,
      vintages: number,
      vintageHistory: [...state.progression.vintageHistory, {
        number,
        bottles,
        terroir: gain,
        label: `Orchard Vintage ${number}`,
        sealedAtTick: state.tick,
      }],
    };
    const economy = resetRun({ ...state, progression }, legacyMultiplier({ ...state, progression }, progression.heirlooms, progression.lineages));
    const knowledge = Object.fromEntries(Object.entries(economy.knowledge).map(([branch, value]) => [branch, value + 1])) as FarmState['economy']['knowledge'];
    return { ...state, progression, economy: { ...economy, knowledge }, player: resetPlayer(state), collision: createEstateCollisionMap(economy.trees) };
  }

  if (action.type === 'succession') {
    const gain = successionHeirlooms(state.progression.lifetimeTerroir, state.progression.heirlooms);
    if (gain <= 0) return state;
    const progression = {
      ...state.progression,
      terroir: 0,
      heirlooms: state.progression.heirlooms + gain,
      lifetimeHeirlooms: state.progression.lifetimeHeirlooms + gain,
      successions: state.progression.successions + 1,
      skillRanks: {},
    };
    return {
      ...state,
      progression,
      economy: { ...state.economy, legacyMultiplier: legacyMultiplier({ ...state, progression }, progression.heirlooms, progression.lineages) },
    };
  }

  const gain = lineageSeeds(state.progression.lifetimeHeirlooms, state.progression.seedsClaimed);
  if (gain <= 0) return state;
  const progression = {
    ...state.progression,
    terroir: 0,
    heirlooms: 0,
    seeds: state.progression.seeds + gain,
    seedsClaimed: state.progression.seedsClaimed + gain,
    lineages: state.progression.lineages + 1,
    skillRanks: {},
  };
  const economy = resetRun({ ...state, progression }, legacyMultiplier({ ...state, progression }, 0, progression.lineages));
  return { ...state, progression, economy, player: resetPlayer(state), collision: createEstateCollisionMap(economy.trees) };
}

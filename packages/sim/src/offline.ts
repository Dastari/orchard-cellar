import { advanceEconomy } from './economy.js';
import type { LegacyEconomyCatalog } from './economy-catalog.js';
import { SIM_TICKS_PER_SECOND, createCellarCollisionMap, createEstateCollisionMap, type FarmState } from './state.js';

export function applyOffline(catalog: LegacyEconomyCatalog, state: FarmState, elapsedSeconds: number): FarmState {
  const elapsed = Math.min(catalog.offlineCapSeconds, Math.max(0, Math.floor(elapsedSeconds)));
  if (elapsed === 0) return state;
  const totalTicks = elapsed * SIM_TICKS_PER_SECOND;
  const trees = state.economy.trees.map((tree) => tree.nextCareDecayTick === 0 ? tree : {
    ...tree,
    nextCareDecayTick: tree.nextCareDecayTick + Math.floor(totalTicks / 2),
  });
  let economy: FarmState['economy'] = { ...state.economy, trees };
  let cursor = state.tick;
  for (let chunk = 0; chunk < catalog.offlineChunks; chunk += 1) {
    const boundary = state.tick + Math.floor(totalTicks * (chunk + 1) / catalog.offlineChunks);
    economy = advanceEconomy(catalog, economy, cursor, boundary,
      { efficiency: catalog.offlineEfficiency, chargeVigour: false });
    cursor = boundary;
  }
  return {
    ...state,
    tick: state.tick + totalTicks,
    economy,
    collision: state.player.location === 'cellar' ? createCellarCollisionMap() : createEstateCollisionMap(economy.trees),
    player: { ...state.player, moving: false },
  };
}

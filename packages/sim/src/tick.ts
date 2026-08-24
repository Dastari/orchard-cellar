import { movePlayer } from './movement.js';
import { advanceEconomy, applyEconomyAction } from './economy.js';
import type { EconomyAction } from './economy-state.js';
import {
  TILE_SIZE_FIXED,
  createCellarCollisionMap,
  createEstateCollisionMap,
  type Action,
  type Direction,
  type FarmState,
} from './state.js';

export function advanceTick(state: FarmState, actions: readonly Action[], tick: number): FarmState {
  let direction: Direction | null = null;
  let transition: Extract<Action, { type: 'transition' }> | null = null;
  let economy = advanceEconomy(state.economy, state.tick, Math.max(state.tick, tick));
  for (const action of actions) {
    if (action.type === 'move') direction = action.direction;
    else if (action.type === 'transition') transition = action;
    else economy = applyEconomyAction(economy, action as EconomyAction, tick);
  }
  if (transition) {
    const cellar = transition.location === 'cellar';
    return {
      ...state,
      tick,
      economy,
      collision: cellar ? createCellarCollisionMap() : createEstateCollisionMap(economy.trees),
      player: {
        ...state.player,
        location: transition.location,
        moving: false,
        facing: cellar ? 'down' : 'up',
        position: cellar
          ? { x: 20 * TILE_SIZE_FIXED, y: 3 * TILE_SIZE_FIXED }
          : { x: 36 * TILE_SIZE_FIXED, y: 45 * TILE_SIZE_FIXED },
      },
    };
  }
  const collision = state.player.location === 'estate' ? createEstateCollisionMap(economy.trees) : state.collision;
  return {
    ...state,
    tick,
    economy,
    collision,
    player: movePlayer(state.player, direction, collision),
  };
}

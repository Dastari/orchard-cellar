import { movePlayer } from './movement.js';
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
  for (const action of actions) {
    if (action.type === 'move') direction = action.direction;
    else transition = action;
  }
  if (transition) {
    const cellar = transition.location === 'cellar';
    return {
      ...state,
      tick,
      collision: cellar ? createCellarCollisionMap() : createEstateCollisionMap(),
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
  return {
    ...state,
    tick,
    player: movePlayer(state.player, direction, state.collision),
  };
}

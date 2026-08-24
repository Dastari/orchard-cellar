import { movePlayer } from './movement.js';
import type { Action, Direction, FarmState } from './state.js';

export function advanceTick(state: FarmState, actions: readonly Action[], tick: number): FarmState {
  let direction: Direction | null = null;
  for (const action of actions) {
    if (action.type === 'move') direction = action.direction;
  }
  return {
    ...state,
    tick,
    player: movePlayer(state.player, direction, state.collision),
  };
}

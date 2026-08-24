import { createRng, type RngState } from './rng.js';

export const SIM_TICKS_PER_SECOND = 60;
export const FIXED_UNITS_PER_PIXEL = 16;
export const TILE_SIZE_PIXELS = 16;
export const TILE_SIZE_FIXED = TILE_SIZE_PIXELS * FIXED_UNITS_PER_PIXEL;

export interface Vec2Fixed {
  readonly x: number;
  readonly y: number;
}

export type Direction =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'upLeft'
  | 'upRight'
  | 'downLeft'
  | 'downRight';

export interface PlayerState {
  readonly position: Vec2Fixed;
  readonly facing: Direction;
  readonly moving: boolean;
}

export interface CollisionMap {
  readonly width: number;
  readonly height: number;
  readonly blocked: readonly boolean[];
}

export interface FarmState {
  readonly version: 1;
  readonly tick: number;
  readonly rng: RngState;
  readonly player: PlayerState;
  readonly collision: CollisionMap;
}

export interface MoveAction {
  readonly type: 'move';
  readonly direction: Direction | null;
}

export type Action = MoveAction;

export function createPlaceholderCollisionMap(width = 48, height = 32): CollisionMap {
  const blocked = Array.from({ length: width * height }, (_, index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    const border = x === 0 || y === 0 || x === width - 1 || y === height - 1;
    const barn = x >= 17 && x <= 23 && y >= 7 && y <= 12;
    const orchardTree = x === 12 && y === 14;
    const pond = x >= 30 && x <= 38 && y >= 18 && y <= 24;
    const fence = y === 16 && x >= 5 && x <= 14 && x !== 10;
    return border || barn || orchardTree || pond || fence;
  });
  return { width, height, blocked };
}

export function createInitialState(seed = 0x0cce11a): FarmState {
  return {
    version: 1,
    tick: 0,
    rng: createRng(seed),
    player: {
      position: { x: 10 * TILE_SIZE_FIXED, y: 10 * TILE_SIZE_FIXED },
      facing: 'down',
      moving: false,
    },
    collision: createPlaceholderCollisionMap(),
  };
}

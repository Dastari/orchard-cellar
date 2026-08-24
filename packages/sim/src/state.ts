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
  readonly location: 'estate' | 'cellar';
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

export interface TransitionAction {
  readonly type: 'transition';
  readonly location: PlayerState['location'];
}

export type Action = MoveAction | TransitionAction;

export function createEstateCollisionMap(width = 64, height = 64): CollisionMap {
  const blocked = Array.from({ length: width * height }, (_, index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    const border = x === 0 || y === 0 || x === width - 1 || y === height - 1;
    const farmhouse = x >= 25 && x <= 31 && y >= 5 && y <= 9;
    const orchardTrees = x >= 12 && x <= 20 && y >= 17 && y <= 37 && x % 4 === 0 && y % 5 === 2;
    const pond = x >= 44 && x <= 54 && y >= 18 && y <= 28;
    const hillside = y >= 48 && (x < 20 || x > 43);
    return border || farmhouse || orchardTrees || pond || hillside;
  });
  return { width, height, blocked };
}

export function createCellarCollisionMap(width = 40, height = 24): CollisionMap {
  const blocked = Array.from({ length: width * height }, (_, index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    const border = x === 0 || y === 0 || x === width - 1 || y === height - 1;
    const racks = y >= 5 && y <= 17 && y % 4 !== 0 && ((x >= 4 && x <= 12) || (x >= 17 && x <= 25));
    return border || racks;
  });
  return { width, height, blocked };
}

export function createPlaceholderCollisionMap(width = 48, height = 32): CollisionMap {
  return createEstateCollisionMap(width, height);
}

export function createInitialState(seed = 0x0cce11a): FarmState {
  return {
    version: 1,
    tick: 0,
    rng: createRng(seed),
    player: {
      position: { x: 28 * TILE_SIZE_FIXED, y: 13 * TILE_SIZE_FIXED },
      facing: 'down',
      moving: false,
      location: 'estate',
    },
    collision: createEstateCollisionMap(),
  };
}

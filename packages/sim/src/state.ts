import { createRng, type RngState } from './rng.js';
import { createInitialEconomy, type EconomyAction, type EconomyState } from './economy-state.js';
import { createInitialProgression, type PrestigeAction, type ProgressionState } from './progression-state.js';
import type { TerrainTransition } from './terrain-elevation.js';

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

/** The surface an actor is physically allowed to traverse. Collision maps are
 * resolved for one medium so the ordinary movement solver can be shared by
 * walking actors, swimmers, flying actors, and future boats. */
export type MovementMedium = 'ground' | 'water' | 'air';

export interface CollisionMap {
  readonly width: number;
  readonly height: number;
  readonly blocked: readonly boolean[];
  /** Optional blockers resolved independently for each terrain elevation.
   * The flattened layout is `[elevation][tileY][tileX]`. This keeps projected
   * cliff faces solid on the lower plane while their cap edges independently
   * guard actors walking on the raised plane. */
  readonly terrainPlaneBlocked?: Uint8Array;
  /** Optional integer height field and explicit contour crossings. Generated
   * terrain supplies both to client prediction and authority movement. */
  readonly elevations?: Uint8Array;
  readonly terrainTransitions?: readonly TerrainTransition[];
  /** Blocked terrain tiles a mounted horse may cross during a jump. */
  readonly horseJumpableTerrain?: readonly boolean[];
  /** Optional fixed-point AABBs for sub-tile blockers such as tree trunks. */
  readonly obstacles?: readonly CollisionObstacle[];
}

export interface CollisionObstacle {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export interface FarmState {
  readonly version: 3;
  readonly tick: number;
  readonly rng: RngState;
  readonly player: PlayerState;
  readonly collision: CollisionMap;
  readonly economy: EconomyState;
  readonly progression: ProgressionState;
}

export interface MoveAction {
  readonly type: 'move';
  readonly direction: Direction | null;
}

export interface TransitionAction {
  readonly type: 'transition';
  readonly location: PlayerState['location'];
}

export type Action = MoveAction | TransitionAction | EconomyAction | PrestigeAction;

export function createEstateCollisionMap(treeTiles: readonly { readonly x: number; readonly y: number }[] = [], width = 64, height = 64): CollisionMap {
  const trees = new Set(treeTiles.map((tree) => `${tree.x},${tree.y}`));
  const blocked = Array.from({ length: width * height }, (_, index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    const border = x === 0 || y === 0 || x === width - 1 || y === height - 1;
    const farmhouse = x >= 25 && x <= 31 && y >= 5 && y <= 9;
    const orchardTrees = trees.has(`${x},${y}`);
    const pond = ((x - 49) / 5.5) ** 2 + ((y - 23) / 4.5) ** 2 <= 1;
    const upperGardenPond = x >= 39 && x <= 41 && y >= 34 && y <= 36;
    const lowerGardenPond = x >= 40 && x <= 42 && y >= 44 && y <= 46;
    const orchardFence = (y === 15 && x >= 8 && x <= 23)
      || (x === 7 && y >= 16 && y <= 39)
      || (y === 40 && x >= 8 && x <= 23);
    const greenhouse = x >= 36 && x <= 42 && y >= 10 && y <= 16;
    const barn = x >= 46 && x <= 54 && y >= 34 && y <= 41;
    const windmill = x >= 56 && x <= 60 && y >= 36 && y <= 41;
    const hillside = y >= 48 && (x < 20 || x > 43);
    return border || farmhouse || orchardTrees || pond || upperGardenPond || lowerGardenPond
      || orchardFence || greenhouse || barn || windmill || hillside;
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
  return createEstateCollisionMap([], width, height);
}

export function createInitialState(seed = 0x0cce11a): FarmState {
  const economy = createInitialEconomy();
  return {
    version: 3,
    tick: 0,
    rng: createRng(seed),
    player: {
      position: { x: 28 * TILE_SIZE_FIXED, y: 13 * TILE_SIZE_FIXED },
      facing: 'down',
      moving: false,
      location: 'estate',
    },
    collision: createEstateCollisionMap(economy.trees),
    economy,
    progression: createInitialProgression(),
  };
}

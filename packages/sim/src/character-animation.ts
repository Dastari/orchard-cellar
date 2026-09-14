import type { Direction } from './state.js';

export type CharacterSheetFacing = 'up' | 'right' | 'down';
export const CHARACTER_ACTION_KINDS = [
  'swing_sword', 'ranged_weapon', 'swing_axe', 'swing_pickaxe',
  'swing_hoe', 'water', 'fish_cast', 'fish_reel', 'jump', 'sitting',
] as const;
export type CharacterActionKind = (typeof CHARACTER_ACTION_KINDS)[number];

export function isCharacterActionKind(value: string): value is CharacterActionKind {
  return CHARACTER_ACTION_KINDS.some((kind) => kind === value);
}

export interface CuteFantasyPlayerRow {
  readonly name: string;
  readonly row: number;
  readonly authoredFrameCount: number;
  readonly outputFrameCount: number;
  readonly loop: boolean;
  readonly sets: readonly ('standing' | 'action' | 'wearable')[];
}

/**
 * Single source of truth for the rows extracted from Cute Fantasy's 9x56
 * modular player sheets. Asset tools filter this table by `sets`; clients use
 * the semantic animation names through the helpers below.
 */
export const CUTE_FANTASY_PLAYER_ROWS = [
  { name: 'idle_down', row: 0, authoredFrameCount: 6, outputFrameCount: 6, loop: true, sets: ['standing', 'wearable'] },
  { name: 'idle_right', row: 1, authoredFrameCount: 6, outputFrameCount: 6, loop: true, sets: ['standing', 'wearable'] },
  { name: 'idle_up', row: 2, authoredFrameCount: 6, outputFrameCount: 6, loop: true, sets: ['standing', 'wearable'] },
  { name: 'walk_down', row: 3, authoredFrameCount: 6, outputFrameCount: 6, loop: true, sets: ['standing', 'wearable'] },
  { name: 'walk_right', row: 4, authoredFrameCount: 6, outputFrameCount: 6, loop: true, sets: ['standing', 'wearable'] },
  { name: 'walk_up', row: 5, authoredFrameCount: 6, outputFrameCount: 6, loop: true, sets: ['standing', 'wearable'] },
  { name: 'swing_sword_down', row: 6, authoredFrameCount: 4, outputFrameCount: 4, loop: false, sets: ['action', 'wearable'] },
  { name: 'swing_sword_right', row: 9, authoredFrameCount: 4, outputFrameCount: 4, loop: false, sets: ['action', 'wearable'] },
  { name: 'swing_sword_up', row: 12, authoredFrameCount: 4, outputFrameCount: 4, loop: false, sets: ['action', 'wearable'] },
  { name: 'hold_idle_down', row: 20, authoredFrameCount: 1, outputFrameCount: 1, loop: false, sets: ['action'] },
  { name: 'hold_idle_right', row: 21, authoredFrameCount: 1, outputFrameCount: 1, loop: false, sets: ['action'] },
  { name: 'hold_idle_up', row: 22, authoredFrameCount: 1, outputFrameCount: 1, loop: false, sets: ['action'] },
  { name: 'hold_walk_down', row: 23, authoredFrameCount: 5, outputFrameCount: 5, loop: false, sets: ['action'] },
  { name: 'hold_walk_right', row: 24, authoredFrameCount: 5, outputFrameCount: 5, loop: false, sets: ['action'] },
  { name: 'hold_walk_up', row: 25, authoredFrameCount: 5, outputFrameCount: 5, loop: false, sets: ['action'] },
  { name: 'jump_down', row: 26, authoredFrameCount: 6, outputFrameCount: 6, loop: false, sets: ['action', 'wearable'] },
  { name: 'jump_right', row: 27, authoredFrameCount: 6, outputFrameCount: 6, loop: false, sets: ['action', 'wearable'] },
  { name: 'jump_up', row: 28, authoredFrameCount: 6, outputFrameCount: 6, loop: false, sets: ['action', 'wearable'] },
  { name: 'ranged_weapon_down', row: 29, authoredFrameCount: 6, outputFrameCount: 6, loop: false, sets: ['action', 'wearable'] },
  { name: 'ranged_weapon_right', row: 30, authoredFrameCount: 6, outputFrameCount: 6, loop: false, sets: ['action', 'wearable'] },
  { name: 'ranged_weapon_up', row: 31, authoredFrameCount: 6, outputFrameCount: 6, loop: false, sets: ['action', 'wearable'] },
  { name: 'swing_axe_down', row: 32, authoredFrameCount: 6, outputFrameCount: 6, loop: false, sets: ['action', 'wearable'] },
  { name: 'swing_axe_right', row: 33, authoredFrameCount: 6, outputFrameCount: 6, loop: false, sets: ['action', 'wearable'] },
  { name: 'swing_axe_up', row: 34, authoredFrameCount: 6, outputFrameCount: 6, loop: false, sets: ['action', 'wearable'] },
  { name: 'swing_pickaxe_down', row: 35, authoredFrameCount: 6, outputFrameCount: 6, loop: false, sets: ['action', 'wearable'] },
  { name: 'swing_pickaxe_right', row: 36, authoredFrameCount: 6, outputFrameCount: 6, loop: false, sets: ['action', 'wearable'] },
  { name: 'swing_pickaxe_up', row: 37, authoredFrameCount: 6, outputFrameCount: 6, loop: false, sets: ['action', 'wearable'] },
  { name: 'swing_hoe_down', row: 38, authoredFrameCount: 6, outputFrameCount: 6, loop: false, sets: ['action'] },
  { name: 'swing_hoe_right', row: 39, authoredFrameCount: 6, outputFrameCount: 6, loop: false, sets: ['action'] },
  { name: 'swing_hoe_up', row: 40, authoredFrameCount: 6, outputFrameCount: 6, loop: false, sets: ['action'] },
  { name: 'water_down', row: 41, authoredFrameCount: 6, outputFrameCount: 6, loop: false, sets: ['action'] },
  { name: 'water_right', row: 42, authoredFrameCount: 6, outputFrameCount: 6, loop: false, sets: ['action'] },
  { name: 'water_up', row: 43, authoredFrameCount: 6, outputFrameCount: 6, loop: false, sets: ['action'] },
  { name: 'fish_cast_down', row: 44, authoredFrameCount: 9, outputFrameCount: 40, loop: false, sets: ['action'] },
  { name: 'fish_cast_right', row: 45, authoredFrameCount: 8, outputFrameCount: 40, loop: false, sets: ['action'] },
  { name: 'fish_cast_up', row: 46, authoredFrameCount: 9, outputFrameCount: 40, loop: false, sets: ['action'] },
  { name: 'fish_reel_right', row: 47, authoredFrameCount: 8, outputFrameCount: 8, loop: false, sets: ['action'] },
  { name: 'fish_reel_down', row: 48, authoredFrameCount: 8, outputFrameCount: 8, loop: false, sets: ['action'] },
  { name: 'fish_reel_up', row: 49, authoredFrameCount: 8, outputFrameCount: 8, loop: false, sets: ['action'] },
  // Reviewed straddle-pose adaptation for furniture; do not substitute idle
  // layers where the source intentionally has empty directional hands.
  { name: 'sitting_down', row: 50, authoredFrameCount: 2, outputFrameCount: 2, loop: true, sets: ['action', 'wearable'] },
  { name: 'sitting_right', row: 51, authoredFrameCount: 2, outputFrameCount: 2, loop: true, sets: ['action', 'wearable'] },
  { name: 'sitting_up', row: 52, authoredFrameCount: 2, outputFrameCount: 2, loop: true, sets: ['action', 'wearable'] },
] as const satisfies readonly CuteFantasyPlayerRow[];

export function characterSheetFacing(facing: Direction): CharacterSheetFacing {
  if (facing === 'up') return 'up';
  if (facing === 'down') return 'down';
  return 'right';
}

/** Cute Fantasy authors all modular side-facing layers looking right. */
export function actionToolFlipsForDirection(facing: Direction): boolean {
  return facing === 'left' || facing === 'upLeft' || facing === 'downLeft';
}

export function idleAvatarAnimationForDirection(facing: Direction): `idle_${CharacterSheetFacing}` {
  return `idle_${characterSheetFacing(facing)}`;
}

export function avatarAnimationForDirection(facing: Direction): `walk_${CharacterSheetFacing}` {
  return `walk_${characterSheetFacing(facing)}`;
}

export function characterLocomotionAnimation(
  facing: Direction,
  moving: boolean,
): `idle_${CharacterSheetFacing}` | `walk_${CharacterSheetFacing}` {
  return moving ? avatarAnimationForDirection(facing) : idleAvatarAnimationForDirection(facing);
}

export function characterActionAnimation(
  action: CharacterActionKind,
  facing: Direction,
): `${CharacterActionKind}_${CharacterSheetFacing}` {
  return `${action}_${characterSheetFacing(facing)}`;
}

export function axeAnimationForDirection(facing: Direction): `axe_${CharacterSheetFacing}` {
  return `axe_${characterSheetFacing(facing)}`;
}

export function characterToolAnimation(
  action: CharacterActionKind,
  facing: Direction,
): string {
  return action === 'swing_axe'
    ? axeAnimationForDirection(facing)
    : characterActionAnimation(action, facing);
}

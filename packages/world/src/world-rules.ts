import {
  TILE_SIZE_FIXED,
  movePlayer,
  type CollisionMap,
  type Direction,
  type PlayerState,
} from '@orchard/sim';

export const AUTHORITY_HZ = 20;
export const SIM_STEPS_PER_AUTHORITY_TICK = 60 / AUTHORITY_HZ;
export const CHUNK_TILES = 16;
export const CHUNK_SIZE_FIXED = CHUNK_TILES * TILE_SIZE_FIXED;
export const TREE_REACH_FIXED = 2 * TILE_SIZE_FIXED;
export const TREE_TEND_COOLDOWN_TICKS = 20n;
export const PRESENCE_LEASE_MICROS = 30_000_000n;

export function chunkAt(position: number): number {
  return Math.floor(position / CHUNK_SIZE_FIXED);
}

export function decodeDirection(value: string): Direction | null | undefined {
  switch (value) {
    case 'up':
    case 'down':
    case 'left':
    case 'right':
    case 'upLeft':
    case 'upRight':
    case 'downLeft':
    case 'downRight':
      return value;
    case 'idle':
      return null;
    default:
      return undefined;
  }
}

export function presenceLeaseExpired(lastSeenMicros: bigint, nowMicros: bigint): boolean {
  return nowMicros - lastSeenMicros > PRESENCE_LEASE_MICROS;
}

export function advanceAuthorityPlayer(
  player: PlayerState,
  direction: Direction | null,
  collision: CollisionMap,
): PlayerState {
  let next = player;
  for (let step = 0; step < SIM_STEPS_PER_AUTHORITY_TICK; step += 1) {
    next = movePlayer(next, direction, collision);
  }
  return next;
}

export function canTendTree(
  playerX: number,
  playerY: number,
  treeX: number,
  treeY: number,
  tendCount: number,
  lastTendedTick: bigint,
  authorityTick: bigint,
): 'ok' | 'out_of_range' | 'cooldown' {
  const dx = treeX - playerX;
  const dy = treeY - playerY;
  if (dx * dx + dy * dy > TREE_REACH_FIXED * TREE_REACH_FIXED) return 'out_of_range';
  if (
    tendCount > 0 &&
    authorityTick - lastTendedTick < TREE_TEND_COOLDOWN_TICKS
  ) return 'cooldown';
  return 'ok';
}

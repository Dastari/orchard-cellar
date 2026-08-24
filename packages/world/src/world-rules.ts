import {
  SURVIVAL_WORLD_SEED,
  SURVIVAL_WORLD_SIZE,
  TILE_SIZE_FIXED,
  createSurvivalCollisionMap,
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
export const CROP_GROWTH_TICKS = 200n;
export const FARM_COLUMNS = 5;
export const FARM_ROWS = 5;
export const FARM_WIDTH_TILES = 14;
export const FARM_HEIGHT_TILES = 14;
export const FARM_GAP_TILES = 2;
export const FARM_FIRST_TILE = 1;
export const PRESENCE_LEASE_MICROS = 30_000_000n;
const SURVIVAL_TERRAIN_COLLISION = createSurvivalCollisionMap(SURVIVAL_WORLD_SEED, []);

export interface AuthoritySurvivalResource {
  readonly tileX: number;
  readonly tileY: number;
  readonly depleted: boolean;
}

export function createAuthoritySurvivalCollisionMap(
  resources: readonly AuthoritySurvivalResource[],
): CollisionMap {
  const blocked = [...SURVIVAL_TERRAIN_COLLISION.blocked];
  for (const resource of resources) {
    if (resource.depleted || resource.tileX < 0 || resource.tileY < 0
      || resource.tileX >= SURVIVAL_WORLD_SIZE || resource.tileY >= SURVIVAL_WORLD_SIZE) continue;
    blocked[resource.tileY * SURVIVAL_WORLD_SIZE + resource.tileX] = true;
  }
  return { width: SURVIVAL_WORLD_SIZE, height: SURVIVAL_WORLD_SIZE, blocked };
}

export function resourceHarvestResult(
  playerX: number,
  playerY: number,
  selectedItem: string,
  resource: { readonly kind: string; readonly tileX: number; readonly tileY: number; readonly depleted: boolean },
): 'ok' | 'depleted' | 'wrong_tool' | 'out_of_range' {
  if (resource.depleted) return 'depleted';
  if (resource.kind !== 'tree' || selectedItem !== 'axe') return 'wrong_tool';
  const resourceX = resource.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
  const resourceY = resource.tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
  const dx = resourceX - playerX;
  const dy = resourceY - playerY;
  if (dx * dx + dy * dy > TREE_REACH_FIXED * TREE_REACH_FIXED) return 'out_of_range';
  return 'ok';
}

export interface FarmParcelLayout {
  readonly originX: number;
  readonly originY: number;
  readonly width: number;
  readonly height: number;
}

export function farmParcelLayout(slot: number): FarmParcelLayout | null {
  if (slot < 0 || slot >= FARM_COLUMNS * FARM_ROWS) return null;
  return {
    originX: FARM_FIRST_TILE + (slot % FARM_COLUMNS) * (FARM_WIDTH_TILES + FARM_GAP_TILES),
    originY: FARM_FIRST_TILE + Math.floor(slot / FARM_COLUMNS) * (FARM_HEIGHT_TILES + FARM_GAP_TILES),
    width: FARM_WIDTH_TILES,
    height: FARM_HEIGHT_TILES,
  };
}

export function createMmoFarmCollisionMap(width = 48, height = 32): CollisionMap {
  return {
    width,
    height,
    blocked: Array.from({ length: width * height }, (_, index) => {
      const x = index % width;
      const y = Math.floor(index / width);
      return x === 0 || y === 0 || x === width - 1 || y === height - 1;
    }),
  };
}

export function isFarmBedTile(layout: FarmParcelLayout, tileX: number, tileY: number): boolean {
  return tileX >= layout.originX + 2
    && tileX <= layout.originX + 11
    && tileY >= layout.originY + 5
    && tileY <= layout.originY + 11;
}

export function canUseFarmTile(playerX: number, playerY: number, tileX: number, tileY: number): boolean {
  const dx = tileX * TILE_SIZE_FIXED - playerX;
  const dy = tileY * TILE_SIZE_FIXED - playerY;
  return dx * dx + dy * dy <= TREE_REACH_FIXED * TREE_REACH_FIXED;
}

export function cropStage(wateredAtTick: bigint, authorityTick: bigint): 0 | 1 | 2 | 3 {
  const elapsed = authorityTick - wateredAtTick;
  if (elapsed >= CROP_GROWTH_TICKS) return 3;
  if (elapsed >= CROP_GROWTH_TICKS * 2n / 3n) return 2;
  if (elapsed >= CROP_GROWTH_TICKS / 3n) return 1;
  return 0;
}

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

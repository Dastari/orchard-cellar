import { TILE_SIZE_FIXED, type CollisionMap, type Direction } from './state.js';

export interface TileTarget {
  readonly tileX: number;
  readonly tileY: number;
}

export interface FixedBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Shared reach for mouse-targeted tools and placeable world objects. */
export const TILE_INTERACTION_REACH_TILES = 3;
export const TILE_INTERACTION_REACH_FIXED = TILE_INTERACTION_REACH_TILES * TILE_SIZE_FIXED;
export const RESOURCE_TOOL_REACH_TILES = 2;
export const AXE_SWING_REACH_TILES = 3;

/** Axe art describes a broad swing around visually large tree crowns. Mining
 * retains the tighter resource reach so an axe adjustment cannot silently
 * increase every tool's authority range. */
export function resourceToolReachFixed(itemKind: string): number {
  const tiles = itemKind === 'axe' ? AXE_SWING_REACH_TILES : RESOURCE_TOOL_REACH_TILES;
  return tiles * TILE_SIZE_FIXED;
}

const FACING_VECTOR: Record<Direction, readonly [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
  upLeft: [-1, -1],
  upRight: [1, -1],
  downLeft: [-1, 1],
  downRight: [1, 1],
};

/** Keyboard targeting remains the adjacent tile in the avatar's facing. */
export function facedTileTarget(playerX: number, playerY: number, facing: Direction): TileTarget {
  const [offsetX, offsetY] = FACING_VECTOR[facing];
  return {
    tileX: Math.floor(playerX / TILE_SIZE_FIXED) + offsetX,
    tileY: Math.floor(playerY / TILE_SIZE_FIXED) + offsetY,
  };
}

/** Reach is measured from the player's authority anchor to the tile centre. */
export function tileTargetInReach(playerX: number, playerY: number, tile: TileTarget): boolean {
  const targetX = tile.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
  const targetY = tile.tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
  const dx = targetX - playerX;
  const dy = targetY - playerY;
  return dx * dx + dy * dy <= TILE_INTERACTION_REACH_FIXED * TILE_INTERACTION_REACH_FIXED;
}

/** Converts a fixed-point world position into an in-bounds, reachable tile. */
export function tileTargetAtFixedPoint(
  playerX: number,
  playerY: number,
  worldX: number,
  worldY: number,
  worldSize: number,
): TileTarget | null {
  if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) return null;
  const tile = {
    tileX: Math.floor(worldX / TILE_SIZE_FIXED),
    tileY: Math.floor(worldY / TILE_SIZE_FIXED),
  };
  if (tile.tileX < 0 || tile.tileY < 0 || tile.tileX >= worldSize || tile.tileY >= worldSize) return null;
  return tileTargetInReach(playerX, playerY, tile) ? tile : null;
}

export function tileTargetBounds(tile: TileTarget): FixedBounds {
  return {
    left: tile.tileX * TILE_SIZE_FIXED,
    top: tile.tileY * TILE_SIZE_FIXED,
    right: (tile.tileX + 1) * TILE_SIZE_FIXED - 1,
    bottom: (tile.tileY + 1) * TILE_SIZE_FIXED - 1,
  };
}

export function boundsOverlap(left: FixedBounds, right: FixedBounds): boolean {
  return left.left <= right.right && left.right >= right.left
    && left.top <= right.bottom && left.bottom >= right.top;
}

/** Placement validity uses the same terrain and obstacle representation as
 * movement, so the reticle and authority do not invent a second collision map. */
export function tileTargetIsBlocked(
  map: CollisionMap,
  tile: TileTarget,
  occupiedBounds: Iterable<FixedBounds> = [],
): boolean {
  if (!Number.isInteger(tile.tileX) || !Number.isInteger(tile.tileY)
    || tile.tileX < 0 || tile.tileY < 0 || tile.tileX >= map.width || tile.tileY >= map.height) return true;
  if (map.blocked[tile.tileY * map.width + tile.tileX] ?? true) return true;
  const bounds = tileTargetBounds(tile);
  if (map.obstacles?.some((obstacle) => boundsOverlap(bounds, obstacle)) ?? false) return true;
  for (const occupied of occupiedBounds) if (boundsOverlap(bounds, occupied)) return true;
  return false;
}

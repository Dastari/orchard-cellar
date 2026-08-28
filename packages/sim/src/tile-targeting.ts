import { FIXED_UNITS_PER_PIXEL, TILE_SIZE_FIXED, type CollisionMap, type Direction } from './state.js';

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
/** Chests open and accept axe strikes radially within two tiles. Physical
 * hands-pickup remains a separate faced-tile action. */
export const CHEST_INTERACTION_REACH_TILES = 2;
export const CHEST_INTERACTION_REACH_FIXED = CHEST_INTERACTION_REACH_TILES * TILE_SIZE_FIXED;
/** Ground items can be collected from any direction inside this radial reach. */
export const ITEM_PICKUP_REACH_FIXED = 24 * FIXED_UNITS_PER_PIXEL;
/** Base contact-tool radius. Skill-tree progression will expand this through
 * a range modifier; keep the unskilled axe/pickaxe/sword/hammer area small. */
export const RESOURCE_TOOL_REACH_TILES = 1;
export const AXE_SWING_REACH_TILES = RESOURCE_TOOL_REACH_TILES;
export const FORWARD_SWING_OFFSET_TILES = 1;

const FORWARD_SWING_TOOL_KINDS = new Set(['axe', 'pickaxe', 'sword', 'hammer']);

export function isForwardSwingToolKind(itemKind: string): boolean {
  return FORWARD_SWING_TOOL_KINDS.has(itemKind);
}

export function resourceToolForwardOffsetFixed(itemKind: string): number {
  return isForwardSwingToolKind(itemKind) ? FORWARD_SWING_OFFSET_TILES * TILE_SIZE_FIXED : 0;
}

/** Radius of the contact area after any forward swing offset is applied. */
export function resourceToolReachFixed(itemKind: string): number {
  const tiles = itemKind === 'axe' ? AXE_SWING_REACH_TILES : RESOURCE_TOOL_REACH_TILES;
  return tiles * TILE_SIZE_FIXED;
}

/** Authority and prediction share the same contact area: a one-tile circle
 * centred one tile ahead of the actor. The forward half-plane check prevents
 * a crafted target id from turning a sword swing into an attack behind the
 * player. Callers supply the target's physical interaction point. */
export function forwardSwingTargetInReach(
  playerX: number,
  playerY: number,
  facing: Direction,
  targetX: number,
  targetY: number,
  itemKind: string,
): boolean {
  const [facingX, facingY] = FACING_VECTOR[facing];
  const [unitX, unitY] = directionUnitVector(facing);
  const dx = targetX - playerX;
  const dy = targetY - playerY;
  if (dx * facingX + dy * facingY <= 0) return false;
  const areaDx = dx - unitX * resourceToolForwardOffsetFixed(itemKind);
  const areaDy = dy - unitY * resourceToolForwardOffsetFixed(itemKind);
  const reach = resourceToolReachFixed(itemKind);
  return areaDx * areaDx + areaDy * areaDy <= reach * reach;
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

export function directionUnitVector(direction: Direction): readonly [number, number] {
  const [x, y] = FACING_VECTOR[direction];
  const length = Math.hypot(x, y);
  return [x / length, y / length];
}

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
  return tileTargetWithinFixedReach(playerX, playerY, tile, TILE_INTERACTION_REACH_FIXED);
}

export function tileTargetWithinFixedReach(
  playerX: number,
  playerY: number,
  tile: TileTarget,
  reachFixed: number,
): boolean {
  const targetX = tile.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
  const targetY = tile.tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
  const dx = targetX - playerX;
  const dy = targetY - playerY;
  return dx * dx + dy * dy <= reachFixed * reachFixed;
}

/** Selects the nearest tile-centred row inside a circular reach. Stable row id
 * breaks exact distance ties, making client prompts and authority deterministic. */
export function nearestTileTarget<T extends TileTarget & { readonly id: bigint }>(
  playerX: number,
  playerY: number,
  targets: Iterable<T>,
  reachFixed: number,
): T | null {
  let nearest: T | null = null;
  let nearestDistanceSquared = Number.POSITIVE_INFINITY;
  for (const target of targets) {
    const targetX = target.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
    const targetY = target.tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
    const dx = targetX - playerX;
    const dy = targetY - playerY;
    const distanceSquared = dx * dx + dy * dy;
    if (distanceSquared > reachFixed * reachFixed) continue;
    if (distanceSquared < nearestDistanceSquared
      || (distanceSquared === nearestDistanceSquared && target.id < (nearest?.id ?? target.id + 1n))) {
      nearest = target;
      nearestDistanceSquared = distanceSquared;
    }
  }
  return nearest;
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
  const tileIndex = tile.tileY * map.width + tile.tileX;
  if (map.blocked[tileIndex] ?? true) return true;
  if (map.fixedTerrainPlane !== undefined && map.terrainPlaneBlocked !== undefined) {
    const stride = map.width * map.height;
    if (map.terrainPlaneBlocked[map.fixedTerrainPlane * stride + tileIndex] === 1) return true;
  }
  const bounds = tileTargetBounds(tile);
  if (map.obstacles?.some((obstacle) => boundsOverlap(bounds, obstacle)) ?? false) return true;
  for (const occupied of occupiedBounds) if (boundsOverlap(bounds, occupied)) return true;
  return false;
}

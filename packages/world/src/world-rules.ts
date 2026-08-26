import {
  AUTHORITY_HZ,
  FIXED_UNITS_PER_PIXEL,
  SIM_STEPS_PER_AUTHORITY_TICK,
  SIM_TICKS_PER_SECOND,
  SURVIVAL_WORLD_SEED,
  SURVIVAL_WORLD_SIZE,
  TILE_SIZE_FIXED,
  TILE_INTERACTION_REACH_FIXED,
  TOPSIDE_SPACE_ID,
  createSurvivalCollisionMap,
  isChoppableTreeKind,
  isBreakableRockKind,
  isGatherableResourceKind,
  isMineableOreKind,
  resourceToolReachFixed,
  survivalBiomeAt,
  survivalGatherableDrop,
  survivalResourceBlocksMovement,
  survivalResourceObstacle,
  survivalResourceTargetVector,
  spaceDefinitionFor,
  tileTargetInReach,
  tileTargetIsBlocked,
  type CollisionMap,
  type Direction,
  type MovementMedium,
} from '@orchard/sim';

export { AUTHORITY_HZ, SIM_STEPS_PER_AUTHORITY_TICK };
export const CHUNK_TILES = 16;
export const CHUNK_SIZE_FIXED = CHUNK_TILES * TILE_SIZE_FIXED;
export const TREE_REACH_FIXED = 2 * TILE_SIZE_FIXED;
export const FARM_TOOL_REACH_FIXED = TILE_INTERACTION_REACH_FIXED;
export const ITEM_PICKUP_REACH_FIXED = 24 * FIXED_UNITS_PER_PIXEL;
export const TREE_TEND_COOLDOWN_TICKS = 20n;
export const CROP_GROWTH_TICKS = 200n;
export const FARM_COLUMNS = 5;
export const FARM_ROWS = 5;
export const FARM_WIDTH_TILES = 14;
export const FARM_HEIGHT_TILES = 14;
export const FARM_GAP_TILES = 2;
export const FARM_FIRST_TILE = 1;
export const PRESENCE_LEASE_MICROS = 30_000_000n;
export const STALE_INPUT_MICROS = 2_000_000n;
export const MOVEMENT_RATE_HZ = BigInt(SIM_TICKS_PER_SECOND);
export const MOVEMENT_RATE_BURST_STEPS = 6n;
export const MAX_SETTLE_BACKLOG_STEPS = 24;
/** Drain every accepted confirmed batch atomically once server-time credit permits. */
export const MAX_SETTLE_STEPS_PER_TICK = MAX_SETTLE_BACKLOG_STEPS;
const SPACE_TERRAIN_COLLISION = new Map<string, CollisionMap>();

function flatSpaceCollision(sizeTiles: number, medium: MovementMedium): CollisionMap {
  const blocked = Array.from({ length: sizeTiles * sizeTiles }, (_, index) => {
    if (medium !== 'ground') return true;
    const x = index % sizeTiles;
    const y = Math.floor(index / sizeTiles);
    return x === 0 || y === 0 || x === sizeTiles - 1 || y === sizeTiles - 1;
  });
  return {
    width: sizeTiles,
    height: sizeTiles,
    blocked,
    horseJumpableTerrain: Array<boolean>(blocked.length).fill(false),
    obstacles: [],
  };
}

export function terrainCollisionForSpace(
  spaceId: number,
  medium: MovementMedium = 'ground',
): CollisionMap {
  const key = `${spaceId}:${medium}`;
  const cached = SPACE_TERRAIN_COLLISION.get(key);
  if (cached !== undefined) return cached;
  const definition = spaceDefinitionFor(spaceId);
  let collision: CollisionMap;
  if (definition?.generator === 'island') {
    collision = createSurvivalCollisionMap(SURVIVAL_WORLD_SEED, [], medium);
  } else if (definition?.generator === 'debug_flat' || definition?.generator === 'homestead') {
    collision = flatSpaceCollision(definition.sizeTiles, medium);
  } else {
    collision = flatSpaceCollision(1, medium);
  }
  SPACE_TERRAIN_COLLISION.set(key, collision);
  return collision;
}

export type ToolSpendResult =
  | { readonly ok: false; readonly code: 'swing_too_soon' | 'insufficient_vigour' }
  | { readonly ok: true; readonly costCenti: number; readonly vigourCenti: number; readonly lastSwingTick: bigint };

/** Pure transaction decision used by every authoritative tool reducer. World
 * state is written only for the `ok` branch, keeping rejections atomic. */
export function toolSpendResult(
  vigourCenti: number,
  lastSwingTick: bigint,
  authorityTick: bigint,
  fullCostCenti: number,
  minimumSwingTicks: number,
  whiff: boolean,
): ToolSpendResult {
  const interval = Math.max(1, Math.trunc(minimumSwingTicks));
  if (lastSwingTick !== 0n && authorityTick - lastSwingTick < BigInt(interval)) {
    return { ok: false, code: 'swing_too_soon' };
  }
  const costCenti = whiff ? Math.ceil(fullCostCenti / 2) : fullCostCenti;
  if (vigourCenti < costCenti) return { ok: false, code: 'insufficient_vigour' };
  return {
    ok: true,
    costCenti,
    vigourCenti: vigourCenti - costCenti,
    lastSwingTick: authorityTick,
  };
}

export interface AuthoritySurvivalResource {
  readonly kind: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly depleted: boolean;
}

export interface AuthorityPlacedChest {
  readonly tileX: number;
  readonly tileY: number;
  readonly carriedBy?: unknown;
}

export interface AuthorityPlaceableObstacle {
  readonly tileX: number;
  readonly tileY: number;
  readonly blocksMovement: boolean;
  readonly open?: boolean;
}

export function createAuthoritySurvivalCollisionMap(
  resources: readonly AuthoritySurvivalResource[],
  chests: readonly AuthorityPlacedChest[] = [],
  medium: MovementMedium = 'ground',
  placeables: readonly AuthorityPlaceableObstacle[] = [],
): CollisionMap {
  return createAuthoritySpaceCollisionMap(TOPSIDE_SPACE_ID, resources, chests, medium, placeables);
}

export function createAuthoritySpaceCollisionMap(
  spaceId: number,
  resources: readonly AuthoritySurvivalResource[],
  chests: readonly AuthorityPlacedChest[] = [],
  medium: MovementMedium = 'ground',
  placeables: readonly AuthorityPlaceableObstacle[] = [],
): CollisionMap {
  // Terrain is immutable for a space definition. Reusing the cached arrays
  // avoids rebuilding the large topside terrain for every authority tick.
  const terrain = terrainCollisionForSpace(spaceId, medium);
  const blocked = terrain.blocked;
  const horseJumpableTerrain = terrain.horseJumpableTerrain ?? [];
  const obstacles = [...(terrain.obstacles ?? [])];
  for (const resource of medium === 'ground' ? resources : []) {
    if (resource.depleted || resource.tileX < 0 || resource.tileY < 0
      || resource.tileX >= terrain.width || resource.tileY >= terrain.height) continue;
    if (survivalResourceBlocksMovement(resource.kind)) {
      obstacles.push(survivalResourceObstacle(resource.kind, resource.tileX, resource.tileY));
    }
  }
  for (const chest of medium === 'ground' ? chests : []) {
    if (chest.carriedBy !== undefined || chest.tileX < 0 || chest.tileY < 0
      || chest.tileX >= terrain.width || chest.tileY >= terrain.height) continue;
    obstacles.push({
      left: chest.tileX * TILE_SIZE_FIXED,
      top: chest.tileY * TILE_SIZE_FIXED,
      right: (chest.tileX + 1) * TILE_SIZE_FIXED - 1,
      bottom: (chest.tileY + 1) * TILE_SIZE_FIXED - 1,
    });
  }
  for (const placeable of medium === 'ground' ? placeables : []) {
    if (!placeable.blocksMovement || placeable.open === true
      || placeable.tileX < 0 || placeable.tileY < 0
      || placeable.tileX >= terrain.width || placeable.tileY >= terrain.height) continue;
    obstacles.push({
      left: placeable.tileX * TILE_SIZE_FIXED,
      top: placeable.tileY * TILE_SIZE_FIXED,
      right: (placeable.tileX + 1) * TILE_SIZE_FIXED - 1,
      bottom: (placeable.tileY + 1) * TILE_SIZE_FIXED - 1,
    });
  }
  return {
    width: terrain.width,
    height: terrain.height,
    blocked,
    horseJumpableTerrain,
    obstacles,
  };
}

export type TilePlacementResult = 'ok' | 'invalid_tile' | 'out_of_range' | 'tile_blocked';

export type PortalUseResult = 'ok' | 'no_horses_underground' | 'portal_out_of_range';

export function portalUseResult(
  player: { readonly spaceId: number; readonly x: number; readonly y: number },
  portal: { readonly fromSpace: number; readonly fromTileX: number; readonly fromTileY: number },
  mounted: boolean,
): PortalUseResult {
  if (mounted) return 'no_horses_underground';
  if (player.spaceId !== portal.fromSpace) return 'portal_out_of_range';
  const tileX = Math.floor(player.x / TILE_SIZE_FIXED);
  const tileY = Math.floor(player.y / TILE_SIZE_FIXED);
  return Math.abs(tileX - portal.fromTileX) <= 1 && Math.abs(tileY - portal.fromTileY) <= 1
    ? 'ok'
    : 'portal_out_of_range';
}

/** Shared authority gate for placeables. Dynamic actor occupancy is supplied
 * separately because players are not movement-map obstacles. */
export function tilePlacementResult(
  playerX: number,
  playerY: number,
  tileX: number,
  tileY: number,
  collision: CollisionMap,
  occupiedByActor: boolean,
): TilePlacementResult {
  if (!Number.isInteger(tileX) || !Number.isInteger(tileY)
    || tileX < 0 || tileY < 0 || tileX >= collision.width || tileY >= collision.height) return 'invalid_tile';
  const tile = { tileX, tileY };
  if (!tileTargetInReach(playerX, playerY, tile)) return 'out_of_range';
  return occupiedByActor || tileTargetIsBlocked(collision, tile) ? 'tile_blocked' : 'ok';
}

export function resourceHarvestResult(
  playerX: number,
  playerY: number,
  selectedItem: string,
  resource: { readonly kind: string; readonly tileX: number; readonly tileY: number; readonly depleted: boolean },
): 'ok' | 'depleted' | 'wrong_tool' | 'out_of_range' {
  if (resource.depleted) return 'depleted';
  const matchingTool = (isChoppableTreeKind(resource.kind) && selectedItem === 'axe')
    || ((isMineableOreKind(resource.kind) || isBreakableRockKind(resource.kind)) && selectedItem === 'pickaxe');
  if (!matchingTool) return 'wrong_tool';
  const targetVector = survivalResourceTargetVector(
    playerX,
    playerY,
    resource.kind,
    resource.tileX,
    resource.tileY,
  );
  const dx = targetVector.x;
  const dy = targetVector.y;
  const reachFixed = resourceToolReachFixed(selectedItem);
  if (dx * dx + dy * dy > reachFixed * reachFixed) return 'out_of_range';
  return 'ok';
}

export function resourceGatherResult(
  playerX: number,
  playerY: number,
  resource: { readonly kind: string; readonly tileX: number; readonly tileY: number; readonly depleted: boolean },
): 'ok' | 'depleted' | 'not_gatherable' | 'out_of_range' {
  if (resource.depleted) return 'depleted';
  if (!isGatherableResourceKind(resource.kind) || survivalGatherableDrop(resource.kind) === null) return 'not_gatherable';
  const resourceX = resource.tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
  const resourceY = resource.tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
  const dx = resourceX - playerX;
  const dy = resourceY - playerY;
  return dx * dx + dy * dy <= ITEM_PICKUP_REACH_FIXED * ITEM_PICKUP_REACH_FIXED ? 'ok' : 'out_of_range';
}

export type FarmToolUseResult = 'ok'
  | 'wrong_tool'
  | 'invalid_tile'
  | 'out_of_range'
  | 'not_grass'
  | 'tile_occupied'
  | 'already_tilled'
  | 'not_tilled'
  | 'already_watered';

/** Only natural grass-surface biomes can become player-authored soil. Cliffs,
 * beaches, desert, water, and authored dirt terraces remain immutable. */
export function isTillableSurvivalTile(seed: number, tileX: number, tileY: number): boolean {
  if (!Number.isInteger(tileX) || !Number.isInteger(tileY)
    || tileX < 0 || tileY < 0 || tileX >= SURVIVAL_WORLD_SIZE || tileY >= SURVIVAL_WORLD_SIZE) return false;
  const biome = survivalBiomeAt(seed, tileX, tileY);
  return biome === 'plains' || biome === 'meadow' || biome === 'forest'
    || biome === 'valley' || biome === 'highland';
}

export function farmToolUseResult(
  seed: number,
  playerX: number,
  playerY: number,
  selectedItem: string,
  tileX: number,
  tileY: number,
  soil: { readonly watered: boolean } | null,
  occupied: boolean,
): FarmToolUseResult {
  if (!Number.isInteger(tileX) || !Number.isInteger(tileY)
    || tileX < 0 || tileY < 0 || tileX >= SURVIVAL_WORLD_SIZE || tileY >= SURVIVAL_WORLD_SIZE) return 'invalid_tile';
  if (selectedItem !== 'hoe' && selectedItem !== 'watering_can') return 'wrong_tool';
  const targetX = tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
  const targetY = tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
  const dx = targetX - playerX;
  const dy = targetY - playerY;
  if (dx * dx + dy * dy > FARM_TOOL_REACH_FIXED * FARM_TOOL_REACH_FIXED) return 'out_of_range';
  if (selectedItem === 'hoe') {
    if (!isTillableSurvivalTile(seed, tileX, tileY)) return 'not_grass';
    if (occupied) return 'tile_occupied';
    return soil === null ? 'ok' : 'already_tilled';
  }
  if (soil === null) return 'not_tilled';
  return soil.watered ? 'already_watered' : 'ok';
}

/** Right-click hoe cleanup uses the same authoritative range and inventory
 * checks as tilling, but only an existing soil row can be restored to grass. */
export function farmSoilRestoreResult(
  playerX: number,
  playerY: number,
  selectedItem: string,
  tileX: number,
  tileY: number,
  soil: unknown | null,
): FarmToolUseResult {
  if (!Number.isInteger(tileX) || !Number.isInteger(tileY)
    || tileX < 0 || tileY < 0 || tileX >= SURVIVAL_WORLD_SIZE || tileY >= SURVIVAL_WORLD_SIZE) return 'invalid_tile';
  if (selectedItem !== 'hoe') return 'wrong_tool';
  const targetX = tileX * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
  const targetY = tileY * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
  const dx = targetX - playerX;
  const dy = targetY - playerY;
  if (dx * dx + dy * dy > FARM_TOOL_REACH_FIXED * FARM_TOOL_REACH_FIXED) return 'out_of_range';
  return soil === null ? 'not_tilled' : 'ok';
}

export function itemDropPosition(playerX: number, playerY: number, facing: Direction): { readonly x: number; readonly y: number } {
  const cardinal = 12 * FIXED_UNITS_PER_PIXEL;
  const diagonal = 8 * FIXED_UNITS_PER_PIXEL;
  switch (facing) {
    case 'up': return { x: playerX, y: playerY - cardinal };
    case 'down': return { x: playerX, y: playerY + cardinal };
    case 'left': return { x: playerX - cardinal, y: playerY };
    case 'right': return { x: playerX + cardinal, y: playerY };
    case 'upLeft': return { x: playerX - diagonal, y: playerY - diagonal };
    case 'upRight': return { x: playerX + diagonal, y: playerY - diagonal };
    case 'downLeft': return { x: playerX - diagonal, y: playerY + diagonal };
    case 'downRight': return { x: playerX + diagonal, y: playerY + diagonal };
  }
}

export function itemWithinPickupReach(playerX: number, playerY: number, itemX: number, itemY: number): boolean {
  const dx = itemX - playerX;
  const dy = itemY - playerY;
  return dx * dx + dy * dy <= ITEM_PICKUP_REACH_FIXED * ITEM_PICKUP_REACH_FIXED;
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

export function inputIsStale(updatedAtMicros: bigint, nowMicros: bigint): boolean {
  return nowMicros - updatedAtMicros > STALE_INPUT_MICROS;
}

export interface SettledMovementRun {
  readonly pendingDirection: string;
  readonly pendingSteps: number;
  readonly rejectedSteps: bigint;
}

interface MovementRunSegment {
  readonly direction: Direction;
  readonly steps: number;
}

function decodeMovementRunQueue(value: string, totalSteps: number): MovementRunSegment[] {
  if (totalSteps <= 0) return [];
  if (!value.includes(':')) {
    const direction = decodeDirection(value);
    return direction === undefined || direction === null ? [] : [{ direction, steps: totalSteps }];
  }
  const segments: MovementRunSegment[] = [];
  for (const token of value.split('|')) {
    const [rawDirection, rawSteps] = token.split(':');
    const direction = decodeDirection(rawDirection ?? '');
    const steps = Number(rawSteps);
    if (direction === undefined || direction === null || !Number.isSafeInteger(steps) || steps <= 0) continue;
    segments.push({ direction, steps });
  }
  return segments;
}

function encodeMovementRunQueue(segments: readonly MovementRunSegment[]): string {
  if (segments.length === 0) return 'idle';
  if (segments.length === 1) return segments[0]?.direction ?? 'idle';
  return segments.map((segment) => `${segment.direction}:${segment.steps}`).join('|');
}

export interface DrainedMovementRunQueue {
  readonly directions: readonly Direction[];
  readonly pendingDirection: string;
  readonly pendingSteps: number;
}

export function drainMovementRunQueue(
  pendingDirection: string,
  pendingSteps: number,
  maximumSteps: number,
): DrainedMovementRunQueue {
  const segments = decodeMovementRunQueue(pendingDirection, pendingSteps);
  const directions: Direction[] = [];
  let remainingDrain = Math.max(0, Math.min(pendingSteps, maximumSteps));
  while (remainingDrain > 0 && segments.length > 0) {
    const segment = segments[0];
    if (segment === undefined) break;
    const taken = Math.min(segment.steps, remainingDrain);
    for (let step = 0; step < taken; step += 1) directions.push(segment.direction);
    remainingDrain -= taken;
    if (taken === segment.steps) segments.shift();
    else segments[0] = { ...segment, steps: segment.steps - taken };
  }
  const nextSteps = segments.reduce((sum, segment) => sum + segment.steps, 0);
  return {
    directions,
    pendingDirection: encodeMovementRunQueue(segments),
    pendingSteps: nextSteps,
  };
}

export interface MovementAcknowledgement {
  readonly settledSequence: bigint;
  readonly pendingSequence: bigint;
}

export function queueMovementAcknowledgement(
  settledSequence: bigint,
  sequence: bigint,
  pendingSteps: number,
): MovementAcknowledgement {
  return pendingSteps === 0
    ? { settledSequence: sequence, pendingSequence: 0n }
    : { settledSequence, pendingSequence: sequence };
}

export function drainMovementAcknowledgement(
  settledSequence: bigint,
  pendingSequence: bigint,
  remainingSteps: number,
): MovementAcknowledgement {
  return remainingSteps === 0 && pendingSequence !== 0n
    ? { settledSequence: pendingSequence, pendingSequence: 0n }
    : { settledSequence, pendingSequence };
}

export function settleMovementRun(
  direction: string,
  runStartClientTick: bigint,
  closingClientTick: bigint,
  existingPendingDirection: string,
  existingPendingSteps: number,
): SettledMovementRun {
  const claimedSteps = closingClientTick > runStartClientTick
    ? closingClientTick - runStartClientTick
    : 0n;
  const decodedDirection = decodeDirection(direction);
  const confirmedSteps = decodedDirection === undefined || decodedDirection === null ? 0n : claimedSteps;
  if (confirmedSteps === 0n) {
    return {
      pendingDirection: existingPendingDirection,
      pendingSteps: existingPendingSteps,
      rejectedSteps: 0n,
    };
  }
  const available = BigInt(MAX_SETTLE_BACKLOG_STEPS - existingPendingSteps);
  const accepted = confirmedSteps < available ? confirmedSteps : available;
  const segments = decodeMovementRunQueue(existingPendingDirection, existingPendingSteps);
  if (accepted > 0n && decodedDirection !== undefined && decodedDirection !== null) {
    const previous = segments[segments.length - 1];
    if (previous?.direction === decodedDirection) {
      segments[segments.length - 1] = { direction: decodedDirection, steps: previous.steps + Number(accepted) };
    } else {
      segments.push({ direction: decodedDirection, steps: Number(accepted) });
    }
  }
  return {
    pendingDirection: encodeMovementRunQueue(segments),
    pendingSteps: existingPendingSteps + Number(accepted),
    rejectedSteps: confirmedSteps - accepted,
  };
}

export function movementCreditAvailable(
  creditStartedAtMicros: bigint,
  creditedSteps: bigint,
  nowMicros: bigint,
): number {
  const elapsed = nowMicros > creditStartedAtMicros ? nowMicros - creditStartedAtMicros : 0n;
  const allowance = elapsed * MOVEMENT_RATE_HZ / 1_000_000n + MOVEMENT_RATE_BURST_STEPS;
  const available = allowance > creditedSteps ? allowance - creditedSteps : 0n;
  return Number(available > 64n ? 64n : available);
}

export function nextActionStartedTick(current: bigint, authorityTick: bigint): bigint {
  return authorityTick > current ? authorityTick : current + 1n;
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

import {
  AUTHORITY_HZ,
  FIXED_UNITS_PER_PIXEL,
  SIM_STEPS_PER_AUTHORITY_TICK,
  SIM_TICKS_PER_SECOND,
  SURVIVAL_WORLD_SEED,
  SURVIVAL_WORLD_SIZE,
  TILE_SIZE_FIXED,
  createSurvivalCollisionMap,
  survivalTreeObstacle,
  type CollisionMap,
  type Direction,
} from '@orchard/sim';

export { AUTHORITY_HZ, SIM_STEPS_PER_AUTHORITY_TICK };
export const CHUNK_TILES = 16;
export const CHUNK_SIZE_FIXED = CHUNK_TILES * TILE_SIZE_FIXED;
export const TREE_REACH_FIXED = 2 * TILE_SIZE_FIXED;
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
  const obstacles = [];
  for (const resource of resources) {
    if (resource.depleted || resource.tileX < 0 || resource.tileY < 0
      || resource.tileX >= SURVIVAL_WORLD_SIZE || resource.tileY >= SURVIVAL_WORLD_SIZE) continue;
    obstacles.push(survivalTreeObstacle(resource.tileX, resource.tileY));
  }
  return { width: SURVIVAL_WORLD_SIZE, height: SURVIVAL_WORLD_SIZE, blocked, obstacles };
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

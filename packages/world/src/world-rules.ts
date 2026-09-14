import {persistedHearthArchitectureCollision} from '@orchard/sim';
import {hearthInteriorCollision} from '@orchard/sim';
import {
  AUTHORITY_HZ,
  FIXED_UNITS_PER_PIXEL,
  ITEM_PICKUP_REACH_FIXED,
  SIM_STEPS_PER_AUTHORITY_TICK,
  SIM_TICKS_PER_SECOND,
  SURVIVAL_WORLD_SIZE,
  TILE_SIZE_FIXED,
  TILE_INTERACTION_REACH_FIXED,
  TOPSIDE_SPACE_ID,
  isGatherableResourceKind,
  growthProgressForElapsedTicks,
  growthStageIndexForProgress,
  generateRogueRoomLayout,
  hearthLobbyCollision,
  resourceToolReachFixed,
  resourceToolForwardOffsetFixed,
  survivalBiomeAt,
  survivalResourceBlocksMovement,
  survivalResourceObstacle,
  runtimeSpaceDefinition,
  runtimeResourceDefinition,
  runtimeResourceObstacle,
  runtimeResourceTargetVector,
  runtimeResourceToolAllowed,
  homesteadPlayableTile,
  residencePlayableTile,
  cellarPlayableTile,
  caveTerrainPlaneCollisionBytes,
  cellarExcavationFootprint,
  terrainPlaneCollisionBytesForElevationGrid,
  tileTargetInReach,
  tileToolTargetInReach,
  tileTargetIsBlocked,
  itemDefinition,
  type CollisionMap,
  type ContentRegistry,
  type Direction,
  type MovementMedium,
  type RuntimeToolDefinition,
} from '@orchard/sim';
import { precomputedSurvivalCollisionMap } from './precomputed-survival-collision.js';

export { AUTHORITY_HZ, SIM_STEPS_PER_AUTHORITY_TICK };
export const CHUNK_TILES = 16;
export const CHUNK_SIZE_FIXED = CHUNK_TILES * TILE_SIZE_FIXED;
export const TREE_REACH_FIXED = 2 * TILE_SIZE_FIXED;
export const FARM_TOOL_REACH_FIXED = TILE_INTERACTION_REACH_FIXED;
export { ITEM_PICKUP_REACH_FIXED };
export const TREE_TEND_COOLDOWN_TICKS = 20n;
export const CROP_GROWTH_TICKS = 200n;
const LEGACY_CROP_GROWTH_PROFILE = {
  maxProgress: Number(CROP_GROWTH_TICKS),
  stageThresholds: [
    Number(CROP_GROWTH_TICKS / 3n),
    Number(CROP_GROWTH_TICKS * 2n / 3n),
    Number(CROP_GROWTH_TICKS),
  ],
} as const;
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
const DYNAMIC_EXCAVATION_COLLISION = new WeakMap<CollisionMap, {
  readonly blocked: boolean[];
  readonly elevations?: Int16Array | Uint8Array;
  terrainPlaneBlocked?: Uint8Array;
  readonly keys: Set<string>;
}>();

function flatSpaceCollision(sizeTiles: number, medium: MovementMedium, generator: 'flat' | 'homestead' | 'residence' | 'marlow_tent' | 'cellar' = 'flat', residenceExpansionRank=0): CollisionMap {
  const blocked = Array.from({ length: sizeTiles * sizeTiles }, (_, index) => {
    if (medium !== 'ground') return true;
    const x = index % sizeTiles;
    const y = Math.floor(index / sizeTiles);
    return generator === 'homestead' ? !homesteadPlayableTile(x, y, sizeTiles)
      : generator === 'residence' || generator === 'marlow_tent' ? !residencePlayableTile(x, y,generator==='residence'?residenceExpansionRank:0)
      : generator === 'cellar' ? x === 0 || y === 0 || x === sizeTiles - 1 || y === sizeTiles - 1
      : x === 0 || y === 0 || x === sizeTiles - 1 || y === sizeTiles - 1;
  });
  const elevations = generator === 'cellar' && medium === 'ground'
    ? Int16Array.from({ length: sizeTiles * sizeTiles }, (_, index) => (
      cellarPlayableTile(index % sizeTiles, Math.floor(index / sizeTiles)) ? 0 : 1
    ))
    : undefined;
  return {
    width: sizeTiles,
    height: sizeTiles,
    blocked,
    ...(elevations === undefined ? {} : {
      elevations,
      fixedTerrainPlane: 0,
      terrainMinimumElevation: 0,
      terrainTransitions: [],
      terrainPlaneBlocked: caveTerrainPlaneCollisionBytes(elevations, sizeTiles, sizeTiles),
    }),
    horseJumpableTerrain: Array<boolean>(blocked.length).fill(false),
    obstacles: [],
  };
}

export function terrainCollisionForSpace(
  registry: ContentRegistry,
  spaceId: number,
  medium: MovementMedium = 'ground',
  instanceRow?: {
    readonly spaceId: number;
    readonly sizeTier?: number | undefined;
    readonly residenceSpaceId?: number | undefined;
    readonly residenceExpansionRank?: number | undefined;
    readonly residenceArchitectureJson?: string | undefined;
    readonly instanceKind?: string | undefined;
    readonly seed?: number | undefined;
    readonly roomNumber?: number | undefined;
    readonly roomKind?: string | undefined;
    readonly theme?: string | undefined;
  } | null,
): CollisionMap {
  const key = `${registry.contentHash}:${spaceId}:${medium}:${instanceRow?.sizeTier ?? 0}:${instanceRow?.seed ?? 0}:${instanceRow?.roomNumber ?? 0}:${instanceRow?.roomKind ?? ''}:${instanceRow?.theme ?? ''}:${instanceRow?.residenceExpansionRank??0}:${instanceRow?.residenceArchitectureJson??''}`;
  const cached = SPACE_TERRAIN_COLLISION.get(key);
  if (cached !== undefined) return cached;
  const definition = runtimeSpaceDefinition(registry, spaceId, instanceRow);
  if(definition?.generator==='residence' && instanceRow?.residenceArchitectureJson!==undefined) {
    const prefix=`${registry.contentHash}:${spaceId}:${medium}:`;
    const keys=[...SPACE_TERRAIN_COLLISION.keys()].filter(candidate=>candidate.startsWith(prefix));
    while(keys.length>=4)SPACE_TERRAIN_COLLISION.delete(keys.shift()!);
  }
  let collision: CollisionMap;
  if (definition?.generator === 'island') {
    collision = medium === 'air'
      ? {
          width: SURVIVAL_WORLD_SIZE,
          height: SURVIVAL_WORLD_SIZE,
          blocked: Array<boolean>(SURVIVAL_WORLD_SIZE * SURVIVAL_WORLD_SIZE).fill(false),
          obstacles: [],
        }
      : precomputedSurvivalCollisionMap(medium);
  } else if (definition?.generator === 'roguelike' && definition.rogueRoom !== undefined) {
    const layout = generateRogueRoomLayout(
      definition.rogueRoom.seed,
      definition.rogueRoom.roomNumber,
      definition.rogueRoom.roomKind as Parameters<typeof generateRogueRoomLayout>[2],
    );
    const defaultCliffFamily = definition.rogueRoom.theme === 'volcanic'
      ? 'volcanic_interior'
      : definition.rogueRoom.theme === 'dungeon' ? 'dungeon_1' : 'cave';
    collision = {
      width: layout.width,
      height: layout.height,
      blocked: medium === 'ground' ? layout.blocked : Array<boolean>(layout.blocked.length).fill(true),
      ...(medium === 'ground' ? {
        elevations: layout.elevations,
        terrainMinimumElevation: 0,
        terrainTransitions: layout.terrainTransitions,
        terrainPlaneBlocked: terrainPlaneCollisionBytesForElevationGrid(
          layout.width,
          layout.height,
          layout.elevations,
          layout.terrainTransitions,
          defaultCliffFamily,
          {baseDatum: 0},
        ),
      } : {}),
      horseJumpableTerrain: Array<boolean>(layout.blocked.length).fill(false),
      obstacles: [],
    };
  } else if (definition?.generator === 'village_interior') {
    collision=hearthInteriorCollision(registry,definition.spaceId)
      ?? flatSpaceCollision(definition.sizeTiles,'air');
    if(medium!=='ground')collision={...collision,blocked:Array<boolean>(collision.width*collision.height).fill(true)};
  } else if (definition?.generator === 'delve_lobby') {
    collision = hearthLobbyCollision(registry,definition.spaceId)
      ?? flatSpaceCollision(definition.sizeTiles,'air');
    if (medium !== 'ground') collision = {...collision, blocked: Array<boolean>(collision.width * collision.height).fill(true)};
  } else if (definition?.generator === 'debug_flat' || definition?.generator === 'homestead'
    || definition?.generator === 'residence' || definition?.generator === 'marlow_tent'
    || definition?.generator === 'cellar') {
    collision = flatSpaceCollision(
      definition.sizeTiles,
      medium,
      definition.generator === 'debug_flat' ? 'flat' : definition.generator,
      definition.residenceExpansionRank,
    );
  } else {
    collision = flatSpaceCollision(1, medium);
  }
  if(definition?.generator==='residence'&&medium==='ground')collision=persistedHearthArchitectureCollision(
    definition.residenceExpansionRank??0,collision,definition.residenceArchitectureJson);
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
  readonly definitionId?: string;
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
}

export interface AuthorityExcavatedTile {
  readonly tileX: number;
  readonly tileY: number;
}

export function createAuthoritySurvivalCollisionMap(
  registry: ContentRegistry,
  resources: readonly AuthoritySurvivalResource[],
  chests: readonly AuthorityPlacedChest[] = [],
  medium: MovementMedium = 'ground',
  placeables: readonly AuthorityPlaceableObstacle[] = [],
): CollisionMap {
  return createAuthoritySpaceCollisionMap(registry, TOPSIDE_SPACE_ID, resources, chests, medium, placeables);
}

export function createAuthoritySpaceCollisionMap(
  registry: ContentRegistry,
  spaceId: number,
  resources: readonly AuthoritySurvivalResource[],
  chests: readonly AuthorityPlacedChest[] = [],
  medium: MovementMedium = 'ground',
  placeables: readonly AuthorityPlaceableObstacle[] = [],
  instanceRow?: {
    readonly spaceId: number;
    readonly sizeTier?: number | undefined;
    readonly residenceSpaceId?: number | undefined;
    readonly residenceExpansionRank?: number | undefined;
    readonly residenceArchitectureJson?: string | undefined;
    readonly instanceKind?: string | undefined;
    readonly seed?: number | undefined;
    readonly roomNumber?: number | undefined;
    readonly roomKind?: string | undefined;
    readonly theme?: string | undefined;
  } | null,
  excavatedTiles: readonly AuthorityExcavatedTile[] = [],
): CollisionMap {
  // Terrain is immutable for a space definition. Reusing the cached arrays
  // avoids rebuilding the large topside terrain for every authority tick.
  const terrain = terrainCollisionForSpace(registry, spaceId, medium, instanceRow);
  let blocked = terrain.blocked;
  let elevations = terrain.elevations;
  let terrainPlaneBlocked = terrain.terrainPlaneBlocked;
  if (excavatedTiles.length > 0) {
    const currentKeys = new Set(excavatedTiles.flatMap((tile) => cellarExcavationFootprint(
      tile.tileX,
      tile.tileY,
      terrain.width,
      terrain.height,
    )).map((tile) => `${tile.tileX},${tile.tileY}`));
    let dynamic = DYNAMIC_EXCAVATION_COLLISION.get(terrain);
    if (dynamic === undefined || [...dynamic.keys].some((key) => !currentKeys.has(key))) {
      dynamic = {
        blocked: terrain.blocked.slice(),
        ...(terrain.elevations === undefined ? {} : { elevations: terrain.elevations.slice() }),
        ...(terrain.terrainPlaneBlocked === undefined
          ? {}
          : { terrainPlaneBlocked: terrain.terrainPlaneBlocked.slice() }),
        keys: new Set<string>(),
      };
      DYNAMIC_EXCAVATION_COLLISION.set(terrain, dynamic);
    }
    let terrainHeightChanged = false;
    for (const tile of excavatedTiles) {
      for (const cell of cellarExcavationFootprint(
        tile.tileX,
        tile.tileY,
        terrain.width,
        terrain.height,
      )) {
        const key = `${cell.tileX},${cell.tileY}`;
        if (dynamic.keys.has(key)) continue;
        const index = cell.tileY * terrain.width + cell.tileX;
        dynamic.blocked[index] = false;
        if (dynamic.elevations !== undefined && dynamic.elevations[index] !== 0) {
          dynamic.elevations[index] = 0;
          terrainHeightChanged = true;
        }
        dynamic.keys.add(key);
      }
    }
    if (terrainHeightChanged && dynamic.elevations !== undefined) {
      dynamic.terrainPlaneBlocked = caveTerrainPlaneCollisionBytes(
        dynamic.elevations,
        terrain.width,
        terrain.height,
      );
    }
    blocked = dynamic.blocked;
    elevations = dynamic.elevations;
    terrainPlaneBlocked = dynamic.terrainPlaneBlocked;
  }
  const horseJumpableTerrain = terrain.horseJumpableTerrain ?? [];
  const obstacles = [...(terrain.obstacles ?? [])];
  for (const resource of medium === 'ground' ? resources : []) {
    if (resource.depleted || resource.tileX < 0 || resource.tileY < 0
      || resource.tileX >= terrain.width || resource.tileY >= terrain.height) continue;
    const definition = runtimeResourceDefinition(registry, resource);
    if (definition === null) {
      if (survivalResourceBlocksMovement(resource.kind, registry)) {
        obstacles.push(survivalResourceObstacle(resource.kind, resource.tileX, resource.tileY, registry));
      }
      continue;
    }
    if (!definition.collision.blocksMovement) continue;
    const obstacle = runtimeResourceObstacle(registry, resource, resource.tileX, resource.tileY);
    if (obstacle !== null) obstacles.push(obstacle);
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
    if (!placeable.blocksMovement
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
    ...(medium === 'ground' && elevations !== undefined
      ? { elevations }
      : {}),
    ...(medium === 'ground' && terrain.fixedTerrainPlane !== undefined
      ? { fixedTerrainPlane: terrain.fixedTerrainPlane }
      : {}),
    ...(medium === 'ground' && terrain.terrainTransitions !== undefined
      ? { terrainTransitions: terrain.terrainTransitions }
      : {}),
    ...(medium === 'ground' && terrainPlaneBlocked !== undefined
      ? { terrainPlaneBlocked }
      : {}),
    ...(medium === 'ground' && terrain.terrainMinimumElevation !== undefined
      ? { terrainMinimumElevation: terrain.terrainMinimumElevation }
      : {}),
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
  allowMounted = false,
): PortalUseResult {
  if (mounted && !allowMounted) return 'no_horses_underground';
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
  _selectedItem: string,
  resource: { readonly kind: string; readonly tileX: number; readonly tileY: number; readonly depleted: boolean },
  runtimeTool: RuntimeToolDefinition | null,
  registry: ContentRegistry,
): 'ok' | 'depleted' | 'wrong_tool' | 'out_of_range' {
  if (resource.depleted) return 'depleted';
  if (!runtimeResourceToolAllowed(registry, resource, runtimeTool)
    || runtimeResourceDefinition(registry, resource) === null) return 'wrong_tool';
  const targetVector = runtimeResourceTargetVector(
    registry, resource, playerX, playerY, resource.tileX, resource.tileY,
  );
  if (targetVector === null) return 'wrong_tool';
  const dx = targetVector.x;
  const dy = targetVector.y;
  const targetLength = Math.hypot(dx, dy);
  const forwardOffset = resourceToolForwardOffsetFixed(runtimeTool);
  const areaDx = targetLength > 0 ? dx - dx / targetLength * forwardOffset : dx;
  const areaDy = targetLength > 0 ? dy - dy / targetLength * forwardOffset : dy;
  const reachFixed = resourceToolReachFixed(runtimeTool);
  if (areaDx * areaDx + areaDy * areaDy > reachFixed * reachFixed) return 'out_of_range';
  return 'ok';
}

export function resourceGatherResult(
  playerX: number,
  playerY: number,
  resource: { readonly kind: string; readonly tileX: number; readonly tileY: number; readonly depleted: boolean },
  registry?: ContentRegistry,
): 'ok' | 'depleted' | 'not_gatherable' | 'out_of_range' {
  if (resource.depleted) return 'depleted';
  if (registry === undefined
    ? !isGatherableResourceKind(resource.kind)
    : runtimeResourceDefinition(registry, resource)?.interaction.mode !== 'gather') return 'not_gatherable';
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

export type FarmToolMode = 'cultivate' | 'water';

function farmToolMode(itemKind: string): FarmToolMode | null {
  const tags = itemDefinition(itemKind)?.tags ?? [];
  if (tags.includes('tool.farming.cultivate')) return 'cultivate';
  if (tags.includes('tool.farming.water')) return 'water';
  return null;
}

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
  toolDefinition: RuntimeToolDefinition | null,
  tillableOverride?: boolean,
  modeOverride?: FarmToolMode | null,
): FarmToolUseResult {
  if (!Number.isInteger(tileX) || !Number.isInteger(tileY)
    || tileX < 0 || tileY < 0 || tileX >= SURVIVAL_WORLD_SIZE || tileY >= SURVIVAL_WORLD_SIZE) return 'invalid_tile';
  const mode = modeOverride === undefined ? farmToolMode(selectedItem) : modeOverride;
  if (mode === null) return 'wrong_tool';
  if (toolDefinition === null || toolDefinition.specialization !== 'farming') return 'wrong_tool';
  if (!tileToolTargetInReach(toolDefinition, { x: playerX, y: playerY }, { tileX, tileY })) return 'out_of_range';
  if (mode === 'cultivate') {
    if (!(tillableOverride ?? isTillableSurvivalTile(seed, tileX, tileY))) return 'not_grass';
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
  toolDefinition: RuntimeToolDefinition | null,
  modeOverride?: FarmToolMode | null,
): FarmToolUseResult {
  if (!Number.isInteger(tileX) || !Number.isInteger(tileY)
    || tileX < 0 || tileY < 0 || tileX >= SURVIVAL_WORLD_SIZE || tileY >= SURVIVAL_WORLD_SIZE) return 'invalid_tile';
  const mode = modeOverride === undefined ? farmToolMode(selectedItem) : modeOverride;
  if (mode !== 'cultivate') return 'wrong_tool';
  if (toolDefinition === null || toolDefinition.specialization !== 'farming') return 'wrong_tool';
  if (!tileToolTargetInReach(toolDefinition, { x: playerX, y: playerY }, { tileX, tileY })) return 'out_of_range';
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
  const elapsed = authorityTick > wateredAtTick ? authorityTick - wateredAtTick : 0n;
  const progress = growthProgressForElapsedTicks(0, elapsed, 1, LEGACY_CROP_GROWTH_PROFILE);
  const stage = growthStageIndexForProgress(LEGACY_CROP_GROWTH_PROFILE, progress);
  return stage === null ? 0 : Math.min(3, stage + 1) as 1 | 2 | 3;
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
  readonly sprinting: boolean;
  readonly steps: number;
}

function decodeMovementRunQueue(value: string, totalSteps: number): MovementRunSegment[] {
  if (totalSteps <= 0) return [];
  if (!value.includes(':')) {
    const direction = decodeDirection(value);
    return direction === undefined || direction === null
      ? []
      : [{ direction, sprinting: false, steps: totalSteps }];
  }
  const segments: MovementRunSegment[] = [];
  for (const token of value.split('|')) {
    const [rawDirection, rawSteps] = token.split(':');
    const sprinting = rawDirection?.endsWith('!') === true;
    const direction = decodeDirection(sprinting ? rawDirection.slice(0, -1) : rawDirection ?? '');
    const steps = Number(rawSteps);
    if (direction === undefined || direction === null || !Number.isSafeInteger(steps) || steps <= 0) continue;
    segments.push({ direction, sprinting, steps });
  }
  return segments;
}

function encodeMovementRunQueue(segments: readonly MovementRunSegment[]): string {
  if (segments.length === 0) return 'idle';
  if (segments.length === 1 && segments[0]?.sprinting === false) {
    return segments[0].direction;
  }
  return segments.map((segment) => (
    `${segment.direction}${segment.sprinting ? '!' : ''}:${segment.steps}`
  )).join('|');
}

export interface MovementRunStep {
  readonly direction: Direction;
  readonly sprinting: boolean;
}

export interface DrainedMovementRunQueue {
  readonly intents: readonly MovementRunStep[];
  readonly pendingDirection: string;
  readonly pendingSteps: number;
}

/** Sprint intent only suppresses Vigour regeneration while the player can
 * actually pay for a sprint step. Keeping Shift held after depletion must fall
 * back to walking and recovery instead of creating a zero-Vigour deadlock. */
export function sprintIntentSuppressesVigourRegen(
  hasSprintIntent: boolean,
  vigourCenti: number,
  oneStepCostCenti: number,
): boolean {
  return hasSprintIntent
    && Number.isSafeInteger(vigourCenti)
    && Number.isSafeInteger(oneStepCostCenti)
    && oneStepCostCenti > 0
    && vigourCenti >= oneStepCostCenti;
}

export function drainMovementRunQueue(
  pendingDirection: string,
  pendingSteps: number,
  maximumSteps: number,
): DrainedMovementRunQueue {
  const segments = decodeMovementRunQueue(pendingDirection, pendingSteps);
  const intents: MovementRunStep[] = [];
  let remainingDrain = Math.max(0, Math.min(pendingSteps, maximumSteps));
  while (remainingDrain > 0 && segments.length > 0) {
    const segment = segments[0];
    if (segment === undefined) break;
    const taken = Math.min(segment.steps, remainingDrain);
    for (let step = 0; step < taken; step += 1) {
      intents.push({ direction: segment.direction, sprinting: segment.sprinting });
    }
    remainingDrain -= taken;
    if (taken === segment.steps) segments.shift();
    else segments[0] = { ...segment, steps: segment.steps - taken };
  }
  const nextSteps = segments.reduce((sum, segment) => sum + segment.steps, 0);
  return {
    intents,
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
  sprinting: boolean,
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
    if (previous?.direction === decodedDirection && previous.sprinting === sprinting) {
      segments[segments.length - 1] = {
        direction: decodedDirection,
        sprinting,
        steps: previous.steps + Number(accepted),
      };
    } else {
      segments.push({ direction: decodedDirection, sprinting, steps: Number(accepted) });
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

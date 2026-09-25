import { runtimeTraversalPolicy, mapDocumentTraversalChannels, createLiveIslandMapDocument, activeSurvivalLandmarks, staticTraversalChannels, terrainCellMedium, type MediumCollisionChannels } from '@orchard/sim';
import {
  SURVIVAL_BIOMES,
  TILE_SIZE_FIXED,
  TOPSIDE_SPACE_ID,
  generateSurvivalDecorations,
  survivalBiomeBlocksTraversal,
  survivalDecorationObstacle,
  survivalFishermanDockWalkableAt,
  survivalResourceBlocksMovement,
  survivalResourceObstacle,
  runtimeResourceDefinition,
  runtimeResourceObstacle,
  survivalTerrainPlaneCollisionBytes,
  runtimePlaceableBlocksMovement,
  runtimeObjectFootprintTiles,
  hearthFurnitureShapeForPlaceable,
  hearthFurnitureObstacle,
  type CollisionMap,
  type CollisionObstacle,
  type ContentRegistry,
  type MovementMedium,
} from '@orchard/sim';
import { terrainFixedPlane, terrainMinimumElevation, type TerrainArray } from './terrain.js';
import { terrainIsWindow } from './terrain-index.js';

export interface CollisionWorldResource {
  readonly id: bigint;
  readonly kind: string;
  readonly definitionId?: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly depleted: boolean;
}

export interface CollisionWorldChest {
  readonly tileX: number;
  readonly tileY: number;
  readonly carriedBy?: unknown;
}

export interface CollisionWorldPlaceable {
  readonly kind: string;
  readonly definitionId?: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly open: boolean;
  readonly lit?: boolean;
  readonly stateJson?: string;
  readonly carriedBy?: unknown;
}

const traversalChannelsCache = new WeakMap<TerrainArray, WeakMap<ContentRegistry, MediumCollisionChannels>>();
const cellarBoundaryCollisionCache = new WeakMap<TerrainArray, Uint8Array>();

/** Uncut cellar rock is height-owned terrain rather than an absolute blocker.
 * Only the finite 1024x1024 world edge belongs in the legacy flat channel.
 * The edge is the whole map's, in world tiles, so a window (non-zero origin)
 * marks only the map-edge cells it contains, never its own border. */
function cellarBoundaryCollision(terrain: TerrainArray): Uint8Array {
  let blocked = cellarBoundaryCollisionCache.get(terrain);
  if (blocked !== undefined) return blocked;
  const originX = terrain.originX ?? 0, originY = terrain.originY ?? 0;
  const worldWidth = terrain.worldWidth ?? terrain.width, worldHeight = terrain.worldHeight ?? terrain.height;
  blocked = Uint8Array.from({ length: terrain.width * terrain.height }, (_, index) => {
    const tileX = originX + index % terrain.width;
    const tileY = originY + Math.floor(index / terrain.width);
    return tileX === 0 || tileY === 0 || tileX === worldWidth - 1 || tileY === worldHeight - 1 ? 1 : 0;
  });
  cellarBoundaryCollisionCache.set(terrain, blocked);
  return blocked;
}

export type PreparedClientTerrainCollision = Omit<CollisionMap, 'obstacles'>;

/** One live row's collision box. Hearth furniture is tagged: the server appends
 * it after its live-map composition, outside the suppressed-key filter. */
export interface ClientLiveRowObstacle {
  readonly obstacle: CollisionObstacle;
  readonly furniture: boolean;
}

/** The ground boxes of live resource, chest and placeable rows, in the order
 * createClientCollisionMap has always listed them, plus each blocking resource's
 * box by id (resource targeting). A resource whose `resource-<id>` is in
 * `generatedSuppressions` is left out, as the server does. */
export function clientLiveRowObstacles(
  resources: Iterable<CollisionWorldResource>,
  chests: Iterable<CollisionWorldChest> = [],
  placeables: Iterable<CollisionWorldPlaceable> = [],
  generatedSuppressions: ReadonlySet<string> = new Set<string>(),
  contentRegistry?: ContentRegistry,
): { readonly entries: readonly ClientLiveRowObstacle[]; readonly resourceObstacles: ReadonlyMap<bigint, CollisionObstacle> } {
  const entries: ClientLiveRowObstacle[] = [];
  const resourceObstacles = new Map<bigint, CollisionObstacle>();
  for (const resource of resources) {
    if (generatedSuppressions.has(`resource-${resource.id}`)) continue;
    const authored = contentRegistry === undefined
      ? null
      : runtimeResourceDefinition(contentRegistry, resource);
    const blocksMovement = authored === null
      ? contentRegistry === undefined && survivalResourceBlocksMovement(resource.kind)
      : authored.collision.blocksMovement;
    if (!resource.depleted && blocksMovement) {
      const obstacle = contentRegistry === undefined
        ? survivalResourceObstacle(resource.kind, resource.tileX, resource.tileY)
        : runtimeResourceObstacle(contentRegistry, resource, resource.tileX, resource.tileY);
      if (obstacle === null) continue;
      entries.push({ obstacle, furniture: false });
      resourceObstacles.set(resource.id, obstacle);
    }
  }
  for (const chest of chests) if (chest.carriedBy === undefined) entries.push({ furniture: false, obstacle: {
    left: chest.tileX * TILE_SIZE_FIXED,
    top: chest.tileY * TILE_SIZE_FIXED,
    right: (chest.tileX + 1) * TILE_SIZE_FIXED - 1,
    bottom: (chest.tileY + 1) * TILE_SIZE_FIXED - 1,
  } });
  for (const placeable of placeables) {
    if (placeable.carriedBy !== undefined) continue;
    const furniture = contentRegistry === undefined
      ? hearthFurnitureShapeForPlaceable(placeable)
      : hearthFurnitureShapeForPlaceable(contentRegistry, placeable);
    if (furniture !== null) {
      const obstacle = hearthFurnitureObstacle({ id: '', shape: furniture, tileX: placeable.tileX, tileY: placeable.tileY });
      if (obstacle !== null) entries.push({ obstacle, furniture: true });
      continue;
    }
    if (contentRegistry === undefined) continue;
    if (!runtimePlaceableBlocksMovement(contentRegistry, placeable)) continue;
    for (const tile of runtimeObjectFootprintTiles(contentRegistry, placeable)) entries.push({ furniture: false, obstacle: {
      left: tile.tileX * TILE_SIZE_FIXED,
      top: tile.tileY * TILE_SIZE_FIXED,
      right: (tile.tileX + 1) * TILE_SIZE_FIXED - 1,
      bottom: (tile.tileY + 1) * TILE_SIZE_FIXED - 1,
    } });
  }
  return { entries, resourceObstacles };
}

/** Reuses explicitly prepared terrain when supplied; live obstacles are always rebuilt.
 * A chunk window (non-zero origin) never takes the generator paths: its static
 * obstacles and traversal channels come from chunk records (chunk-collision). */
export function createClientCollisionMap(
  terrain: TerrainArray,
  resources: Iterable<CollisionWorldResource>,
  chests: Iterable<CollisionWorldChest> = [],
  medium: MovementMedium = 'ground',
  placeables: Iterable<CollisionWorldPlaceable> = [],
  generatedSuppressions: ReadonlySet<string> = new Set<string>(),
  authoredDockWalkableTiles?: readonly { readonly tileX: number; readonly tileY: number }[],
  contentRegistry?: ContentRegistry,
  preparedTerrain?: PreparedClientTerrainCollision,
): CollisionMap & { readonly resourceObstacles: ReadonlyMap<bigint, CollisionObstacle> } {
  const live = medium === 'ground'
    ? clientLiveRowObstacles(resources, chests, placeables, generatedSuppressions, contentRegistry)
    : { entries: [], resourceObstacles: new Map<bigint, CollisionObstacle>() };
  const obstacles = live.entries.map(({ obstacle }) => obstacle);
  const resourceObstacles = live.resourceObstacles;
  const window = terrainIsWindow(terrain);
  if (terrain.spaceId === TOPSIDE_SPACE_ID && !window) {
    // Isolated engine fixtures may omit all authored spaces. Live snapshots
    // always carry the active registry and must fail neutral on a missing
    // island palette instead of silently restoring bootstrap content.
    const decorationRegistry = contentRegistry !== undefined && contentRegistry.spaces.size > 0
      ? contentRegistry : undefined;
    for (const decoration of generateSurvivalDecorations(terrain.seed, decorationRegistry)) {
      if (generatedSuppressions.has(String(decoration.id))
        || generatedSuppressions.has(`decoration-${decoration.id}`)
        || generatedSuppressions.has(`decoration:${decoration.id}`)) continue;
      const obstacle = survivalDecorationObstacle(decoration, medium, contentRegistry);
      if (obstacle !== null) obstacles.push(obstacle);
    }
  }
  let traversalChannels = terrain.traversalChannels;
  if (traversalChannels === undefined && !window && contentRegistry !== undefined && runtimeTraversalPolicy(contentRegistry) !== null) {
    let cache = traversalChannelsCache.get(terrain);
    if (cache === undefined) { cache = new WeakMap(); traversalChannelsCache.set(terrain, cache); }
    traversalChannels = cache.get(contentRegistry);
    if (traversalChannels === undefined) {
      if (terrain.spaceId === TOPSIDE_SPACE_ID) {
        const document = createLiveIslandMapDocument({ seed: terrain.seed, landmarks: activeSurvivalLandmarks(contentRegistry, TOPSIDE_SPACE_ID) });
        traversalChannels = mapDocumentTraversalChannels(document);
      } else {
        const ground = prepareClientTerrainCollision(terrain, 'ground', authoredDockWalkableTiles);
        const hazards = new Set(Array.from(terrain.rogueHazards ?? [], (value, index) => value ? index : -1).filter(index => index >= 0));
        traversalChannels = staticTraversalChannels(ground, index => hazards.has(index) ? 'lava'
          : terrainCellMedium({ biome: SURVIVAL_BIOMES[terrain.biomes[index]!] ?? 'water' }), hazards);
      }
      cache.set(contentRegistry, traversalChannels);
    }
  }
  return {
    ...(preparedTerrain ?? prepareClientTerrainCollision(terrain, medium, authoredDockWalkableTiles)),
    ...(traversalChannels === undefined ? {} : { traversalChannels }),
    obstacles,
    resourceObstacles,
  };
}

/** A caller may retain this projection only while its terrain and dock inputs
 * are unchanged. Generic/editor callers receive a fresh projection by default. */
export function prepareClientTerrainCollision(
  terrain: TerrainArray,
  medium: MovementMedium = 'ground',
  authoredDockWalkableTiles?: readonly { readonly tileX: number; readonly tileY: number }[],
): PreparedClientTerrainCollision {
  const fixedTerrainPlane = terrainFixedPlane(terrain);
  const terrainBlocked = medium === 'ground'
    ? fixedTerrainPlane !== undefined
      ? cellarBoundaryCollision(terrain)
      : terrain.blocked
    : Uint8Array.from(terrain.biomes, (biome) => (
      survivalBiomeBlocksTraversal(SURVIVAL_BIOMES[biome] ?? 'water', medium) ? 1 : 0
    ));
  let blocked = terrainBlocked;
  const window = terrainIsWindow(terrain);
  if (medium === 'ground' && terrain.spaceId === TOPSIDE_SPACE_ID) {
    let authoredDockCorrection: Uint8Array | null = null;
    const configuredDockTiles = authoredDockWalkableTiles === undefined ? null
      : new Set(authoredDockWalkableTiles.map((tile) => `${tile.tileX}:${tile.tileY}`));
    // Dock tiles are world tiles: a window's cell index is offset by its origin.
    const originX = terrain.originX ?? 0, originY = terrain.originY ?? 0;
    for (let index = 0; index < terrainBlocked.length; index += 1) {
      if (!terrainBlocked[index]) continue;
      const tileX = originX + index % terrain.width, tileY = originY + Math.floor(index / terrain.width);
      if (!(configuredDockTiles?.has(`${tileX}:${tileY}`) ?? survivalFishermanDockWalkableAt(tileX, tileY))) continue;
      authoredDockCorrection ??= terrainBlocked.slice();
      authoredDockCorrection[index] = 0;
    }
    blocked = authoredDockCorrection ?? terrainBlocked;
  }
  // The generator's whole-map plane bytes never describe a window.
  const topsidePlaneBlocked = medium !== 'ground' || terrain.spaceId !== TOPSIDE_SPACE_ID ? undefined
    : terrain.terrainPlaneBlocked ?? (window ? undefined : survivalTerrainPlaneCollisionBytes(terrain.seed));
  return {
    width: terrain.width,
    height: terrain.height,
    ...(window ? { originX: terrain.originX ?? 0, originY: terrain.originY ?? 0 } : {}),
    ...(terrain.traversalChannels === undefined ? {} : { traversalChannels: terrain.traversalChannels }),
    blocked,
    ...(medium === 'ground' ? { elevations: terrain.elevations } : {}),
    ...(medium === 'ground' && fixedTerrainPlane !== undefined
      ? { fixedTerrainPlane }
      : {}),
    ...(medium === 'ground'
      ? terrain.spaceId === TOPSIDE_SPACE_ID && topsidePlaneBlocked !== undefined
        ? { terrainPlaneBlocked: topsidePlaneBlocked }
        : terrain.terrainPlaneBlocked === undefined
          ? {}
          : { terrainPlaneBlocked: terrain.terrainPlaneBlocked }
      : {}),
    ...(medium === 'ground' && terrain.terrainTransitions !== undefined
      ? { terrainTransitions: terrain.terrainTransitions }
      : {}),
    ...(medium === 'ground' ? { terrainMinimumElevation: terrainMinimumElevation(terrain) } : {}),
    ...(medium === 'ground' ? { horseJumpableTerrain: terrain.horseJumpableTerrain } : {}),
  };
}

/**
 * The compiled live-island runtime: the chunk materializer's reference compiler (static world
 * S3-final moved it out of the world module, which serves the published chunks only; S7b made it
 * browser-safe so Studio can materialise its own publications). Never imported by the world module
 * or the game client.
 */
import {
  activeSpaceGroundWalkableTiles, activeSurvivalLandmarks, cellFlagsWhere, CombatRegionPolicy, compileMapDocument,
  compiledMapTerrainPlaneCollisionBytes, createLiveIslandMapDocument, generateSurvivalDecorations, generateSurvivalLandmarkDecorations,
  generateSurvivalProceduralDecorations, generateSurvivalResources, MAP_PREFAB_COLLISION_RESOLUTION,
  mapDocumentUsesSurvivalIslandBase, mapLandmarkCollisionObstacle, mapObjectCollisionCells, mapTraversalChannels, parseMapDocumentV3,
  resolvedMapBiomeAt, runtimeTilesetResolver, runtimeTraversalPolicy, survivalBiomeAllowsHorseJump, survivalDecorationObstacle,
  SURVIVAL_WORLD_SEED, SURVIVAL_WORLD_SIZE, SURVIVAL_WORLD_VERSION, terrainDocumentForMapV3, TILE_SIZE_FIXED, TOPSIDE_SPACE_ID,
  type CollisionMap, type CollisionObstacle, type CombatRegion, type ContentRegistry, type GeneratedSurvivalResource, type MapDocumentV3,
} from '@orchard/sim';
import { documentStaticView, type LiveIslandStaticView } from '../../../world/src/content/chunk-authority-runtime.js';

/** A live map row (the map document table row), or null for the seed bootstrap. */
export interface CompiledIslandRow { readonly revision: number; readonly contentHash: string; readonly documentJson: string }

export interface LiveIslandRuntime {
  readonly combatPolicy: CombatRegionPolicy;
  readonly combatRegions: readonly CombatRegion[] | undefined;
  readonly key: string;
  readonly document: MapDocumentV3;
  readonly ground: CollisionMap;
  readonly water: CollisionMap;
  readonly generatedSuppressions: ReadonlySet<string>;
  readonly suppressedDecorationObstacleKeys: Readonly<Record<'ground' | 'water', ReadonlySet<string>>>;
  readonly staticView: LiveIslandStaticView;
  generatedResources(): readonly GeneratedSurvivalResource[];
  readonly baseObstacles: Readonly<Record<'ground' | 'water', readonly CollisionObstacle[]>>;
}

let liveIslandRuntimeCache: LiveIslandRuntime | null = null;

export function authoredMapCollisionObstacles(
  document: MapDocumentV3,
  medium: 'ground' | 'water',
  registry: ContentRegistry,
): readonly CollisionObstacle[] {
  const subCellSize = TILE_SIZE_FIXED / MAP_PREFAB_COLLISION_RESOLUTION;
  const obstacles: CollisionObstacle[] = [];
  for (const object of medium === 'ground' ? document.objects : []) {
    for (const cell of mapObjectCollisionCells(document, object)) {
      for (let bit = 0; bit < MAP_PREFAB_COLLISION_RESOLUTION ** 2; bit += 1) {
        if ((cell.collisionMask & (1 << bit)) === 0) continue;
        const column = bit % MAP_PREFAB_COLLISION_RESOLUTION;
        const row = Math.floor(bit / MAP_PREFAB_COLLISION_RESOLUTION);
        const left = cell.tileX * TILE_SIZE_FIXED + column * subCellSize;
        const top = cell.tileY * TILE_SIZE_FIXED + row * subCellSize;
        obstacles.push({ left, top, right: left + subCellSize - 1, bottom: top + subCellSize - 1 });
      }
    }
  }
  for (const landmark of document.landmarks) {
    const obstacle = mapLandmarkCollisionObstacle(landmark, medium, registry);
    if (obstacle !== null) obstacles.push(obstacle);
  }
  return obstacles;
}

export function suppressedGeneratedDecorationObstacleKeys(
  document: MapDocumentV3,
  generatedSuppressions: ReadonlySet<string>,
  medium: 'ground' | 'water',
  activeLandmarks: ReturnType<typeof activeSurvivalLandmarks>,
  registry: ContentRegistry,
): ReadonlySet<string> {
  const keys = new Set<string>();
  const activeLandmarkIds = new Set(
    generateSurvivalLandmarkDecorations(activeLandmarks).map((landmark) => landmark.id),
  );
  const proceduralIds = new Set(generateSurvivalProceduralDecorations(
    document.provenance.generatorSeed ?? SURVIVAL_WORLD_SEED,
    registry,
  ).map(({ id }) => id));
  for (const decoration of generateSurvivalDecorations(
    document.provenance.generatorSeed ?? SURVIVAL_WORLD_SEED,
    registry,
  )) {
    const suppressed = !proceduralIds.has(decoration.id)
      || activeLandmarkIds.has(decoration.id)
      || generatedSuppressions.has(String(decoration.id));
    if (!suppressed
      && !generatedSuppressions.has(`decoration-${decoration.id}`)
      && !generatedSuppressions.has(`decoration:${decoration.id}`)) continue;
    const obstacle = survivalDecorationObstacle(decoration, medium, registry);
    if (obstacle !== null) keys.add(
      `${obstacle.left}:${obstacle.top}:${obstacle.right}:${obstacle.bottom}`,
    );
  }
  return keys;
}

export function compiledLiveIslandRuntime(row: CompiledIslandRow | null, registry: ContentRegistry): LiveIslandRuntime | null {
  const landmarks = activeSurvivalLandmarks(registry, TOPSIDE_SPACE_ID);
  const key = row === null
    ? `seed:${SURVIVAL_WORLD_SEED}:${SURVIVAL_WORLD_VERSION}:${registry.contentHash}`
    : `${row.revision}:${row.contentHash}:${registry.contentHash}`;
  if (liveIslandRuntimeCache?.key === key) return liveIslandRuntimeCache;
  const document = row === null
    ? createLiveIslandMapDocument({ landmarks })
    : parseMapDocumentV3(row.documentJson, landmarks);
  if (document.width !== SURVIVAL_WORLD_SIZE || document.height !== SURVIVAL_WORLD_SIZE
    || !mapDocumentUsesSurvivalIslandBase(document)) return null;
  const compiled = compileMapDocument(
    terrainDocumentForMapV3(document),
    runtimeTilesetResolver(registry.tilesets),
  );
  const traversalChannels = runtimeTraversalPolicy(registry) === null ? undefined : mapTraversalChannels(document, compiled);
  const length = compiled.width * compiled.height;
  const horseJumpableTerrain = cellFlagsWhere(length, (index) => (
    survivalBiomeAllowsHorseJump(resolvedMapBiomeAt(
      document,
      index % compiled.width,
      Math.floor(index / compiled.width),
    ))
  ));
  let minimumElevation = 0;
  for (const elevation of compiled.elevations) minimumElevation = Math.min(minimumElevation, elevation);
  const groundWalkableTiles = new Set(activeSpaceGroundWalkableTiles(
    registry, TOPSIDE_SPACE_ID, document.landmarks,
  ).map(({tileX,tileY})=>`${tileX}:${tileY}`));
  const ground: CollisionMap = {
    ...(traversalChannels === undefined ? {} : { traversalChannels }),
    width: compiled.width,
    height: compiled.height,
    blocked: compiled.blocked.map((blocked, index) => (
      groundWalkableTiles.has(`${index % compiled.width}:${Math.floor(index / compiled.width)}`)
        ? 0
        : blocked
    )),
    elevations: compiled.elevations,
    terrainMinimumElevation: minimumElevation,
    terrainTransitions: compiled.transitions,
    terrainPlaneBlocked: compiledMapTerrainPlaneCollisionBytes(compiled),
    horseJumpableTerrain,
    obstacles: authoredMapCollisionObstacles(document, 'ground', registry),
  };
  const water: CollisionMap = {
    ...(traversalChannels === undefined ? {} : { traversalChannels }),
    width: compiled.width,
    height: compiled.height,
    blocked: cellFlagsWhere(length, (index) => compiled.surfaces[index] !== 'water'),
    horseJumpableTerrain: new Uint8Array(length),
    obstacles: authoredMapCollisionObstacles(document, 'water', registry),
  };
  const generatedSuppressions = new Set(document.generatedSuppressions);
  const suppressedDecorationObstacleKeys = {
    ground: suppressedGeneratedDecorationObstacleKeys(
      document, generatedSuppressions, 'ground', landmarks, registry,
    ),
    water: suppressedGeneratedDecorationObstacleKeys(
      document, generatedSuppressions, 'water', landmarks, registry,
    ),
  } as const;
  liveIslandRuntimeCache = {
    combatPolicy: new CombatRegionPolicy(document.combatRegions ?? []),
    combatRegions: document.combatRegions,
    key,
    document,
    ground,
    water,
    generatedSuppressions,
    suppressedDecorationObstacleKeys,
    staticView: documentStaticView(document),
    generatedResources: () => generatedSurvivalResources(registry),
    // The composition base (the precomputed island collision) carries the static base group here.
    baseObstacles: { ground: [], water: [] },
  };
  return liveIslandRuntimeCache;
}

/** The generator's topside resources for this registry (what the published `authority.resource` records hold). */
export function generatedSurvivalResources(registry: ContentRegistry): readonly GeneratedSurvivalResource[] {
  return generateSurvivalResources(SURVIVAL_WORLD_SEED, registry);
}


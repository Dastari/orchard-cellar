import {
  SURVIVAL_BIOMES,
  SURVIVAL_WORLD_SEED,
  compileMapDocument,
  compiledMapTerrainPlaneCollisionBytes,
  mapDocumentUsesSurvivalIslandBase,
  mapCellKey,
  survivalBiomeAllowsHorseJump,
  survivalBiomeAt,
  survivalDirtCliffRoleBytes,
  survivalDirtTerraceBytes,
  terrainCliffTileSet,
  terrainTransitionCapability,
  type CompiledMapDocument,
  type MapDocumentV2,
  type MapDocumentV3,
  type MapSurfaceKind,
  type RuntimeTilesetResolver,
  type TerrainTransitionCapability,
  type TerrainTransitionDirection,
  type TerrainTransitionKind,
} from '@orchard/sim';
import type { TerrainArray } from './terrain.js';

const EDITOR_SPACE_ID = 4_200_001;

export interface EditorTerrainArrayOptions {
  /** Collision-plane expansion is required by gameplay authority, but the
   * visual editor renderer consumes elevations and semantic layers only. */
  readonly includeTerrainPlaneCollision?: boolean;
}

export function authoredTransitionArtRefusal(
  request: Readonly<{
    kind: TerrainTransitionKind;
    direction: TerrainTransitionDirection | null;
    familyId: string;
    width?: number;
    tilesets?: RuntimeTilesetResolver;
  }>,
): TerrainTransitionCapability | null {
  if (request.direction === null) return null;
  const capability = terrainTransitionCapability({
    kind: request.kind,
    direction: request.direction,
    familyId: request.familyId,
    ...(request.width === undefined ? {} : { width: request.width }),
    ...(request.tilesets === undefined ? {} : { tilesets: request.tilesets }),
  });
  return capability.supported ? null : capability;
}

function biomeForSurface(surface: MapSurfaceKind): typeof SURVIVAL_BIOMES[number] {
  if (surface === 'water') return 'freshwater';
  if (surface === 'sand') return 'beach';
  if (surface === 'stone' || surface === 'cave_floor') return 'highland';
  if (surface === 'dirt') return 'dirt_terrace';
  return 'plains';
}

export function terrainArrayForMapDocument(
  document: MapDocumentV2,
  compiled: CompiledMapDocument = compileMapDocument(document),
  semanticDocument?: MapDocumentV3,
  options: EditorTerrainArrayOptions = {},
): TerrainArray {
  const length = compiled.width * compiled.height;
  const biomes = new Uint8Array(length);
  const elevations = new Int16Array(compiled.elevations);
  const generatedIsland = mapDocumentUsesSurvivalIslandBase(document);
  const seed = document.provenance.generatorSeed ?? SURVIVAL_WORLD_SEED;
  const dirtTerraces = generatedIsland
    ? survivalDirtTerraceBytes(seed).slice()
    : new Uint8Array(length);
  const dirtCliffRoles = generatedIsland
    ? survivalDirtCliffRoleBytes(seed).slice()
    : new Uint8Array(length);
  let authoredFarmland: Uint8Array | undefined;
  const horseJumpableTerrain = Array<boolean>(length).fill(false);
  const defaultTileSet = compiled.tilesets?.tileSetFor(compiled.defaultCliffFamily)
    ?? terrainCliffTileSet(compiled.defaultCliffFamily);
  for (let index = 0; index < length; index += 1) {
    const tileX = index % compiled.width;
    const tileY = Math.floor(index / compiled.width);
    const cell = document.cells[mapCellKey(tileX, tileY)];
    const semanticCell = semanticDocument?.cells[mapCellKey(tileX, tileY)];
    const surface = compiled.features[index] === 'river' ? 'water'
      : compiled.features[index] === 'path' ? 'dirt'
        : compiled.surfaces[index] ?? 'grass';
    const hasAuthoredSurface = cell?.surface !== undefined || cell?.feature !== undefined;
    const biome = semanticCell?.biome
      ?? (hasAuthoredSurface
        ? biomeForSurface(surface)
        : generatedIsland
          ? survivalBiomeAt(seed, tileX, tileY)
          : semanticDocument?.baseBiome ?? biomeForSurface(surface));
    biomes[index] = Math.max(0, SURVIVAL_BIOMES.indexOf(biome));
    horseJumpableTerrain[index] = survivalBiomeAllowsHorseJump(biome);
    if (surface === 'dirt') dirtTerraces[index] = 1;
    if (compiled.features[index] === 'farmland') {
      authoredFarmland ??= new Uint8Array(length);
      authoredFarmland[index] = 1;
    }
  }
  return {
    spaceId: EDITOR_SPACE_ID,
    seed,
    version: document.revision,
    width: compiled.width,
    height: compiled.height,
    generator: generatedIsland ? 'island' : 'debug_flat',
    biomes,
    blocked: compiled.blocked,
    horseJumpableTerrain,
    elevations,
    defaultCliffFamily: compiled.defaultCliffFamily,
    cliffFamilyIds: compiled.cliffFamilyIds,
    ...(compiled.tilesets === undefined ? {} : { tilesets: compiled.tilesets }),
    defaultSurfaceFamily: document.defaultSurfaceFamily ?? 'grass_1',
    projectionStyle: defaultTileSet?.projectionStyle ?? 'raised',
    baseDatum: defaultTileSet?.baseDatum ?? 0,
    ...(defaultTileSet?.fixedPlane === undefined
      ? {}
      : { fixedTerrainPlane: defaultTileSet.fixedPlane }),
    cliffFamilies: compiled.cliffFamilies,
    surfaceFamilies: compiled.surfaceFamilies,
    terrainOverrides: compiled.terrainOverrides,
    ...(authoredFarmland === undefined ? {} : { authoredFarmland }),
    ledges: compiled.ledges,
    terrainTransitions: compiled.transitions,
    ...(options.includeTerrainPlaneCollision === false
      ? {}
      : { terrainPlaneBlocked: compiledMapTerrainPlaneCollisionBytes(compiled) }),
    raisedTerrainCollisionClassified: true,
    dirtCliffRoles,
    dirtTerraces,
  };
}

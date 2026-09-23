import { farmlandRuleLayers, type ResolvedRuleFrame } from '@orchard/sim';
import {parseHearthArchitectureState,persistedHearthArchitectureCollision} from '@orchard/sim';
import {hearthInteriorCollision,bootstrapContentRegistry} from '@orchard/sim';
import {
  FIXED_UNITS_PER_PIXEL,
  PLAYER_HITBOX_FOOT_OFFSET,
  SURVIVAL_BIOMES,
  SURVIVAL_DIRT_CLIFF_ROLES,
  SURVIVAL_RAISED_CLIFF_TILE_SET,
  CAVE_RAISED_CLIFF_TILE_SET,
  SURVIVAL_WORLD_SIZE,
  TOPSIDE_SPACE_ID,
  homesteadBiomeAt,
  homesteadPlayableTile,
  residencePlayableTile,
  cellarPlayableTile,
  starterCellarTerrainTransitions,
  generateRogueRoomLayout,
  generateHearthLobbyLayout,
  runtimeHearthLobbyDefinition,
  caveTerrainPlaneCollisionBytes,
  cellarExcavationFootprint,
  terrainPlaneCollisionBytesForElevationGrid,
  resolveRaisedTerrainTile,
  resolveRaisedTerrainContoursAt,
  raisedTerrainProjectionRowsPerLevel,
  maximumTerrainElevation,
  minimumTerrainElevation,
  terrainProjectedDepthOffset,
  terrainTransitionLaneAt,
  terrainElevationAt as sampleTerrainElevation,
  terrainWalkingStepAllowed,
  cliffFamilyAtIndex,
  terrainCliffTileSet,
  survivalElevationBytes,
  survivalTerrainTransitions,
  survivalBiomeAllowsHorseJump,
  survivalTerrainBlocksTraversalAt,
  survivalDirtCliffRoleBytes,
  survivalDirtTerraceBytes,
  survivalTerrainBytes,
  type RaisedTerrainGrid,
  type RaisedTerrainTileSet,
  type RaisedTerrainRampRole,
  type RaisedTerrainTilePlan,
  type RaisedTerrainContourPlan,
  type SurvivalBiome,
  type SpaceDefinition,
  type TerrainTransition,
  type TerrainOverride,
  type RuntimeTilesetResolver,
  type TerrainSurfaceFamilyId,
  type ContentRegistry,
} from "@orchard/sim";
import { blob47FrameIndexFor } from "./tilemap.js";

export { SURVIVAL_BIOMES };

export const BIOME_COLORS = [
  "#0095e9",
  "#e4a672",
  "#0789d1",
  "#00b9f2",
  "#3e8948",
  "#3e8948",
  "#3e8948",
  "#3e8948",
  "#3e8948",
  "#3e8948",
  "#e8a261",
  "#e4a672",
  "#8f583c",
  "#7f8b42",
  "#16bed0",
  "#a8a34f",
  "#3e8948",
  "#e4a672",
  "#9c6754",
  "#66535d",
  "#ed632c",
  "#d8b38a",
] as const;

const WATER = 0;
export interface TerrainArray {
  readonly traversalChannels?: import('@orchard/sim').MediumCollisionChannels;
  readonly spaceId: number;
  readonly seed: number;
  readonly version: number;
  readonly width: number;
  readonly height: number;
  readonly generator?: SpaceDefinition["generator"];
  readonly rogueTheme?: string;
  readonly rogueHazards?: Uint8Array;
  readonly rogueRoomRevision?: string;
  readonly hearthLobbyFloorThresholdY?: number;
  /** Authored interior materials: 0 rustic wood, 1 townhouse parquet, 2 stone, 3 planting soil. */
  readonly hearthInteriorFloorStyles?: Uint8Array;
  readonly defaultCliffFamily?: string;
  /** Space-wide projection contract. Per-cell cliff families select artwork;
   * they must not change the map's datum, projection, or collision plane. */
  readonly projectionStyle?: RaisedTerrainTileSet["projectionStyle"];
  readonly baseDatum?: number;
  /** `null` explicitly opts out of a family default fixed plane. */
  readonly fixedTerrainPlane?: number | null;
  /** Optional per-cell family ordinals into `cliffFamilyIds`. Legacy terrain
   * without a palette continues to use TERRAIN_CLIFF_FAMILY_IDS. */
  readonly cliffFamilies?: Uint8Array;
  readonly cliffFamilyIds?: readonly string[];
  /** Active authored family resolver retained by live/editor map compilation. */
  readonly tilesets?: RuntimeTilesetResolver;
  readonly defaultSurfaceFamily?: TerrainSurfaceFamilyId;
  /** Optional per-cell surface-family ordinals; zero inherits the default. */
  readonly surfaceFamilies?: Uint8Array;
  /** Sparse authoritative final substitutions from MapDocumentV2. */
  readonly terrainOverrides?: readonly (TerrainOverride | null)[];
  /** Sparse authored cell part stacks (doc 61 §2.2), keyed by
   * `tileY * width + tileX`. Only non-contour exact parts are read here;
   * contour parts arrive through `terrainOverrides`. Absent on pre-parts maps. */
  readonly cellParts?: ReadonlyMap<number, readonly import('@orchard/sim').CellPart[]>;
  /** Visual-only authored farmland from MapDocument features. This dry mask is
   * deliberately separate from authority-backed world soil and crop state. */
  readonly authoredFarmland?: Uint8Array;
  /** Compiled authored substrate, retained for per-cell interior floor rendering. */
  readonly authoredSurfaces?: readonly import('@orchard/sim').MapSurfaceKind[];
  /** Per-cell zero-height ledge/lip mask. */
  readonly ledges?: Uint8Array;
  readonly biomes: Uint8Array;
  readonly blocked: readonly boolean[];
  readonly residenceEnvelopeBlocked?: readonly boolean[];
  readonly residenceArchitecture?: readonly import('@orchard/sim').HearthArchitectureCell[];
  readonly horseJumpableTerrain: readonly boolean[];
  /** Integer logical terrain height. This is the editor/generator source of
   * truth; every raised contour is derived independently from it. */
  readonly elevations: Int16Array;
  /** Present on v2/generated/editor terrain. Omission preserves the legacy
   * island's collision-authored ramps; an empty list means no crossings. */
  readonly terrainTransitions?: readonly TerrainTransition[];
  /** Elevation-owned wall geometry. Cellars rebuild this sparse mask whenever
   * excavation changes so prediction and the terrain inspector agree. */
  readonly terrainPlaneBlocked?: Uint8Array;
  /** True when `blocked`/biomes already include every nested contour plan. */
  readonly raisedTerrainCollisionClassified?: true;
  readonly dirtCliffRoles: Uint8Array;
  readonly dirtTerraces: Uint8Array;
}

export interface CellarExcavationTile {
  readonly tileX: number;
  readonly tileY: number;
}

/** Applies the sparse server-owned excavation overlay without mutating the
 * cached generator terrain. The revision participates in ground-cache keys so
 * cave contour tiles rebuild immediately after a wall opens. */
export function terrainWithCellarExcavations(
  terrain: TerrainArray,
  excavations: Iterable<CellarExcavationTile>,
  revision: number,
): TerrainArray {
  if (terrain.generator !== 'cellar') return terrain;
  const blocked = terrain.blocked.slice();
  const elevations = terrain.elevations.slice();
  for (const tile of excavations) {
    for (const cell of cellarExcavationFootprint(
      tile.tileX,
      tile.tileY,
      terrain.width,
      terrain.height,
    )) {
      const index = cell.tileY * terrain.width + cell.tileX;
      blocked[index] = false;
      elevations[index] = 0;
    }
  }
  return {
    ...terrain,
    version: terrain.version * 1_000_003 + Math.max(0, Math.trunc(revision)),
    blocked,
    elevations,
    terrainPlaneBlocked: caveTerrainPlaneCollisionBytes(
      elevations,
      terrain.width,
      terrain.height,
    ),
  };
}

const terrainCache = new Map<string, TerrainArray>();
const terrainClassificationCache = new Map<
  string,
  Omit<TerrainArray, "seed" | "version">
>();
const SPACE_GENERATOR_REVISION: Readonly<
  Record<NonNullable<TerrainArray["generator"]>, number>
> = {
  island: 1,
  mine: 1,
  homestead: 1,
  residence: 1,
  marlow_tent: 1,
  cellar: 4,
  delve_lobby: 1,
  village_interior: 1,
  roguelike: 2,
  debug_flat: 1,
};

export function terrainForWorld(seed: number, version: number): TerrainArray {
  return terrainForSpace(
    {
      spaceId: TOPSIDE_SPACE_ID,
      name: "island",
      sizeTiles: SURVIVAL_WORLD_SIZE,
      generator: "island",
      environment: "outdoor",
      ambient: "clock",
      weather: true,
      audioBed: "estate",
    },
    seed,
    version,
  );
}

export function terrainForSpace(
  space: SpaceDefinition,
  seed: number,
  version: number,
  registry?:ContentRegistry,
): TerrainArray {
  const generatorRevision = SPACE_GENERATOR_REVISION[space.generator];
  const rogueKey = space.rogueRoom === undefined ? ''
    : `${space.rogueRoom.seed}:${space.rogueRoom.roomNumber}:${space.rogueRoom.roomKind}:${space.rogueRoom.theme}`;
  const contentKey=registry?.contentHash??'bootstrap';
  const terrainKey = `${contentKey}:${space.spaceId}:${space.generator}:${space.sizeTiles}:${generatorRevision}:${seed}:${version}:${rogueKey}:${space.residenceExpansionRank??0}:${space.residenceArchitectureJson??''}`;
  const cachedTerrain = terrainCache.get(terrainKey);
  if (cachedTerrain !== undefined) return cachedTerrain;
  const classificationKey = `${contentKey}:${space.spaceId}:${space.generator}:${space.sizeTiles}:${generatorRevision}:${seed}:${rogueKey}:${space.residenceExpansionRank??0}:${space.residenceArchitectureJson??''}`;
  if (space.generator === 'residence' && space.residenceArchitectureJson !== undefined) {
    const prefix=`${contentKey}:${space.spaceId}:residence:`;
    for (const cache of [terrainCache,terrainClassificationCache]) {
      const keys=[...cache.keys()].filter(key=>key.startsWith(prefix));
      while(keys.length>=4)cache.delete(keys.shift()!);
    }
  }
  let classification = terrainClassificationCache.get(classificationKey);
  if (!classification) {
    if (space.generator === "island") {
      const biomes = survivalTerrainBytes(seed);
      const elevations = Int16Array.from(survivalElevationBytes(seed));
      classification = {
        spaceId: space.spaceId,
        generator: space.generator,
        defaultCliffFamily: 'stone_1',
        projectionStyle: 'raised',
        baseDatum: 0,
        width: SURVIVAL_WORLD_SIZE,
        height: SURVIVAL_WORLD_SIZE,
        biomes,
        blocked: Array.from(biomes, (_biome, index) =>
          survivalTerrainBlocksTraversalAt(
            seed,
            index % SURVIVAL_WORLD_SIZE,
            Math.floor(index / SURVIVAL_WORLD_SIZE),
            "ground",
          ),
        ),
        horseJumpableTerrain: Array.from(biomes, (biome) =>
          survivalBiomeAllowsHorseJump(SURVIVAL_BIOMES[biome] ?? "water"),
        ),
        elevations,
        terrainTransitions: survivalTerrainTransitions(seed),
        raisedTerrainCollisionClassified: true,
        dirtCliffRoles: survivalDirtCliffRoleBytes(seed),
        dirtTerraces: survivalDirtTerraceBytes(seed),
      };
    } else if (space.generator === 'village_interior') {
      const collision=registry===undefined?hearthInteriorCollision(space.spaceId)
        :hearthInteriorCollision(registry,space.spaceId);
      if(collision===null){
        const length=space.sizeTiles*space.sizeTiles;
        return {spaceId:space.spaceId,seed,version,width:space.sizeTiles,height:space.sizeTiles,
          generator:space.generator,biomes:new Uint8Array(length),blocked:Array<boolean>(length).fill(true),
          horseJumpableTerrain:Array<boolean>(length).fill(false),elevations:new Int16Array(length),
          dirtCliffRoles:new Uint8Array(length),dirtTerraces:new Uint8Array(length)};
      }
      const layout={width:collision.width,height:collision.height,blocked:collision.blocked};
      const authored = [...(registry ?? bootstrapContentRegistry()).spaces.values()]
        .find(candidate => candidate.retired !== true && candidate.spaceId === space.spaceId);
      const hearthInteriorFloorStyles = new Uint8Array(layout.width * layout.height);
      for (const {bounds: [left, top, right, bottom], style} of authored?.hearthInteriorFloors ?? [])
        for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
          const index = y * layout.width + x;
          if (!layout.blocked[index]) hearthInteriorFloorStyles[index] = style === 'townhouse' ? 1 : style === 'stone' ? 2 : 3;
        }

      const length=layout.width*layout.height;
      classification={...layout,hearthInteriorFloorStyles,spaceId:space.spaceId,generator:space.generator,
        defaultCliffFamily:'stone_1',projectionStyle:'raised',baseDatum:0,
        biomes:new Uint8Array(length).fill(Math.max(0,SURVIVAL_BIOMES.indexOf('plains'))),
        horseJumpableTerrain:Array<boolean>(length).fill(false),elevations:new Int16Array(length),
        dirtCliffRoles:new Uint8Array(length),dirtTerraces:new Uint8Array(length)};
    } else if (space.generator === 'delve_lobby') {
      const lobby=registry===undefined?undefined:runtimeHearthLobbyDefinition(registry,space.spaceId);
      const layout = registry===undefined?generateHearthLobbyLayout()
        : generateHearthLobbyLayout(registry,space.spaceId);
      if(layout===null){
        const length=space.sizeTiles*space.sizeTiles;
        return {spaceId:space.spaceId,seed,version,width:space.sizeTiles,height:space.sizeTiles,
          generator:space.generator,biomes:new Uint8Array(length),blocked:Array<boolean>(length).fill(true),
          horseJumpableTerrain:Array<boolean>(length).fill(false),elevations:new Int16Array(length),
          dirtCliffRoles:new Uint8Array(length),dirtTerraces:new Uint8Array(length)};
      }
      const length = layout.width * layout.height;
      classification = {
        ...layout, spaceId: space.spaceId, generator: space.generator,
        defaultCliffFamily: 'dungeon_1', projectionStyle: 'interior', baseDatum: 0,
        fixedTerrainPlane: 0, rogueTheme: 'dungeon',
        ...(lobby==null?{}:{hearthLobbyFloorThresholdY:lobby.floorThresholdY}),
        biomes: new Uint8Array(length).fill(Math.max(0, SURVIVAL_BIOMES.indexOf('plains'))),
        horseJumpableTerrain: Array<boolean>(length).fill(false), terrainTransitions: [],
        dirtCliffRoles: new Uint8Array(length), dirtTerraces: new Uint8Array(length),
      };
    } else if (space.generator === 'roguelike' && space.rogueRoom !== undefined) {
      const layout = generateRogueRoomLayout(
        space.rogueRoom.seed,
        space.rogueRoom.roomNumber,
        space.rogueRoom.roomKind as Parameters<typeof generateRogueRoomLayout>[2],
      );
      const length = layout.width * layout.height;
      const hazards = new Uint8Array(length);
      for (const hazard of layout.hazards) hazards[hazard.tileY * layout.width + hazard.tileX] = 1;
      const defaultCliffFamily = space.rogueRoom.theme === 'volcanic'
        ? 'volcanic_interior'
        : space.rogueRoom.theme === 'dungeon' ? 'dungeon_1' : 'cave';
      const elevations = layout.elevations.slice();
      classification = {
        spaceId: space.spaceId,
        generator: space.generator,
        defaultCliffFamily,
        projectionStyle: 'interior',
        baseDatum: 0,
        fixedTerrainPlane: null,
        rogueTheme: space.rogueRoom.theme,
        rogueHazards: hazards,
        rogueRoomRevision: rogueKey,
        width: layout.width,
        height: layout.height,
        biomes: new Uint8Array(length).fill(Math.max(0, SURVIVAL_BIOMES.indexOf('plains'))),
        blocked: [...layout.blocked],
        horseJumpableTerrain: Array<boolean>(length).fill(false),
        elevations,
        terrainTransitions: layout.terrainTransitions,
        terrainPlaneBlocked: terrainPlaneCollisionBytesForElevationGrid(
          layout.width,
          layout.height,
          elevations,
          layout.terrainTransitions,
          defaultCliffFamily,
          {baseDatum: 0},
        ),
        dirtCliffRoles: new Uint8Array(length),
        dirtTerraces: new Uint8Array(length),
      };
    } else {
      const length = space.sizeTiles * space.sizeTiles;
      const elevations = new Int16Array(length);
      const plains = Math.max(0, SURVIVAL_BIOMES.indexOf("plains"));
      const biomes = new Uint8Array(length).fill(plains);
      if (
        space.generator === "homestead" &&
        space.homesteadSite !== undefined
      ) {
        for (let index = 0; index < length; index += 1) {
          const biome = homesteadBiomeAt(
            seed,
            space.homesteadSite,
            index % space.sizeTiles,
            Math.floor(index / space.sizeTiles),
            space.sizeTiles,
          );
          biomes[index] = Math.max(0, SURVIVAL_BIOMES.indexOf(biome));
        }
      }
      let blocked = Array.from({ length }, (_, index) => {
        const x = index % space.sizeTiles;
        const y = Math.floor(index / space.sizeTiles);
        return space.generator === "homestead"
          ? !homesteadPlayableTile(x, y, space.sizeTiles)
          : space.generator === "residence" || space.generator === "marlow_tent"
            ? !residencePlayableTile(x, y,space.generator==='residence'?space.residenceExpansionRank:0)
            : space.generator === "cellar"
              ? !cellarPlayableTile(x, y)
              : x === 0 ||
                y === 0 ||
                x === space.sizeTiles - 1 ||
                y === space.sizeTiles - 1;
      });
      const residenceEnvelopeBlocked=space.generator==='residence'?blocked:undefined;
      if(space.generator==='residence')blocked=[...persistedHearthArchitectureCollision(space.residenceExpansionRank??0,
        {width:space.sizeTiles,height:space.sizeTiles,blocked},space.residenceArchitectureJson).blocked];
      if (space.generator === "cellar") {
        for (let index = 0; index < length; index += 1)
          elevations[index] = blocked[index] ? 1 : 0;
      }
      classification = {
        spaceId: space.spaceId,
        generator: space.generator,
        defaultCliffFamily: space.generator === 'cellar' ? 'cave' : 'stone_1',
        projectionStyle: space.generator === 'cellar' ? 'interior' : 'raised',
        baseDatum: 0,
        ...(space.generator === 'cellar' ? { fixedTerrainPlane: 0 } : {}),
        width: space.sizeTiles,
        height: space.sizeTiles,
        biomes,
        blocked,
        ...(residenceEnvelopeBlocked===undefined?{}:{residenceEnvelopeBlocked,
          residenceArchitecture:space.residenceArchitectureJson===undefined?[]:parseHearthArchitectureState(space.residenceArchitectureJson)?.cells??[]}),
        horseJumpableTerrain: Array<boolean>(length).fill(false),
        elevations,
        ...(space.generator === "cellar"
          ? {
              terrainTransitions: starterCellarTerrainTransitions(),
              terrainPlaneBlocked: caveTerrainPlaneCollisionBytes(
                elevations,
                space.sizeTiles,
                space.sizeTiles,
              ),
            }
          : {}),
        dirtCliffRoles: new Uint8Array(length),
        dirtTerraces: new Uint8Array(length),
      };
    }
    terrainClassificationCache.set(classificationKey, classification);
  }
  const terrain = {
    seed,
    version,
    ...classification,
  };
  terrainCache.set(terrainKey, terrain);
  return terrain;
}

export function terrainBiomeAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): SurvivalBiome {
  if (
    tileX < 0 ||
    tileY < 0 ||
    tileX >= terrain.width ||
    tileY >= terrain.height
  )
    return "water";
  return (
    SURVIVAL_BIOMES[terrain.biomes[tileY * terrain.width + tileX] ?? WATER] ??
    "water"
  );
}

export function terrainColorAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): string {
  const biome =
    tileX < 0 || tileY < 0 || tileX >= terrain.width || tileY >= terrain.height
      ? WATER
      : (terrain.biomes[tileY * terrain.width + tileX] ?? WATER);
  return BIOME_COLORS[biome] ?? BIOME_COLORS[WATER];
}

function edgeFrameIndex(
  north: boolean,
  east: boolean,
  south: boolean,
  west: boolean,
): number {
  if (north && west) return 0;
  if (north && east) return 2;
  if (south && west) return 6;
  if (south && east) return 8;
  if (north) return 1;
  if (west) return 3;
  if (east) return 5;
  if (south) return 7;
  return 4;
}

function oceanWaterBiome(biome: SurvivalBiome): boolean {
  return biome === "water";
}

function freshwaterBiome(biome: SurvivalBiome): boolean {
  return biome === "freshwater" || biome === "waterfall" || biome === "water";
}

export function beachFrameIndexAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): number {
  const water = (offsetX: number, offsetY: number): boolean =>
    oceanWaterBiome(terrainBiomeAt(terrain, tileX + offsetX, tileY + offsetY));
  const north = water(0, -1);
  const east = water(1, 0);
  const south = water(0, 1);
  const west = water(-1, 0);
  return edgeFrameIndex(north, east, south, west);
}

function vegetatedBiome(biome: SurvivalBiome): boolean {
  return (
    biome === "plains" ||
    biome === "meadow" ||
    biome === "forest" ||
    biome === "valley" ||
    biome === "highland" ||
    biome === "oasis" ||
    biome === "savanna"
  );
}

function darkGrassBiome(biome: SurvivalBiome): boolean {
  return (
    biome === "plains" ||
    biome === "meadow" ||
    biome === "forest" ||
    biome === "valley" ||
    biome === "highland"
  );
}

function desertGroundBiome(biome: SurvivalBiome): boolean {
  return (
    biome === "desert" || biome === "desert_shore" || biome === "desert_ridge"
  );
}

/** The authored 47-frame fringe is drawn on sandy cells, but ocean counts as
 * part of the mask so the grass fringe is emitted only along landward edges. */
export function grassSandTransitionFrameIndexAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): number | null {
  if (terrainBiomeAt(terrain, tileX, tileY) !== "beach") return null;
  const frame = blob47FrameIndexFor(
    (offsetX, offsetY) =>
      !vegetatedBiome(
        terrainBiomeAt(terrain, tileX + offsetX, tileY + offsetY),
      ),
  );
  return frame === 46 ? null : frame;
}

/** Paving uses the same native grass fringe, including diagonal inside corners.
 * Water/bridge decks count as continuous pavement so quay ends stay unobstructed. */
export function pavingGrassTransitionFrameIndexAt(terrain: TerrainArray,tileX:number,tileY:number):number|null {
  if(terrainBiomeAt(terrain,tileX,tileY)!=='paving')return null;
  const frame=blob47FrameIndexFor((dx,dy)=>!vegetatedBiome(terrainBiomeAt(terrain,tileX+dx,tileY+dy)));
  return frame===46?null:frame;
}

/** Savanna is the ecological buffer between humid grass and bare desert. Its
 * licensed olive fill receives a dark-grass blob fringe on only the humid side. */
export function savannaGrassTransitionFrameIndexAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): number | null {
  if (terrainBiomeAt(terrain, tileX, tileY) !== "savanna") return null;
  const frame = blob47FrameIndexFor(
    (offsetX, offsetY) =>
      !darkGrassBiome(
        terrainBiomeAt(terrain, tileX + offsetX, tileY + offsetY),
      ),
  );
  return frame === 46 ? null : frame;
}

/** The desert pack supplies its own olive grass fringe as a 3x3 edge set. */
export function desertGrassEdgeFrameIndexAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): number | null {
  if (!desertGroundBiome(terrainBiomeAt(terrain, tileX, tileY))) return null;
  const grass = (offsetX: number, offsetY: number): boolean =>
    vegetatedBiome(terrainBiomeAt(terrain, tileX + offsetX, tileY + offsetY));
  return edgeFrameIndex(grass(0, -1), grass(1, 0), grass(0, 1), grass(-1, 0));
}

export function desertGrassInsetFrameIndicesAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): readonly number[] {
  if (!desertGroundBiome(terrainBiomeAt(terrain, tileX, tileY))) return [];
  const grass = (offsetX: number, offsetY: number): boolean =>
    vegetatedBiome(terrainBiomeAt(terrain, tileX + offsetX, tileY + offsetY));
  const north = grass(0, -1);
  const east = grass(1, 0);
  const south = grass(0, 1);
  const west = grass(-1, 0);
  const frames: number[] = [];
  if (!south && !east && grass(1, 1)) frames.push(0);
  if (!south && !west && grass(-1, 1)) frames.push(1);
  if (!north && !east && grass(1, -1)) frames.push(2);
  if (!north && !west && grass(-1, -1)) frames.push(3);
  return frames;
}

/** The shoreline sheets place their four inward corners in a 2x2 block after
 * the outer 3x3 tiles: SE, SW, NE, NW. They are needed when only a diagonal
 * neighbour is water, as happens at the inside of a cove. */
export function shorelineInsetFrameIndicesAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): readonly number[] {
  const biome = terrainBiomeAt(terrain, tileX, tileY);
  if (biome !== "beach" && biome !== "desert_shore") return [];
  const water = (offsetX: number, offsetY: number): boolean => {
    const neighbor = terrainBiomeAt(terrain, tileX + offsetX, tileY + offsetY);
    return biome === "beach"
      ? neighbor === "water"
      : neighbor === "water" || neighbor === "oasis_water";
  };
  const north = water(0, -1);
  const east = water(1, 0);
  const south = water(0, 1);
  const west = water(-1, 0);
  const frames: number[] = [];
  if (!south && !east && water(1, 1)) frames.push(0);
  if (!south && !west && water(-1, 1)) frames.push(1);
  if (!north && !east && water(1, -1)) frames.push(2);
  if (!north && !west && water(-1, -1)) frames.push(3);
  return frames;
}

/** Grass-edged freshwater frames are selected from the water tile itself, so
 * exposed sides are the neighboring non-water sides rather than adjacent water. */
export function freshwaterFrameIndexAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): number {
  const land = (offsetX: number, offsetY: number): boolean =>
    !freshwaterBiome(terrainBiomeAt(terrain, tileX + offsetX, tileY + offsetY));
  return edgeFrameIndex(land(0, -1), land(1, 0), land(0, 1), land(-1, 0));
}

/** Water Tile 1 supplies four inverse banks as full frames. Rendering only
 * one loses the opposite corner of a two-tile diagonal river, producing the
 * square blue protrusions visible at every bend. The runtime uses water-keyed
 * transparent extracts of those frames, so every valid diagonal can compose
 * over the cardinal base. Frame order is SE, SW, NE, NW. */
export function freshwaterInsetFrameIndicesAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): readonly number[] {
  if (terrainBiomeAt(terrain, tileX, tileY) !== "freshwater") return [];
  const land = (offsetX: number, offsetY: number): boolean =>
    !freshwaterBiome(terrainBiomeAt(terrain, tileX + offsetX, tileY + offsetY));
  const north = land(0, -1);
  const east = land(1, 0);
  const south = land(0, 1);
  const west = land(-1, 0);
  const frames: number[] = [];
  if (!south && !east && land(1, 1)) frames.push(0);
  if (!south && !west && land(-1, 1)) frames.push(1);
  if (!north && !east && land(1, -1)) frames.push(2);
  if (!north && !west && land(-1, -1)) frames.push(3);
  return frames;
}

function waterDecorationGroup(biome: SurvivalBiome): number {
  if (biome === "water") return 1;
  if (biome === "freshwater" || biome === "waterfall") return 2;
  if (biome === "oasis_water") return 3;
  return 0;
}

/** Water details only occupy uninterrupted interior water, never a bank frame. */
export function waterDecorationAllowedAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): boolean {
  const group = waterDecorationGroup(terrainBiomeAt(terrain, tileX, tileY));
  if (group === 0 || terrainBiomeAt(terrain, tileX, tileY) === "waterfall")
    return false;
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      if (offsetX === 0 && offsetY === 0) continue;
      if (
        waterDecorationGroup(
          terrainBiomeAt(terrain, tileX + offsetX, tileY + offsetY),
        ) !== group
      )
        return false;
    }
  }
  return true;
}

export function terrainDecorationHash(tileX: number, tileY: number): number {
  return (Math.imul(tileX, 73_856_093) ^ Math.imul(tileY, 19_349_663)) >>> 0;
}

export function grassTuftAllowedAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): boolean {
  // Biomes are deliberately reused as inexpensive substrate data by indoor
  // generators. They must not inherit outdoor ambient decoration merely
  // because their backing tile happens to be classified as plains.
  if (
    terrain.generator !== "island" &&
    terrain.generator !== "homestead" &&
    terrain.generator !== "debug_flat"
  )
    return false;
  const biome = terrainBiomeAt(terrain, tileX, tileY);
  if (biome !== "plains" && biome !== "meadow" && biome !== "forest")
    return false;
  return (
    terrainDecorationHash(tileX, tileY) % (biome === "meadow" ? 9 : 23) === 0
  );
}

export function animatedWaterRockAllowedAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): boolean {
  const biome = terrainBiomeAt(terrain, tileX, tileY);
  const hash = terrainDecorationHash(tileX, tileY);
  return (
    (biome === "freshwater" || biome === "oasis_water") &&
    waterDecorationAllowedAt(terrain, tileX, tileY) &&
    hash % 113 === 0 &&
    hash % 13 !== 0
  );
}

export function waterfallTopLeftAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): boolean {
  return (
    terrainBiomeAt(terrain, tileX, tileY) === "waterfall" &&
    terrainBiomeAt(terrain, tileX - 1, tileY) !== "waterfall" &&
    terrainBiomeAt(terrain, tileX, tileY - 1) !== "waterfall"
  );
}

/** Raised waterfalls are composed in the depth queue rather than baked into
 * the ground cache. Test a complete local fall neighbourhood so every member
 * cell makes the same decision, not only its north-west anchor. */
export function waterfallUsesRaisedCompositionAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): boolean {
  if (terrainBiomeAt(terrain, tileX, tileY) !== "waterfall") return false;
  let minimumElevation = Number.POSITIVE_INFINITY;
  let maximumElevation = Number.NEGATIVE_INFINITY;
  for (let offsetY = -4; offsetY <= 4; offsetY += 1) {
    for (let offsetX = -4; offsetX <= 4; offsetX += 1) {
      if (terrainBiomeAt(terrain, tileX + offsetX, tileY + offsetY) !== "waterfall")
        continue;
      const elevation = terrainElevationAt(
        terrain,
        tileX + offsetX,
        tileY + offsetY,
      );
      minimumElevation = Math.min(minimumElevation, elevation);
      maximumElevation = Math.max(maximumElevation, elevation);
    }
  }
  return maximumElevation > minimumElevation;
}

export function desertShoreFrameIndexAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): number {
  const water = (offsetX: number, offsetY: number): boolean => {
    const biome = terrainBiomeAt(terrain, tileX + offsetX, tileY + offsetY);
    return biome === "water" || biome === "oasis_water";
  };
  return edgeFrameIndex(water(0, -1), water(1, 0), water(0, 1), water(-1, 0));
}

export function waterfallFrameIndexAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): number | null {
  if (terrainBiomeAt(terrain, tileX, tileY) !== "waterfall") return null;
  const waterfall = (offsetX: number, offsetY: number): boolean =>
    terrainBiomeAt(terrain, tileX + offsetX, tileY + offsetY) === "waterfall";
  const column = !waterfall(-1, 0) ? 0 : !waterfall(1, 0) ? 2 : 1;
  const row = !waterfall(0, -1)
    ? 0
    : !waterfall(0, 1)
      ? 4
      : !waterfall(0, -2)
        ? 1
        : !waterfall(0, 2)
          ? 3
          : 2;
  return row * 3 + column;
}

function plateauAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): boolean {
  return terrainElevationAt(terrain, tileX, tileY) >= 1;
}

export function terrainElevationAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): number {
  const outside = tileX < 0 || tileY < 0
    || tileX >= terrain.width || tileY >= terrain.height;
  // An interior map is a window cut into a continuous solid mass one level
  // above its floor datum. Treating its array boundary as open floor creates a
  // false rectangular cliff. Bounds are checked before any family lookup
  // because this is a hot resolver callback and projection is a space
  // property, not a per-cell art property.
  if (outside && terrainProjectionStyle(terrain) === 'interior') {
    return terrainBaseDatum(terrain) + 1;
  }
  return sampleTerrainElevation(
    terrain.elevations,
    terrain.width,
    terrain.height,
    tileX,
    tileY,
  );
}

export function terrainElevationAtWorldFoot(
  terrain: TerrainArray,
  worldX: number,
  worldFootY: number,
): number {
  const fixedPlane = terrainFixedPlane(terrain);
  if (fixedPlane !== undefined) return fixedPlane;
  return terrainElevationAt(
    terrain,
    Math.floor(worldX / 16),
    Math.floor((worldFootY - 0.001) / 16),
  );
}

/** The avatar authority anchor sits below its physical shoe contact. Terrain
 * presentation must sample the same point as the shared movement solver. */
export function terrainContactWorldYForPlayer(worldAnchorY: number): number {
  return worldAnchorY - (PLAYER_HITBOX_FOOT_OFFSET + 1) / FIXED_UNITS_PER_PIXEL;
}

function dirtCliffRoleAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): (typeof SURVIVAL_DIRT_CLIFF_ROLES)[number] {
  if (
    tileX < 0 ||
    tileY < 0 ||
    tileX >= terrain.width ||
    tileY >= terrain.height
  )
    return "none";
  return (
    SURVIVAL_DIRT_CLIFF_ROLES[
      terrain.dirtCliffRoles[tileY * terrain.width + tileX] ?? 0
    ] ?? "none"
  );
}

function dirtTerraceAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): boolean {
  if (
    tileX < 0 ||
    tileY < 0 ||
    tileX >= terrain.width ||
    tileY >= terrain.height
  )
    return false;
  const biome = terrainBiomeAt(terrain, tileX, tileY);
  return (
    terrain.dirtTerraces[tileY * terrain.width + tileX] === 1 &&
    (biome === "dirt_terrace" || biome === "dirt_ridge")
  );
}

/** Stone Cliff 1 plugs into the generic raised-terrain topology. Other natural
 * wall sheets provide another data object rather than another resolver. */
export const STONE_RAISED_CLIFF_TILE_SET = SURVIVAL_RAISED_CLIFF_TILE_SET;

// Keep the cave tileset visible to renderer consumers while its frame-role
// contract lives beside the shared mountain contract in @orchard/sim.
export { CAVE_RAISED_CLIFF_TILE_SET };

export function terrainCliffFamilyAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): string {
  if (tileX >= 0 && tileY >= 0 && tileX < terrain.width && tileY < terrain.height) {
    const overrideFamily = terrain.terrainOverrides?.[tileY * terrain.width + tileX]?.family;
    if (overrideFamily !== undefined) return overrideFamily;
    const ordinal = terrain.cliffFamilies?.[tileY * terrain.width + tileX];
    if (ordinal !== undefined) {
      const family = terrain.cliffFamilyIds?.[ordinal - 1] ?? cliffFamilyAtIndex(ordinal);
      if (family !== null) return family;
    }
  }
  return terrain.defaultCliffFamily ?? 'stone_1';
}

function planWithTerrainOverride(
  plan: RaisedTerrainTilePlan,
  tileSet: RaisedTerrainTileSet,
  override: TerrainOverride | null | undefined,
  contourLevel: number,
): RaisedTerrainTilePlan {
  if (override === null || override === undefined
    || override.contourLevel !== contourLevel
    || (override.role === undefined && override.frameIndex === undefined)) return plan;
  const frame = override.frameIndex;
  const role = override.role;
  if (role?.startsWith('face.')) {
    const [, rowId, join] = role.split('.');
    const index = plan.faceLayers.findIndex((face) => face.rowId === rowId && face.join === join);
    if (index >= 0 && frame !== undefined) {
      const faceLayers = [...plan.faceLayers];
      faceLayers[index] = { ...faceLayers[index]!, frame };
      return { ...plan, faceLayers };
    }
  }
  if (role !== undefined && role in tileSet.edgeFrames) {
    return { ...plan, edgeRole: role as typeof plan.edgeRole, edgeFrame: frame ?? tileSet.edgeFrames[role as keyof typeof tileSet.edgeFrames] ?? null };
  }
  if (role !== undefined && role in tileSet.insetFrames) {
    const insetRole = role as typeof plan.insetRoles[number];
    const insetFrame = frame ?? tileSet.insetFrames[insetRole];
    return insetFrame === undefined ? plan : { ...plan, insetRoles: [insetRole], insetFrames: [insetFrame] };
  }
  if (role !== undefined && role in tileSet.rampFrames) {
    const rampRole = role as RaisedTerrainRampRole;
    return { ...plan, rampRole, rampFrame: frame ?? tileSet.rampFrames[rampRole] ?? null };
  }
  if (frame === undefined) return plan;
  if (plan.rampFrame !== null) return { ...plan, rampFrame: frame };
  if (plan.insetFrames.length > 0) {
    const insetFrames = [...plan.insetFrames];
    insetFrames[insetFrames.length - 1] = frame;
    return { ...plan, insetFrames };
  }
  if (plan.edgeFrame !== null) return { ...plan, edgeFrame: frame };
  if (plan.faceLayers.length > 0) {
    const faceLayers = [...plan.faceLayers];
    faceLayers[faceLayers.length - 1] = { ...faceLayers[faceLayers.length - 1]!, frame };
    return { ...plan, faceLayers };
  }
  return plan;
}

export function raisedCliffTileSetFor(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): RaisedTerrainTileSet {
  const family = terrainCliffFamilyAt(terrain, tileX, tileY);
  return terrain.tilesets?.tileSetFor(family)
    ?? terrainCliffTileSet(family)
    ?? STONE_RAISED_CLIFF_TILE_SET;
}

function terrainDefaultCliffTileSet(terrain: TerrainArray): RaisedTerrainTileSet {
  const family = terrain.defaultCliffFamily ?? 'stone_1';
  return terrain.tilesets?.tileSetFor(family)
    ?? terrainCliffTileSet(family)
    ?? STONE_RAISED_CLIFF_TILE_SET;
}

export function terrainProjectionStyle(
  terrain: TerrainArray,
): RaisedTerrainTileSet['projectionStyle'] {
  return terrain.projectionStyle ?? terrainDefaultCliffTileSet(terrain).projectionStyle;
}

export function terrainBaseDatum(terrain: TerrainArray): number {
  return terrain.baseDatum ?? terrainDefaultCliffTileSet(terrain).baseDatum ?? 0;
}

export function terrainFixedPlane(terrain: TerrainArray): number | undefined {
  if ('fixedTerrainPlane' in terrain) return terrain.fixedTerrainPlane ?? undefined;
  return terrainDefaultCliffTileSet(terrain).fixedPlane;
}

function plateauRampRoleAt(
  terrain: TerrainArray,
  contourLevel: number,
  tileX: number,
  tileY: number,
): RaisedTerrainRampRole | null {
  const lane = terrainTransitionLaneAt(
    terrain.terrainTransitions ?? [], contourLevel, tileX, tileY,
  );
  if (lane === null) return null;
  return `ramp_${lane.endpoint === 'upper' ? 'top' : 'bottom'}_${lane.position}`;
}

const plateauGridCache = new WeakMap<TerrainArray, RaisedTerrainGrid>();
const maximumElevationCache = new WeakMap<TerrainArray, number>();
const minimumElevationCache = new WeakMap<TerrainArray, number>();
const contourPlanCache = new WeakMap<
  TerrainArray,
  Map<number, readonly RaisedTerrainContourPlan[]>
>();
const transitionsByTileCache = new WeakMap<
  TerrainArray,
  Map<number, readonly TerrainTransition[]>
>();

function plateauGridFor(terrain: TerrainArray): RaisedTerrainGrid {
  let grid = plateauGridCache.get(terrain);
  if (!grid) {
    grid = {
      raisedAt: (tileX, tileY) => plateauAt(terrain, tileX, tileY),
      rampRoleAt: (tileX, tileY) => plateauRampRoleAt(terrain, 1, tileX, tileY),
    };
    plateauGridCache.set(terrain, grid);
  }
  return grid;
}

export function plateauLayerPlanAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): RaisedTerrainTilePlan {
  return resolveRaisedTerrainTile(
    plateauGridFor(terrain),
    raisedCliffTileSetFor(terrain, tileX, tileY),
    "tall",
    tileX,
    tileY,
  );
}

export function plateauLayerPlansAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): readonly RaisedTerrainContourPlan[] {
  let plansByTile = contourPlanCache.get(terrain);
  if (plansByTile === undefined) {
    plansByTile = new Map();
    contourPlanCache.set(terrain, plansByTile);
  }
  const tileKey = tileY * terrain.width + tileX;
  const cached = plansByTile.get(tileKey);
  if (cached !== undefined) return cached;
  const tileSet = raisedCliffTileSetFor(terrain, tileX, tileY);
  const baseDatum = terrainBaseDatum(terrain);
  const maximumElevation = Math.max(terrainMaximumElevation(terrain), baseDatum);
  const override = tileX >= 0 && tileY >= 0 && tileX < terrain.width && tileY < terrain.height
    ? terrain.terrainOverrides?.[tileY * terrain.width + tileX]
    : null;
  const plans = resolveRaisedTerrainContoursAt(
    (x, y) => terrainElevationAt(terrain, x, y),
    maximumElevation,
    tileSet,
    "tall",
    tileX,
    tileY,
    (contourLevel, x, y) => plateauRampRoleAt(terrain, contourLevel, x, y),
    Math.min(terrainMinimumElevation(terrain), baseDatum) + 1,
  );
  const overridden = plans.map(({ contourLevel, plan }) => ({
    contourLevel,
    plan: planWithTerrainOverride(plan, tileSet, override, contourLevel),
  }));
  plansByTile.set(tileKey, overridden);
  return overridden;
}

export function terrainMaximumElevation(terrain: TerrainArray): number {
  let maximumElevation = maximumElevationCache.get(terrain);
  if (maximumElevation === undefined) {
    maximumElevation = maximumTerrainElevation(terrain.elevations);
    maximumElevationCache.set(terrain, maximumElevation);
  }
  return maximumElevation;
}

export function terrainMinimumElevation(terrain: TerrainArray): number {
  let minimumElevation = minimumElevationCache.get(terrain);
  if (minimumElevation === undefined) {
    minimumElevation = minimumTerrainElevation(terrain.elevations);
    minimumElevationCache.set(terrain, minimumElevation);
  }
  return minimumElevation;
}

/** Seeds the two elevation caches when a worker or overview pass has already
 * measured the same immutable terrain. This avoids repeating an O(map area)
 * scan on the first inspector interaction. */
export function primeTerrainElevationRange(
  terrain: TerrainArray,
  minimumElevation: number,
  maximumElevation: number,
): void {
  minimumElevationCache.set(terrain, minimumElevation);
  maximumElevationCache.set(terrain, maximumElevation);
}

function cellarWallTileIsExposed(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): boolean {
  if (
    tileX <= 0 ||
    tileY <= 0 ||
    tileX >= terrain.width - 1 ||
    tileY >= terrain.height - 1 ||
    terrain.blocked[tileY * terrain.width + tileX] !== true
  )
    return false;
  return (
    terrain.blocked[(tileY - 1) * terrain.width + tileX] === false ||
    terrain.blocked[tileY * terrain.width + tileX + 1] === false ||
    terrain.blocked[(tileY + 1) * terrain.width + tileX] === false ||
    terrain.blocked[tileY * terrain.width + tileX - 1] === false
  );
}

/** True for solid cellar rock with at least one open orthogonal neighbour:
 * the only rock a pickaxe may strike. */
export function cellarExposedWallAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): boolean {
  return cellarWallTileIsExposed(terrain, tileX, tileY);
}

/** Maps the tile under a drawn cave-wall pixel back to the solid source tile
 * that owns it. Rock is displaced north by its wall height, so a drawn cell
 * shows either the rim of the rock two rows south or a face course whose
 * source is the south edge below it. This keeps pointer targeting in the same
 * logical coordinate system as server collision. */
export function cellarWallSourceAtProjectedTile(
  terrain: TerrainArray,
  projectedTileX: number,
  projectedTileY: number,
): { readonly tileX: number; readonly tileY: number } | null {
  if (terrainProjectionStyle(terrain) !== 'interior') return null;
  const sourceProjectionRows = terrainVisualProjectionRowsPerLevel(terrain);
  const logicalTileY = projectedTileY + sourceProjectionRows;
  if (cellarWallTileIsExposed(terrain, projectedTileX, logicalTileY)) {
    return { tileX: projectedTileX, tileY: logicalTileY };
  }
  for (const { plan } of plateauLayerPlansAt(
    terrain,
    projectedTileX,
    logicalTileY,
  )) {
    const face = plan.faceLayers.find((layer) => layer.direct);
    if (face === undefined) continue;
    const sourceTileY = logicalTileY - face.depth;
    if (cellarWallTileIsExposed(terrain, projectedTileX, sourceTileY)) {
      return { tileX: projectedTileX, tileY: sourceTileY };
    }
  }
  return null;
}

export function terrainProjectedDepthAtFoot(
  terrain: TerrainArray,
  worldX: number,
  worldFootY: number,
): number {
  return terrainProjectedDepthForElevation(
    terrain,
    terrainProjectedElevationAtFoot(terrain, worldX, worldFootY),
  );
}

/** Converts a logical plane to its screen displacement using the selected
 * family's datum and visual projection. This is also the canonical editor
 * overlay/picking transform for signed elevations. */
export function terrainProjectedDepthForElevation(
  terrain: TerrainArray,
  elevation: number,
): number {
  return terrainProjectedDepthOffset(
    elevation,
    terrainVisualProjectionRowsPerLevel(terrain),
    16,
    terrainBaseDatum(terrain),
  );
}

function terrainTransitionsByTile(
  terrain: TerrainArray,
): Map<number, readonly TerrainTransition[]> {
  let byTile = transitionsByTileCache.get(terrain);
  if (byTile !== undefined) return byTile;
  const mutable = new Map<number, TerrainTransition[]>();
  for (const transition of terrain.terrainTransitions ?? []) {
    for (const [tileX, tileY] of [
      [transition.lowerTileX, transition.lowerTileY],
      [transition.upperTileX, transition.upperTileY],
    ] as const) {
      const key = tileY * terrain.width + tileX;
      const entries = mutable.get(key) ?? [];
      entries.push(transition);
      mutable.set(key, entries);
    }
  }
  byTile = mutable;
  transitionsByTileCache.set(terrain, byTile);
  return byTile;
}

/** Continuous presentation elevation along an authored crossing. Collision
 * remains integer and authoritative; only the 2.5D screen projection blends
 * between the lower and upper tile centres. */
export function terrainProjectedElevationAtFoot(
  terrain: TerrainArray,
  worldX: number,
  worldFootY: number,
): number {
  const tileX = Math.floor(worldX / 16);
  const tileY = Math.floor((worldFootY - 0.001) / 16);
  const fixedPlane = terrainFixedPlane(terrain);
  if (fixedPlane !== undefined) return fixedPlane;
  const baseElevation = terrainElevationAt(terrain, tileX, tileY);
  const transitions =
    terrainTransitionsByTile(terrain).get(tileY * terrain.width + tileX) ?? [];
  for (const transition of transitions) {
    if (transition.kind !== "slope" && transition.kind !== "stairs") continue;
    const lowerX = (transition.lowerTileX + 0.5) * 16;
    const lowerY = (transition.lowerTileY + 0.5) * 16;
    const deltaX = (transition.upperTileX - transition.lowerTileX) * 16;
    const deltaY = (transition.upperTileY - transition.lowerTileY) * 16;
    const distanceSquared = deltaX * deltaX + deltaY * deltaY;
    const progress =
      ((worldX - lowerX) * deltaX + (worldFootY - lowerY) * deltaY) /
      distanceSquared;
    if (progress < 0 || progress > 1) continue;
    const perpendicular =
      Math.abs((worldX - lowerX) * deltaY - (worldFootY - lowerY) * deltaX) /
      Math.sqrt(distanceSquared);
    if (perpendicular > 8) continue;
    return transition.contourLevel - 1 + progress;
  }
  return baseElevation;
}

const TERRAIN_PLANE_SORT_EPSILON = 1 / 1_024;

/** Stable sub-pixel tie-break within the explicit elevation/phase ordering.
 * Projection affects drawing; it never replaces the logical foot-Y key. */
export function terrainProjectedSortOffset(
  elevation: number,
  boundary = false,
): number {
  return (elevation - (boundary ? 0.5 : 0)) * TERRAIN_PLANE_SORT_EPSILON;
}

/** Screen-space projection for 2.5D terrain. Logical coordinates and server
 * collision remain unchanged; raised surfaces and their occupants render
 * north by the selected face height, creating a lower-plane walk-behind band. */
export function terrainProjectedWorldYAtFoot(
  terrain: TerrainArray,
  worldX: number,
  worldFootY: number,
): number {
  return worldFootY - terrainProjectedDepthAtFoot(terrain, worldX, worldFootY);
}

export type TerrainContourBoundary = "none" | "blocked" | "transition";
export type TerrainPlaneCollisionCell = "open" | "blocked" | "transition";

/** Classifies one logical tile for the actor's current elevation plane. This
 * is the debug/editor counterpart of the movement guard: other elevations are
 * solid, while authored slope/stair endpoints remain visibly traversable. */
export function terrainPlaneCollisionCellAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
  activeElevation: number,
): TerrainPlaneCollisionCell {
  if (
    tileX < 0 ||
    tileY < 0 ||
    tileX >= terrain.width ||
    tileY >= terrain.height
  )
    return "blocked";
  const index = tileY * terrain.width + tileX;
  if (terrainFixedPlane(terrain) !== undefined) {
    if (tileX === 0 || tileY === 0 || tileX === terrain.width - 1 || tileY === terrain.height - 1) {
      return "blocked";
    }
    if (terrain.terrainPlaneBlocked === undefined) return "open";
    const stride = terrain.width * terrain.height;
    const planeIndex = activeElevation - terrainMinimumElevation(terrain);
    return planeIndex >= 0 && terrain.terrainPlaneBlocked[planeIndex * stride + index] === 1
      ? "blocked"
      : "open";
  }
  if (terrain.blocked[index] ?? true) return "blocked";
  const transition = (terrainTransitionsByTile(terrain).get(index) ?? []).some(
    (candidate) => {
      if (candidate.kind !== "slope" && candidate.kind !== "stairs")
        return false;
      const endpoint =
        (candidate.lowerTileX === tileX && candidate.lowerTileY === tileY) ||
        (candidate.upperTileX === tileX && candidate.upperTileY === tileY);
      return (
        endpoint &&
        (candidate.contourLevel === activeElevation ||
          candidate.contourLevel - 1 === activeElevation)
      );
    },
  );
  if (transition) return "transition";
  return terrainElevationAt(terrain, tileX, tileY) === activeElevation
    ? "open"
    : "blocked";
}

export function terrainContourBoundaryBetween(
  terrain: TerrainArray,
  fromTileX: number,
  fromTileY: number,
  toTileX: number,
  toTileY: number,
): TerrainContourBoundary {
  const fromElevation = terrainElevationAt(terrain, fromTileX, fromTileY);
  const toElevation = terrainElevationAt(terrain, toTileX, toTileY);
  if (fromElevation === toElevation) return "none";
  return terrainWalkingStepAllowed(
    terrain.elevations,
    terrain.width,
    terrain.height,
    terrain.terrainTransitions ?? [],
    fromTileX,
    fromTileY,
    toTileX,
    toTileY,
  )
    ? "transition"
    : "blocked";
}

/** Number of authored wall rows which displace one logical terrain level.
 * This is the visible walk-behind depth, not the underground stratum number.
 * Omitting terrain retains the mountain profile for editor-only callers. */
export function terrainProjectedRowsPerLevel(
  terrain?: TerrainArray,
): number {
  const tileSet = terrain === undefined
    ? STONE_RAISED_CLIFF_TILE_SET
    : terrainDefaultCliffTileSet(terrain);
  return raisedTerrainProjectionRowsPerLevel(tileSet);
}

/** Rows by which the logical source plane is moved on screen. Every raised
 * surface moves north by its wall height, underground rock included. Cave
 * collision additionally places blocking front-face courses at those visual
 * destinations; the excavated floor immediately south remains open. */
export function terrainVisualProjectionRowsPerLevel(
  terrain?: TerrainArray,
): number {
  return terrainProjectedRowsPerLevel(terrain);
}

/** Editor preview mutates a working elevation buffer in place. Production
 * terrain snapshots stay immutable; the editor calls this after each stroke. */
export function invalidateTerrainElevationCaches(terrain: TerrainArray): void {
  maximumElevationCache.delete(terrain);
  minimumElevationCache.delete(terrain);
  contourPlanCache.delete(terrain);
  plateauGridCache.delete(terrain);
  transitionsByTileCache.delete(terrain);
}

/** Background faces are returned deepest-to-nearest for correct compositing. */
export function plateauBackgroundFrameIndicesAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): readonly number[] {
  return plateauLayerPlanAt(terrain, tileX, tileY).faceLayers.map(
    (layer) => layer.frame,
  );
}

/** Organic raised areas use the matching cap and side frames from Stone Cliff
 * 1. Unlike the blob edge sheet, these read as the top of a raised landform. */
export function plateauEdgeFrameIndexAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): number | null {
  return plateauLayerPlanAt(terrain, tileX, tileY).edgeFrame;
}

/** Standard diagonal-inner-corner rule used by blob/autotile renderers. A
 * plateau cell can need more than one foreground quadrant in pinched shapes. */
export function plateauForegroundFrameIndicesAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): readonly number[] {
  return plateauLayerPlanAt(terrain, tileX, tileY).insetFrames;
}

export function plateauRampFrameIndexAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): number | null {
  return plateauLayerPlanAt(terrain, tileX, tileY).rampFrame;
}

export function dirtTerraceFrameIndexAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): number | null {
  if (
    !dirtTerraceAt(terrain, tileX, tileY) ||
    dirtCliffRoleAt(terrain, tileX, tileY).startsWith("ramp_top")
  )
    return null;
  return blob47FrameIndexFor((offsetX, offsetY) =>
    dirtTerraceAt(terrain, tileX + offsetX, tileY + offsetY),
  );
}

/** Blob frame for a dry, visual-only authored farmland cell. */
export function authoredFarmlandFrameIndexAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): number | null {
  return authoredFarmlandRuleLayersAt(terrain,tileX,tileY)[0]?.frame ?? null;
}

/** Shared hoed/authored catalogue; only the source of occupancy differs. */
export function authoredFarmlandRuleLayersAt(terrain:TerrainArray,tileX:number,tileY:number):readonly ResolvedRuleFrame[] {
  const mask = terrain.authoredFarmland;
  const present = (offsetX:number,offsetY:number):boolean => {
    const x=tileX+offsetX,y=tileY+offsetY;
    return mask!==undefined&&x>=0&&y>=0&&x<terrain.width&&y<terrain.height&&mask[y*terrain.width+x]===1;
  };
  return present(0,0)?farmlandRuleLayers(present):[];
}

export function dirtTerraceRampFrameIndexAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): number | null {
  const role = dirtCliffRoleAt(terrain, tileX, tileY);
  if (role === "ramp_top_left") return 0;
  if (role === "ramp_top_right") return 1;
  if (role === "ramp_bottom_left") return 2;
  if (role === "ramp_bottom_right") return 3;
  return null;
}

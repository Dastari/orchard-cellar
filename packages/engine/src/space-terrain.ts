/** Terrain for every space kind except the generated island topside:
 * homestead exteriors, residences and Marlow's tent, cellars, the delve lobby,
 * village interiors, roguelike rooms, mines and debug spaces, plus the cellar
 * excavation overlay. These spaces are outside chunk streaming (static-world
 * S8 is out of scope), so they keep building their terrain here.
 *
 * Import boundary (static-world S6a): this module takes sim values only from
 * generator-free `@orchard/sim/*` leaf subpaths and never imports `terrain.ts`,
 * the island generator, the map compiler or the sim barrel. The two
 * generator-backed inputs, island classification and homestead biomes (a
 * homestead enlarges a patch of the generated island), are injected through
 * `SpaceTerrainGenerators`; `terrainForSpace` in `terrain.ts` supplies both, so
 * its output and caching are unchanged. `space-terrain.test.ts` pins this. */
import type { ContentRegistry, SpaceDefinition } from '@orchard/sim';
import { cellarExcavationFootprint } from '@orchard/sim/cellar-excavation';
import { caveTerrainPlaneCollisionBytes } from '@orchard/sim/cave-autotile';
import { bootstrapContentRegistry } from '@orchard/sim/content/bootstrap-registry';
import { parseHearthArchitectureState, persistedHearthArchitectureCollision } from '@orchard/sim/hearth-architecture-state';
import { hearthInteriorCollision } from '@orchard/sim/hearth-interiors';
import { generateHearthLobbyLayout, runtimeHearthLobbyDefinition } from '@orchard/sim/hearth-lobby';
import { generateRogueRoomLayout } from '@orchard/sim/roguelike';
import {
  cellarPlayableTile,
  homesteadPlayableTile,
  residencePlayableTile,
  starterCellarTerrainTransitions,
} from '@orchard/sim/spaces';
import { SURVIVAL_BIOMES, type SurvivalBiome } from '@orchard/sim/survival-biomes';
import { terrainPlaneCollisionBytesForElevationGrid } from '@orchard/sim/terrain-plane-collision';
import type { TerrainArray } from './terrain-array.js';
import { terrainIndexAt } from './terrain-index.js';

/** A space's terrain without the per-request seed and version. */
export type SpaceTerrainClassification = Omit<TerrainArray, "seed" | "version">;

/** Generator-backed inputs this module cannot import. Omitting one makes
 * `spaceTerrain` throw for the spaces that need it (the island topside, and
 * homestead exteriors with an overworld site). */
export interface SpaceTerrainGenerators {
  readonly island?: (space: SpaceDefinition, seed: number) => SpaceTerrainClassification;
  readonly homesteadBiomeAt?: (
    worldSeed: number,
    site: { readonly worldTileX: number; readonly worldTileY: number },
    tileX: number,
    tileY: number,
    sizeTiles?: number,
  ) => SurvivalBiome;
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
      const index = terrainIndexAt(terrain, cell.tileX, cell.tileY);
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
const terrainClassificationCache = new Map<string, SpaceTerrainClassification>();
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

/** Builds (and caches) the terrain of any space. Island and homestead
 * generation come from `generators`; see `SpaceTerrainGenerators`. The caches
 * are shared by every caller, so `terrainForSpace` and direct callers get the
 * same terrain objects for the same inputs. Cache keys do not include
 * `generators`: pass the island and homestead generators `terrainForSpace`
 * uses (or none), never substitutes. */
export function spaceTerrain(
  space: SpaceDefinition,
  seed: number,
  version: number,
  registry?: ContentRegistry,
  generators: SpaceTerrainGenerators = {},
): TerrainArray {
  const islandClassification = generators.island;
  const homesteadBiomeAt = generators.homesteadBiomeAt;
  if (space.generator === 'island' && islandClassification === undefined) {
    throw new Error('space_terrain_island_requires_generator');
  }
  if (space.generator === 'homestead' && space.homesteadSite !== undefined && homesteadBiomeAt === undefined) {
    throw new Error('space_terrain_homestead_requires_generator');
  }
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
      classification = islandClassification!(space, seed);
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
          const biome = homesteadBiomeAt!(
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

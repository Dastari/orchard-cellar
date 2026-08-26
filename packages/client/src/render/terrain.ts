import {
  FIXED_UNITS_PER_PIXEL,
  PLAYER_HITBOX_FOOT_OFFSET,
  SURVIVAL_BIOMES,
  SURVIVAL_CLIFF_ROLES,
  SURVIVAL_DIRT_CLIFF_ROLES,
  SURVIVAL_RAISED_CLIFF_TILE_SET,
  SURVIVAL_WORLD_SIZE,
  TOPSIDE_SPACE_ID,
  homesteadBiomeAt,
  resolveRaisedTerrainTile,
  resolveRaisedTerrainContoursAt,
  maximumTerrainElevation,
  terrainElevationAt as sampleTerrainElevation,
  terrainWalkingStepAllowed,
  survivalElevationBytes,
  survivalTerrainTransitions,
  survivalCliffRoleBytes,
  survivalBiomeAllowsHorseJump,
  survivalTerrainBlocksTraversalAt,
  survivalDirtCliffRoleBytes,
  survivalDirtTerraceBytes,
  survivalTerrainBytes,
  type RaisedTerrainGrid,
  type RaisedTerrainRampRole,
  type RaisedTerrainTilePlan,
  type RaisedTerrainContourPlan,
  type SurvivalBiome,
  type SpaceDefinition,
  type TerrainTransition,
} from '@orchard/sim';
import { blob47FrameIndexFor } from './tilemap.js';

export { SURVIVAL_BIOMES };

export const BIOME_COLORS = [
  '#0095e9',
  '#e4a672',
  '#0789d1',
  '#00b9f2',
  '#3e8948',
  '#3e8948',
  '#3e8948',
  '#3e8948',
  '#3e8948',
  '#3e8948',
  '#e8a261',
  '#e4a672',
  '#8f583c',
  '#7f8b42',
  '#16bed0',
  '#a8a34f',
  '#3e8948',
  '#e4a672',
  '#9c6754',
] as const;

const WATER = 0;
export interface TerrainArray {
  readonly spaceId: number;
  readonly seed: number;
  readonly version: number;
  readonly width: number;
  readonly height: number;
  readonly biomes: Uint8Array;
  readonly blocked: readonly boolean[];
  readonly horseJumpableTerrain: readonly boolean[];
  readonly cliffRoles: Uint8Array;
  /** Integer logical terrain height. This is the editor/generator source of
   * truth; every raised contour is derived independently from it. */
  readonly elevations: Uint8Array;
  /** Present on v2/generated/editor terrain. Omission preserves the legacy
   * island's collision-authored ramps; an empty list means no crossings. */
  readonly terrainTransitions?: readonly TerrainTransition[];
  /** True when `blocked`/biomes already include every nested contour plan. */
  readonly raisedTerrainCollisionClassified?: true;
  /** @deprecated Compatibility alias while the v1 island generator is retired. */
  readonly plateaus: Uint8Array;
  readonly dirtCliffRoles: Uint8Array;
  readonly dirtTerraces: Uint8Array;
}

const terrainCache = new Map<string, TerrainArray>();
const terrainClassificationCache = new Map<string, Omit<TerrainArray, 'seed' | 'version'>>();

export function terrainForWorld(seed: number, version: number): TerrainArray {
  return terrainForSpace({
    spaceId: TOPSIDE_SPACE_ID,
    name: 'island',
    sizeTiles: SURVIVAL_WORLD_SIZE,
    generator: 'island',
    ambient: 'clock',
    weather: true,
    audioBed: 'estate',
  }, seed, version);
}

export function terrainForSpace(space: SpaceDefinition, seed: number, version: number): TerrainArray {
  const terrainKey = `${space.spaceId}:${seed}:${version}`;
  const cachedTerrain = terrainCache.get(terrainKey);
  if (cachedTerrain !== undefined) return cachedTerrain;
  const classificationKey = `${space.spaceId}:${seed}`;
  let classification = terrainClassificationCache.get(classificationKey);
  if (!classification) {
    if (space.generator === 'island') {
      const biomes = survivalTerrainBytes(seed);
      const elevations = survivalElevationBytes(seed);
      classification = {
        spaceId: space.spaceId,
        width: SURVIVAL_WORLD_SIZE,
        height: SURVIVAL_WORLD_SIZE,
        biomes,
        blocked: Array.from(biomes, (_biome, index) => survivalTerrainBlocksTraversalAt(
          seed,
          index % SURVIVAL_WORLD_SIZE,
          Math.floor(index / SURVIVAL_WORLD_SIZE),
          'ground',
        )),
        horseJumpableTerrain: Array.from(biomes, (biome) => (
          survivalBiomeAllowsHorseJump(SURVIVAL_BIOMES[biome] ?? 'water')
        )),
        cliffRoles: survivalCliffRoleBytes(seed),
        elevations,
        terrainTransitions: survivalTerrainTransitions(seed),
        raisedTerrainCollisionClassified: true,
        plateaus: elevations,
        dirtCliffRoles: survivalDirtCliffRoleBytes(seed),
        dirtTerraces: survivalDirtTerraceBytes(seed),
      };
    } else {
      const length = space.sizeTiles * space.sizeTiles;
      const elevations = new Uint8Array(length);
      const plains = Math.max(0, SURVIVAL_BIOMES.indexOf('plains'));
      const biomes = new Uint8Array(length).fill(plains);
      if (space.generator === 'homestead' && space.homesteadSite !== undefined) {
        for (let index = 0; index < length; index += 1) {
          const biome = homesteadBiomeAt(
            seed, space.homesteadSite, index % space.sizeTiles, Math.floor(index / space.sizeTiles), space.sizeTiles,
          );
          biomes[index] = Math.max(0, SURVIVAL_BIOMES.indexOf(biome));
        }
      }
      const blocked = Array.from({ length }, (_, index) => {
        const x = index % space.sizeTiles;
        const y = Math.floor(index / space.sizeTiles);
        return x === 0 || y === 0 || x === space.sizeTiles - 1 || y === space.sizeTiles - 1;
      });
      classification = {
        spaceId: space.spaceId,
        width: space.sizeTiles,
        height: space.sizeTiles,
        biomes,
        blocked,
        horseJumpableTerrain: Array<boolean>(length).fill(false),
        cliffRoles: new Uint8Array(length),
        elevations,
        plateaus: elevations,
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

export function terrainBiomeAt(terrain: TerrainArray, tileX: number, tileY: number): SurvivalBiome {
  if (tileX < 0 || tileY < 0 || tileX >= terrain.width || tileY >= terrain.height) return 'water';
  return SURVIVAL_BIOMES[terrain.biomes[tileY * terrain.width + tileX] ?? WATER] ?? 'water';
}

export function terrainColorAt(terrain: TerrainArray, tileX: number, tileY: number): string {
  const biome = tileX < 0 || tileY < 0 || tileX >= terrain.width || tileY >= terrain.height
    ? WATER
    : terrain.biomes[tileY * terrain.width + tileX] ?? WATER;
  return BIOME_COLORS[biome] ?? BIOME_COLORS[WATER];
}

function edgeFrameIndex(north: boolean, east: boolean, south: boolean, west: boolean): number {
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
  return biome === 'water';
}

function freshwaterBiome(biome: SurvivalBiome): boolean {
  return biome === 'freshwater' || biome === 'waterfall';
}

export function beachFrameIndexAt(terrain: TerrainArray, tileX: number, tileY: number): number {
  const water = (offsetX: number, offsetY: number): boolean => oceanWaterBiome(terrainBiomeAt(terrain, tileX + offsetX, tileY + offsetY));
  const north = water(0, -1);
  const east = water(1, 0);
  const south = water(0, 1);
  const west = water(-1, 0);
  return edgeFrameIndex(north, east, south, west);
}

function vegetatedBiome(biome: SurvivalBiome): boolean {
  return biome === 'plains' || biome === 'meadow' || biome === 'forest'
    || biome === 'valley' || biome === 'highland' || biome === 'oasis'
    || biome === 'savanna';
}

function darkGrassBiome(biome: SurvivalBiome): boolean {
  return biome === 'plains' || biome === 'meadow' || biome === 'forest'
    || biome === 'valley' || biome === 'highland';
}

function desertGroundBiome(biome: SurvivalBiome): boolean {
  return biome === 'desert' || biome === 'desert_shore' || biome === 'desert_ridge';
}

/** The authored 47-frame fringe is drawn on sandy cells, but ocean counts as
 * part of the mask so the grass fringe is emitted only along landward edges. */
export function grassSandTransitionFrameIndexAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): number | null {
  if (terrainBiomeAt(terrain, tileX, tileY) !== 'beach') return null;
  const frame = blob47FrameIndexFor((offsetX, offsetY) => (
    !vegetatedBiome(terrainBiomeAt(terrain, tileX + offsetX, tileY + offsetY))
  ));
  return frame === 46 ? null : frame;
}

/** Savanna is the ecological buffer between humid grass and bare desert. Its
 * licensed olive fill receives a dark-grass blob fringe on only the humid side. */
export function savannaGrassTransitionFrameIndexAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): number | null {
  if (terrainBiomeAt(terrain, tileX, tileY) !== 'savanna') return null;
  const frame = blob47FrameIndexFor((offsetX, offsetY) => (
    !darkGrassBiome(terrainBiomeAt(terrain, tileX + offsetX, tileY + offsetY))
  ));
  return frame === 46 ? null : frame;
}

/** The desert pack supplies its own olive grass fringe as a 3x3 edge set. */
export function desertGrassEdgeFrameIndexAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): number | null {
  if (!desertGroundBiome(terrainBiomeAt(terrain, tileX, tileY))) return null;
  const grass = (offsetX: number, offsetY: number): boolean => (
    vegetatedBiome(terrainBiomeAt(terrain, tileX + offsetX, tileY + offsetY))
  );
  return edgeFrameIndex(grass(0, -1), grass(1, 0), grass(0, 1), grass(-1, 0));
}

export function desertGrassInsetFrameIndicesAt(
  terrain: TerrainArray,
  tileX: number,
  tileY: number,
): readonly number[] {
  if (!desertGroundBiome(terrainBiomeAt(terrain, tileX, tileY))) return [];
  const grass = (offsetX: number, offsetY: number): boolean => (
    vegetatedBiome(terrainBiomeAt(terrain, tileX + offsetX, tileY + offsetY))
  );
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
  if (biome !== 'beach' && biome !== 'desert_shore') return [];
  const water = (offsetX: number, offsetY: number): boolean => {
    const neighbor = terrainBiomeAt(terrain, tileX + offsetX, tileY + offsetY);
    return biome === 'beach' ? neighbor === 'water' : neighbor === 'water' || neighbor === 'oasis_water';
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
export function freshwaterFrameIndexAt(terrain: TerrainArray, tileX: number, tileY: number): number {
  const land = (offsetX: number, offsetY: number): boolean => !freshwaterBiome(terrainBiomeAt(terrain, tileX + offsetX, tileY + offsetY));
  const frame = edgeFrameIndex(land(0, -1), land(1, 0), land(0, 1), land(-1, 0));
  if (frame !== 4) return frame;
  if (land(-1, -1)) return 13;
  if (land(1, -1)) return 12;
  if (land(-1, 1)) return 10;
  if (land(1, 1)) return 9;
  return frame;
}

function waterDecorationGroup(biome: SurvivalBiome): number {
  if (biome === 'water') return 1;
  if (biome === 'freshwater' || biome === 'waterfall') return 2;
  if (biome === 'oasis_water') return 3;
  return 0;
}

/** Water details only occupy uninterrupted interior water, never a bank frame. */
export function waterDecorationAllowedAt(terrain: TerrainArray, tileX: number, tileY: number): boolean {
  const group = waterDecorationGroup(terrainBiomeAt(terrain, tileX, tileY));
  if (group === 0 || terrainBiomeAt(terrain, tileX, tileY) === 'waterfall') return false;
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      if (offsetX === 0 && offsetY === 0) continue;
      if (waterDecorationGroup(terrainBiomeAt(terrain, tileX + offsetX, tileY + offsetY)) !== group) return false;
    }
  }
  return true;
}

export function terrainDecorationHash(tileX: number, tileY: number): number {
  return (Math.imul(tileX, 73_856_093) ^ Math.imul(tileY, 19_349_663)) >>> 0;
}

export function grassTuftAllowedAt(terrain: TerrainArray, tileX: number, tileY: number): boolean {
  const biome = terrainBiomeAt(terrain, tileX, tileY);
  if (biome !== 'plains' && biome !== 'meadow' && biome !== 'forest') return false;
  return terrainDecorationHash(tileX, tileY) % (biome === 'meadow' ? 9 : 23) === 0;
}

export function animatedWaterRockAllowedAt(terrain: TerrainArray, tileX: number, tileY: number): boolean {
  const biome = terrainBiomeAt(terrain, tileX, tileY);
  const hash = terrainDecorationHash(tileX, tileY);
  return (biome === 'freshwater' || biome === 'oasis_water')
    && waterDecorationAllowedAt(terrain, tileX, tileY)
    && hash % 113 === 0
    && hash % 13 !== 0;
}

export function waterfallTopLeftAt(terrain: TerrainArray, tileX: number, tileY: number): boolean {
  return terrainBiomeAt(terrain, tileX, tileY) === 'waterfall'
    && terrainBiomeAt(terrain, tileX - 1, tileY) !== 'waterfall'
    && terrainBiomeAt(terrain, tileX, tileY - 1) !== 'waterfall';
}

export function desertShoreFrameIndexAt(terrain: TerrainArray, tileX: number, tileY: number): number {
  const water = (offsetX: number, offsetY: number): boolean => {
    const biome = terrainBiomeAt(terrain, tileX + offsetX, tileY + offsetY);
    return biome === 'water' || biome === 'oasis_water';
  };
  return edgeFrameIndex(water(0, -1), water(1, 0), water(0, 1), water(-1, 0));
}

export function waterfallFrameIndexAt(terrain: TerrainArray, tileX: number, tileY: number): number | null {
  if (terrainBiomeAt(terrain, tileX, tileY) !== 'waterfall') return null;
  const waterfall = (offsetX: number, offsetY: number): boolean => terrainBiomeAt(terrain, tileX + offsetX, tileY + offsetY) === 'waterfall';
  const column = !waterfall(-1, 0) ? 0 : !waterfall(1, 0) ? 2 : 1;
  const row = !waterfall(0, -1) ? 0
    : !waterfall(0, 1) ? 4
      : !waterfall(0, -2) ? 1
        : !waterfall(0, 2) ? 3
          : 2;
  return row * 3 + column;
}

function plateauAt(terrain: TerrainArray, tileX: number, tileY: number): boolean {
  return terrainElevationAt(terrain, tileX, tileY) >= 1;
}

export function terrainElevationAt(terrain: TerrainArray, tileX: number, tileY: number): number {
  return sampleTerrainElevation(terrain.elevations, terrain.width, terrain.height, tileX, tileY);
}

export function terrainElevationAtWorldFoot(
  terrain: TerrainArray,
  worldX: number,
  worldFootY: number,
): number {
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

function cliffRoleAt(terrain: TerrainArray, tileX: number, tileY: number): typeof SURVIVAL_CLIFF_ROLES[number] {
  if (tileX < 0 || tileY < 0 || tileX >= terrain.width || tileY >= terrain.height) return 'none';
  return SURVIVAL_CLIFF_ROLES[terrain.cliffRoles[tileY * terrain.width + tileX] ?? 0] ?? 'none';
}

function dirtCliffRoleAt(terrain: TerrainArray, tileX: number, tileY: number): typeof SURVIVAL_DIRT_CLIFF_ROLES[number] {
  if (tileX < 0 || tileY < 0 || tileX >= terrain.width || tileY >= terrain.height) return 'none';
  return SURVIVAL_DIRT_CLIFF_ROLES[terrain.dirtCliffRoles[tileY * terrain.width + tileX] ?? 0] ?? 'none';
}

function dirtTerraceAt(terrain: TerrainArray, tileX: number, tileY: number): boolean {
  if (tileX < 0 || tileY < 0 || tileX >= terrain.width || tileY >= terrain.height) return false;
  const biome = terrainBiomeAt(terrain, tileX, tileY);
  return terrain.dirtTerraces[tileY * terrain.width + tileX] === 1
    && (biome === 'dirt_terrace' || biome === 'dirt_ridge');
}

/** Stone Cliff 1 plugs into the generic raised-terrain topology. Other natural
 * wall sheets provide another data object rather than another resolver. */
export const STONE_RAISED_CLIFF_TILE_SET = SURVIVAL_RAISED_CLIFF_TILE_SET;

function plateauRampRoleAt(
  terrain: TerrainArray,
  contourLevel: number,
  tileX: number,
  tileY: number,
): RaisedTerrainRampRole | null {
  for (const transition of terrain.terrainTransitions ?? []) {
    if (transition.contourLevel !== contourLevel || transition.direction !== 'up') continue;
    const peerOnRight = terrain.terrainTransitions?.some((candidate) => (
      candidate.contourLevel === contourLevel && candidate.direction === 'up'
      && candidate.lowerTileX === transition.lowerTileX + 1
      && candidate.lowerTileY === transition.lowerTileY
    )) ?? false;
    const side = peerOnRight ? 'left' : 'right';
    if (tileX === transition.upperTileX && tileY === transition.upperTileY) {
      return side === 'left' ? 'ramp_top_left' : 'ramp_top_right';
    }
    if (tileX === transition.lowerTileX && tileY === transition.lowerTileY) {
      return side === 'left' ? 'ramp_bottom_left' : 'ramp_bottom_right';
    }
  }
  if (contourLevel !== 1) return null;
  const legacyRole = cliffRoleAt(terrain, tileX, tileY);
  if (legacyRole === 'ramp_top_left' || legacyRole === 'ramp_top_right'
    || legacyRole === 'ramp_bottom_left' || legacyRole === 'ramp_bottom_right') return legacyRole;
  return null;
}

const plateauGridCache = new WeakMap<TerrainArray, RaisedTerrainGrid>();
const maximumElevationCache = new WeakMap<TerrainArray, number>();
const contourPlanCache = new WeakMap<TerrainArray, Map<number, readonly RaisedTerrainContourPlan[]>>();
const transitionsByTileCache = new WeakMap<TerrainArray, Map<number, readonly TerrainTransition[]>>();

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

export function plateauLayerPlanAt(terrain: TerrainArray, tileX: number, tileY: number): RaisedTerrainTilePlan {
  return resolveRaisedTerrainTile(
    plateauGridFor(terrain),
    STONE_RAISED_CLIFF_TILE_SET,
    'tall',
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
  const maximumElevation = terrainMaximumElevation(terrain);
  const plans = resolveRaisedTerrainContoursAt(
    (x, y) => terrainElevationAt(terrain, x, y),
    maximumElevation,
    STONE_RAISED_CLIFF_TILE_SET,
    'tall',
    tileX,
    tileY,
    (contourLevel, x, y) => plateauRampRoleAt(terrain, contourLevel, x, y),
  );
  plansByTile.set(tileKey, plans);
  return plans;
}

export function terrainMaximumElevation(terrain: TerrainArray): number {
  let maximumElevation = maximumElevationCache.get(terrain);
  if (maximumElevation === undefined) {
    maximumElevation = maximumTerrainElevation(terrain.elevations);
    maximumElevationCache.set(terrain, maximumElevation);
  }
  return maximumElevation;
}

export function terrainProjectedDepthAtFoot(
  terrain: TerrainArray,
  worldX: number,
  worldFootY: number,
): number {
  return terrainProjectedElevationAtFoot(terrain, worldX, worldFootY)
    * terrainProjectedRowsPerLevel() * 16;
}

function terrainTransitionsByTile(terrain: TerrainArray): Map<number, readonly TerrainTransition[]> {
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
  const baseElevation = terrainElevationAt(terrain, tileX, tileY);
  const transitions = terrainTransitionsByTile(terrain).get(tileY * terrain.width + tileX) ?? [];
  for (const transition of transitions) {
    if (transition.kind !== 'slope' && transition.kind !== 'stairs') continue;
    const lowerX = (transition.lowerTileX + 0.5) * 16;
    const lowerY = (transition.lowerTileY + 0.5) * 16;
    const deltaX = (transition.upperTileX - transition.lowerTileX) * 16;
    const deltaY = (transition.upperTileY - transition.lowerTileY) * 16;
    const distanceSquared = deltaX * deltaX + deltaY * deltaY;
    const progress = ((worldX - lowerX) * deltaX + (worldFootY - lowerY) * deltaY)
      / distanceSquared;
    if (progress < 0 || progress > 1) continue;
    const perpendicular = Math.abs((worldX - lowerX) * deltaY - (worldFootY - lowerY) * deltaX)
      / Math.sqrt(distanceSquared);
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

export type TerrainContourBoundary = 'none' | 'blocked' | 'transition';

export function terrainContourBoundaryBetween(
  terrain: TerrainArray,
  fromTileX: number,
  fromTileY: number,
  toTileX: number,
  toTileY: number,
): TerrainContourBoundary {
  const fromElevation = terrainElevationAt(terrain, fromTileX, fromTileY);
  const toElevation = terrainElevationAt(terrain, toTileX, toTileY);
  if (fromElevation === toElevation) return 'none';
  return terrainWalkingStepAllowed(
    terrain.elevations,
    terrain.width,
    terrain.height,
    terrain.terrainTransitions ?? [],
    fromTileX,
    fromTileY,
    toTileX,
    toTileY,
  ) ? 'transition' : 'blocked';
}

export function terrainProjectedRowsPerLevel(): number {
  return STONE_RAISED_CLIFF_TILE_SET.faceProfiles.tall?.rows.length ?? 0;
}

/** Editor preview mutates a working elevation buffer in place. Production
 * terrain snapshots stay immutable; the editor calls this after each stroke. */
export function invalidateTerrainElevationCaches(terrain: TerrainArray): void {
  maximumElevationCache.delete(terrain);
  contourPlanCache.delete(terrain);
  plateauGridCache.delete(terrain);
  transitionsByTileCache.delete(terrain);
}

/** Background faces are returned deepest-to-nearest for correct compositing. */
export function plateauBackgroundFrameIndicesAt(terrain: TerrainArray, tileX: number, tileY: number): readonly number[] {
  return plateauLayerPlanAt(terrain, tileX, tileY).faceLayers.map((layer) => layer.frame);
}

/** Organic raised areas use the matching cap and side frames from Stone Cliff
 * 1. Unlike the blob edge sheet, these read as the top of a raised landform. */
export function plateauEdgeFrameIndexAt(terrain: TerrainArray, tileX: number, tileY: number): number | null {
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

export function plateauRampFrameIndexAt(terrain: TerrainArray, tileX: number, tileY: number): number | null {
  return plateauLayerPlanAt(terrain, tileX, tileY).rampFrame;
}

export function dirtTerraceFrameIndexAt(terrain: TerrainArray, tileX: number, tileY: number): number | null {
  if (!dirtTerraceAt(terrain, tileX, tileY) || dirtCliffRoleAt(terrain, tileX, tileY).startsWith('ramp_top')) return null;
  return blob47FrameIndexFor((offsetX, offsetY) => dirtTerraceAt(terrain, tileX + offsetX, tileY + offsetY));
}

export function dirtTerraceRampFrameIndexAt(terrain: TerrainArray, tileX: number, tileY: number): number | null {
  const role = dirtCliffRoleAt(terrain, tileX, tileY);
  if (role === 'ramp_top_left') return 0;
  if (role === 'ramp_top_right') return 1;
  if (role === 'ramp_bottom_left') return 2;
  if (role === 'ramp_bottom_right') return 3;
  return null;
}

/** Frame coordinates address the separate ocean-facing Stone Cliff 1 bands.
 * Raised plateau projections are selected independently above. */
export function cliffFrameIndexAt(terrain: TerrainArray, tileX: number, tileY: number): number | null {
  const cliff = (offsetX: number, offsetY: number): boolean => {
    const biome = terrainBiomeAt(terrain, tileX + offsetX, tileY + offsetY);
    return biome === 'coastal_cliff';
  };
  if (!cliff(0, 0)) return null;
  const column = !cliff(-1, 0) ? 1 : !cliff(1, 0) ? 3 : 2;
  if (!cliff(0, 1)) return 3 * 14 + column;
  if (!cliff(0, 2)) return 2 * 14 + column;
  if (!cliff(0, 3)) return column;
  if (!cliff(0, -1)) return column;
  if (!cliff(-1, 0) || !cliff(1, 0)) return 14 + column;
  return null;
}

/** Frame coordinates address the authored 13x11 desert cliff sheet. */
export function desertCliffFrameIndexAt(terrain: TerrainArray, tileX: number, tileY: number): number | null {
  if (terrainBiomeAt(terrain, tileX, tileY) !== 'desert_ridge') return null;
  const ridge = (offsetX: number, offsetY: number): boolean => terrainBiomeAt(terrain, tileX + offsetX, tileY + offsetY) === 'desert_ridge';
  const column = !ridge(-1, 0) ? 1 : !ridge(1, 0) ? 3 : 2;
  if (!ridge(0, 1)) return 5 * 13 + column;
  if (!ridge(0, 2)) return 4 * 13 + column;
  if (!ridge(0, 3)) return 3 * 13 + column;
  if (!ridge(0, -1)) return 13 + column;
  return 2 * 13 + column;
}

import {
  SURVIVAL_BIOMES,
  SURVIVAL_CLIFF_ROLES,
  SURVIVAL_DIRT_CLIFF_ROLES,
  SURVIVAL_WORLD_SIZE,
  TOPSIDE_SPACE_ID,
  resolveRaisedTerrainTile,
  survivalCliffRoleBytes,
  survivalBiomeAllowsHorseJump,
  survivalBiomeBlocksMovement,
  survivalDirtCliffRoleBytes,
  survivalDirtTerraceBytes,
  survivalPlateauBytes,
  survivalTerrainBytes,
  type RaisedTerrainGrid,
  type RaisedTerrainRampRole,
  type RaisedTerrainTilePlan,
  type RaisedTerrainTileSet,
  type SurvivalBiome,
  type SpaceDefinition,
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
      classification = {
        spaceId: space.spaceId,
        width: SURVIVAL_WORLD_SIZE,
        height: SURVIVAL_WORLD_SIZE,
        biomes,
        blocked: Array.from(biomes, (biome) => (
          survivalBiomeBlocksMovement(SURVIVAL_BIOMES[biome] ?? 'water')
        )),
        horseJumpableTerrain: Array.from(biomes, (biome) => (
          survivalBiomeAllowsHorseJump(SURVIVAL_BIOMES[biome] ?? 'water')
        )),
        cliffRoles: survivalCliffRoleBytes(seed),
        plateaus: survivalPlateauBytes(seed),
        dirtCliffRoles: survivalDirtCliffRoleBytes(seed),
        dirtTerraces: survivalDirtTerraceBytes(seed),
      };
    } else {
      const length = space.sizeTiles * space.sizeTiles;
      const plains = Math.max(0, SURVIVAL_BIOMES.indexOf('plains'));
      const biomes = new Uint8Array(length).fill(plains);
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
        plateaus: new Uint8Array(length),
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
  return tileX >= 0 && tileY >= 0 && tileX < terrain.width && tileY < terrain.height
    && terrain.plateaus[tileY * terrain.width + tileX] === 1;
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
export const STONE_RAISED_CLIFF_TILE_SET: RaisedTerrainTileSet = {
  edgeFrames: {
    top_left: 1, top: 2, top_right: 3,
    left: 15, right: 17,
    bottom_left: 29, bottom: 30, bottom_right: 31,
  },
  faceProfiles: {
    tall: {
      rows: [
        { id: 'wall', frames: [43, 44, 45], blocksMovement: true },
        { id: 'lower_wall', frames: [57, 58, 59], blocksMovement: true },
        { id: 'foot', frames: [71, 72, 73], blocksMovement: false },
      ],
    },
  },
  insetFrames: {
    // The source sheet stores quadrants of a central hole. These names describe
    // the corner drawn inside the destination cell, hence the apparent reversal.
    inner_bottom_right: 0,
    inner_bottom_left: 1,
    inner_top_right: 2,
    inner_top_left: 3,
  },
  rampFrames: {
    ramp_top_left: 0,
    ramp_top_right: 1,
    ramp_bottom_left: 2,
    ramp_bottom_right: 3,
  },
};

function plateauRampRoleAt(terrain: TerrainArray, tileX: number, tileY: number): RaisedTerrainRampRole | null {
  const role = cliffRoleAt(terrain, tileX, tileY);
  if (role === 'ramp_top_left' || role === 'ramp_top_right'
    || role === 'ramp_bottom_left' || role === 'ramp_bottom_right') return role;
  return null;
}

const plateauGridCache = new WeakMap<TerrainArray, RaisedTerrainGrid>();

function plateauGridFor(terrain: TerrainArray): RaisedTerrainGrid {
  let grid = plateauGridCache.get(terrain);
  if (!grid) {
    grid = {
      raisedAt: (tileX, tileY) => plateauAt(terrain, tileX, tileY),
      rampRoleAt: (tileX, tileY) => plateauRampRoleAt(terrain, tileX, tileY),
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

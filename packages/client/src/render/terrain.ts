import {
  SURVIVAL_BIOMES,
  SURVIVAL_WORLD_SIZE,
  survivalBiomeBlocksMovement,
  survivalTerrainBytes,
  type SurvivalBiome,
} from '@orchard/sim';

export { SURVIVAL_BIOMES };

export const BIOME_COLORS = [
  '#0095e9',
  '#e4a672',
  '#0789d1',
  '#00b9f2',
  '#3e8948',
  '#50af5d',
  '#33713b',
  '#3f886c',
  '#56627b',
  '#3c4258',
  '#e8a261',
  '#e4a672',
  '#8f583c',
  '#7f8b42',
  '#16bed0',
  '#a8a34f',
  '#454b5d',
] as const;

const WATER = 0;
export interface TerrainArray {
  readonly seed: number;
  readonly version: number;
  readonly width: number;
  readonly height: number;
  readonly biomes: Uint8Array;
  readonly blocked: readonly boolean[];
}

let cachedTerrain: TerrainArray | null = null;

export function terrainForWorld(seed: number, version: number): TerrainArray {
  if (cachedTerrain?.seed === seed && cachedTerrain.version === version) return cachedTerrain;
  const biomes = survivalTerrainBytes(seed);
  const blocked = Array.from(biomes, (biome) => (
    survivalBiomeBlocksMovement(SURVIVAL_BIOMES[biome] ?? 'water')
  ));
  cachedTerrain = {
    seed,
    version,
    width: SURVIVAL_WORLD_SIZE,
    height: SURVIVAL_WORLD_SIZE,
    biomes,
    blocked,
  };
  return cachedTerrain;
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

/** Grass-edged freshwater frames are selected from the water tile itself, so
 * exposed sides are the neighboring non-water sides rather than adjacent water. */
export function freshwaterFrameIndexAt(terrain: TerrainArray, tileX: number, tileY: number): number {
  const land = (offsetX: number, offsetY: number): boolean => !freshwaterBiome(terrainBiomeAt(terrain, tileX + offsetX, tileY + offsetY));
  return edgeFrameIndex(land(0, -1), land(1, 0), land(0, 1), land(-1, 0));
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

/** Frame coordinates address the authored 14x6 Stone_Cliff_1 sheet. Southern
 * ridge bands become a three-tile lip/wall/foot while other exposed edges use
 * the matching top or side cap. */
export function cliffFrameIndexAt(terrain: TerrainArray, tileX: number, tileY: number): number | null {
  const cliff = (offsetX: number, offsetY: number): boolean => {
    const biome = terrainBiomeAt(terrain, tileX + offsetX, tileY + offsetY);
    return biome === 'ridge' || biome === 'coastal_cliff';
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

import {
  SURVIVAL_WORLD_SIZE,
  survivalBiomeBlocksMovement,
  survivalTerrainBytes,
  type SurvivalBiome,
} from '@orchard/sim';

export const SURVIVAL_BIOMES = [
  'water',
  'beach',
  'plains',
  'meadow',
  'forest',
  'valley',
  'highland',
  'ridge',
] as const satisfies readonly SurvivalBiome[];

export const BIOME_COLORS = [
  '#0095e9',
  '#e4a672',
  '#3e8948',
  '#50af5d',
  '#33713b',
  '#3f886c',
  '#56627b',
  '#3c4258',
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

import {
  SURVIVAL_BIOMES,
  compileMapDocument,
  type CompiledMapDocument,
  type MapDocumentV2,
  type MapSurfaceKind,
} from '@orchard/sim';
import type { TerrainArray } from '../render/terrain.js';

const EDITOR_SPACE_ID = 4_200_001;

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
): TerrainArray {
  const length = compiled.width * compiled.height;
  const biomes = new Uint8Array(length);
  const elevations = new Uint8Array(length);
  const dirtTerraces = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) {
    const surface = compiled.features[index] === 'river' ? 'water'
      : compiled.features[index] === 'path' ? 'dirt'
        : compiled.surfaces[index] ?? 'grass';
    const biome = biomeForSurface(surface);
    biomes[index] = Math.max(0, SURVIVAL_BIOMES.indexOf(biome));
    elevations[index] = Math.max(0, Math.min(255, compiled.elevations[index] ?? 0));
    if (surface === 'dirt') dirtTerraces[index] = 1;
  }
  return {
    spaceId: EDITOR_SPACE_ID,
    seed: 42,
    version: document.revision,
    width: compiled.width,
    height: compiled.height,
    generator: 'debug_flat',
    biomes,
    blocked: compiled.blocked,
    horseJumpableTerrain: Array<boolean>(length).fill(false),
    cliffRoles: new Uint8Array(length),
    elevations,
    terrainTransitions: compiled.transitions,
    raisedTerrainCollisionClassified: true,
    plateaus: elevations,
    dirtCliffRoles: new Uint8Array(length),
    dirtTerraces,
  };
}

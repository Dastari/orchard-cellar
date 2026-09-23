import { WORLD_CHUNK_MEDIA, type WorldChunkMedium } from '@orchard/sim/world-chunk';
import type { MapBiomeId, MapFeatureKind, MapSurfaceKind } from '@orchard/sim';

export interface ChunkMediumSource {
  readonly biome: MapBiomeId;
  readonly surface?: MapSurfaceKind;
  readonly feature?: MapFeatureKind;
  /** A resolved catalogue role, supplied by the authoring/rule integration. */
  readonly ruleMedium?: WorldChunkMedium;
}
/** Migration categories only: this is not an actor traversal decision or depth measurement. */
export function worldChunkCellMedium(source: ChunkMediumSource): WorldChunkMedium {
  if (source.ruleMedium !== undefined) {
    if (!WORLD_CHUNK_MEDIA.includes(source.ruleMedium)) throw new TypeError('Unknown rule medium');
    return source.ruleMedium;
  }
  if (source.biome === 'lava') return 'lava';
  if (source.biome === 'water') return 'deep_water';
  if (source.biome === 'freshwater' || source.biome === 'oasis_water' || source.biome === 'waterfall'
    || source.feature === 'river' || source.surface === 'water') return 'shallow_water';
  return 'land';
}

import { RULE_MEDIA, type RuleMedium } from './rule-catalogue.js';
import type { MapBiomeId } from './biomes.js';
import type { MapFeatureKind, MapSurfaceKind } from './map-document.js';

export interface TraversalMediumSource {
  readonly biome: MapBiomeId;
  readonly surface?: MapSurfaceKind;
  readonly feature?: MapFeatureKind;
  /** Resolved authored catalogue role; never guessed from sprite identifiers. */
  readonly ruleMedium?: RuleMedium;
}
/** Shared migration classification for runtime, shadow audit and chunk tooling.
 * These categories are not a physical depth measurement or actor capability. */
export function terrainCellMedium(source: TraversalMediumSource): RuleMedium {
  if (source.ruleMedium !== undefined) {
    if (!RULE_MEDIA.includes(source.ruleMedium)) throw new TypeError('Unknown rule medium');
    return source.ruleMedium;
  }
  if (source.biome === 'lava') return 'lava';
  if (source.biome === 'water') return 'deep_water';
  if (source.biome === 'freshwater' || source.biome === 'oasis_water' || source.biome === 'waterfall'
    || source.feature === 'river' || source.surface === 'water') return 'shallow_water';
  return 'land';
}

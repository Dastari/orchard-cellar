import type { GeneratedSurvivalDecoration, MapLandmarkInstance } from '@orchard/sim';
import { authoredMapContentPainterTie, type MapContentLayerRecords } from '@orchard/sim/map-object-records';

/** Resolve the same identities as the decoration producer. Suppressed or
 * offscreen ponds do not count unless their command enters the painter. */
export function protocolPondTies(decorations: readonly (GeneratedSurvivalDecoration & { readonly landmark?: MapLandmarkInstance })[],
  document: MapContentLayerRecords | null): ReadonlySet<string | number> {
  const result = new Set<string | number>();
  for (const decoration of decorations) {
    if (decoration.kind !== 'camp_pond') continue;
    const landmark = decoration.landmark;
    result.add(landmark === undefined ? `decoration:${decoration.id}`
      : document === null ? `landmark:${landmark.id}`
        : authoredMapContentPainterTie(document, landmark.layer, 'landmark', landmark.id));
  }
  return result;
}

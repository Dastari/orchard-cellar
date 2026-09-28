import {
  authoredMapContentPainterTie, runtimeLandmarkCampfirePlans, survivalDecorationBlocksTraversal, survivalDecorationObstacle,
  type CollisionObstacle, type ContentRegistry,
} from '@orchard/sim';
import type { ChunkWindowMapRecords, TopsideMapRecords } from '@orchard/engine/chunk-map-records';
import { isLightEmitterKind } from '@orchard/engine/light-sources';
import { overworldPoiDecorationDepthY } from '@orchard/engine/overworld-art';
import type { RuntimeSurvivalDecoration } from './gameplay-painter-inputs.js';

export type { TopsideMapRecords } from '@orchard/engine/chunk-map-records';

/**
 * Static world S4e, S6: the one place the topside client resolves its authored map content:
 * the render window's chunk records (WorldSource.mapRecords) while the chunk collision serves.
 * Painters, light occluders, the supply cache and the ferry read them; nothing reads a whole map
 * document (S6 removed it from the client). Null while no window serves (the world is updating).
 */
export interface TopsideMapSource {
  mapRecords(registry: ContentRegistry): ChunkWindowMapRecords | undefined;
}

/** The records topside draws from: the chunk window's, or null while none serves. */
export function topsideMapRecords(source: TopsideMapSource, registry: ContentRegistry): TopsideMapRecords | null {
  return source.mapRecords(registry) ?? null;
}

/** True for a chunk window's records. */
export function isChunkMapRecords(records: TopsideMapRecords | null): records is ChunkWindowMapRecords {
  return records !== null && (records as Partial<ChunkWindowMapRecords>).source === 'chunks';
}

/** The topside decorations (unsuppressed) of resolved records; none while no window serves. */
export function topsideDecorationsFor(records: TopsideMapRecords | null): readonly RuntimeSurvivalDecoration[] {
  return isChunkMapRecords(records) ? records.decorations : NO_DECORATIONS;
}
const NO_DECORATIONS: readonly RuntimeSurvivalDecoration[] = Object.freeze([]);

/** A solid topside decoration that casts a light shadow, before its art is sampled. */
export interface TopsideDecorationCaster {
  readonly decoration: RuntimeSurvivalDecoration;
  readonly worldX: number;
  readonly worldY: number;
  readonly obstacle: CollisionObstacle | null;
  readonly tie: string;
  readonly painterFootY: number;
}

const casterCache = new WeakMap<readonly RuntimeSurvivalDecoration[], {
  readonly records: TopsideMapRecords | null; readonly registry: ContentRegistry; readonly spaceId: number;
  readonly casters: readonly TopsideDecorationCaster[];
}>();

/** The topside decorations that occlude light (overworld-main's elevated light
 * occluders add their sprite silhouettes), in decoration order. Retained per
 * decoration list, records, registry and space: a chunk window's are computed
 * ahead of time by a staged prewarm step (S4e), the legacy lists once per revision. */
export function topsideDecorationLightCasters(decorations: readonly RuntimeSurvivalDecoration[], records: TopsideMapRecords | null,
  registry: ContentRegistry, spaceId: number): readonly TopsideDecorationCaster[] {
  const cached = casterCache.get(decorations);
  if (cached !== undefined && cached.records === records && cached.registry === registry && cached.spaceId === spaceId) return cached.casters;
  const casters = decorationLightCasters(decorations, records, registry, spaceId);
  casterCache.set(decorations, { records, registry, spaceId, casters });
  return casters;
}

function decorationLightCasters(decorations: readonly RuntimeSurvivalDecoration[], records: TopsideMapRecords | null,
  registry: ContentRegistry, spaceId: number): readonly TopsideDecorationCaster[] {
  const result: TopsideDecorationCaster[] = [];
  const suppressions = new Set(records?.generatedSuppressions ?? []);
  const landmarkCampfires = new Set(runtimeLandmarkCampfirePlans(registry)
    .filter(plan => plan.spaceId === spaceId).map(plan => plan.runtimeId));
  for (const decoration of decorations) {
    if (suppressions.has(`decoration-${decoration.id}`)) continue;
    if (landmarkCampfires.has(BigInt(decoration.id))) continue;
    if (!survivalDecorationBlocksTraversal(decoration.kind, 'ground', registry)) continue;
    // A pond reserves traversal space, but is below the light plane. Collision
    // is not optical height: water and other floor-level art cast no shadow.
    if (decoration.kind === 'camp_pond') continue;
    // The emitter is the luminous body: do not let its own alpha silhouette
    // terminate its seed. Non-emissive solid props remain occluders.
    if (isLightEmitterKind(decoration.kind)) continue;
    result.push({
      decoration,
      worldX: decoration.tileX * 16 + 8,
      worldY: (decoration.tileY + 1) * 16,
      obstacle: survivalDecorationObstacle(decoration, 'ground', registry),
      tie: decoration.landmark === undefined ? `decoration:${decoration.id}`
        : records === null ? `landmark:${decoration.landmark.id}`
          : authoredMapContentPainterTie(records, decoration.landmark.layer, 'landmark', decoration.landmark.id),
      painterFootY: overworldPoiDecorationDepthY(decoration.kind, (decoration.tileY + 1) * 16),
    });
  }
  return result;
}

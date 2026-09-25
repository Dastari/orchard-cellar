import {
  activeSurvivalLandmarks, authoredMapContentPainterTie, generateSurvivalLandmarkDecorations, generateSurvivalProceduralDecorations,
  mapLandmarkDecoration, runtimeLandmarkCampfirePlans, survivalDecorationBlocksTraversal, survivalDecorationObstacle, TOPSIDE_SPACE_ID,
  type CollisionObstacle, type ContentRegistry, type MapDocumentV3,
} from '@orchard/sim';
import type { ChunkWindowMapRecords, TopsideMapRecords } from '@orchard/engine/chunk-map-records';
import { isLightEmitterKind } from '@orchard/engine/light-sources';
import { overworldPoiDecorationDepthY } from '@orchard/engine/overworld-art';
import type { RuntimeSurvivalDecoration } from './gameplay-painter-inputs.js';

export type { TopsideMapRecords } from '@orchard/engine/chunk-map-records';

/**
 * Static world S4e: the one place the topside client chooses where its authored
 * map content comes from.
 *
 * - Chunk mode `on` while the chunk collision serves: the render window's chunk
 *   records (WorldSource.mapRecords). Painters, light occluders, the supply cache
 *   and the ferry read them; nothing reads the whole map document.
 * - Otherwise (modes off and shadow, `on` before a revision serves, or whenever
 *   the server would serve its compiled map): the legacy live map document and the
 *   generator's procedural decorations, exactly as before S4e. S6b deletes this branch.
 */
export interface TopsideMapSource {
  mapRecords(registry: ContentRegistry): ChunkWindowMapRecords | undefined;
}

/** The records topside draws from: the chunk window's, else the legacy document. */
export function topsideMapRecords(source: TopsideMapSource, registry: ContentRegistry,
  legacyDocument: () => MapDocumentV3 | null): TopsideMapRecords | null {
  return source.mapRecords(registry) ?? legacyDocument();
}

/** True for a chunk window's records (mode `on`), false for the legacy document. */
export function isChunkMapRecords(records: TopsideMapRecords | null): records is ChunkWindowMapRecords {
  return records !== null && (records as Partial<ChunkWindowMapRecords>).source === 'chunks';
}

/** The topside decorations (unsuppressed) of resolved records: the chunk window's,
 * else the legacy composition over the document. */
export function topsideDecorationsFor(records: TopsideMapRecords | null, seed: number, registry: ContentRegistry,
  legacyDocument: () => MapDocumentV3 | null): readonly RuntimeSurvivalDecoration[] {
  return isChunkMapRecords(records) ? records.decorations : legacyTopsideDecorations(legacyDocument(), seed, registry);
}

const legacyDecorationCache = new WeakMap<MapDocumentV3, Map<number, readonly RuntimeSurvivalDecoration[]>>();

/** The pre-S4e composition: the procedural decorations plus the document's enabled
 * landmarks (or, without a document, the registry's landmark decorations). */
export function legacyTopsideDecorations(document: MapDocumentV3 | null, seed: number,
  registry: ContentRegistry): readonly RuntimeSurvivalDecoration[] {
  if (document === null) return Object.freeze([
    ...generateSurvivalProceduralDecorations(seed, registry),
    ...generateSurvivalLandmarkDecorations(activeSurvivalLandmarks(registry, TOPSIDE_SPACE_ID)),
  ]);
  const bySeed = legacyDecorationCache.get(document) ?? new Map();
  const cached = bySeed.get(seed);
  if (cached !== undefined) return cached;
  const decorations = Object.freeze([
    ...generateSurvivalProceduralDecorations(seed, registry),
    ...document.landmarks
      .filter((landmark) => landmark.enabled)
      .map((landmark) => ({ ...mapLandmarkDecoration(landmark), landmark })),
  ]);
  bySeed.set(seed, decorations);
  legacyDecorationCache.set(document, bySeed);
  return decorations;
}

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

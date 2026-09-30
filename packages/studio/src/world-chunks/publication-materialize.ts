/**
 * The heavy half of a Studio chunk publication (static world S7b-3): predict the head the server
 * commits and materialise and verify its chunks. Runs in `publication.worker.ts`; kept out of the
 * main Studio bundle.
 */
import {
  activeSurvivalLandmarks, bootstrapContentRegistry, buildContentRegistry, liveMapHeadSource, parseMapDocumentV3, TOPSIDE_SPACE_ID,
  type ContentDefinitionRow, type ContentRegistry, type MapDocumentV3,
} from '@orchard/sim';
import { canonicalChunkJson, worldChunkHash } from '@orchard/sim/world-chunk';
import type { LiveMapDocumentRow } from '@orchard/engine/live-map-runtime';
import { prepareLiveMapPublication } from '../../../world/src/live-map-publication.js';
import { assertMapRecordsReach, captureWorldChunkSnapshot, materializeWorldChunks, verifyWorldChunkParity } from './materialize.js';
import {
  LIVE_ISLAND_PUBLICATION_MAP_ID, type LiveMapPublicationInput, type LiveMapPublicationPhase, type MaterializedLiveMapPublication,
} from './publication.js';

export function publicationRegistry(contentRows: readonly ContentDefinitionRow[] | null): ContentRegistry {
  if (contentRows === null) return bootstrapContentRegistry();
  const built = buildContentRegistry([...contentRows]);
  if (!built.report.valid) throw new Error('live_content_registry_invalid');
  return built.registry;
}

/**
 * The head `publishLiveMapWithChunks` commits for this edit, derived exactly as the server derives it:
 * `prepareLiveMapPublication` over the head parsed with the active topside landmarks, the previous
 * combat policy kept when the edit leaves it unspecified (`commitLiveMapSnapshot`), then
 * `liveMapHeadSource` at the next revision.
 */
export function predictLiveMapHead(input: Pick<LiveMapPublicationInput, 'head' | 'deltaJson' | 'expectedRevision' | 'clientMutationId'>,
  registry: ContentRegistry): LiveMapDocumentRow {
  if (input.head.revision !== input.expectedRevision) throw new Error('live_map_revision_conflict');
  const landmarks = activeSurvivalLandmarks(registry, TOPSIDE_SPACE_ID);
  const previous = parseMapDocumentV3(input.head.documentJson, landmarks);
  let document: MapDocumentV3 | null = prepareLiveMapPublication(input.deltaJson, input.expectedRevision, input.clientMutationId,
    () => ({ revision: input.head.revision, clientMutationId: '', document: previous }),
    json => parseMapDocumentV3(json, landmarks));
  if (document === null) throw new Error('live_map_publication_unchanged');
  if (document.id !== LIVE_ISLAND_PUBLICATION_MAP_ID) throw new Error('live_map_id_mismatch');
  if (document.combatRegions === undefined && previous.combatRegions !== undefined) document = { ...document, combatRegions: previous.combatRegions };
  const head = liveMapHeadSource(document, input.expectedRevision + 1);
  return { mapId: LIVE_ISLAND_PUBLICATION_MAP_ID, revision: input.expectedRevision + 1, documentJson: head.documentJson, contentHash: head.contentHash };
}

/**
 * Materialise and verify the chunk publication for this edit: one materialisation (with the S7a
 * authored-document extension, so Studio can read the map back from the chunks) and one full
 * parity check against the server reference. Throws rather than return an unverified publication.
 */
export function materializeLiveMapPublication(input: LiveMapPublicationInput,
  onPhase: (phase: LiveMapPublicationPhase) => void = () => undefined): MaterializedLiveMapPublication {
  onPhase('predicting');
  const registry = publicationRegistry(input.contentRows);
  const row = predictLiveMapHead(input, registry);
  assertMapRecordsReach(row, registry);
  const atlasIndex = JSON.parse(input.atlasIndexSource) as { readonly assetPacks?: Readonly<Record<string, unknown>> };
  const atlasPackIdsForAssets = (assetIds: readonly string[]): readonly string[] => assetIds.map(id => {
    const pack = atlasIndex.assetPacks?.[id];
    if (typeof pack !== 'string') throw new Error(`Atlas index has no pack for ${id}`);
    return pack;
  });
  const assetRevision = worldChunkHash(new TextEncoder().encode(input.atlasIndexSource));
  onPhase('materialising');
  const snapshot = captureWorldChunkSnapshot(row, registry);
  const result = materializeWorldChunks(snapshot, row, registry, { atlasPackIdsForAssets, assetRevision, includeAuthoredDocument: true });
  onPhase('verifying');
  verifyWorldChunkParity(snapshot, result);
  return {
    row,
    manifestJson: canonicalChunkJson(result.manifest) + '\n',
    registryContentHash: registry.contentHash,
    blobs: result.blobs.map((bytes, index) => ({ contentHash: result.manifest.chunks[index]!.contentHash, bytes })),
  };
}


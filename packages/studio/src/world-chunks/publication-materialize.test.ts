import { describe, expect, it } from 'vitest';
import {
  activeSurvivalLandmarks, bootstrapContentRegistry, createLiveIslandMapDocument, createMapDocumentDelta, liveMapHeadSource, parseMapDocumentV3,
  TOPSIDE_SPACE_ID,
} from '@orchard/sim';
import { validateRuntimeManifest, verifyRuntimeChunk } from '@orchard/sim/chunk-runtime';
import { manifestCarriesAuthoredDocument } from '@orchard/sim/world-chunk-document';
import { validateShadowPublication } from '../../../world/src/content/chunk-shadow-runtime.js';
import type { LiveMapPublicationPhase } from './publication.js';
import { materializeLiveMapPublication } from './publication-materialize.js';
import { captureWorldChunkSnapshot, materializeWorldChunks } from './materialize.js';
import { loadChunkMapHead } from './map-head.js';

/** Nightly (whole island, tens of seconds): what Studio publishes is what the atomic reducer accepts. */
describe('Studio chunk publication materialisation (static world S7b-3)', () => {
  it('pins the manifest to the predicted head, carries the authored document, passes the reducer checks and reads back', async () => {
    const registry = bootstrapContentRegistry();
    const landmarks = activeSurvivalLandmarks(registry, TOPSIDE_SPACE_ID);
    const head = liveMapHeadSource(createLiveIslandMapDocument({ landmarks }), 2);
    const base = parseMapDocumentV3(head.documentJson, landmarks);
    const edited = { ...base, generatedSuppressions: [...base.generatedSuppressions, 'resource-1'] };
    // Every asset the island's chunks reference, in one pack (the served index is generated, not in the checkout).
    const assetIds = new Set<string>();
    const recordRow = { mapId: 'live-island', revision: 2, documentJson: head.documentJson, contentHash: head.contentHash };
    materializeWorldChunks(captureWorldChunkSnapshot(recordRow, registry), recordRow, registry,
      { atlasPackIdsForAssets: ids => (ids.forEach(id => assetIds.add(id)), []) });
    const atlasIndexSource = JSON.stringify({ assetPacks: Object.fromEntries([...assetIds].map(id => [id, 'pack-all'])) });
    const phases: LiveMapPublicationPhase[] = [];
    const publication = materializeLiveMapPublication({
      head: { revision: 2, documentJson: head.documentJson }, deltaJson: JSON.stringify(createMapDocumentDelta(base, edited)),
      expectedRevision: 2, clientMutationId: 'm-1', contentRows: null, atlasIndexSource,
    }, phase => phases.push(phase));
    expect(phases).toEqual(['predicting', 'materialising', 'verifying']);
    const expected = liveMapHeadSource(edited, 3);
    expect(publication.row).toMatchObject({ revision: 3, contentHash: expected.contentHash });
    const manifest = validateRuntimeManifest(JSON.parse(publication.manifestJson));
    expect([manifest.sourceRevision, manifest.sourceHash]).toEqual([3, expected.contentHash]);
    expect(manifestCarriesAuthoredDocument(manifest)).toBe(true);
    const blobs = new Map(publication.blobs.map(blob => [blob.contentHash, blob.bytes]));
    for (const chunk of manifest.chunks) verifyRuntimeChunk(blobs.get(chunk.contentHash)!, manifest, chunk.cx, chunk.cy);
    // S7b-4: Studio reads the published map back from exactly these chunks.
    const readBack = await loadChunkMapHead('live-island', publication.manifestJson, async entry => blobs.get(entry.contentHash)!);
    expect(readBack).toEqual({ mapId: 'live-island', revision: 3, contentHash: expected.contentHash, documentJson: publication.row.documentJson });
    expect(() => validateShadowPublication({ manifestJson: publication.manifestJson, contentHash: publication.registryContentHash, expectedRevision: 0 },
      { mapRevision: 3, mapHash: expected.contentHash, contentHash: registry.contentHash, shadowRevision: 0 }, hash => blobs.get(hash))).not.toThrow();
  }, 300_000);
});

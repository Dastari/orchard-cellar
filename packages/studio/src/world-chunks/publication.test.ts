import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  activeSurvivalLandmarks, bootstrapContentRegistry, createLiveIslandMapDocument, createMapDocumentDelta, liveMapHeadSource, mapDocumentSemanticHash,
  parseMapDocumentV3, TOPSIDE_SPACE_ID,
} from '@orchard/sim';
import { publishLiveMapWithChunks, type LiveMapPublicationPort, type LiveMapPublicationProgress } from './publication.js';
import { predictLiveMapHead } from './publication-materialize.js';

const registry = bootstrapContentRegistry();
const landmarks = activeSurvivalLandmarks(registry, TOPSIDE_SPACE_ID);
const head = liveMapHeadSource(createLiveIslandMapDocument({ landmarks }), 4);
const base = parseMapDocumentV3(head.documentJson, landmarks);
const edited = { ...base, generatedSuppressions: [...base.generatedSuppressions, 'resource-1'] };
const deltaJson = JSON.stringify(createMapDocumentDelta(base, edited));
const request = { head: { revision: 4, documentJson: head.documentJson }, deltaJson, expectedRevision: 4, clientMutationId: 'm-1', contentRows: null };

describe('Studio chunk publication (static world S7b-3)', () => {
  it('predicts the head the server commits for the edit: the next revision of the edited document', () => {
    const row = predictLiveMapHead(request, registry);
    const expected = liveMapHeadSource(edited, 5);
    expect(row).toEqual({ mapId: 'live-island', revision: 5, documentJson: expected.documentJson, contentHash: expected.contentHash });
    expect(mapDocumentSemanticHash(parseMapDocumentV3(row.documentJson, landmarks))).toBe(mapDocumentSemanticHash(edited));
    expect(() => predictLiveMapHead({ ...request, expectedRevision: 3 }, registry)).toThrow('live_map_revision_conflict');
  });

  it('carries the combat policy through an edit that does not touch it (a delta cannot drop it)', () => {
    const regions = [{ id: 'r1', spaceId: TOPSIDE_SPACE_ID, policy: 'sanctuary' as const, minX: 10, minY: 10, maxX: 20, maxY: 20 }];
    const withPolicy = liveMapHeadSource({ ...base, combatRegions: regions }, 4);
    const policyBase = parseMapDocumentV3(withPolicy.documentJson, landmarks);
    const target = { ...policyBase, generatedSuppressions: [...policyBase.generatedSuppressions, 'resource-2'] };
    const row = predictLiveMapHead({ ...request, head: { revision: 4, documentJson: withPolicy.documentJson },
      deltaJson: JSON.stringify(createMapDocumentDelta(policyBase, target)) }, registry);
    expect(parseMapDocumentV3(row.documentJson, landmarks).combatRegions).toEqual(regions);
  });

  it('mirrors the server commit it predicts (pinned source)', () => {
    const index = readFileSync(new URL('../../../world/src/index.ts', import.meta.url), 'utf8');
    const commit = index.slice(index.indexOf('function commitLiveMapSnapshot('), index.indexOf('function isAuthoredLandmarkPlaceable('));
    expect(commit).toContain('if (preserveUnspecifiedPolicy && document.combatRegions === undefined && existing !== null) {');
    expect(commit).toContain('const { document: canonical, documentJson, contentHash } = liveMapHeadSource(document, revision);');
    const reducer = index.slice(index.indexOf('export const publishLiveMapWithChunks'), index.indexOf('export const adminMoveHomestead ='));
    expect(reducer).toContain('commitLiveMapSnapshot(ctx, document, input.expectedRevision, input.clientMutationId, true, commitChunks)');
    const prepared = index.slice(index.indexOf('function preparedLiveMapPublication('), index.indexOf('export const publishLiveMapWithChunks'));
    expect(prepared).toContain('mapId === LIVE_ISLAND_MAP_ID ? activeTopsideLandmarks(ctx) : undefined');
  });

  it('stages only the blobs the current publication lacks, once each, then commits map and chunks together', async () => {
    const blob = (hash: string) => ({ contentHash: hash, bytes: new TextEncoder().encode(hash) });
    const staged: string[] = [];
    const commit = vi.fn(async () => undefined);
    const port: LiveMapPublicationPort = {
      publishedChunks: async () => ({ revision: 7, contentHashes: new Set(['a', 'b']), assetRevision: 'art-1' }),
      atlasIndex: async () => '{"assetPacks":{}}',
      assetRevisionOf: () => 'art-1',
      materialize: async (input, onPhase) => {
        expect(input.atlasIndexSource).toBe('{"assetPacks":{}}');
        onPhase('materialising'); onPhase('verifying');
        return { row: { mapId: 'live-island', revision: 5, documentJson: '{}', contentHash: 'h' }, manifestJson: 'manifest\n', registryContentHash: 'content-1',
          blobs: [blob('a'), blob('c'), blob('b'), blob('c'), blob('d')] };
      },
      stageBlob: async bytes => { staged.push(new TextDecoder().decode(bytes)); },
      commit,
    };
    const progress: LiveMapPublicationProgress[] = [];
    await publishLiveMapWithChunks(request, port, value => progress.push(value));
    expect(staged).toEqual(['c', 'd']);
    expect(commit).toHaveBeenCalledWith({ mapId: 'live-island', expectedRevision: 4, documentJson: deltaJson, clientMutationId: 'm-1',
      manifestJson: 'manifest\n', contentHash: 'content-1', expectedChunkRevision: 7 });
    expect(progress.map(({ phase, done }) => done === undefined ? phase : `${phase}:${done}`)).toEqual(
      ['predicting', 'materialising', 'verifying', 'uploading:0', 'uploading:1', 'uploading:2', 'committing']);
  });

  it('commits nothing when a stage fails', async () => {
    const commit = vi.fn(async () => undefined);
    await expect(publishLiveMapWithChunks(request, {
      publishedChunks: async () => ({ revision: 0, contentHashes: new Set(), assetRevision: null }), atlasIndex: async () => '{}', assetRevisionOf: () => 'x',
      materialize: async () => ({ row: { mapId: 'live-island', revision: 5, documentJson: '{}', contentHash: 'h' }, manifestJson: 'm', registryContentHash: 'c',
        blobs: [{ contentHash: 'x', bytes: new Uint8Array(1) }] }),
      stageBlob: async () => { throw new Error('chunk_blob_too_large'); }, commit,
    })).rejects.toThrow('chunk_blob_too_large');
    expect(commit).not.toHaveBeenCalled();
  });

  it('refuses before building when the served art is not the live publication\'s (the release lane republishes first)', async () => {
    const materialize = vi.fn();
    await expect(publishLiveMapWithChunks(request, {
      publishedChunks: async () => ({ revision: 3, contentHashes: new Set(), assetRevision: 'art-1' }), atlasIndex: async () => '{}',
      assetRevisionOf: () => 'art-2', materialize, stageBlob: async () => undefined, commit: async () => undefined,
    })).rejects.toThrow('chunk_asset_revision_changed');
    expect(materialize).not.toHaveBeenCalled();
  });
});

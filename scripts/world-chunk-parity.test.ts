import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { activeSurvivalLandmarks, bootstrapContentRegistry, createLiveIslandMapDocument, LIVE_ISLAND_MAP_ID, serializeMapDocumentV3, TOPSIDE_SPACE_ID } from '@orchard/sim';
import { canonicalChunkJson, worldChunkHash } from '@orchard/sim/world-chunk';
import { captureWorldChunkSnapshot, materializeWorldChunks, verifyWorldChunkParity } from './materialize-world-chunks.js';

describe('static island materialization golden parity', () => {
  it('reconstructs every seed/bootstrap channel, server collision and ordered record from 13×13 chunks', () => {
    const registry = bootstrapContentRegistry();
    const document = createLiveIslandMapDocument({ landmarks: activeSurvivalLandmarks(registry, TOPSIDE_SPACE_ID) });
    const row = { mapId: LIVE_ISLAND_MAP_ID, revision: document.revision, contentHash: 'bootstrap-golden', documentJson: serializeMapDocumentV3(document) };
    const snapshot = captureWorldChunkSnapshot(row, registry);
    const result = materializeWorldChunks(snapshot, row, registry, { includeServerOracle: true });
    expect(result.blobs).toHaveLength(169);
    verifyWorldChunkParity(snapshot, result);
    const goldens = JSON.parse(readFileSync(new URL('./world-chunk-goldens.json', import.meta.url), 'utf8')) as Record<string, string>;
    for (const [name, values] of Object.entries(snapshot.channels)) {
      expect(worldChunkHash(new Uint8Array(values.buffer, values.byteOffset, values.byteLength)), name).toBe(goldens[name]);
    }
    expect(worldChunkHash(new TextEncoder().encode(canonicalChunkJson(snapshot.records))), 'ordered records').toBe(goldens['records']);
  }, 120_000);
});

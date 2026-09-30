import { describe, expect, it } from 'vitest';
import { runtimeChunkFixture } from '@orchard/sim/chunk-runtime-fixture';
import { canonicalChunkJson } from '@orchard/sim/world-chunk';
import { chunkPublicationCarriesMap, loadChunkMapHead } from './map-head.js';

describe('Studio map head from chunks (static world S7b-4)', () => {
  it('reads only publications that carry the authored document', async () => {
    const { manifest, blobs } = runtimeChunkFixture();
    const manifestJson = canonicalChunkJson(manifest);
    expect(chunkPublicationCarriesMap(manifestJson)).toBe(false);
    expect(chunkPublicationCarriesMap('not json')).toBe(false);
    await expect(loadChunkMapHead('live-island', manifestJson, async () => blobs[0]!)).rejects.toThrow('chunk_map_document_missing');
  });
});

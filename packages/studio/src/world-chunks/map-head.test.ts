import { describe, expect, it, vi } from 'vitest';
import { runtimeChunkFixture } from '@orchard/sim/chunk-runtime-fixture';
import { canonicalChunkJson } from '@orchard/sim/world-chunk';
import { chunkHistoryFixture } from '../../../world/src/live-map-chunk-history.fixture.js';
import { chunkPublicationCarriesMap, loadChunkMapHead } from './map-head.js';

describe('Studio map head from chunks (static world S7b-4)', () => {
  it('rebuilds only verified chunk data, and aborts obsolete head reads', async () => {
    const fixture = chunkHistoryFixture();
    const read = vi.fn(async (head: { contentHash: string }) => fixture.blobs.get(head.contentHash)!);
    expect(await loadChunkMapHead('live-island', fixture.manifestJson, read)).toMatchObject({ revision: 7, contentHash: fixture.head.contentHash });
    const cancelled = new AbortController(); cancelled.abort();
    read.mockClear();
    await expect(loadChunkMapHead('live-island', fixture.manifestJson, read, 8, cancelled.signal)).rejects.toThrow('cancelled');
    expect(read).not.toHaveBeenCalled();
  });

  it('aborts sibling reads after a transient reader rejection so the same head can be retried', async () => {
    const fixture = chunkHistoryFixture();
    let failedSignal: AbortSignal | undefined;
    const reader = vi.fn().mockImplementationOnce(async (_head, signal?: AbortSignal) => { failedSignal = signal; throw new Error('transient'); })
      .mockImplementation(async (head: { contentHash: string }) => fixture.blobs.get(head.contentHash)!);
    await expect(loadChunkMapHead('live-island', fixture.manifestJson, reader)).rejects.toThrow('transient');
    expect(failedSignal?.aborted).toBe(true);
    expect(await loadChunkMapHead('live-island', fixture.manifestJson, reader)).toMatchObject({ revision: 7 });
  });

  it('reads only publications that carry the authored document', async () => {
    const { manifest, blobs } = runtimeChunkFixture();
    const manifestJson = canonicalChunkJson(manifest);
    expect(chunkPublicationCarriesMap(manifestJson)).toBe(false);
    expect(chunkPublicationCarriesMap('not json')).toBe(false);
    await expect(loadChunkMapHead('live-island', manifestJson, async () => blobs[0]!)).rejects.toThrow('chunk_map_document_missing');
  });
});

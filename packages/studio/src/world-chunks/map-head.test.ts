import { describe, expect, it, vi } from 'vitest';
import { runtimeChunkFixture } from '@orchard/sim/chunk-runtime-fixture';
import { createEmptyMapDocument, migrateMapDocumentV2 } from '@orchard/sim';
import { canonicalChunkJson, decodeWorldChunk, encodeWorldChunk, WORLD_CHUNK_STRIDE } from '@orchard/sim/world-chunk';
import { chunkHistoryFixture } from '../../../world/src/live-map-chunk-history.fixture.js';
import { chunkPublicationCarriesMap, loadChunkMapHead, type ChunkMapLoadState } from './map-head.js';

/** Genuine authored bytes with two coordinates, without the terrain compiler. */
function twoChunkFixture() {
  const document = { ...migrateMapDocumentV2(createEmptyMapDocument({ id: 'live-island', title: 'Retry', width: 128, height: 64 })), landmarks: [], cells: { '1,2': { elevation: 1 as const, collision: 'force_block' as const } } };
  const fixture = chunkHistoryFixture(7, document);
  const second = encodeWorldChunk({ schema: 1, mediumSchema: 1, spaceId: 0, cx: 1, cy: 0, assetRevision: 'assets',
    arrays: { biomes: new Uint8Array(WORLD_CHUNK_STRIDE ** 2), medium: new Uint8Array(WORLD_CHUNK_STRIDE ** 2), solidBlocked: new Uint8Array(WORLD_CHUNK_STRIDE ** 2) },
    records: [], assetIds: [], atlasPackIds: [], documentSchema: 1, documentCells: { palette: [], cells: [] } });
  const contentHash = decodeWorldChunk(second).contentHash;
  fixture.blobs.set(contentHash, second);
  const manifest = { ...fixture.manifest, width: 128, chunks: [...fixture.manifest.chunks, { cx: 1, cy: 0, contentHash, byteLength: second.byteLength }] };
  return { ...fixture, manifestJson: canonicalChunkJson(manifest) };
}

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

  it('retains verified successes through a 429 retry without downloading them again', async () => {
    const fixture = twoChunkFixture();
    const state: ChunkMapLoadState = { verifiedBlobs: new Map(), onProgress: vi.fn() };
    const reader = vi.fn(async (head: { contentHash: string; cx: number }) => {
      if (head.cx === 1 && reader.mock.calls.filter(([row]) => row.cx === 1).length === 1) throw new Error('chunk_fetch_429');
      return fixture.blobs.get(head.contentHash)!;
    });
    await expect(loadChunkMapHead('live-island', fixture.manifestJson, reader, 1, undefined, state)).rejects.toThrow('429');
    expect(state.verifiedBlobs.size).toBe(1);
    expect(await loadChunkMapHead('live-island', fixture.manifestJson, reader, 1, undefined, state)).toMatchObject({ contentHash: fixture.head.contentHash });
    expect(reader.mock.calls.map(([head]) => head.cx)).toEqual([0, 1, 1]);
    expect(state.onProgress).toHaveBeenLastCalledWith({ verifiedChunks: 2, totalChunks: 2 });
    expect(state.verifiedBlobs.values().next().value).not.toBe(fixture.blobs.values().next().value);
  });

  it('rejects and drops corrupt retained bytes, and never retains corrupt reader bytes', async () => {
    const fixture = chunkHistoryFixture();
    const head = fixture.manifest.chunks[0]!;
    const state: ChunkMapLoadState = { verifiedBlobs: new Map() };
    const invalid = fixture.blobs.get(head.contentHash)!.slice(); invalid[44] = invalid[44]! ^ 1;
    await expect(loadChunkMapHead('live-island', fixture.manifestJson, async () => invalid, 1, undefined, state)).rejects.toThrow();
    expect(state.verifiedBlobs.size).toBe(0);
    state.verifiedBlobs.set(head.contentHash, invalid);
    const read = vi.fn(async () => fixture.blobs.get(head.contentHash)!);
    await expect(loadChunkMapHead('live-island', fixture.manifestJson, read, 1, undefined, state)).rejects.toThrow();
    expect(read).not.toHaveBeenCalled(); expect(state.verifiedBlobs.size).toBe(0);
    expect(await loadChunkMapHead('live-island', fixture.manifestJson, read, 1, undefined, state)).toMatchObject({ revision: 7 });
  });

  it('does not retain late sibling successes or report progress after cancellation', async () => {
    const fixture = twoChunkFixture();
    let finish: ((bytes: Uint8Array) => void) | undefined;
    const state: ChunkMapLoadState = { verifiedBlobs: new Map(), onProgress: vi.fn() };
    const read = vi.fn(async (head: { contentHash: string; cx: number }) => {
      if (head.cx === 0) throw new Error('chunk_fetch_429');
      return new Promise<Uint8Array>(resolve => { finish = resolve; });
    });
    await expect(loadChunkMapHead('live-island', fixture.manifestJson, read, 8, undefined, state)).rejects.toThrow('429');
    finish!(fixture.blobs.get([...fixture.blobs.keys()][1]!)!);
    await Promise.resolve(); await Promise.resolve();
    expect(state.verifiedBlobs.size).toBe(0);
    expect(state.onProgress).toHaveBeenCalledTimes(1);
  });

  it('reads only publications that carry the authored document', async () => {
    const { manifest, blobs } = runtimeChunkFixture();
    const manifestJson = canonicalChunkJson(manifest);
    expect(chunkPublicationCarriesMap(manifestJson)).toBe(false);
    expect(chunkPublicationCarriesMap('not json')).toBe(false);
    await expect(loadChunkMapHead('live-island', manifestJson, async () => blobs[0]!)).rejects.toThrow('chunk_map_document_missing');
  });
});

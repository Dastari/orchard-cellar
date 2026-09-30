import { describe, expect, it, vi } from 'vitest';
import { chunkHistoryFixture } from '../packages/world/src/live-map-chunk-history.fixture.js';
import { allHistoryRows, runHistory } from './world-chunks-history.js';
import type { HistoryWorldPort, OriginPort } from './world-chunks-publish.js';

function fixture() {
  const publication = chunkHistoryFixture();
  let archived = false;
  let copy = true;
  const row = () => ({ id: '1', mapId: 'live-island', revision: 7, contentHash: publication.head.contentHash, hasDocumentCopy: copy, archived });
  const world: HistoryWorldPort = {
    listHistory: vi.fn(async () => ({ rows: [row()], more: false })),
    readHistory: vi.fn(async () => ({ ...publication.head, manifestHash: '' })),
    read: () => ({ mapRow: publication.head, contentHead: null, contentRows: null, shadow: null, heads: [] }),
    stageBlob: vi.fn(async () => {}), readBlob: async () => [...publication.blobs.values()][0]!,
    publishShadow: vi.fn(async () => {}), settle: async () => world.read(),
    suspend: vi.fn(async () => {}), resume: vi.fn(async () => {}),
    backfillHistory: vi.fn(async () => { archived = true; copy = false; }),
    verifyHistory: vi.fn(async () => ({ id: '1', revision: 7, hasDocumentCopy: copy, manifestHash: 'verified' })),
  };
  const origin: OriginPort = { origin: 'http://127.0.0.1:9999', atlasIndex: async () => new Uint8Array([1, 2, 3]),
    blob: async () => { throw new Error('unexpected_http_blob_read'); } };
  const materialize = vi.fn(async () => ({ manifest: publication.manifest, manifestJson: publication.manifestJson,
    registryContentHash: 'registry', blobs: [...publication.blobs].map(([contentHash, bytes]) => ({ cx: 0, cy: 0, contentHash, bytes })) }));
  return { world, origin, materialize, database: 'disposable-history', publication };
}

describe('S7c history operations', () => {
  it('follows every page and fails closed if a cursor stops advancing', async () => {
    const deps = fixture();
    const first = (await deps.world.listHistory(0n, 100)).rows[0]!;
    const listHistory = vi.fn().mockResolvedValueOnce({ rows: [first], more: true })
      .mockResolvedValueOnce({ rows: [{ ...first, id: '2' }], more: false });
    expect(await allHistoryRows({ listHistory })).toHaveLength(2);
    expect(listHistory).toHaveBeenLastCalledWith(1n, 100);
    await expect(allHistoryRows({ listHistory: async () => ({ rows: [first], more: true }) })).rejects.toThrow('not_advancing');
    await expect(allHistoryRows({ listHistory: async () => ({ rows: [], more: true }) })).rejects.toThrow('incomplete');
  });

  it('plans without materializing/staging and refuses any unconfirmed write', async () => {
    const deps = fixture();
    const report = await runHistory('plan', deps);
    expect(report).toMatchObject({ rows: 1, processed: ['1'], confirmation: expect.stringMatching(/^history:[a-f0-9]{64}:disposable-history$/u) });
    expect(deps.materialize).not.toHaveBeenCalled();
    expect(deps.world.stageBlob).not.toHaveBeenCalled();
    await expect(runHistory('backfill', deps)).rejects.toThrow('confirmation_required');
    expect(deps.world.backfillHistory).not.toHaveBeenCalled();
  });

  it('reconnects after materialization, verifies before staging, archives and proves the document copy retired', async () => {
    const deps = fixture();
    const plan = await runHistory('plan', deps);
    expect(await runHistory('backfill', { ...deps, confirmation: plan.confirmation! })).toMatchObject({ rows: 1, processed: ['1'] });
    expect(deps.world.suspend).toHaveBeenCalledOnce();
    expect(deps.world.resume).toHaveBeenCalledOnce();
    expect(deps.world.stageBlob).toHaveBeenCalledOnce();
    expect(deps.world.backfillHistory).toHaveBeenCalledWith(expect.objectContaining({ revisionId: 1n, expectedManifestHash: '', registryContentHash: 'registry' }));
    expect(await runHistory('check', deps)).toMatchObject({ processed: ['1'] });
  });

  it('refuses a wrong reconstructed document without touching staging/history and resumes after materializer failure', async () => {
    const deps = fixture();
    const plan = await runHistory('plan', deps);
    const bad = { ...deps, confirmation: plan.confirmation!, materialize: async () => { throw new Error('materializer_failed'); } };
    await expect(runHistory('backfill', bad)).rejects.toThrow('materializer_failed');
    expect(deps.world.resume).toHaveBeenCalledOnce();
    expect(deps.world.stageBlob).not.toHaveBeenCalled();
    const tampered = { ...deps, confirmation: plan.confirmation!, materialize: async () => {
      const candidate = await deps.materialize();
      return { ...candidate, manifestJson: JSON.stringify({ ...candidate.manifest, sourceHash: 'tampered' }) };
    } };
    await expect(runHistory('backfill', tampered)).rejects.toThrow('head_mismatch');
    expect(deps.world.backfillHistory).not.toHaveBeenCalled();
  });

  it('requires complete archived history for check and an explicit revision for rematerialization', async () => {
    const deps = fixture();
    await expect(runHistory('check', deps)).rejects.toThrow('incomplete:1');
    await expect(runHistory('check', { ...deps, world: { ...deps.world,
      listHistory: async () => ({ rows: [], more: false }) } })).rejects.toThrow('chunk_history_empty');
    await expect(runHistory('rematerialize', deps)).rejects.toThrow('requires_revision');
    await expect(runHistory('plan', { ...deps, revisionId: 8n })).rejects.toThrow('not_found');
  });
});

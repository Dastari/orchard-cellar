import { describe, expect, it, vi } from 'vitest';
import { chunkHistoryFixture } from '../packages/world/src/live-map-chunk-history.fixture.js';
import { allHistoryRows, historyTokenProvider, runHistory } from './world-chunks-history.js';
import type { HistoryWorldPort, OriginPort } from './world-chunks-publish.js';
import { PipelineError } from './world-chunks-publish.js';
import { historyFailure, type HistoryPhaseEvent } from './static-map-history-diagnostics.js';

function fixture() {
  const publication = chunkHistoryFixture();
  let archived = false;
  let copy = true;
  const row = () => ({ id: '1', mapId: 'live-island', revision: 7, contentHash: publication.head.contentHash, hasDocumentCopy: copy, archived });
  const world: HistoryWorldPort = {
    historyCopyStatus: async () => ({historyCopies:copy?1:0,missingArchives:archived?0:1,auditCopies:0,previewCopies:0}),
    retireAuditDocuments: vi.fn(async()=>{}),
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
  it('retries the tokenless locked validation checkpoint without blindly refreshing', async () => {
    const read=vi.fn().mockRejectedValueOnce(new Error('token_file_token_missing_refresh_first')).mockResolvedValue('opaque-fresh');
    const refresh=vi.fn();const wait=vi.fn(async()=>{});
    expect(await historyTokenProvider('/private/file','operator',{read,refresh,wait})()).toBe('opaque-fresh');
    expect(wait).toHaveBeenCalledOnce();expect(refresh).not.toHaveBeenCalled();
    await expect(historyTokenProvider('/private/file','operator',{read:async()=>{throw new Error('wrong_permissions');},wait})()).rejects.toThrow('wrong_permissions');
  });

  it('uses the latest locked keepalive checkpoint for each reconnect in a multi-row backfill', async () => {
    const deps = fixture();const second = chunkHistoryFixture(8);
    const rows = [deps.publication, second].map((publication,index) => ({ id: String(index+1), mapId:'live-island',
      revision:publication.head.revision, contentHash:publication.head.contentHash, hasDocumentCopy:true, archived:false }));
    let currentToken = `e30.${Buffer.from(JSON.stringify({exp:1000})).toString('base64url')}.first`;
    const read = vi.fn(async () => currentToken);const refresh = vi.fn();
    const provider = historyTokenProvider('/private/tokens.json','operator',{read,refresh,now:()=>0});
    const connected: string[] = [await provider()];
    const world = {...deps.world,listHistory:async () => ({rows,more:false}),
      readHistory:async (id:bigint) => ({...(id===1n?deps.publication:second).head,manifestHash:''}),
      resume:async () => {connected.push(await provider());},
      verifyHistory:async (id:bigint) => ({id:String(id),revision:id===1n?7:8,hasDocumentCopy:false,manifestHash:'verified'})};
    const materialize = async ({mapRow}:Parameters<typeof runHistory>[1]['materialize'] extends (input:infer I)=>unknown?I:never) => {
      currentToken = `e30.${Buffer.from(JSON.stringify({exp:1000})).toString('base64url')}.row${mapRow.revision}`;
      const publication = mapRow.revision===7?deps.publication:second;
      return {manifest:publication.manifest,manifestJson:publication.manifestJson,registryContentHash:'registry',
        blobs:[...publication.blobs].map(([contentHash,bytes])=>({cx:0,cy:0,contentHash,bytes}))};
    };
    const plan = await runHistory('plan',{...deps,world});
    await runHistory('backfill',{...deps,world,materialize,confirmation:plan.confirmation!});
    expect(connected.map(token=>token.split('.').at(-1))).toEqual(['first','row7','row8']);
    expect(refresh).not.toHaveBeenCalled();expect(read).toHaveBeenCalledTimes(3);
  });
  it('rotates near-expiry credentials through the shared refresh path', async () => {
    const expired=`e30.${Buffer.from(JSON.stringify({exp:1})).toString('base64url')}.test`;
    const refresh=vi.fn(async()=>[{label:'operator',token:'rotated'}]);
    expect(await historyTokenProvider('/private/file','operator',{read:async()=>expired,refresh,now:()=>1000})()).toBe('rotated');
    expect(refresh).toHaveBeenCalledWith('/private/file');
  });
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
    await expect(runHistory('backfill', bad)).rejects.toMatchObject({ failure: { phase: 'history-materialize', code: 'static_history_rehearsal_failed' } });
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
    await expect(runHistory('check', deps)).rejects.toMatchObject({ failure: { phase: 'history-verify-server', code: 'chunk_history_incomplete', historyId: '1' } });
    await expect(runHistory('check', { ...deps, world: { ...deps.world,
      listHistory: async () => ({ rows: [], more: false }) } })).rejects.toThrow('chunk_history_empty');
    await expect(runHistory('rematerialize', deps)).rejects.toThrow('requires_revision');
    await expect(runHistory('plan', { ...deps, revisionId: 8n })).rejects.toThrow('not_found');
  });

  it.each(['history-archive', 'history-verify-server', 'history-retire-audit'] as const)(
    'identifies %s SDK/pipeline failure while preserving archive/retirement gates', async phase => {
      const deps = fixture(); const events: HistoryPhaseEvent[] = [];
      const plan = await runHistory('plan', deps);
      const failure = phase === 'history-retire-audit' ? new PipelineError('retire_audit_documents_timeout', 1, 'private-body-marker')
        : 'Procedure failed: chunk_history_not_backfilled';
      if (phase === 'history-archive') vi.mocked(deps.world.backfillHistory).mockRejectedValueOnce(failure);
      if (phase === 'history-verify-server') vi.mocked(deps.world.verifyHistory).mockRejectedValueOnce(failure);
      if (phase === 'history-retire-audit') vi.mocked(deps.world.retireAuditDocuments).mockRejectedValueOnce(failure);
      const error = await runHistory('backfill', { ...deps, confirmation: plan.confirmation!, progress: entry => events.push(entry) }).catch(value => value as unknown);
      expect(historyFailure(error)).toMatchObject({ phase, code: phase === 'history-retire-audit' ? 'retire_audit_documents_timeout' : 'chunk_history_not_backfilled' });
      expect(JSON.stringify(historyFailure(error))).not.toContain('private-body-marker');
      expect(events).toContainEqual(expect.objectContaining({ phase, status: 'start' }));
      expect(events).not.toContainEqual(expect.objectContaining({ phase, status: 'complete' }));
      if (phase !== 'history-retire-audit') expect(deps.world.retireAuditDocuments).not.toHaveBeenCalled();
      if (phase === 'history-archive') expect(deps.world.verifyHistory).not.toHaveBeenCalled();
      if (phase === 'history-retire-audit') expect(events).toContainEqual({ stage: 'phase', phase: 'history-row-complete', status: 'complete', historyId: '1', revision: 7 });
    });

  it('always resumes after materialization and preserves a primary failure if resume also fails', async () => {
    const deps = fixture(); const plan = await runHistory('plan', deps);
    vi.mocked(deps.world.resume).mockRejectedValueOnce(new PipelineError('connect_failed'));
    const error = await runHistory('backfill', { ...deps, confirmation: plan.confirmation!,
      materialize: async () => { throw 'chunk_document_sha256_mismatch'; } }).catch(value => value as unknown);
    expect(historyFailure(error)).toMatchObject({ phase: 'history-materialize', code: 'chunk_document_sha256_mismatch', historyId: '1', revision: 7 });
    expect((error as Error).cause).toBe('chunk_document_sha256_mismatch');
    expect(deps.world.resume).toHaveBeenCalledOnce(); expect(deps.world.stageBlob).not.toHaveBeenCalled();
    expect(deps.world.backfillHistory).not.toHaveBeenCalled();
  });

  it('reports reconnect as the primary failure when materialization succeeded', async () => {
    const deps = fixture(); const plan = await runHistory('plan', deps);
    vi.mocked(deps.world.resume).mockRejectedValueOnce(new PipelineError('connect_failed'));
    const error = await runHistory('backfill', { ...deps, confirmation: plan.confirmation! }).catch(value => value as unknown);
    expect(historyFailure(error)).toMatchObject({ phase: 'history-resume', code: 'connect_failed', historyId: '1', revision: 7 });
    expect(deps.materialize).toHaveBeenCalledOnce(); expect(deps.world.stageBlob).not.toHaveBeenCalled();
  });
});

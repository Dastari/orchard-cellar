import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { liveMapHeadSource } from '@orchard/sim';
import { chunkHistoryFixture } from '../packages/world/src/live-map-chunk-history.fixture.js';
import { repinChunkHistoryManifest } from '../packages/world/src/live-map-chunk-history.js';
import { assertHistoryRehearsalTarget, candidateAtlasOrigin, runStaticMapHistoryRehearsal } from './static-map-history-rehearsal.js';
import { httpOrigin, sha256Hex } from './world-chunks-publish.js';
import type { HistoryWorldPort, LiveState } from './world-chunks-publish.js';

function fixture() {
  const publications=[chunkHistoryFixture(7),chunkHistoryFixture(8)];
  let archived=false,revision=8,shadowRevision=4;let publication=publications[1]!;
  const read=():LiveState=>({mapRow:{...publication.head,revision},contentHead:null,contentRows:null,
    shadow:{revision:shadowRevision,mapId:'live-island',contentHash:'registry',manifestJson:publication.manifestJson},
    heads:publication.manifest.chunks.map(head=>({...head,revision:shadowRevision}))});
  const world:HistoryWorldPort={read,listHistory:async()=>({rows:publications.map((p,index)=>({id:String(index+1),mapId:'live-island',revision:p.head.revision,contentHash:p.head.contentHash,archived,hasDocumentCopy:!archived})),more:false}),
    readHistory:async id=>({...publications[Number(id)-1]!.head,manifestHash:''}),
    historyCopyStatus:async()=>({historyCopies:archived?0:2,missingArchives:archived?0:2,auditCopies:0,previewCopies:0}),
    retireAuditDocuments:vi.fn(async()=>{}),backfillHistory:async()=>{archived=true;},verifyHistory:async id=>({id:String(id),revision:Number(id)+6,hasDocumentCopy:!archived,manifestHash:'verified'}),
    suspend:vi.fn(async()=>{}),resume:vi.fn(async()=>{}),settle:async()=>read(),stageBlob:async()=>{},publishShadow:async()=>{},
    readBlob:async(_space,head)=>publications.flatMap(p=>[...p.blobs]).find(([hash])=>hash===head.contentHash)![1]};
  let count=0;
  const admin={close:vi.fn(),privateTableRefused:vi.fn(async()=>{}),restore:vi.fn(async(id:bigint)=>{
    const selected=publications[Number(id)-1]!;revision+=1;shadowRevision+=1;
    const manifestJson=repinChunkHistoryManifest(selected.manifestJson,selected.document,revision);
    publication={...selected,head:{...selected.head,...liveMapHeadSource(selected.document,revision),revision},manifestJson,manifest:JSON.parse(manifestJson)};
    count+=1;return {auditId:String(count),inverseRevisionId:count===1?'2':'1'};
  })};
  return {world,admin,database:'orchard-cellar-world',origin:{origin:'https://orchard.dastari.net',atlasIndex:async()=>new Uint8Array([1]),blob:async()=>{throw new Error('unexpected');}},
    materialize:async({mapRow}:{mapRow:{revision:number}})=>{const p=publications.find(p=>p.head.revision===mapRow.revision)!;return {...p,registryContentHash:'registry',blobs:[...p.blobs].map(([contentHash,bytes])=>({cx:0,cy:0,contentHash,bytes}))};},
    openAdmin:vi.fn(async()=>admin),verifyRejoin:vi.fn(async()=>{})};
}
describe('fixed isolated S7c history rehearsal',()=>{
  it('reproduces the stopped frontend dependency locally before any history write',async()=>{
    const deps=fixture();const offline=vi.fn(async()=>new Response('Frontend stopped',{status:503}));
    await expect(runStaticMapHistoryRehearsal({...deps,origin:httpOrigin('http://127.0.0.1:9999',offline)})).rejects.toThrow('origin_atlas_index_unavailable');
    expect(offline).toHaveBeenCalledOnce();expect(deps.openAdmin).not.toHaveBeenCalled();expect(deps.world.retireAuditDocuments).not.toHaveBeenCalled();
  });
  it('runs complete history restore/inverse offline using the exact validated candidate atlas and its digest',async()=>{
    const repository=await mkdtemp(join(tmpdir(),'s7c-atlas-'));
    const directory=join(repository,'packages/client/dist/generated');await mkdir(directory,{recursive:true});
    const bytes=Buffer.from(JSON.stringify({schemaVersion:5,revision:'candidate-revision',packs:{flora:'flora.json'},assetPacks:{tree:'flora'}}));
    const path=join(directory,'atlas.packs.json');await writeFile(path,bytes);
    const unavailable=vi.fn(async()=>{throw new Error('public_frontend_stopped');});vi.stubGlobal('fetch',unavailable);
    try {
      const atlas=await candidateAtlasOrigin(repository);expect(atlas.evidence).toEqual({path:'packages/client/dist/generated/atlas.packs.json',sha256:sha256Hex(bytes),byteLength:bytes.byteLength,schemaVersion:5,revision:'candidate-revision'});
      const deps=fixture();expect(await runStaticMapHistoryRehearsal({...deps,origin:atlas.origin})).toMatchObject({ok:true,reconnectVerified:true});
      expect(unavailable).not.toHaveBeenCalled();expect(deps.admin.restore).toHaveBeenCalledTimes(2);
      const copy=await atlas.origin.atlasIndex();copy[0]=0;expect(await atlas.origin.atlasIndex()).toEqual(new Uint8Array(bytes));
      await writeFile(path,Buffer.from(JSON.stringify({schemaVersion:5,revision:'different',packs:{},assetPacks:{}})));
      await expect(atlas.assertUnchanged()).rejects.toThrow('candidate_atlas_changed');
    } finally {vi.unstubAllGlobals();await rm(repository,{recursive:true,force:true});}
  });
  it('refuses absent, malformed, wrong-schema or redirected candidate indexes',async()=>{
    const repository=await mkdtemp(join(tmpdir(),'s7c-atlas-invalid-'));const directory=join(repository,'packages/client/dist/generated');
    await mkdir(directory,{recursive:true});const path=join(directory,'atlas.packs.json');
    try {
      await expect(candidateAtlasOrigin(repository)).rejects.toThrow();
      for(const body of ['invalid',JSON.stringify({schemaVersion:4,revision:'old',packs:{},assetPacks:{}}),JSON.stringify({schemaVersion:5,revision:'x',packs:{},assetPacks:{tree:'missing'}})]) {
        await writeFile(path,body);await expect(candidateAtlasOrigin(repository)).rejects.toThrow('candidate_atlas_index_invalid');
      }
      const redirected=join(repository,'redirected.json');await writeFile(redirected,JSON.stringify({schemaVersion:5,revision:'x',packs:{},assetPacks:{}}));
      await rm(path);await symlink(redirected,path);await expect(candidateAtlasOrigin(repository)).rejects.toThrow('candidate_atlas_file_invalid');
    } finally {await rm(repository,{recursive:true,force:true});}
  });
  it('refuses production/public targets and live authority port',()=>{
    assertHistoryRehearsalTarget('http://127.0.0.1:3300','orchard-cellar-world');
    for(const host of ['http://127.0.0.1:3000','https://orchard.dastari.net','http://localhost:3300','http://127.0.0.1:3300/x']) expect(()=>assertHistoryRehearsalTarget(host,'orchard-cellar-world')).toThrow('target_refused');
  });
  it('backfills the complete retained history then restores and replays the exact audited inverse before reconnect proof',async()=>{
    const deps=fixture();expect(await runStaticMapHistoryRehearsal(deps)).toMatchObject({ok:true,retainedRowsVerified:2,inverseHistoryId:'2',mapRevisionBefore:8,mapRevisionAfter:10,reconnectVerified:true});
    expect(deps.admin.restore.mock.calls.map(call=>call[0])).toEqual([1n,2n]);expect(deps.admin.close).toHaveBeenCalledOnce();expect(deps.verifyRejoin).toHaveBeenCalledOnce();expect(deps.world.retireAuditDocuments).toHaveBeenCalledOnce();
  });
  it('keeps restore inaccessible on a failed history archive and closes admin on privacy/inverse failure',async()=>{
    const deps=fixture();await expect(runStaticMapHistoryRehearsal({...deps,materialize:async()=>{throw new Error('incompatible_history');}})).rejects.toThrow('incompatible_history');expect(deps.openAdmin).not.toHaveBeenCalled();
    const privateFailure=fixture();privateFailure.admin.privateTableRefused.mockRejectedValueOnce(new Error('private_allowed'));
    await expect(runStaticMapHistoryRehearsal(privateFailure)).rejects.toThrow('private_allowed');expect(privateFailure.admin.restore).not.toHaveBeenCalled();expect(privateFailure.admin.close).toHaveBeenCalledOnce();
    const inverseFailure=fixture();inverseFailure.admin.restore.mockResolvedValueOnce({auditId:'1',inverseRevisionId:'99'});
    await expect(runStaticMapHistoryRehearsal(inverseFailure)).rejects.toThrow('inverse_mismatch');expect(inverseFailure.verifyRejoin).not.toHaveBeenCalled();
  });
  it('runs the fixed hook after unchanged normal schema capture/verify and before normal success/cleanup',()=>{
    const shell=readFileSync(new URL('../ops/orchard-runtime/bin/restore-world-rehearsal.sh',import.meta.url),'utf8');
    const hook=shell.indexOf('scripts/static-map-history-rehearsal.ts');
    expect(hook).toBeGreaterThan(shell.lastIndexOf('verify',hook));expect(shell.slice(hook)).toContain('Isolated schema-only restore and reconnect passed');
    expect(shell).toContain('WORLD_RESTORE_STATIC_MAP_HISTORY');expect(shell).not.toContain('excludedTables');
  });
});

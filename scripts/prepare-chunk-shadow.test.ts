import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {brotliDecompressSync} from 'node:zlib';
import {expect,it} from 'vitest';
import {runtimeChunkFixture} from '../packages/sim/src/chunk-runtime.fixture.js';
import {prepareChunkShadow} from './prepare-chunk-shadow.js';
it('prepares immutable URLs and a CAS request offline after verifying every blob',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'orchard-chunk-shadow-'));
 try{
  const {manifest,blobs}=runtimeChunkFixture();await writeFile(join(directory,'manifest.json'),JSON.stringify(manifest));
  const hash=manifest.chunks[0]!.contentHash;await writeFile(join(directory,`${hash}.bin`),blobs[0]!);
  const output=join(directory,'out');expect(await prepareChunkShadow(directory,output,'b3f30168',0)).toMatchObject({chunks:1,published:false});
  expect(new Uint8Array(brotliDecompressSync(await readFile(join(output,'world','0',`${hash}.bin.br`))))).toEqual(blobs[0]);
  expect(JSON.parse(await readFile(join(output,'shadow-publication.json'),'utf8'))).toMatchObject({expectedRevision:0,contentHash:'b3f30168'});
  await writeFile(join(directory,`${hash}.bin`),new Uint8Array([0]));await expect(prepareChunkShadow(directory,join(directory,'bad'),'a'.repeat(64),0)).rejects.toThrow();
 }finally{await rm(directory,{recursive:true,force:true});}
});

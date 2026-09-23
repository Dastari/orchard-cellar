import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateRuntimeManifest,verifyRuntimeChunk} from '../packages/sim/src/chunk-runtime.js';
import {gzipSync,brotliCompressSync} from 'node:zlib';
/** Offline preparation only. Does not contact an authority or install live files. */
export async function prepareChunkShadow(inputDirectory:string,outputDirectory:string,contentHash:string,expectedRevision:number) {
 if(!/^[a-f0-9]{64}$/u.test(contentHash)||!Number.isSafeInteger(expectedRevision)||expectedRevision<0||expectedRevision>=0xffffffff)throw new Error('invalid_shadow_publication_input');
 const source=await readFile(resolve(inputDirectory,'manifest.json'),'utf8');
 if(source.length>1024*1024)throw new Error('chunk_manifest_too_large');
 const manifest=validateRuntimeManifest(JSON.parse(source));
 // Verify all inputs before emitting a publication request.
 const blobs=[];let total=0;
 for(const head of manifest.chunks){
  const bytes=new Uint8Array(await readFile(resolve(inputDirectory,`${head.contentHash}.bin`)));
  verifyRuntimeChunk(bytes,manifest,head.cx,head.cy);total+=bytes.byteLength;
  if(total>128*1024*1024)throw new Error('chunk_shadow_publication_too_large');
  blobs.push({head,bytes});
 }
 const directory=resolve(outputDirectory,'world',String(manifest.spaceId));await mkdir(directory,{recursive:true});
 for(const {head,bytes} of blobs){
  await writeFile(resolve(directory,`${head.contentHash}.bin`),bytes);
  await writeFile(resolve(directory,`${head.contentHash}.bin.gz`),gzipSync(bytes));
  await writeFile(resolve(directory,`${head.contentHash}.bin.br`),brotliCompressSync(bytes));
 }
 const publication={mapId:'live-island',contentHash,expectedRevision,manifestJson:source};
 await writeFile(resolve(outputDirectory,'shadow-publication.json'),JSON.stringify(publication)+'\n');
 return {chunks:blobs.length,bytes:total,spaceId:manifest.spaceId,sourceRevision:manifest.sourceRevision,sourceHash:manifest.sourceHash,assetRevision:manifest.assetRevision,mode:'shadow',published:false};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [input,output,contentHash,expected]=process.argv.slice(2);
 if(!input||!output||!contentHash||expected===undefined)throw new Error('Usage: tsx scripts/prepare-chunk-shadow.ts INPUT OUTPUT CONTENT_HASH EXPECTED_SHADOW_REVISION');
 console.log(JSON.stringify(await prepareChunkShadow(input,output,contentHash,Number(expected))));
}

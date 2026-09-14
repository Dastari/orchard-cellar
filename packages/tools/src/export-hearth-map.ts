/** Offline candidate export. Never connects to or publishes a world database. */
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseMapDocumentV3,serializeMapDocumentV3ForTransport} from '@orchard/sim';
import {HEARTH_AUTHORING_ISLANDS} from './hearth-archipelago-authoring.js';
import {composeHearthContentMap} from './hearth-map-composition.js';
import {loadAssets,loadPalette,readJson} from './assets/load.js';
import {atlasSourceRevision} from './assets/source-revision.js';
import type {AssetSource,BuiltPageAsset} from './assets/types.js';
const root=resolve(import.meta.dirname,'../../..');
const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
// Map collections are semantically unordered. Preserve multiplicity and every
// supplied field while permitting the parser's deterministic collection ordering.
function canonical(value:unknown):string {
  if(Array.isArray(value)) return `[${value.map(canonical).sort().join(',')}]`;
  if(value!==null&&typeof value==='object') return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b))
    .map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value)??'null';
}
interface RegistryAsset {assetId:number;name:string;category:string;tags:readonly string[]}
interface Registry {revision:string;assets:readonly RegistryAsset[]}
interface Category {revision:string;assets:Record<string,BuiltPageAsset&{anchor:readonly [number,number]}>}
export function validateExportVisual(name:string,built:BuiltPageAsset,size:readonly [number,number],visualName:string,index:number,animated:boolean):void {
  const frames=animated?built.animations[visualName]:built.animations[visualName]??built.variants[visualName]??[built.states[visualName]];
  if(!frames?.[index]) throw new Error(`asset_frame_mismatch:${name}:${visualName}`);
  for(const frame of animated?frames:[frames[index]]) {
    if(!frame||frame.width!==size[0]||frame.height!==size[1]) throw new Error(`asset_frame_mismatch:${name}:${visualName}`);
  }
}
export async function exportHearthMap(inputPath:string,outputPath:string):Promise<void> {
  const inputFile=resolve(inputPath),output=resolve(outputPath);
  const inputBytes=await readFile(inputFile),raw:unknown=JSON.parse(inputBytes.toString('utf8'));
  const fields=new Set(['schemaVersion','id','title','width','height','tileSize','themeId','baseElevation','baseSurface',
    'defaultCliffFamily','defaultSurfaceFamily','revision','cells','transitions','stairRuns','scenery','anchors','provenance',
    'baseBiome','layers','prefabs','objects','landmarks','generatedSuppressions','combatRegions']);
  if(raw===null||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(key=>!fields.has(key)))
    throw new Error('input_requires_lossless_current_v3_export');
  const input=parseMapDocumentV3(inputBytes.toString('utf8'));
  if(canonical(raw)!==canonical(JSON.parse(JSON.stringify(input)))) throw new Error('input_requires_lossless_current_v3_export');
  const registryPath=resolve(root,'packages/assets/generated/asset-registry.json');
  const registryBytes=await readFile(registryPath),registry=JSON.parse(registryBytes.toString('utf8')) as Registry;
  const [sources,palette,seasons]=await Promise.all([loadAssets(),loadPalette(),readJson(resolve(root,'packages/assets/seasons.json'))]);
  if(registry.revision!==atlasSourceRevision(sources,palette,seasons)) throw new Error('generated_assets_are_stale');
  const byName=new Map<string,RegistryAsset>(),ids=new Set<number>();
  for(const row of registry.assets) {
    if(!Number.isSafeInteger(row.assetId)||byName.has(row.name)||ids.has(row.assetId)) throw new Error('invalid_asset_registry');
    byName.set(row.name,row);ids.add(row.assetId);
  }
  const sourceByName=new Map<string,AssetSource>();
  for(const source of sources) {if(sourceByName.has(source.name)) throw new Error('duplicate_asset_source');sourceByName.set(source.name,source);}
  const categories=new Map<string,Category>(),categoryHashes:Record<string,string>={};
  for(const category of new Set(registry.assets.map(row=>row.category))) {
    if(!/^[a-z_]+$/.test(category)) throw new Error('invalid_asset_category');
    const bytes=await readFile(resolve(root,`packages/assets/generated/atlas_${category}.meta.json`));
    const metadata=JSON.parse(bytes.toString('utf8')) as Category;
    if(metadata.revision!==registry.revision) throw new Error('mixed_atlas_revisions');
    categories.set(category,metadata);categoryHashes[category]=hash(bytes);
  }
  const used=new Map<string,{assetId:number;sourceSha256:string;approved:boolean}>();
  const assetFor=(name:string)=>{
    const row=byName.get(name),source=sourceByName.get(name),built=row&&categories.get(row.category)?.assets[name];
    if(!row||!source||!built||built.assetId!==row.assetId||source.category!==row.category) throw new Error(`asset_unresolved:${name}`);
    if(JSON.stringify(source.anchor)!==JSON.stringify(built.anchor)) throw new Error(`asset_anchor_mismatch:${name}`);
    used.set(name,{assetId:row.assetId,sourceSha256:hash(JSON.stringify(source)),approved:source.approved===true&&row.tags.includes('review.approved')});
    return {id:row.assetId,width:source.size[0],height:source.size[1],anchor:source.anchor};
  };
  const result=composeHearthContentMap(input,assetFor,registry.revision);
  if(result.document===null) throw new Error(`map_conflicts:\n${result.conflicts.join('\n')}`);
  for(const prefab of result.document.prefabs) for(const placement of prefab.placements) {
    const asset=assetFor(placement.assetName),row=byName.get(placement.assetName)!;
    if(placement.assetId!==asset.id) throw new Error(`asset_id_mismatch:${placement.assetName}`);
    const built=categories.get(row.category)!.assets[placement.assetName]!,visual=placement.visual;
    validateExportVisual(placement.assetName,built,[asset.width,asset.height],visual.name,visual.frameIndex,visual.kind==='animation');
  }
  for(const scenery of result.document.scenery) {
    const asset=assetFor(scenery.assetId),row=byName.get(scenery.assetId)!;
    validateExportVisual(scenery.assetId,categories.get(row.category)!.assets[scenery.assetId]!,
      [asset.width,asset.height],scenery.state??'base',0,false);
  }
  const map=serializeMapDocumentV3ForTransport(result.document);
  const parsed=parseMapDocumentV3(map);
  const rerun=composeHearthContentMap(parsed,assetFor,registry.revision);
  if(!rerun.document||serializeMapDocumentV3ForTransport(rerun.document)!==map) throw new Error('candidate_roundtrip_not_idempotent');
  const compilerPaths=['packages/tools/src/hearth-cinder-scenery.ts','packages/tools/src/hearth-map-composition.ts','packages/tools/src/hearth-village.ts','packages/sim/src/hearth-archipelago.ts','packages/tools/src/hearth-archipelago-authoring.ts','packages/engine/src/legacy-landmark-assets.ts','packages/tools/src/legacy-landmark-bounds.ts',
    'packages/tools/src/export-hearth-map.ts','packages/tools/src/assets/source-revision.ts'];
  const compilerHashes=Object.fromEntries(await Promise.all(compilerPaths.map(async path=>[path,hash(await readFile(resolve(root,path)))])));
  const assetFileHashes=Object.fromEntries(await Promise.all([...used.keys()].map(async name=>{
    const category=byName.get(name)!.category;
    const path=`packages/assets/${category}/${name}.${category==='tiles'?'tile':'sprite'}.json`;
    const bytes=await readFile(resolve(root,path));
    if(hash(JSON.stringify(JSON.parse(bytes.toString('utf8'))))!==used.get(name)!.sourceSha256) throw new Error(`asset_changed_during_export:${name}`);
    return [path,hash(bytes)];
  })));
  const manifest={format:'hearth-map-candidate-v1',publishReady:false,inputPath:relative(root,inputFile),inputSha256:hash(inputBytes),
    registrySha256:hash(registryBytes),registryRevision:registry.revision,categoryHashes,compilerHashes,assetFileHashes,
    mapSha256:hash(map),inputRevision:input.revision,candidateRevision:parsed.revision,
    affectedBounds:HEARTH_AUTHORING_ISLANDS,counts:{cells:Object.keys(parsed.cells).length,prefabs:parsed.prefabs.length,objects:parsed.objects.length},
    assets:Object.fromEntries(used),unapprovedAssets:[...used].filter(([,asset])=>!asset.approved).map(([name])=>name),
    limitations:['Offline candidate only; saved-map survey, remaining patch content and release acceptance are not proven.']};
  // Require a fresh directory, so a failed rerun cannot masquerade as new success.
  await mkdir(output);
  try {
    await writeFile(resolve(output,'map.json'),map,{flag:'wx'});
    await writeFile(resolve(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
    await writeFile(resolve(output,'COMPLETE'),manifest.mapSha256+'\n',{flag:'wx'});
  } catch(error) {await rm(output,{recursive:true,force:true});throw error;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const [input,output,...extra]=process.argv.slice(2);
  if(!input||!output||extra.length) throw new Error('Usage: export-hearth-map <saved-map-v3.json> <new-output-directory>');
  await exportHearthMap(input,output);
  console.log(`Wrote offline candidate: ${resolve(output)} (not publication-ready)`);
}

/** Reproducible, read-only RGBA/frame/source inventory. See the generated README. */
import { createHash } from 'node:crypto';
import { readdir, readFile, mkdir, writeFile, stat, realpath } from 'node:fs/promises';
import { resolve, relative, join, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { decodePng, encodePng, type DecodedPng } from '../packages/tools/src/assets/png.js';
import { framesForAsset } from '../packages/tools/src/assets/pixels.js';
import type { AssetSource, BuiltFrame, BuiltPageAsset } from '../packages/tools/src/assets/types.js';
import { atlasSourceRevision } from '../packages/tools/src/assets/source-revision.js';

type Rect = readonly [number, number, number, number];
type Json = Record<string, unknown>;
interface RegistryAsset {
  name: string; assetId: number; category: string; pageId: string; tags: string[];
  placement: Json; animations: Record<string, {frameCount:number; fps:number; loop:boolean}>;
  variants: Record<string, {frameCount:number; topology?:string}>; states: string[];
}
interface AssetMetadata extends BuiltPageAsset {
  anchor?: readonly [number,number]; collision?: AssetSource['collision'];
}
interface AtlasIndex {
  revision:string; atlases:Record<string,string>; pages:Record<string,{width:number;height:number}>;
  assetCategories:Record<string,string>; assetsById:Record<string,string>;
}
interface DuplicateFrame {
  asset:string; empty?:boolean; sourcePath?:string|null; sourceRect?:Rect|null;
}
interface AuditFrame extends DuplicateFrame {
  id:string; kind:'animations'|'variants'|'states'; group:string; index:number; pageId:string;
  rect:Rect; durationTicks:number; sourceMapping:string; hashes:Partial<Record<Season,string>>;
  emptySeasons:Season[]; springVisiblePixelHash?:string; sourcePixelHash?:string;
  sourceVisiblePixels?:number; sourcePixelComparison?:string; emptyClassification?:string; emptyEvidence?:string;
}
interface AuditAsset extends RegistryAsset {
  anchor?:AssetMetadata['anchor']; collision?:AssetMetadata['collision']; sourceFile:string;
  sourcePath:string|null; sourcePathsByGroup:Readonly<Record<string,string>>;
  expectedFrames:number; sourceExpandedFrames:number; frames:string[];
}
interface ReferenceEntry {path?:string;source?:string;sha256?:string;layout?:unknown;tileSet?:unknown}
interface SourceRow {
  path:string; bytes:number; sha256:string; indexed:boolean; assets:string[]; mappedFrames:number;
  declaredCropFrames:number; status:string; reason:string; indexHashMismatch?:boolean;
  width?:number; height?:number; pixelHash?:string; visiblePixels?:number;
  coveredVisiblePixels?:number; uncoveredVisiblePixels?:number; layout?:unknown;tileSet?:unknown;
  cropComparisons?:{exact:number;hiddenRgbOnly:number;different:number;invalid:number;unresolved:number};
}
type Season = 'spring'|'summer'|'autumn'|'winter';
const seasons = ['spring', 'summer', 'autumn', 'winter'] as const;
const digest = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex');
export function pixelFingerprint(width: number, height: number, rgba: Uint8Array): string {
  return digest(Buffer.concat([Buffer.from(`${width}x${height}:`), rgba]));
}
export function visibleFingerprint(width: number, height: number, rgba: Uint8Array): string {
  const normalized = new Uint8Array(rgba);
  for (let i=0;i<normalized.length;i+=4) if(normalized[i+3]===0) normalized.fill(0,i,i+3);
  return pixelFingerprint(width,height,normalized);
}
export function crop(image: DecodedPng, rect: Rect): Uint8Array {
  const [x, y, width, height] = rect;
  if (![...rect].every(Number.isInteger) || x < 0 || y < 0 || width < 1 || height < 1 || x + width > image.width || y + height > image.height) {
    throw new Error(`Invalid crop ${rect.join(',')} in ${image.width}x${image.height}`);
  }
  const data = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row++) data.set(image.rgba.subarray(((y + row) * image.width + x) * 4, ((y + row) * image.width + x + width) * 4), row * width * 4);
  return data;
}
export function classifyDuplicate(frames: DuplicateFrame[]): string {
  if (frames.every(f => f.empty)) return 'transparent-empty';
  if (new Set(frames.map(f => f.asset)).size === 1) return 'same-asset-repeated-frame-or-season';
  if (frames.every(f => f.sourcePath && f.sourceRect) && new Set(frames.map(f => `${f.sourcePath}:${f.sourceRect!.join(',')}`)).size === 1) return 'same-source-crop-alias';
  return 'cross-asset-exact-pixels-review';
}
async function walk(root: string, ancestors=new Set<string>()): Promise<string[]> {
  const canonical=await realpath(root);
  if(ancestors.has(canonical)) throw new Error(`Source directory symlink cycle: ${root}`);
  const next=new Set([...ancestors,canonical]);
  const out: string[] = [];
  for (const entry of (await readdir(root, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
    const path = join(root, entry.name);
    const info=entry.isSymbolicLink()?await stat(path):entry;
    if (info.isDirectory()) out.push(...await walk(path,next));
    else if (info.isFile()) out.push(path);
  }
  return out;
}
const readJson = async <T=Json>(path: string): Promise<T> => JSON.parse(await readFile(path, 'utf8'));
export async function audit(root: string, sourceRoot: string, output: string, customRoot=join(root,'art')) {
  const generated = join(root, 'packages/assets/generated');
  const registry = await readJson<{revision:string;assets:RegistryAsset[]}>(join(generated, 'asset-registry.json'));
  const index = await readJson<AtlasIndex>(join(generated, 'atlas.meta.json'));
  const errors: Json[] = [];
  const sources = new Map<string, AssetSource & {file:string}>();
  const sourceFiles = (await walk(join(root, 'packages/assets'))).filter(p => /\.(sprite|tile)\.json$/.test(p)).sort();
  const sourceSnapshot: AssetSource[]=[];
  for (const file of sourceFiles) {
    const source = await readJson<AssetSource>(file);
    sourceSnapshot.push(source);
    if (sources.has(source.name)) errors.push({kind:'duplicate-source-name', asset:source.name});
    sources.set(source.name, {...source, file: relative(root, file)});
  }
  const currentRevision=atlasSourceRevision(sourceSnapshot,await readJson(join(root,'packages/assets/palette.json')),await readJson(join(root,'packages/assets/seasons.json')));
  if(currentRevision!==index.revision) errors.push({kind:'source-atlas-revision-mismatch',source:currentRevision,atlas:index.revision});
  const categories = [...new Set(registry.assets.map((a) => a.category))].sort() as string[];
  const metadata = new Map<string, AssetMetadata>();
  for (const category of categories) {
    const data = await readJson<{revision:string;assets:Record<string,AssetMetadata>}>(join(generated, `atlas_${category}.meta.json`));
    if (data.revision !== index.revision) errors.push({kind:'category-revision-mismatch', category});
    for (const [name, asset] of Object.entries(data.assets)) metadata.set(name, asset);
  }
  if (registry.revision !== index.revision) errors.push({kind:'registry-revision-mismatch'});
  const frames: AuditFrame[] = [], assets: AuditAsset[] = [];
  let expectedFrames = 0, sourceExpandedFrames = 0;
  const ids = new Set<number>(), names = new Set<string>();
  for (const entry of [...registry.assets].sort((a,b) => a.name.localeCompare(b.name))) {
    if (ids.has(entry.assetId) || names.has(entry.name)) errors.push({kind:'duplicate-registry-identity',asset:entry.name});
    ids.add(entry.assetId); names.add(entry.name);
    const source = sources.get(entry.name), meta = metadata.get(entry.name);
    const count = Object.values(entry.animations).reduce((n,v)=>n+v.frameCount,0) + Object.values(entry.variants).reduce((n,v)=>n+v.frameCount,0) + entry.states.length;
    expectedFrames += count;
    if (!source || !meta) { errors.push({kind:'missing-source-or-metadata',asset:entry.name}); continue; }
    const expanded = framesForAsset(source as AssetSource);
    const sourceCount = Object.values(expanded).reduce((n,v)=>n+v.length,0);
    sourceExpandedFrames += sourceCount;
    if(sourceCount!==count) errors.push({kind:'source-registry-frame-count-mismatch',asset:entry.name,source:sourceCount,registry:count});
    const asset: AuditAsset = {name:entry.name,assetId:entry.assetId,category:entry.category,pageId:entry.pageId,tags:entry.tags,placement:entry.placement,anchor:meta.anchor,collision:meta.collision,animations:entry.animations,variants:entry.variants,states:entry.states,sourceFile:source.file,sourcePath:source.sourcePath ?? null,sourcePathsByGroup:source.sourcePathsByGroup ?? {},expectedFrames:count,sourceExpandedFrames:sourceCount,frames:[]};
    assets.push(asset);
    if (meta.assetId !== entry.assetId || meta.pageId !== entry.pageId || index.assetCategories[entry.name] !== entry.category || index.assetsById[String(entry.assetId)] !== entry.name) errors.push({kind:'registry-metadata-identity-mismatch',asset:entry.name});
    for (const kind of ['animations','variants','states'] as const) {
      for (const [group,value] of Object.entries(meta[kind] ?? {})) {
        const list = (kind === 'states' ? [value] : value) as readonly BuiltFrame[];
        const expected = kind === 'states' ? (entry.states.includes(group) ? 1 : 0) : entry[kind][group]?.frameCount;
        if (expected !== list.length || expanded[group]?.length !== list.length) errors.push({kind:'frame-group-count-mismatch',asset:entry.name,group,expected,actual:list.length,source:expanded[group]?.length});
        list.forEach((rect, frameIndex) => {
          const sourceRect = source.autotile === 'blob47' ? null : source.sourceRegions?.[group]?.[frameIndex] ?? (count === 1 ? source.sourceRegion : null) ?? null;
          const f: AuditFrame = {id:`${entry.name}/${kind}/${group}/${frameIndex}`,asset:entry.name,kind,group,index:frameIndex,pageId:entry.pageId,rect:[rect.x,rect.y,rect.width,rect.height],durationTicks:rect.durationTicks,sourcePath:source.sourcePathsByGroup?.[group] ?? source.sourcePath ?? null,sourceRect,sourceMapping:source.autotile === 'blob47' ? 'generated-blob47' : sourceRect ? 'declared-crop' : source.sourcePath ? 'sheet-only-unresolved-crop' : 'authored-no-external-source',hashes:{},emptySeasons:[]};
          asset.frames.push(f.id); frames.push(f);
        });
      }
    }
    if (asset.frames.length !== count) errors.push({kind:'asset-frame-count-mismatch',asset:entry.name,expected:count,actual:asset.frames.length});
  }
  for (const name of sources.keys()) if (!names.has(name)) errors.push({kind:'unregistered-source-asset',asset:name});
  for (const name of metadata.keys()) if (!names.has(name)) errors.push({kind:'unregistered-category-asset',asset:name});
  const byPage = new Map<string, AuditFrame[]>();
  for (const f of frames) { if(!byPage.has(f.pageId)) byPage.set(f.pageId,[]); byPage.get(f.pageId)!.push(f); }
  let processedSeasonFrames = 0;
  const pageFiles: Json[] = [];
  for (const [pageId, pageFrames] of byPage) {
    for (const season of seasons) {
      const file = index.atlases[`${pageId}:${season}`];
      try {
        if (!file) throw new Error('Missing page mapping');
        const bytes = await readFile(join(generated,file));
        const image = decodePng(bytes);
        pageFiles.push({pageId,season,file,sha256:digest(bytes),width:image.width,height:image.height});
        if (image.width !== index.pages[pageId]?.width || image.height !== index.pages[pageId]?.height) errors.push({kind:'page-dimension-mismatch',pageId,season});
        for (const f of pageFrames) {
          try {
            const pixels = crop(image,f.rect);
            f.hashes[season] = pixelFingerprint(f.rect[2],f.rect[3],pixels);
            if(season==='spring') f.springVisiblePixelHash=visibleFingerprint(f.rect[2],f.rect[3],pixels);
            if (!pixels.some((value, index)=>index%4 === 3 && value !== 0)) f.emptySeasons.push(season);
            processedSeasonFrames++;
          } catch (error) { errors.push({kind:'invalid-frame-crop',frame:f.id,season,error:String(error)}); }
        }
      } catch (error) { errors.push({kind:'unreadable-atlas-page',pageId,season,file,error:String(error)}); }
    }
  }
  const globalIndex = await readJson<{entries:ReferenceEntry[]}>(join(root,'docs/reference-assets/reference-library-index.json'));
  const cuteIndex = await readJson<{entries:ReferenceEntry[]}>(join(root,'docs/reference-assets/cute-fantasy-index.json'));
  const indexed = new Map<string,ReferenceEntry>(globalIndex.entries.map(e=>[e.path ?? e.source!,e]));
  const cute = new Map<string,ReferenceEntry>(cuteIndex.entries.map(e=>[e.source!,e]));
  const sourceLedger: SourceRow[] = [];
  const references = new Map<string,AuditFrame[]>();
  for (const f of frames) if (f.sourcePath) { if(!references.has(f.sourcePath)) references.set(f.sourcePath,[]); references.get(f.sourcePath)!.push(f); }
  let discovered: {file:string,path:string}[] = [];
  try { discovered = (await walk(sourceRoot)).map(file=>({file,path:`references/${relative(sourceRoot,file).split('\\').join('/')}`})); } catch(error) { errors.push({kind:'source-library-unavailable',error:String(error)}); }
  try { discovered.push(...(await walk(customRoot)).map(file=>({file,path:`art/${relative(customRoot,file).split('\\').join('/')}`}))); } catch(error) { errors.push({kind:'custom-art-unavailable',error:String(error)}); }
  discovered.sort((a,b)=>a.path.localeCompare(b.path));
  const discoveredNames = new Set<string>();
  for (const {file,path} of discovered) {
    discoveredNames.add(path);
    const bytes = await readFile(file), mapped = references.get(path) ?? [];
    const extension = extname(file).toLowerCase();
    const row: SourceRow = {path,bytes:bytes.length,sha256:digest(bytes),indexed:indexed.has(path),assets:[...new Set(mapped.map(f=>f.asset))].sort(),mappedFrames:mapped.length,declaredCropFrames:mapped.filter(f=>f.sourceRect).length,status:'non-image-reference',reason:'Documentation, license, audio, font or other reference; not a raster tileset.'};
    const historical = indexed.get(path);
    if (historical?.sha256 && historical.sha256 !== row.sha256) row.indexHashMismatch = true;
    if (extension === '.png') {
      try {
        const image = decodePng(bytes);
        row.width=image.width; row.height=image.height; row.pixelHash=pixelFingerprint(image.width,image.height,image.rgba);
        row.status=mapped.length ? 'mapped-sheet-partial-or-unverified' : 'unimported-source-gap';
        row.reason=mapped.length ? 'Registered provenance links exist; only declared crops are measured. A sheet link does not prove complete import.' : 'No registered frame declares this source sheet.';
        const covered = new Uint8Array(image.width * image.height);
        let matched = 0, different = 0, hiddenRgbOnly = 0, invalid = 0;
        for (const f of mapped) if (f.sourceRect) {
          try {
            const pixels=crop(image,f.sourceRect);
            f.sourcePixelHash=pixelFingerprint(f.sourceRect[2],f.sourceRect[3],pixels);
            f.sourceVisiblePixels=0; for(let i=3;i<pixels.length;i+=4) if(pixels[i]) f.sourceVisiblePixels++;
            f.sourcePixelComparison=f.sourcePixelHash===f.hashes.spring ? 'exact-rgba-match' : visibleFingerprint(f.sourceRect[2],f.sourceRect[3],pixels)===f.springVisiblePixelHash ? 'hidden-rgb-only-difference' : 'visible-rgba-difference-review-transform-or-source-drift';
            if (f.sourcePixelHash===f.hashes.spring) matched++; else if(f.sourcePixelComparison==='hidden-rgb-only-difference') hiddenRgbOnly++; else different++;
            const [x,y,w,h]=f.sourceRect;
            for(let yy=y;yy<y+h;yy++) covered.fill(1,yy*image.width+x,yy*image.width+x+w);
          } catch(error) { invalid++; errors.push({kind:'invalid-source-crop',frame:f.id,path,error:String(error)}); }
        }
        let visible=0,coveredVisible=0;
        for(let i=0;i<covered.length;i++) if(image.rgba[i*4+3]) { visible++; if(covered[i]) coveredVisible++; }
        row.visiblePixels=visible; row.coveredVisiblePixels=coveredVisible; row.uncoveredVisiblePixels=visible-coveredVisible;
        row.cropComparisons={exact:matched,hiddenRgbOnly,different,invalid,unresolved:mapped.length-row.declaredCropFrames};
        row.layout=cute.get(path)?.layout ?? null; row.tileSet=cute.get(path)?.tileSet ?? null;
        if(mapped.length && visible===coveredVisible && !different && !invalid && row.declaredCropFrames===mapped.length) { row.status='declared-crops-cover-visible-sheet'; row.reason='Declared crop union covers all nontransparent pixels and each visibly matches its spring atlas frame; exact/hidden-RGB distinctions remain in cropComparisons. Empty gutters are not imported art.'; }
      } catch(error) { row.status='unsupported-raster-source-gap'; row.reason=String(error); }
    } else if (['.aseprite','.ase','.webp','.jpg','.jpeg','.gif','.psd','.svg'].includes(extension)) {
      row.status='unsupported-source-format-gap'; row.reason='File is accounted for and byte-hashed; this audit decodes PNG RGBA only and makes no frame-coverage claim.';
    }
    sourceLedger.push(row);
  }
  const missingIndexed = [...indexed.keys()].filter(path=>path && !discoveredNames.has(path)).sort();
  const missingReferenced = [...references.keys()].filter(path=>!discoveredNames.has(path)).sort();
  for (const path of missingReferenced) errors.push({kind:'referenced-source-file-missing',path});
  const sourcePixelGroups=new Map<string,string[]>();
  for(const source of sourceLedger) if(source.pixelHash) { if(!sourcePixelGroups.has(source.pixelHash)) sourcePixelGroups.set(source.pixelHash,[]); sourcePixelGroups.get(source.pixelHash)!.push(source.path); }
  const sourceDuplicateGroups=[...sourcePixelGroups.entries()].filter(([,paths])=>paths.length>1).map(([pixelHash,paths])=>({pixelHash,paths})).sort((a,b)=>a.pixelHash.localeCompare(b.pixelHash));
  const groups = new Map<string,AuditFrame[]>();
  for (const f of frames) {
    f.empty = f.emptySeasons.length === seasons.length;
    if(f.empty) f.emptyClassification=f.kind==='states' ? 'empty-static-import-review-required' : f.sourceVisiblePixels===0 ? f.kind==='animations' ? 'source-empty-animation-component-slot' : 'source-empty-grid-slot' : f.sourcePixelComparison?.startsWith('visible-rgba-difference') ? 'source-painted-atlas-empty-review-required' : 'empty-frame-unresolved-provenance';
    if(f.empty && f.kind==='variants' && f.group==='base' && f.index===46 && ['tile_cf_farmland_grass_inset','tile_cf_savanna_grass_inset','tile_cf_grass_dirt_cliff_edge'].includes(f.asset)) {
      f.emptyClassification='reviewed-transparent-overlay-centre';
      f.emptyEvidence='Fully surrounded blob47 fringe centre. extract-cute-fantasy-farmland.ts copies canonical grass/path transparent companion; no fringe is needed at the interior.';
    }
    // Group frames by their complete seasonal fingerprint, not spring alone.
    if(seasons.every(s=>f.hashes[s])) {
      const key=seasons.map(s=>f.hashes[s]).join(':');
      if(!groups.has(key)) groups.set(key,[]); groups.get(key)!.push(f);
    }
  }
  const duplicateGroups = [...groups.entries()].filter(([,fs])=>fs.length>1).map(([key,fs])=>({signature:digest(key),classification:classifyDuplicate(fs),frames:fs.map(f=>f.id),assets:[...new Set(fs.map(f=>f.asset))].sort()})).sort((a,b)=>a.signature.localeCompare(b.signature));
  const wholeAssets=new Map<string,string[]>();
  const frameById=new Map(frames.map(f=>[f.id,f]));
  for(const a of assets) {
    const fs=a.frames.map((id:string)=>frameById.get(id)!);
    // Group names, kind, duration and order remain semantic distinctions.
    const signature=digest(JSON.stringify([a.animations,fs.map(f=>[f.kind,f.group,f.index,f.durationTicks,f.hashes])]));
    wholeAssets.set(signature,[...(wholeAssets.get(signature)??[]),a.name]);
  }
  const wholeAssetDuplicates=[...wholeAssets.entries()].filter(([,names])=>names.length>1).map(([signature,names])=>({signature,assets:names,classification:frames.filter(f=>names.includes(f.asset)).every(f=>f.empty)?'wholly-empty-assets-review-required':'same-complete-frame-sequence-review-semantics'}));
  const countBy=<T,K extends keyof T>(rows:T[],key:K)=>Object.fromEntries([...new Set(rows.map(r=>String(r[key])))].sort().map(value=>[value,rows.filter(r=>String(r[key])===value).length]));
  const summary={registryAssets:registry.assets.length,processedAssets:assets.length,sourceAssetFiles:sourceFiles.length,metadataAssets:metadata.size,expectedFrames,sourceExpandedFrames,processedFrames:frames.length,expectedSeasonFrames:expectedFrames*4,processedSeasonFrames,atlasPageSeasons:pageFiles.length,expectedAtlasPageSeasons:Object.keys(index.atlases).length,discoveredSourceFiles:discovered.length,processedSourceFiles:sourceLedger.length,indexedSourceFiles:indexed.size,missingIndexedFiles:missingIndexed.length,missingReferencedFiles:missingReferenced.length,sourceStatus:countBy(sourceLedger,'status'),assetsByCategory:countBy(assets,'category'),duplicateGroups:duplicateGroups.length,duplicateClassifications:countBy(duplicateGroups,'classification'),wholeAssetDuplicateGroups:wholeAssetDuplicates.length,emptyFrames:frames.filter(f=>f.empty).length,unresolvedSourceCropFrames:frames.filter(f=>f.sourceMapping==='sheet-only-unresolved-crop').length,errors:errors.length};
  const report={schemaVersion:1,atlasRevision:index.revision,method:'SHA-256 of dimension-prefixed decoded RGBA, all four seasons; no perceptual deduplication; source crops compare spring RGBA.',summary,assets,frames,duplicateGroups,wholeAssetDuplicates,atlasPages:pageFiles,sourceLedger,sourceDuplicateGroups,missingIndexed,missingReferenced,errors};
  await mkdir(output,{recursive:true});
  const frameBytes=Buffer.from(frames.map(f=>JSON.stringify(f)).join('\n')+'\n');
  await writeFile(join(output,'frames.jsonl.gz'),gzipSync(frameBytes,{level:9}));
  const compactReport=Object.fromEntries(Object.entries(report).filter(([key])=>key!=='frames'));
  await writeFile(join(output,'inventory.json'),JSON.stringify({...compactReport,frameEvidence:{file:'frames.jsonl.gz',format:'gzip-compressed JSON Lines; one complete frame record per line',records:frames.length,uncompressedSha256:digest(frameBytes),uncompressedBytes:frameBytes.length},emptyClassifications:countBy(frames.filter(f=>f.empty),'emptyClassification')})+'\n');
  const escape=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
  const preview=['<!doctype html><html lang="en"><meta charset="utf-8"><title>Complete-sequence duplicate evidence</title><style>body{font:15px system-ui;background:#20262c;color:#eee;margin:24px}section{border-top:1px solid #58616a;padding:12px}figure{display:inline-block;vertical-align:top;margin:8px;width:300px;overflow-wrap:anywhere}img{image-rendering:pixelated;background:repeating-conic-gradient(#bbc3cb 0% 25%,#e2e6eb 0% 50%) 50%/16px 16px;max-width:290px}figcaption{margin-top:8px}code{font-size:12px}</style><h1>Complete-sequence duplicate evidence</h1><p>Every whole-sequence duplicate group is listed. Images show each asset’s first spring frame only; equality was checked for every frame and season. Checkerboard indicates transparency. Placement and state semantics still require review.</p>'];
  let previewPage='',previewImage:DecodedPng|undefined;
  for(const g of wholeAssetDuplicates) {
    preview.push(`<section><h2>${escape(g.classification)}</h2>`);
    for(const name of g.assets) {
      const asset=assets.find(a=>a.name===name)!; const f=frameById.get(asset.frames[0])!;
      if(!f.hashes.spring) continue;
      if(previewPage!==f.pageId) { previewImage=decodePng(await readFile(join(generated,index.atlases[`${f.pageId}:spring`])));previewPage=f.pageId; }
      const png=encodePng(f.rect[2],f.rect[3],crop(previewImage!,f.rect));
      preview.push(`<figure><img width="${f.rect[2]*2}" height="${f.rect[3]*2}" alt="${escape(name)} native first frame" src="data:image/png;base64,${png.toString('base64')}"><figcaption><strong>${escape(name)}</strong><br><code>${escape(f.id)}</code><br>${f.empty?'EMPTY first frame':'Painted first frame'}; ${asset.frames.length} total frame(s)</figcaption></figure>`);
    }
    preview.push('</section>');
  }
  preview.push('</html>'); await writeFile(join(output,'duplicate-evidence.html'),preview.join('\n'));
  const cross=duplicateGroups.filter(g=>g.classification==='cross-asset-exact-pixels-review');
  const lines=['# Atlas inventory audit','',`Atlas revision: \`${index.revision}\`. Deterministic artifact: [inventory.json](inventory.json).`,'','Reproduce from the repository root (source corpus is owner-local):','','```sh','npx tsx scripts/audit-atlas.ts --source-root /path/to/references','npx vitest run scripts/audit-atlas.test.ts','```','','The default source root is `references`; `--source-root` replaces that directory, not `references/art`. Generated atlas files must exist. The script only reads source/atlas inputs and writes this report directory. Missing inputs are recorded and yield a failing exit status. Unsupported source formats are explicit coverage gaps.','','## Reconciled coverage','',...Object.entries(summary).filter(([,v])=>typeof v==='number').map(([k,v])=>`- ${k}: **${v}**`),'','## Findings and priorities','','1. Resolve source crop mismatches, invalid bounds and missing files before claiming provenance parity; every failure is preserved in `errors` or `sourceLedger.cropComparisons`.','2. Review exact cross-asset duplicates before changing palette choices. Stable asset IDs must remain. Same declared source crops are provenance aliases, not automatic permission to merge IDs.','3. Fill unimported and partially mapped source sheets; inspect `uncoveredVisiblePixels` and unresolved crops. Sheet-level registration is not complete frame coverage.','4. Review all transparent frames and repeated sequence frames in their animation/state context. Empty pixels do not prove redundant assets.','','### Duplicate classifications','',...Object.entries(summary.duplicateClassifications).map(([k,v])=>`- ${k}: ${v} groups`),'',`Complete sequence duplicate groups: ${wholeAssetDuplicates.length}. Cross-asset candidate groups: ${cross.length}. Full membership and every frame/season fingerprint are in the JSON.`,'','### Source coverage','',...Object.entries(summary.sourceStatus).map(([k,v])=>`- ${k}: ${v} files`),'','Each discovered file has a content hash. PNGs additionally have dimensions, exact decoded pixel hash, registered asset links and crop coverage. Non-raster documentation/audio/font files have explicit exclusions. Aseprite and other undecoded formats remain gaps. The stored reference index is reconciled against live discovery; index-only paths appear in `missingIndexed`.','','### Cross-asset examples','',...cross.slice(0,30).map(g=>`- ${g.assets.join(', ')} (${g.frames.length} identical frame records)`),'','## Interpretation limits','','- Pixel equality is exact, dimension-sensitive RGBA including alpha and hidden RGB. Transparent frames are separately classified. Matching spring alone never collapses seasonal variants.','- Duplicate groups compare all seasons; whole-asset sequence groups also preserve kind, group, frame order and duration. Placement/collision/tag differences still require human semantic review.','- A matching source crop establishes pixel provenance; differing crops may be intentional masks/transforms and are review findings, not automatic bugs. Source regions missing from old imports remain explicitly unresolved.','- Source coverage uses the union of declared crop rectangles over visible pixels. It does not invent a cell size for unknown sheets or claim every semantic tile arrangement is supported.','- This audit covers registered original atlas pages. Shadow-omission derivatives, backdrop composites, audio and runtime recolour combinations are not independent registered tile/object variants.','- All source files are inventoried; unsupported decoding or missing source files is never counted as successfully inspected pixels.','','## Errors','',...(errors.length?errors.map(e=>`- \`${JSON.stringify(e)}\``):['None.']),''];
  lines.splice(4,0,'Complete frame rows are in [frames.jsonl.gz](frames.jsonl.gz), one JSON object per line after gzip decompression. `frameEvidence` records the uncompressed SHA-256 and count. [Duplicate evidence](duplicate-evidence.html) displays every complete-sequence duplicate cohort. [Reviewed findings](findings.md) preserves pre-correction evidence.','');
  lines.push('Local custom art is also discovered from `art/`. In an isolated worktree with ignored owner-local source files, pass `--custom-root /path/to/canonical/art` alongside `--source-root /path/to/canonical/references`. Paths in the ledger retain their repository-relative provenance.','');
  lines.push(`Exact source-sheet RGBA duplicate groups: **${sourceDuplicateGroups.length}**. Full paths and hashes are in \`sourceDuplicateGroups\`; byte hashes remain separate. Source duplicates do not justify deleting licensed provenance records.`,'');
  lines.push('## Empty-frame classifications','',...Object.entries(countBy(frames.filter(f=>f.empty),'emptyClassification')).map(([k,v])=>`- ${k}: ${v}`),'','A source-empty grid slot is demonstrably empty native padding, but whether it should remain a selectable variant still needs semantic review. Source-empty animation component slots preserve authored timing; this does not assert that every animation is visually correct. Unresolved empties are never described as intentional.','');
  await writeFile(join(output,'README.md'),lines.join('\n').replace('Full membership and every frame/season fingerprint are in the JSON.','Full membership is in the inventory JSON; every frame/season fingerprint is in frames.jsonl.gz.'));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const option=(name:string,fallback:string)=> {const i=process.argv.indexOf(name);return i<0?fallback:process.argv[i+1]??fallback;};
  const root=resolve(option('--root','.'));
  const report=await audit(root,resolve(option('--source-root',join(root,'references'))),resolve(option('--output',join(root,'docs/atlas-audit/inventory'))),resolve(option('--custom-root',join(root,'art'))));
  console.log(JSON.stringify(report.summary,null,2));
  if(report.errors.length || report.summary.expectedFrames!==report.summary.processedFrames || report.summary.expectedSeasonFrames!==report.summary.processedSeasonFrames || report.summary.discoveredSourceFiles!==report.summary.processedSourceFiles) process.exitCode=1;
}

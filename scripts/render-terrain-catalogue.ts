/** Native-art terrain evidence. Run: npx tsx scripts/render-terrain-catalogue.ts [--check] */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage, type Canvas } from '@napi-rs/canvas';
import { loadAssets, loadPalette } from '../packages/tools/src/assets/load.js';
import { framesForAsset, resolveColor } from '../packages/tools/src/assets/pixels.js';
import { catalogueFormation, TERRAIN_CATALOGUE_SHAPES } from './terrain-catalogue-formations.js';
import type { AssetSource } from '../packages/tools/src/assets/types.js';
import { TERRAIN_CLIFF_FAMILIES, TERRAIN_SURFACE_FAMILIES } from '../packages/sim/src/terrain-tilesets.js';
import { resolveRaisedTerrainTile, type RaisedTerrainTileSet } from '../packages/sim/src/raised-terrain-autotile.js';
import { caveFloorAutotilePlan } from '../packages/sim/src/cave-floor-autotile.js';
import { authoredGrassFringeLayersAt, authoredFarmlandGroundLayersAt } from '../packages/engine/src/ground-cache.js';
import { MAP_BIOME_IDS } from '../packages/sim/src/biomes.js';
import { blob47FrameIndexFor } from '../packages/engine/src/tilemap.js';
import { beachFrameIndexAt, shorelineInsetFrameIndicesAt, freshwaterFrameIndexAt, freshwaterInsetFrameIndicesAt,
  desertShoreFrameIndexAt, desertGrassEdgeFrameIndexAt, desertGrassInsetFrameIndicesAt,
  grassSandTransitionFrameIndexAt, pavingGrassTransitionFrameIndexAt, savannaGrassTransitionFrameIndexAt,
  waterfallFrameIndexAt, type TerrainArray } from '../packages/engine/src/terrain.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'docs/atlas-audit/terrain');
const check = process.argv.includes('--check');
const outputs = new Map<string, Buffer>();
const emit = (path: string, value: string | Buffer) => outputs.set(path, Buffer.isBuffer(value) ? value : Buffer.from(value));
const json = (path: string, value: unknown) => emit(path, `${JSON.stringify(value)}\n`);
const hash = (value: Buffer) => createHash('sha256').update(value).digest('hex');
const escape = (s: unknown) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const link = (path: string) => '../../../' + path;
const assets = await loadAssets();
const palette = await loadPalette();
const byId = new Map(assets.map(a => [a.name, a]));
const tileAssets = assets.filter(a => a.category === 'tiles' || a.name.startsWith('tile_'));
const rendered = new Map<string, Canvas>();
type Ref = { asset: string; frame: number; group?: string; role?: string };
function frame(ref: Ref): Canvas {
  const key = `${ref.asset}:${ref.group ?? 'base'}:${ref.frame}`;
  const cached = rendered.get(key); if (cached) return cached;
  const asset = byId.get(ref.asset); if (!asset) throw new Error(`Missing asset ${key}`);
  const grid = framesForAsset(asset)[ref.group ?? 'base']?.[ref.frame];
  if (!grid) throw new Error(`Missing frame ${key}`);
  const canvas = createCanvas(...asset.size); const ctx = canvas.getContext('2d');
  const pixels = ctx.createImageData(...asset.size);
  grid.forEach((row, y) => [...row].forEach((character, x) => pixels.data.set(
    resolveColor(character, palette, {}, asset.markers ?? {}, asset.sourcePalette ?? {}), (y * asset.size[0] + x) * 4,
  )));
  ctx.putImageData(pixels, 0, 0); rendered.set(key, canvas); return canvas;
}
function board(w: number, h: number): Canvas {
  const c = createCanvas(w, h); const ctx = c.getContext('2d');
  ctx.fillStyle = '#243039'; ctx.fillRect(0, 0, w, h); ctx.imageSmoothingEnabled = false;
  ctx.font = '11px monospace'; ctx.fillStyle = '#edf4ed'; return c;
}
function draw(c: Canvas, ref: Ref, x: number, y: number, scale = 3) {
  const f = frame(ref); c.getContext('2d').drawImage(f, x, y, f.width * scale, f.height * scale);
}
function imageOut(path: string, c: Canvas) { emit(path, c.toBuffer('image/png')); }
function contact(asset: AssetSource) {
  const refs = Object.entries(framesForAsset(asset)).flatMap(([group, frames]) => frames.map((_, i) => ({ asset: asset.name, group, frame: i })));
  const cw = Math.max(90, asset.size[0] * 2 + 8), ch = asset.size[1] * 2 + 27;
  const columns = Math.min(12, refs.length), c = board(columns * cw, Math.ceil(refs.length / columns) * ch);
  refs.forEach((r, i) => { const x = i % columns * cw, y = Math.floor(i / columns) * ch; draw(c, r, x + 4, y + 4, 2); c.getContext('2d').fillText(`${r.group}:${r.frame}`, x + 4, y + ch - 6); });
  imageOut(`assets/${asset.name}.png`, c);
  return { asset: asset.name, source: asset.sourcePath ?? null, sourceRegions: asset.sourceRegions ?? null,
    sourceRegion: asset.sourceRegion ?? null, sourcePathsByGroup: asset.sourcePathsByGroup ?? null,
    frameCount: refs.length, frameKinds: asset.frameKinds ?? {}, autotile: asset.autotile ?? null,
    image: `assets/${asset.name}.png`, frameIds: refs.map(r => `${r.group}:${r.frame}`) };
}
const assetLedger = tileAssets.map(contact);
const offsets = [[0,-1],[1,0],[0,1],[-1,0],[1,-1],[1,1],[-1,1],[-1,-1]] as const;
const matches = (mask: number, center = true) => (x: number, y: number) => {
  if (x === 0 && y === 0) return center;
  const bit = offsets.findIndex(([dx,dy]) => x === dx && y === dy);
  return bit >= 0 && (mask & (1 << bit)) !== 0;
};
const maskLegend = { N:1,E:2,S:4,W:8,NE:16,SE:32,SW:64,NW:128 };
function maskKind(mask: number) {
  const n = [1,2,4,8].filter(b => mask & b).length;
  return n === 0 ? 'isolated/diagonal-only' : n === 1 ? 'endpoint' : n === 2 ? ((mask & 15) === 5 || (mask & 15) === 10 ? 'straight' : 'convex turn') : n === 3 ? 'T junction' : mask === 255 ? 'centre' : 'cross/concave corners';
}
function drawMask(c: Canvas, mask: number, x: number, y: number) {
  const ctx = c.getContext('2d'), match = matches(mask);
  for (let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {
    ctx.fillStyle = match(dx,dy) ? '#bed58a' : '#435361'; ctx.fillRect(x+(dx+1)*7,y+(dy+1)*7,6,6);
  }
  ctx.fillStyle='#edf4ed';
}
type MaskResult = { mask: number; kind: string; refs: Ref[]; unsupported?: string; missingRoles?: string[]; detail?: unknown };
function maskSheet(id: string, rows: MaskResult[]) {
  const c = board(16*100, Math.ceil(rows.length/16)*99); const ctx=c.getContext('2d');
  rows.forEach((r,i)=>{const x=i%16*100,y=Math.floor(i/16)*99;drawMask(c,r.mask,x+3,y+3);
    ctx.fillText(String(r.mask).padStart(3,'0'),x+31,y+15);
    if (!r.unsupported) r.refs.forEach(ref=>draw(c,ref,x+25,y+27,3));
    else { ctx.fillStyle='#ffb088';ctx.fillText('Smart repair',x+3,y+48);ctx.fillText('required',x+3,y+63);ctx.fillStyle='#edf4ed'; }
    ctx.fillText(r.refs.map(ref=>ref.frame).join('+').slice(0,14) || 'base',x+3,y+91);
    if(r.missingRoles?.length){ctx.fillStyle='#ffb088';ctx.fillText('role missing',x+3,y+78);ctx.fillStyle='#edf4ed';}
  }); imageOut(`rules/${id}-masks.png`,c);
}
const rules: {id:string; evidence:string; meaning:string; notes:string[]; masks:MaskResult[]; [key:string]:unknown}[]=[];
for(const [id, family] of Object.entries(TERRAIN_CLIFF_FAMILIES)) {
  if (!family.available) continue;
  const ts:RaisedTerrainTileSet=family.tileSet;
  const masks:MaskResult[]=Array.from({length:256},(_,mask)=>{
    const plan=resolveRaisedTerrainTile({raisedAt:matches(mask)},ts,'tall',0,0);
    const refs:Ref[]=[];
    if(plan.edgeFrame!==null) refs.push({asset:ts.assetId,frame:plan.edgeFrame,role:plan.edgeRole!});
    plan.insetFrames.forEach((f,i)=>refs.push({asset:ts.insetAssetId??ts.assetId,frame:f,role:plan.insetRoles[i]}));
    return {mask,kind:maskKind(mask),refs,...(plan.insetRoles.length>1?{unsupported:'Multiple inset blocks occupy one cell; Smart Placement widens the local neck.'}:{}),missingRoles:plan.insetRoles.filter(role=>ts.insetFrames[role]===undefined),detail:plan};
  });
  maskSheet(`cliff-${id}`,masks);
  const notes=['Eight adjacent cells resolve the local rim and inset; face projection also reads source rows behind the displayed cell.',
    'N edge precedes S, then W, then E. One-cell/T/cross cases may share a frame; enumeration proves current behavior, not complete source art.',
    'South-facing exposed rows supply vertical faces; face left/middle/right depends on neighbouring face coverage. Native alpha shadows are retained.'];
  if(Object.keys(ts.insetFrames).length===0) notes.push('No inset frames registered: diagonal concave roles have no source mapping in this family.');
  if(!ts.faceProfiles.tall?.rows.length) notes.push('No authored vertical face bank; this is a flat rim, not a tall cliff.');
  if(ts.projectionStyle==='interior')notes.push('Inverse interior: solid rock owns the rim; a complete room requires a verified opaque mass fill. Missing fill or source banks with unverified roles are not presented as valid assembled examples.');
  const named:Ref[]=[...Object.entries(ts.edgeFrames).map(([role,frame])=>({asset:ts.assetId,frame:frame!,role})),...Object.entries(ts.insetFrames).map(([role,frame])=>({asset:ts.insetAssetId??ts.assetId,frame:frame!,role}))];
  for(const [profile,bank]of Object.entries(ts.faceProfiles))for(const row of [...bank.rows,...(bank.repeatRows??(bank.repeatRow?[bank.repeatRow]:[]))])row.frames.forEach((frame,i)=>named.push({asset:ts.assetId,frame,role:`${profile}.${row.id}.${['left','middle','right'][i]}`}));
  if(ts.rampBank)for(const [course,bank]of [['crest',ts.rampBank.crest],...ts.rampBank.treads.map((t,i)=>[`tread${i}`,t]),['base',ts.rampBank.base]] as const){
    const b=bank as NonNullable<RaisedTerrainTileSet['rampBank']>['crest'];
    [b.left,...b.middle,b.right].forEach((frame,i)=>named.push({asset:ts.rampBank!.assetId,frame,role:`ramp.${course}.${i}`}));
  }
  if(ts.ledgeBank){for(const[role,frame]of Object.entries({...ts.ledgeBank.edgeFrames,...ts.ledgeBank.insetFrames}))named.push({asset:ts.ledgeBank.assetId,frame:frame!,role:`ledge.${role}`});}
  const bankImage=board(6*225,Math.ceil(named.length/6)*94);
  named.forEach((r,i)=>{const x=i%6*225,y=Math.floor(i/6)*94;draw(bankImage,r,x+3,y+3,3);bankImage.getContext('2d').fillText(r.role??'',x+3,y+68);bankImage.getContext('2d').fillText(`${r.frame} ${r.asset.replace('tile_cf_','')}`.slice(0,33),x+3,y+85);});
  imageOut(`rules/cliff-${id}-roles.png`,bankImage);
  const c=board(6*272,414); const ctx=c.getContext('2d');
  const formationEvidence: {name:string;input:unknown;added:unknown;points:unknown}[]=[];
  const substrate = 'substrate' in family ? family.substrate : undefined;
  // Explicit fallback is diagnostic only; reviewed outdoor families supply
  // source-backed surrounding/cap refs instead of a universal grass fill.
  const surrounding = substrate?.surrounding ?? {assetId:'tile_cf_cave_floor_middle',frame:0};
  const cap = substrate?.cap;
  const sourceReview = 'sourceReview' in family ? family.sourceReview : undefined;
  const formationStatus = sourceReview?.status==='unverified' ? sourceReview.reason : cap===null ? 'No verified opaque rock-mass fill is registered for this interior. Native banks are shown; complete room assembly remains unverified.' : undefined;
  Object.entries(TERRAIN_CATALOGUE_SHAPES).forEach(([name,shape],i)=>{
    const normalized=catalogueFormation(shape), raisedAt=normalized.occupiedAt;
    formationEvidence.push({name,input:normalized.input,added:normalized.added,points:normalized.points});
    ctx.fillText(name,i*272+8,18);
    for(let y=-1;y<9;y++)for(let x=-1;x<8;x++){
      const px=i*272+8+(x+1)*28,py=30+(y+1)*28;
      const p=resolveRaisedTerrainTile({raisedAt},ts,'tall',x,y);
      const fill=raisedAt(x,y)&&p.edgeFrame===null&&cap?cap:surrounding;
      draw(c,{asset:fill.assetId,frame:fill.frame},px,py,28/16);
      // Match the shared painter: indirect face coverage supports topology,
      // but is not another visible wall at a stepped corner.
      if(p.faceLayers.some(f=>f.direct))p.faceLayers.forEach(f=>{
        if(f.seamUnderlayFrame!==undefined)draw(c,{asset:ts.assetId,frame:f.seamUnderlayFrame},px,py,28/16);
        draw(c,{asset:ts.assetId,frame:f.frame},px,py,28/16);
      });
      if(p.edgeSeamUnderlayFrame!==undefined&&p.insetFrames.length===0)draw(c,{asset:ts.assetId,frame:p.edgeSeamUnderlayFrame},px,py,28/16);
      if(p.edgeFrame!==null)draw(c,{asset:ts.assetId,frame:p.edgeFrame},px,py,28/16);
      if(p.insetRoles.length>1)throw new Error(`Multiple insets in Smart formation: ${id}/${name}/${x},${y}`);
      p.insetFrames.forEach(f=>draw(c,{asset:ts.insetAssetId??ts.assetId,frame:f},px,py,28/16));
    }
    ctx.fillText(normalized.added.length?`Smart added ${normalized.added.length} neighbouring cells`:'Native continuous courses',i*272+8,334);
    // Small tile-plan evidence: amber marks assisted cells; outlines are the
    // authored input. This makes diagonal widening inspectable, not hidden.
    for(const point of normalized.points){ctx.fillStyle=normalized.inputAt(point.tileX,point.tileY)?'#94aa83':'#f8bd69';ctx.fillRect(i*272+8+point.tileX*9,350+point.tileY*9,8,8);}
    ctx.fillStyle='#edf4ed';
  });
  if(formationStatus){ctx.fillStyle='#243039';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#ffb088';ctx.fillText(`${id}: assembled preview withheld`,24,42);ctx.fillText('Native role banks below remain available for inspection; this family is not verified for automatic room assembly.',24,72);}
  imageOut(`rules/cliff-${id}-formations.png`,c);
  rules.push({id:`cliff-${id}`,evidence:'packages/sim/src/terrain-tilesets.ts',meaning:'Bit=adjacent raised/solid cell; centre is raised.',notes,masks,tileSet:ts,substrate,formationStatus,formationEvidence,namedRoles:named,roleImage:`rules/cliff-${id}-roles.png`,formations:`rules/cliff-${id}-formations.png`});
}
for(const [id,f]of Object.entries(TERRAIN_SURFACE_FAMILIES)) {
  const ts:RaisedTerrainTileSet={projectionStyle:'raised',assetId:f.ledgeBank.assetId,edgeFrames:f.ledgeBank.edgeFrames,insetFrames:f.ledgeBank.insetFrames,rampFrames:{},rampBank:null,ledgeBank:null,stairFrames:null,ladderFrames:null,faceProfiles:{tall:{rows:[]}}};
  const masks=Array.from({length:256},(_,mask)=>{const p=resolveRaisedTerrainTile({raisedAt:matches(mask)},ts,'tall',0,0);return{mask,kind:maskKind(mask),refs:[{asset:f.assetId,frame:0},...(p.edgeFrame===null?[]:[{asset:ts.assetId,frame:p.edgeFrame}]),...p.insetFrames.map(frame=>({asset:ts.assetId,frame}))],...(p.insetRoles.length>1?{unsupported:'Multiple inset blocks; Smart Placement repairs the local neck.'}:{})};});
  maskSheet(id,masks);rules.push({id,evidence:'packages/sim/src/terrain-tilesets.ts',meaning:'Bit=adjacent same surface; extracted ledge bank. Centre fill beneath native edge/inset.',notes:['Source fringe and wood/stone ramp banks remain separate named banks; ramp minimum width is two lanes.'],masks,surface:f});
}
function terrain(mask:number,center:string,on:string,off:string):TerrainArray {
  const biomes=new Uint8Array(49).fill(MAP_BIOME_IDS.indexOf(off as typeof MAP_BIOME_IDS[number]));
  biomes[24]=MAP_BIOME_IDS.indexOf(center as typeof MAP_BIOME_IDS[number]);
  offsets.forEach(([x,y],i)=>{if(mask&(1<<i))biomes[(3+y)*7+3+x]=MAP_BIOME_IDS.indexOf(on as typeof MAP_BIOME_IDS[number]);});
  return {spaceId:0,seed:0,version:0,width:7,height:7,biomes,blocked:new Uint8Array(49),horseJumpableTerrain:new Uint8Array(49),elevations:new Int16Array(49),dirtCliffRoles:new Uint8Array(49),dirtTerraces:new Uint8Array(49)};
}
const flat=[
  {id:'beach',center:'beach',on:'water',off:'beach',base:'tile_cf_beach',resolve:beachFrameIndexAt,inset:'tile_cf_beach_inset',insets:shorelineInsetFrameIndicesAt,meaning:'Bit=water neighbour; centre is beach.'},
  {id:'desert-shore',center:'desert_shore',on:'oasis_water',off:'desert_shore',base:'tile_cf_desert_shore',resolve:desertShoreFrameIndexAt,inset:'tile_cf_desert_shore_inset',insets:shorelineInsetFrameIndicesAt,meaning:'Bit=oasis/ocean water neighbour; centre is desert shore.'},
  {id:'freshwater-river',center:'freshwater',on:'plains',off:'freshwater',base:'tile_cf_freshwater',resolve:freshwaterFrameIndexAt,inset:'tile_cf_freshwater_inset',insets:freshwaterInsetFrameIndicesAt,meaning:'Bit=land neighbour; centre is freshwater. Waterfall/ocean connect as water.'},
  {id:'desert-grass',center:'desert',on:'savanna',off:'desert',base:'tile_cf_desert_grass_edge',resolve:desertGrassEdgeFrameIndexAt,inset:'tile_cf_desert_grass_inset',insets:desertGrassInsetFrameIndicesAt,meaning:'Bit=vegetated neighbour; centre is desert.'},
  {id:'grass-sand',center:'beach',on:'beach',off:'plains',base:'tile_cf_farmland_grass_inset',resolve:grassSandTransitionFrameIndexAt,meaning:'Bit=non-vegetated neighbour; centre is beach. Ocean counts connected.'},
  {id:'paving-grass',center:'paving',on:'paving',off:'plains',base:'tile_cf_farmland_grass_inset',resolve:pavingGrassTransitionFrameIndexAt,meaning:'Bit=non-vegetated neighbour; centre is paving. This is grass fringe, not pavement kerb art.'},
  {id:'savanna-grass',center:'savanna',on:'savanna',off:'plains',base:'tile_cf_savanna_grass_inset',resolve:savannaGrassTransitionFrameIndexAt,meaning:'Bit=non-dark-grass neighbour; centre is savanna.'},
];
for(const f of flat){const masks=Array.from({length:256},(_,mask)=>{const t=terrain(mask,f.center,f.on,f.off),n=f.resolve(t,3,3),insets='insets'in f?f.insets!(t,3,3):[];return {mask,kind:maskKind(mask),refs:[...(n===null?[]:[{asset:f.base,frame:n}]),...insets.map(frame=>({asset:f.inset!,frame}))],...(insets.length>1?{unsupported:'Multiple inset blocks; Smart Placement repairs the local neck.'}:{})};});maskSheet(f.id,masks);rules.push({id:f.id,evidence:'packages/engine/src/terrain.ts',meaning:f.meaning,notes:['Every raw 8-neighbour mask is recorded, including unsupported-looking narrow/T/cross cases. Nine-grid edge selection has precedence, not dedicated art for all 256 masks.','Raw multi-inset masks describe existing invalid geometry, not accepted Smart designs. Smart Placement repairs its local patch; Exact and historical geometry remain allowed.'],masks});}
// Assembled native examples exercise the same neighbour functions across a
// complete small patch, not just a selected centre frame.
for(const f of flat){
  const shapes=TERRAIN_CATALOGUE_SHAPES;
  const c=board(6*240,300),ctx=c.getContext('2d');
  Object.entries(shapes).forEach(([name,shape],i)=>{
    const t=terrain(0,f.center,f.on,f.off),biomes=new Uint8Array(100);
    const shore=f.id==='beach'||f.id==='desert-shore';
    const inside=shore?f.on:f.center,outside=shore?f.center:(f.id==='freshwater-river'?'plains':f.id==='desert-grass'?'savanna':'plains');
    biomes.fill(MAP_BIOME_IDS.indexOf(outside as typeof MAP_BIOME_IDS[number]));
    const normalized=catalogueFormation(shape);
    for(const {tileX,tileY} of normalized.points)biomes[(tileY+2)*10+tileX+2]=MAP_BIOME_IDS.indexOf(inside as typeof MAP_BIOME_IDS[number]);
    const field={...t,width:10,height:10,biomes};
    ctx.fillText(name,i*240+5,17);
    for(let y=1;y<9;y++)for(let x=1;x<9;x++){
      const biome=MAP_BIOME_IDS[biomes[y*10+x]!],px=i*240+5+(x-1)*28,py=30+(y-1)*28;
      const base=biome==='oasis_water'?'tile_cf_desert_waterfall_1':biome==='water'?'tile_cf_water':biome==='paving'?'tile_cf_hearth_pavement':biome==='beach'?'tile_cf_beach':biome==='desert_shore'?'tile_cf_desert_shore':biome==='desert'?'tile_cf_desert':biome==='savanna'?'tile_cf_desert_grass':'tile_cf_grass';
      draw(c,{asset:base,frame:biome==='oasis_water'?1:biome==='beach'||biome==='desert_shore'?4:biome==='paving'?(y%2)*2+x%2:0},px,py,28/16);
      if(biome===f.center){const n=f.resolve(field,x,y);if(n!==null)draw(c,{asset:f.base,frame:n},px,py,28/16);if('insets'in f)f.insets!(field,x,y).forEach(frame=>draw(c,{asset:f.inset!,frame},px,py,28/16));}
    }
    ctx.fillText(normalized.added.length?`Smart added ${normalized.added.length} local cells`:'Native local assembly',i*240+5,278);
  });imageOut(`rules/${f.id}-formations.png`,c);rules.find(r=>r.id===f.id)!.formations=`rules/${f.id}-formations.png`;
}
// The source itself proves this four-corner ring; do not infer repeatable
// straight kerbs or a general pavement autotile from it.
const pavement=board(560,170),pctx=pavement.getContext('2d');
pctx.fillText('Pavement fill: retained 2x2 centre bank',8,18);
for(let y=0;y<2;y++)for(let x=0;x<2;x++)draw(pavement,{asset:'tile_cf_hearth_pavement',frame:y*2+x},8+x*64,30+y*64,4);
const pavementAsset=byId.get('tile_cf_hearth_pavement')!;
for(const[y,row]of [['top',0],['bottom',1]] as const)for(const[x,col]of [['left',0],['right',1]] as const){const group=`curb_corner_${y}_${x}`;if(pavementAsset.frames[group])draw(pavement,{asset:pavementAsset.name,group,frame:0},330+col*64,30+row*64,4);}
pctx.fillText('Source-authored 2x2 curb ring',315,18);imageOut('rules/pavement-source-assembly.png',pavement);
const blobMasks=Array.from({length:256},(_,mask)=>({mask,kind:maskKind(mask),refs:[{asset:'tile_cf_path',frame:blob47FrameIndexFor(matches(mask))}]}));
maskSheet('blob47-path',blobMasks);rules.push({id:'blob47-path',evidence:'packages/engine/src/tilemap.ts',meaning:'Bit=connected same-material neighbour. Diagonal counts only when both adjacent cardinals match.',notes:['256 raw masks collapse to 47 canonical frames; frames are imported native art, not synthetic examples.'],masks:blobMasks});
for(const center of [false,true]){const id=`cave-floor-${center?'rocky':'normal'}`;const masks=Array.from({length:256},(_,mask)=>{const p=caveFloorAutotilePlan(matches(mask,center));return{mask,kind:maskKind(mask),refs:[{asset:'tile_cf_cave_floor_middle',frame:0},...(p.transitionFrame===null?[]:[{asset:'tile_cf_cave_floor',frame:p.transitionFrame}]),...p.insetFrames.map(frame=>({asset:'tile_cf_cave_floor',frame}))],detail:p,...(p.insetFrames.length>1?{unsupported:'Multiple inset blocks in this raw input; not a valid Smart design.'}:{})};});maskSheet(id,masks);rules.push({id,evidence:'packages/sim/src/cave-floor-autotile.ts',meaning:`Bit=rocky neighbour; centre ${center?'rocky':'normal'}.`,notes:['Cave Floor 1 and 2 share this role layout; variation and floor decoration are separate from adjacency.'],masks});}
for(const family of Object.keys(TERRAIN_SURFACE_FAMILIES) as (keyof typeof TERRAIN_SURFACE_FAMILIES)[]) {
  const id=`flat-fringe-${family}`;
  const masks=Array.from({length:256},(_,mask)=>{
    // Grass 1 intentionally follows the legacy blob fallback on bare ground.
    // A higher-priority grass seam exercises its native family border instead.
    const t=terrain(mask,family==='grass_1'?'plains':'paving','plains','paving');
    const surfaceFamilies=new Uint8Array(49).fill(Number(family.at(-1)));
    if(family==='grass_1')surfaceFamilies[24]=2;
    const layers=authoredGrassFringeLayersAt({...t,surfaceFamilies},3,3);
    return {mask,kind:maskKind(mask),refs:(layers??[]).map(l=>({asset:l.assetId,frame:l.frame}))};
  });maskSheet(id,masks);rules.push({id,evidence:'packages/engine/src/ground-cache.ts',meaning:'Bit=adjacent grass of this family at equal elevation; centre is paving (grass_1 uses a grass_2 seam).',notes:['Family priority is lexical; higher-priority adjacent grass paints onto lower-priority grass. Different elevations do not bleed.','Flat inverse quartet is source frames 65,64,49,48; distinct from the raised ledge quartet. Opposing sides fill with the opaque middle asset.'],masks});
}
const farmlandMasks=Array.from({length:256},(_,mask)=>{const t=terrain(0,'plains','plains','plains'), authoredFarmland=new Uint8Array(49);authoredFarmland[24]=1;offsets.forEach(([x,y],i)=>{if(mask&(1<<i))authoredFarmland[(3+y)*7+3+x]=1;});return{mask,kind:maskKind(mask),refs:authoredFarmlandGroundLayersAt({...t,authoredFarmland},3,3).map(l=>({asset:l.asset,frame:l.frame}))};});
maskSheet('farmland-dry',farmlandMasks);rules.push({id:'farmland-dry',evidence:'packages/engine/src/ground-cache.ts',meaning:'Bit=adjacent authored dry farmland; centre is farmland.',notes:['Dry soil plus optional grass inset use the same canonical blob47 index. Wet runtime soil is a distinct state, retained in the registered tile ledger.'],masks:farmlandMasks});
// A waterfall needs two rows of context, not merely an eight-neighbour mask.
const waterfallCases=Array.from({length:6},(_,i)=>({width:i+1,height:5})).flatMap(({width,height})=>Array.from({length:width*height},(_,i)=>{
  const x=i%width,y=Math.floor(i/width),t=terrain(0,'waterfall','waterfall','water');
  const biomes=new Uint8Array(15*15).fill(MAP_BIOME_IDS.indexOf('water'));
  for(let yy=0;yy<height;yy++)for(let xx=0;xx<width;xx++)biomes[(yy+4)*15+xx+4]=MAP_BIOME_IDS.indexOf('waterfall');
  const n=waterfallFrameIndexAt({...t,width:15,height:15,biomes},x+4,y+4);
  return{width,height,x,y,asset:'tile_cf_waterfall',frame:n};
}));
const fall=board(800,280);for(let w=1;w<=6;w++){fall.getContext('2d').fillText(`${w} lanes`,(w-1)*130+5,16);waterfallCases.filter(r=>r.width===w).forEach(r=>draw(fall,{asset:r.asset,frame:r.frame!},(w-1)*130+5+r.x*20,30+r.y*40,1.25));}imageOut('rules/waterfall-lanes.png',fall);
// Source sheet ledger. Cell ownership is conservative: matching a sourcePath alone
// is not evidence that every frame on that sheet was imported or assigned a role.
const sourceIndex=JSON.parse(await readFile(resolve(root,'docs/reference-assets/cute-fantasy-index.json'),'utf8')) as {entries:{source:string;pack:string;section:string;tileSet?:string;use?:string;layout?:unknown;sha256:string}[]};
const sourceEntries=sourceIndex.entries.filter(e=>e.source.includes('/Tiles/')||e.use==='tile-set'||tileAssets.some(a=>a.sourcePath===e.source));
const sourceLedger=[];
const roleOwners=new Map<string,Set<string>>();
for(const r of rules)for(const m of r.masks)for(const ref of m.refs){const key=`${ref.asset}:${ref.group??'base'}:${ref.frame}`;const owners=roleOwners.get(key)??new Set<string>();owners.add(r.id);roleOwners.set(key,owners);}

for(const r of rules)for(const ref of (r.namedRoles??[]) as Ref[]){const key=`${ref.asset}:${ref.group??'base'}:${ref.frame}`;const owners=roleOwners.get(key)??new Set<string>();owners.add(r.id);roleOwners.set(key,owners);}
for(const ref of waterfallCases){if(ref.frame!==null){const key=`${ref.asset}:base:${ref.frame}`,owners=roleOwners.get(key)??new Set<string>();owners.add('waterfalls');roleOwners.set(key,owners);}}
for(const e of sourceEntries){
  const bytes=await readFile(resolve(root,e.source)); const img=await loadImage(bytes);
  const columns=Math.ceil(img.width/16),rows=Math.ceil(img.height/16),c=board(columns*52,rows*65);
  const ctx=c.getContext('2d');const raw=createCanvas(img.width,img.height);raw.getContext('2d').drawImage(img,0,0);
  const rgba=raw.getContext('2d').getImageData(0,0,img.width,img.height).data;
  const owners=assets.filter(a=>a.sourcePath===e.source||Object.values(a.sourcePathsByGroup??{}).includes(e.source));
  const cells=[];
  for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
    const sx=x*16,sy=y*16,w=Math.min(16,img.width-sx),h=Math.min(16,img.height-sy);
    let nonempty=false;for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++)if(rgba[((sy+yy)*img.width+sx+xx)*4+3])nonempty=true;
    const refs: {asset:string;group:string;frame:number;coverage:string}[]=[];
    for(const a of owners){for(const[group,regions]of Object.entries(a.sourceRegions??{})){
      if((a.sourcePathsByGroup?.[group]??a.sourcePath)!==e.source)continue;
      regions.forEach(([rx,ry,rw,rh],frame)=>{if(rx<0||ry<0||rw<=0||rh<=0||rx+rw>img.width||ry+rh>img.height)throw new Error(`Invalid source crop ${a.name}:${group}:${frame}`);if(rx<sx+w&&ry<sy+h&&rx+rw>sx&&ry+rh>sy)refs.push({asset:a.name,group,frame,coverage:rx<=sx&&ry<=sy&&rx+rw>=sx+w&&ry+rh>=sy+h?'full-source-region':'partial-source-region'});});
    }
    if(a.sourceRegion&&a.sourcePath===e.source){const[rx,ry,rw,rh]=a.sourceRegion;if(rx<0||ry<0||rw<=0||rh<=0||rx+rw>img.width||ry+rh>img.height)throw new Error(`Invalid source region ${a.name}`);if(rx<sx+w&&ry<sy+h&&rx+rw>sx&&ry+rh>sy)refs.push({asset:a.name,group:'sourceRegion',frame:0,coverage:rx<=sx&&ry<=sy&&rx+rw>=sx+w&&ry+rh>=sy+h?'full-source-region':'partial-source-region'});}
    }
    const status=!nonempty?'empty-source-cell':refs.some(r=>r.coverage==='full-source-region')?'declared-import-region':refs.length?'partial-import-region':'unmapped-source-cell';
    cells.push({id:y*columns+x,column:x,row:y,rect:[sx,sy,w,h],status,refs,implementedRules:[...new Set(refs.flatMap(r=>[...(roleOwners.get(`${r.asset}:${r.group}:${r.frame}`)??[])]))]});
    ctx.drawImage(img,sx,sy,w,h,x*52+2,y*65+2,w*3,h*3);ctx.fillStyle=status==='unmapped-source-cell'?'#ffb088':'#edf4ed';ctx.fillText(`${x},${y}`,x*52+2,y*65+61);
  }
  const id=e.source.replace(/^references\/art\//,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/-png$/,'');
  imageOut(`sources/${id}.png`,c);
  sourceLedger.push({...e,id,width:img.width,height:img.height,sha256:hash(bytes),image:`sources/${id}.png`,cells,
    importedAssets:owners.map(a=>a.name),unlocatedImports:owners.filter(a=>!a.sourceRegion&&!a.sourceRegions).map(a=>a.name),
    ruleStatus:owners.length===0?'source-only; joining roles unverified':cells.some(c=>c.implementedRules.length)?'some imported banks have implemented rules; remaining cells unverified':'imported source; joining roles unverified',
    implementedRules:[...new Set(cells.flatMap(c=>c.implementedRules))]});
}
const biomeAssets:Record<string,string[]>={water:['tile_cf_water'],beach:['tile_cf_beach','tile_cf_beach_inset'],freshwater:['tile_cf_freshwater','tile_cf_freshwater_inset'],waterfall:['tile_cf_waterfall','tile_cf_waterfall_flow'],desert:['tile_cf_desert'],desert_shore:['tile_cf_desert_shore','tile_cf_desert_shore_inset'],desert_ridge:['tile_cf_desert'],oasis:['tile_cf_desert_grass'],oasis_water:['tile_cf_water'],savanna:['tile_cf_desert_grass','tile_cf_savanna_grass_inset'],coastal_cliff:['tile_cf_beach','tile_cf_stone_cliff_variants'],dirt_terrace:['tile_cf_path'],dirt_ridge:['tile_cf_grass_dirt_cliff_edge'],volcanic_ash:['tile_cf_rogue_volcanic_floor'],lava:['tile_cf_rogue_volcanic_lava'],paving:['tile_cf_hearth_pavement','tile_cf_farmland_grass_inset']};
const biomes=MAP_BIOME_IDS.map(id=>({id,status:'runtime-biome',assets:biomeAssets[id]??['tile_cf_grass'],evidence:'packages/engine/src/ground-cache.ts',note:'Default base/overlay artwork; authored grass surface and cliff families can override it. Biome identity does not enforce geometry.'}));
const totals={registeredTileAssets:tileAssets.length,registeredTileFrames:assetLedger.reduce((s,a)=>s+a.frameCount,0),sourceSheets:sourceLedger.length,sourceOnlySheets:sourceLedger.filter(s=>s.importedAssets.length===0).length,sourceSheetsWithImplementedBanks:sourceLedger.filter(s=>s.implementedRules.length>0).length,
  sourceCells:sourceLedger.reduce((s,a)=>s+a.cells.length,0),nonemptySourceCells:sourceLedger.reduce((s,a)=>s+a.cells.filter(c=>c.status!=='empty-source-cell').length,0),
  unmappedNonemptySourceCells:sourceLedger.reduce((s,a)=>s+a.cells.filter(c=>c.status==='unmapped-source-cell').length,0),
  partialImportCells:sourceLedger.reduce((s,a)=>s+a.cells.filter(c=>c.status==='partial-import-region').length,0),
  runtimeBiomes:biomes.length,availableCliffFamilies:Object.values(TERRAIN_CLIFF_FAMILIES).filter(f=>f.available).length,
  reservedCliffFamilies:Object.values(TERRAIN_CLIFF_FAMILIES).filter(f=>!f.available).length,surfaceFamilies:Object.keys(TERRAIN_SURFACE_FAMILIES).length,
  maskRuleFamilies:rules.length,maskCases:rules.reduce((s,r)=>s+r.masks.length,0),waterfallCases:waterfallCases.length};
const gaps=[
  'Initial audit found tile_cf_interior_wall imported a transparent gutter at (48,0), and tile_cf_desert_grass was all transparent. The audit corrected these stable IDs with native crops; the contact sheets below show the corrected imports. This historical finding must not be mistaken for an intentional empty joining state.',
  'Snow cliff family is explicitly reserved: checked Christmas source has no cliff sheet. Ground overlays are not substitute cliff faces.',
  'Shroomlands primary inverse corners use source frames 3, 4, 12 and 13. Its separate salmon ground quartet is path art, not inverse cliff art; the compact ledge bank also has separate roles.',
  'Basic cliff has no authored vertical wall course. No synthetic face or shadow is fabricated.',
  'No cliff family supports a dedicated stair painter contract; ladder artwork is not traversable ladder authority. Registered ramps support north/up only, minimum two lanes.',
  'Pavement source includes kerbs/rings/stairs as well as fill. Coordinate variants do not prove complete automatic joining roles. Paving-grass mask is a grass fringe only.',
  'Nine-grid shores and freshwater banks collapse many T/cross/narrow masks through precedence. Existing behavior is shown exactly; it does not prove an authored tile for each topology.',
  'Source cells without declared regions remain unresolved even if their sheet has imports. Some transformed/imported frames intentionally lack a direct source rectangle; consult full inventory pixel comparisons.',
  'Source table includes indexed terrain sheets and every registered tile source within the Cute Fantasy index. Other source formats/library packs are accounted for by the complete inventory, not silently claimed by this terrain guide.',
  'Family waterfallAssetId is source availability, not proof of all animation/course mappings. Only the core waterfall runtime lane resolver is exercised here; biome sheets retain unknown roles where absent.',
  'Smart formations are local native cap/wall/foot assemblies, with family-specific substrate and repaired diagonal necks. Raw multi-inset masks are explicitly unsupported placement designs; old maps and Exact Placement remain legal.',
  'Volcanic interior legacy primary frames are staircase art; a complete inverse wall bank is unverified. Its assembled preview is withheld. Cave/dungeon interiors also lack a verified opaque rock-mass fill; no generic green/brown block substitutes for that missing contract.',
  'Shroomland ground patches and path transitions are visible in the source sheets, but are not yet registered as complete semantic material families. Cliff source correctness does not establish those missing joining rules.',
];
json('catalogue.json',{version:1,generator:'scripts/render-terrain-catalogue.ts',totals,maskLegend,biomes,gaps,assets:assetLedger,sources:sourceLedger,rules,waterfall:{evidence:'packages/engine/src/terrain.ts#waterfallFrameIndexAt',notes:'Column left/middle/right from neighbours. Row 0 crest, 1 upper flow, 2 middle, 3 lower flow, 4 foot, requiring two rows of context. One-lane chooses left, not a double-cap. Animation remains separate.',cases:waterfallCases}});
const style=`body{font:16px/1.55 system-ui;background:#141e25;color:#edf4ed;margin:0 auto;max-width:1500px;padding:24px}a{color:#a5d4ff}nav{position:sticky;top:0;background:#141e25;padding:12px;border-bottom:1px solid #65808e}h2{margin-top:48px}img{image-rendering:pixelated;max-width:100%;height:auto;background:#243039}details{scroll-margin-top:70px;border:1px solid #465c66;padding:12px;margin:12px 0}summary{cursor:pointer;font-weight:bold}code{color:#dce6aa}table{border-collapse:collapse;width:100%}td,th{padding:6px;text-align:left;border:1px solid #465c66}.gap{color:#ffc39d}.scroll{overflow:auto}.scroll img{max-width:none}input{padding:10px;width:70%;font:inherit}small{color:#adc0ca}`;
let html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Native terrain joining atlas</title><link rel="icon" href="data:,"><style>${style}</style><h1>Native terrain joining atlas</h1><p>Generated from registered pixel grids, licensed source sheets and the actual shared runtime resolvers. No invented art, deleted stable IDs, or global map repair.</p><nav><a href="#rules">Joining rules</a> · <a href="#sources">Source sheets</a> · <a href="#assets">All registered tiles</a> · <a href="#gaps">Gaps</a> · <a href="catalogue.json">Machine-readable catalogue</a> · <a href="../inventory/README.md">Full atlas inventory</a></nav><p>${Object.entries(totals).map(([k,v])=>`${escape(k)}: <b>${v}</b>`).join(' · ')}</p><h2>Reading the guide</h2><p>Each mask uses bits <code>N=1 E=2 S=4 W=8 NE=16 SE=32 SW=64 NW=128</code>. Green squares mean the family-specific predicate is true; read each family's definition. The centre square is selected. Numbers under art are frame IDs drawn in order; all layer asset IDs appear in JSON. Every raw mask (0–255) is shown, including centres, straight edges, convex/concave turns, endpoints, T/crosses and diagonals. Repeated images can be intentional rule fallbacks.</p><p>Native transparent shadows are retained against the preview background. Source inspection grids use 16px cells; a cell is not automatically a valid placement unit or joining role. Orange source coordinates mark nonempty cells without a declared import rectangle. The grid preserves incomplete edge cells. Complete source-sheet captures are generated locally and excluded from Git, like the licensed references directory; regenerate on the licensed host to view them.</p><h2 id="gaps">Known limitations and missing rules</h2><ul>${gaps.map(x=>`<li class="gap">${escape(x)}</li>`).join('')}</ul><h2 id="rules">Implemented joining rules</h2>`;
for(const r of rules){html+=`<details id="${r.id}"><summary>${escape(r.id)} — ${r.masks.length} masks</summary><p>${escape(r.meaning)} <a href="${link(r.evidence)}">Resolver source</a></p><ul>${r.notes.map(n=>`<li>${escape(n)}</li>`).join('')}</ul>${r.roleImage?`<p>Named native banks: edge, inset, face/foot, ramp and ledge roles. Frame IDs refer to the named asset, never to a global index.</p><a href="${r.roleImage}"><img loading="lazy" src="${r.roleImage}" alt="${r.id} named source roles"></a>`:''}${r.formationStatus?`<p class="gap">${escape(r.formationStatus)}</p>`:''}${r.formations&&!r.formationStatus?`<p>Six Smart Placement formations: 2×2 logical minimum (native inset pixels reduce the visible cap), rectangle, concave notch, corrected diagonal, T and cross. Amber plan cells show local assistance. Native cap, wall and foot courses use the family’s own substrate. Raw unsupported masks below are diagnostic and are not valid placement examples.</p><a href="${r.formations}"><img loading="lazy" src="${r.formations}" alt="${r.id} native assembled formations"></a>`:''}<a href="rules/${r.id}-masks.png"><img loading="lazy" src="rules/${r.id}-masks.png" alt="All 256 masks for ${r.id}"></a></details>`;}
html+=`<details id="waterfalls"><summary>Waterfall lane and course rules</summary><p>Core waterfall uses 3 columns × 5 courses, with two rows of vertical lookahead. One-lane art uses the left frame; no double-capped tile is implied. Other biome falls are visible in their source and registered banks, with mapping gaps recorded.</p><img loading="lazy" src="rules/waterfall-lanes.png" alt="Native waterfall lanes one through six"></details><details id="pavement-source-assembly"><summary>Paving: native fill and authored curb ring</summary><p>The four native corner crops reassemble the original 2×2 ring. Straight kerbs and arbitrary T/cross/concave paving joins remain unverified; source-coordinate fragments are exposed for exact placement, without invented automatic roles.</p><img loading="lazy" src="rules/pavement-source-assembly.png" alt="Native pavement fill and four-corner curb ring"></details><h2 id="sources">Every terrain source sheet</h2><p>Filter by pack, source filename, or asset ID. Open a sheet to inspect every source cell and import gaps. Detailed cell-to-frame ownership is in <a href="catalogue.json">catalogue.json</a>.</p><input id="filter" placeholder="Filter source sheets and registered tiles" aria-label="Filter source sheets and registered tiles">`;
for(const s of sourceLedger){const missing=s.cells.filter(c=>c.status==='unmapped-source-cell').length;html+=`<details class="searchable" data-search="${escape(s.source+' '+s.importedAssets.join(' '))}" id="source-${s.id}"><summary>${escape(s.pack+' / '+s.source.split('/').at(-1))} — ${s.cells.length} cells, ${missing} unresolved</summary><p><a href="${link(s.source)}">Original native PNG</a> · ${s.width}×${s.height} · SHA-256 <code>${s.sha256}</code></p><p>${escape(s.tileSet??'Roles unknown')}</p><p class="gap">${escape(s.ruleStatus)}</p><p>Implemented banks: ${s.implementedRules.map(id=>`<a href="#${id}">${id}</a>`).join(', ')||'none'}. This does not cover the entire source sheet.</p><p>Imports: ${s.importedAssets.map(id=>`<a href="${assetLedger.some(a=>a.asset===id)?`#asset-${id}`:'../inventory/README.md'}">${id}</a>`).join(', ')||'<span class="gap">None registered</span>'}</p><p>Imports without located crop metadata: ${escape(s.unlocatedImports.join(', ')||'none')}. These do not count as source-cell coverage.</p><a href="${s.image}"><img loading="lazy" src="${s.image}" alt="${escape(s.source)} every source cell"></a><p class="gap">${missing} nonempty cells with no declared import: ${s.cells.filter(c=>c.status==='unmapped-source-cell').map(c=>`(${c.column},${c.row})`).join(' ')||'none'}</p></details>`;}
html+='<h2 id="assets">Every tile-category or tile-named asset and frame</h2>';
for(const a of assetLedger){html+=`<details class="searchable" data-search="${escape(a.asset+' '+a.source)}" id="asset-${a.asset}"><summary>${a.asset} — ${a.frameCount} frames</summary><p>${a.source?`<a href="${link(a.source)}">Source PNG</a>`:'No source path'} · ${escape(JSON.stringify(a.frameKinds))}. Groups preserve variation/animation/state identity.</p><a href="${a.image}"><img loading="lazy" src="${a.image}" alt="All frames of ${a.asset}"></a></details>`;}
html+=`<h2>Runtime biome ledger</h2><ul>${biomes.map(b=>`<li><code>${b.id}</code>: ${b.assets.map(a=>`<a href="#asset-${a}">${a}</a>`).join(', ')}</li>`).join('')}</ul><p>Biomes are substrate identities; several share art and join rules. Interior floor/architecture sources are also included above.</p><script>document.querySelector('#filter').addEventListener('input',e=>{const q=e.target.value.toLowerCase();document.querySelectorAll('.searchable').forEach(d=>{d.hidden=!d.dataset.search.toLowerCase().includes(q)})});function openHash(){if(location.hash){const d=document.getElementById(location.hash.slice(1));if(d?.tagName==='DETAILS'){d.hidden=false;d.open=true}}}addEventListener('hashchange',openHash);openHash()</script></html>`;
emit('index.html',html);
emit('README.md',`# Terrain atlas evidence\n\nOpen [the navigable guide](index.html), [machine-readable rules and source-cell ledger](catalogue.json), or [the full asset inventory](../inventory/README.md).\n\nReproduce from repository root:\n\n\`\`\`sh\nnpx tsx scripts/render-terrain-catalogue.ts\nnpx tsx scripts/render-terrain-catalogue.ts --check\n\`\`\`\n\nRequires the licensed \`references/art\` source library and installed workspace dependencies. Complete source-sheet captures in \`sources/\` are local-only and excluded from Git, matching the existing licensed-reference policy. Registered-art examples and source-cell metadata are versioned. Missing source files, frames or invalid colors fail generation. \`--check\` regenerates in memory and compares every expected artifact byte-for-byte; it writes nothing. No live source/generated atlas files change. The audit PR owns release notes and integration checks.\n\n${Object.entries(totals).map(([k,v])=>`- ${k}: ${v}`).join('\n')}\n\nThe source ledger selects all Cute Fantasy index entries under \`/Tiles/\`, classified as \`tile-set\`, or referenced by a registered tile. Every selected sheet and cell is retained, including empty cells; source crop ownership is conservatively classified as declared/partial/unmapped, never inferred from filename alone. The full inventory accounts for the rest of the source library and formats.\n\nAll 256 neighbour masks are enumerated per rule family using the actual exported resolver. JSON records the bit predicate, frame/layer IDs, full cliff bank definitions, and missing roles. T/cross/diagonal cases may map to repeated native frames through the current precedence rules. Coverage is an audit of implementation, not a claim that every topology is visually supported.\n\nOutdoor examples show minimum 2×2, rectangle, concave, corrected diagonal, T and cross formations with matching native substrate. Tile plans expose the edited input and amber Smart additions. Multi-inset raw masks are not advertised as valid geometry. Unverified interior assemblies are withheld with precise missing-role explanations; native source banks remain visible. Local authoring assistance may update a placed cell and neighbours; historical invalid maps remain allowed.\n\n## Explicit gaps\n\n${gaps.map(g=>`- ${g}`).join('\n')}\n`);
// Check coverage invariants before considering output successful.
if(rules.some(r=>r.masks.length!==256||new Set(r.masks.map(m=>m.mask)).size!==256))throw new Error('Incomplete masks');
if(new Set(blobMasks.map(m=>m.refs[0]!.frame)).size!==47)throw new Error('Blob47 coverage mismatch');
if(assetLedger.length!==tileAssets.length)throw new Error('Tile ledger mismatch');
for(const r of rules)for(const m of r.masks)for(const ref of m.refs)frame(ref);
json('artifact-manifest.json',{generator:'scripts/render-terrain-catalogue.ts',artifacts:[...outputs].map(([path,bytes])=>({path,bytes:bytes.length,sha256:hash(bytes)})).sort((a,b)=>a.path.localeCompare(b.path))});
for(const[path,bytes]of outputs){const target=resolve(output,path);if(check){const prior=await readFile(target);if(!bytes.equals(prior))throw new Error(`Stale artifact: ${relative(root,target)}`);}else{await mkdir(resolve(target,'..'),{recursive:true});await writeFile(target,bytes);}}
console.log(JSON.stringify({mode:check?'verified':'generated',artifacts:outputs.size,...totals}));

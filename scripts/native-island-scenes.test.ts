import { readFileSync,readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { it,expect } from 'vitest';
import { framesForAsset,resolveColor } from '../packages/tools/src/assets/pixels.js';
import type { AssetSource,PaletteSource } from '../packages/tools/src/assets/types.js';
import type { LoadedAsset } from '../packages/ui/src/index.js';
import type { OverworldArt } from '../packages/engine/src/overworld-art.js';
import { createNativeIslandRenderer } from './native-island-preview/core.js';
import { cinderwakeDesign,willowharbourDesign } from './native-island-scenes.js';

const directory=resolve(import.meta.dirname,'../packages/assets');
const sources=new Map<string,AssetSource>();
for(const folder of readdirSync(directory,{withFileTypes:true}).filter(entry=>entry.isDirectory())){
  if(folder.name==='generated')continue;
  for(const file of readdirSync(resolve(directory,folder.name)).filter(name=>/\.(sprite|tile)\.json$/.test(name))){
    const asset=JSON.parse(readFileSync(resolve(directory,folder.name,file),'utf8')) as AssetSource;sources.set(asset.name,asset);
  }
}
it('exports both native drafts as valid Studio maps with the same art coordinates and visual selection',()=>{
  for(const scene of [cinderwakeDesign(),willowharbourDesign()]){
    const assets=new Map<string,LoadedAsset>();
    for(const p of scene.placements){
      expect(p.asset.startsWith('source:')).toBe(false);expect(p.crop).toBeUndefined();
      const source=sources.get(p.asset)!;expect(source,`${scene.id}: ${p.asset}`).toBeDefined();
      const groups=framesForAsset(source);
      const frames=Object.fromEntries(Object.entries(groups).map(([name,grids])=>[name,grids.map((_,i)=>({x:i*source.size[0],y:0,width:source.size[0],height:source.size[1],durationTicks:0}))]));
      assets.set(source.name,{name:source.name,assetId:[...sources.keys()].indexOf(source.name)+1,image:{} as CanvasImageSource,atlasRevision:1,anchor:source.anchor,collision:[],tags:[],
        placement:{layer:'object',footprint:[1,1],blocksMovement:false,builderAvailable:false},metadata:{image:'fixture',animations:{},variants:frames,states:{}}});
    }
    const renderer=createNativeIslandRenderer({} as OverworldArt,assets,'native-review');
    const map=renderer.editable(scene);
    expect(map.objects.length).toBe(scene.placements.length);expect(map.prefabs.length).toBeGreaterThan(40);
    const byId=new Map(map.objects.map(object=>[object.id,object]));
    for(const p of scene.placements){
      const object=byId.get(p.id)!,asset=assets.get(p.asset)!;
      const prefab=map.prefabs.find(prefab=>prefab.id===object.prefabId)!;
      expect(prefab.placements[0]!.assetName).toBe(p.asset);
      expect(prefab.placements[0]!.visual.frameIndex).toBe(p.frame??0);
      const tile=p.asset.startsWith('tile_');
      expect(object.tileX*16+8-asset.anchor[0]).toBe(tile?p.x:p.x-asset.anchor[0]);
      expect((object.tileY+1)*16-asset.anchor[1]).toBe(tile?p.y+1:p.y-asset.anchor[1]);
      expect(object.elevation).toBe(0);
    }
  }
});

it('uses complete waterfall poses and masonry interiors while leaving visible cliff cells clear of scenery',()=>{
  const scene=cinderwakeDesign(),review=scene.review!;
  expect(review.falls.length).toBeGreaterThanOrEqual(4);
  for(const fall of review.falls){
    const pieces=scene.placements.filter(p=>p.role==='lavafall'&&p.x>=fall.left*16&&p.x<(fall.left+fall.width)*16&&p.y>=fall.y*16&&p.y<(fall.y+5)*16);
    expect(pieces.length).toBe(fall.width*5);
    for(let dy=0;dy<5;dy++)for(let dx=0;dx<fall.width;dx++)expect(pieces.some(p=>p.x===(fall.left+dx)*16&&p.y===(fall.y+dy)*16&&p.frame===dy*54+(dx===0?0:dx===fall.width-1?2:1))).toBe(true);
    expect(scene.placements.some(p=>p.role==='lava'&&p.x>=fall.left*16&&p.x<(fall.left+fall.width)*16&&p.y>fall.y*16&&p.y<(fall.y+4)*16)).toBe(false);
  }
  const basins=new Set(review.basinCells);
  expect(basins.size).toBeGreaterThan(50);
  for(const p of scene.placements)if(basins.has(`${p.x/16},${p.y/16}`)){
    expect(p.role).not.toBe('cliff');expect(p.role).not.toBe('lava');
  }
  for(const [x,y] of [[36,56],[36,57],[39,79],[86,67],[86,68]])expect(basins.has(`${x},${y}`)).toBe(true);
  const palette={colors:{},markerDefaults:{}} as PaletteSource;
  const bank=sources.get('tile_cf_volcano_design_sheet')!,bankFrames=framesForAsset(bank).base!;
  const interior=scene.placements.filter(p=>p.role==='masonry'&&p.asset===bank.name&&p.frame===223);
  expect(interior.length).toBeGreaterThan(100);
  const masonryColors=new Set(['104,92,112','155,171,178','124,139,146','78,69,84']);
  // A full masonry frame has no volcanic ash. Border frames are tested through
  // source topology, rather than accepting arbitrary source-correct fragments.
  for(const row of bankFrames[223]!)for(const token of row){
    const rgba=resolveColor(token,palette,{},bank.markers??{},bank.sourcePalette??{});
    expect(rgba[3]).toBe(255);expect(masonryColors.has(rgba.slice(0,3).join(','))).toBe(true);
  }
  const protectedCells=new Set([...review.cliffCells,...review.roadCells]);
  const plants=scene.placements.filter(p=>p.role==='foliage');expect(plants.length).toBeGreaterThan(30);
  for(const p of plants){
    const asset=sources.get(p.asset)!,grid=framesForAsset(asset).base![p.frame??0]!;
    const left=p.x-asset.anchor[0],top=p.y-asset.anchor[1];
    for(let y=0;y<grid.length;y++)for(let x=0;x<grid[y]!.length;x++){
      const rgba=resolveColor(grid[y]![x]!,palette,{},asset.markers??{},asset.sourcePalette??{});if(rgba[3]!==255)continue;
      expect(protectedCells.has(`${Math.floor((left+x)/16)},${Math.floor((top+y)/16)}`),`${p.asset} overlaps structural cliff/route`).toBe(false);
    }
  }
  const cliffs=new Set(review.cliffCells);
  for(const p of scene.placements.filter(p=>p.role==='clutter'))expect(cliffs.has(`${p.x/16},${p.y/16}`)).toBe(false);
});

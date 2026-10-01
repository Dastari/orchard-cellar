import { readFileSync,readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { it,expect } from 'vitest';
import { framesForAsset } from '../packages/tools/src/assets/pixels.js';
import type { AssetSource } from '../packages/tools/src/assets/types.js';
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

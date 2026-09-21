/** Reproducible native adjacency art. Frames retain source-grid order; the
 * shared semantic resolver maps all sixteen NESW masks to these source cells. */
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'../../..');
for(const [family,path,crop] of [
  ['hedge','Tiles/Hedge_Tiles.png','0,0'],
  ['wood_small_fence','Outdoor decoration/Fences.png','0,0'],
  ['stone_fence','Outdoor decoration/Stone_Fence_Small.png','0,0'],
  ['stone_large_fence','Outdoor decoration/Stone_Fence_Big.png','0,0'],
  ['wood_fence','Outdoor decoration/Fence_Big.png','0,0'],
  ['white_fence','Outdoor decoration/White_Fence.png','0,0'],
] as const){
  const name=`prop_cf_join_${family}`;
  execFileSync(resolve(root,'node_modules/.bin/tsx'),['packages/tools/src/import-image.ts',
    `references/art/kenmi/cute-fantasy/core/${path}`,'--size','16x16','--source-size','16x16',
    '--crop',crop,'--frame-grid','4x4','--animation-names','base','--category','props','--name',name],{cwd:root,stdio:'inherit'});
  const output=resolve(root,`packages/assets/props/${name}.sprite.json`);
  const source=JSON.parse(readFileSync(output,'utf8')) as Record<string,unknown>;
  source['approved']=true;source['frameKinds']={base:'variant'};
  source['sourceRegions']={base:Array.from({length:16},(_,index)=>[index%4*16,Math.floor(index/4)*16,16,16])};
  source['tags']=['world.nature','build.fence','review.approved'];
  source['placement']={layer:'object',footprint:[1,1],blocksMovement:true,builderAvailable:true};
  writeFileSync(output,JSON.stringify(source,null,2)+'\n');
}

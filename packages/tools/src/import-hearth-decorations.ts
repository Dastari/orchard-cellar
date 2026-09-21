/** Native crops for Willowharbour's public square and garden boundaries. */
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const root=resolve(import.meta.dirname,'../../..');
function importReviewed(name:string,args:string[]):void {
  const output=resolve(root,`packages/assets/props/${name}.sprite.json`);
  const previous=existsSync(output)?JSON.parse(readFileSync(output,'utf8')) as Record<string,unknown>:null;
  execFileSync(resolve(root,'node_modules/.bin/tsx'),args,{cwd:root,stdio:'inherit'});
  const current=JSON.parse(readFileSync(output,'utf8')) as Record<string,unknown>;
  if(previous?.['approved']===true&&JSON.stringify({...previous,approved:false})===JSON.stringify({...current,approved:false})) current['approved']=true;
  writeFileSync(output,JSON.stringify(current,null,2)+'\n');
}
const sources=[
  ['stall_red','Buildings/Buildings/Unique_Buildings/Stalls/Market_Stalls.png',48,48,0,0],
  ['stall_blue','Buildings/Buildings/Unique_Buildings/Stalls/Market_Stalls.png',48,48,96,0],
  ['stall_gold','Buildings/Buildings/Unique_Buildings/Stalls/Market_Stalls.png',48,48,144,0],
  ['bench','Outdoor decoration/Benches.png',32,32,32,0],
  ['streetlamp','Outdoor decoration/Lanter_Posts.png',16,48,0,0],
  ['well','Outdoor decoration/Well.png',32,48,0,0],
  ['trough','Outdoor decoration/Water_Troughs.png',32,16,16,0],
  ['scarecrow','Outdoor decoration/Scarecrows.png',32,32,0,0],

  ['hedge_horizontal','Tiles/Hedge_Tiles.png',16,16,32,0],
  ['hedge_vertical','Tiles/Hedge_Tiles.png',16,16,0,16],
] as const;
for(const [id,source,width,height,x,y] of sources) {
  importReviewed(`prop_cf_hearth_${id}`,['packages/tools/src/import-image.ts',
    `references/art/kenmi/cute-fantasy/core/${source}`, '--size',`${width}x${height}`,
    '--source-size',`${width}x${height}`,'--crop',`${x},${y}`,'--category','props',
    '--name',`prop_cf_hearth_${id}`]);
}

importReviewed('prop_cf_hearth_fountain',['packages/tools/src/import-image.ts',
  'references/art/kenmi/cute-fantasy/core/Outdoor decoration/Outdoor_Decor_Animations/Other_Animations/Fountain_Anim.png',
  '--size','32x48','--source-size','32x48','--crop','0,0','--frame-grid','8x1',
  '--animation-names','flow','--fps','8','--category','props','--name','prop_cf_hearth_fountain']);

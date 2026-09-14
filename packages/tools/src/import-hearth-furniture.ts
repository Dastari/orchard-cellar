/** First behaviour-spanning native furniture set from the reviewed32+4 plan.
 * Native source pixels only. Draft assets require review before publication. */
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import remaining from './hearth-furniture-crops.json' with { type: 'json' };
const root=resolve(import.meta.dirname,'../../..');
const initialCrops=[
  ['rustic_chair','Chairs',16,32,16,0],
  ['rustic_dining_table','Tables',50,33,8,24],
  ['rustic_bed','Beds',16,32,32,64],
  ['rustic_chest','Chest_Anim',16,16,0,0],
  ['rustic_woven_rug','Carpets',48,48,96,320],
  ['townhouse_table_lamp','Standing_Lamps',16,32,48,192],
  ['townhouse_wall_mirror','Bathroom_Furniture',16,32,0,224],
  ['rustic_potted_fern','House_Plants',16,32,32,0],
] as const;
const crops=[...initialCrops,...remaining.entries.map(entry=>[entry.suffix,entry.sheet,entry.width,entry.height,entry.x,entry.y] as const)];
for(const [name,sheet,width,height,x,y] of crops){
  const output=resolve(root,`packages/assets/props/prop_cf_furniture_${name}.sprite.json`);
  const previous=existsSync(output)?JSON.parse(readFileSync(output,'utf8')) as Record<string,unknown>:null;
  execFileSync(resolve(root,'node_modules/.bin/tsx'),['packages/tools/src/import-image.ts',
    `references/art/kenmi/cute-fantasy/core/Buildings/House_Decor/${sheet}.png`,
    '--size',`${width}x${height}`,'--source-size',`${width}x${height}`,'--crop',`${x},${y}`,
    '--category','props','--name',`prop_cf_furniture_${name}`,
    ...(String(name)==='rustic_cooking_range'?['--frame-grid','2x1','--frame-stride','16x32','--animation-names','base']:[])],{cwd:root,stdio:'inherit'});
  const current=JSON.parse(readFileSync(output,'utf8')) as Record<string,unknown>;
  if(String(name)==='rustic_cooking_range'){
    const frames=current['frames'] as {base:unknown[]};
    current['frames']={base:[frames.base[0]],off:[frames.base[0]],burn:[frames.base[1]]};
  }
  const reviewed=remaining.entries.find(entry=>entry.suffix===name) ?? (name==='rustic_dining_table'?remaining.existingCropCorrection:undefined);
  if(reviewed)current['anchor']=reviewed.anchor;
  writeFileSync(output,JSON.stringify(current,null,2)+'\n');
  // Re-importing unchanged pixels preserves the bounded native-art review.
  // Any source/crop/metadata change returns the asset to draft.
  if(previous?.['approved']===true){
    const prior={...previous,approved:false},next={...current,approved:false};
    if(JSON.stringify(prior)===JSON.stringify(next)){
      current['approved']=true;writeFileSync(output,JSON.stringify(current,null,2)+'\n');
    }
  }
}

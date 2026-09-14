/** Reproduce native construction crops. Changed art returns to draft. */
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import crops from './hearth-architecture-crops.json' with {type:'json'};
const root=resolve(import.meta.dirname,'../../..');
for(const entry of crops.entries){
  const {name,category,sheet,x,y,width,height,anchor}=entry;
  const output=resolve(root,`packages/assets/${category}/${name}.${category==='tiles'?'tile':'sprite'}.json`);
  const previous=existsSync(output)?JSON.parse(readFileSync(output,'utf8')) as Record<string,unknown>:null;
  execFileSync(resolve(root,'node_modules/.bin/tsx'),['packages/tools/src/import-image.ts',
    `references/art/kenmi/cute-fantasy/core/Buildings/${sheet}.png`,
    '--size',`${width}x${height}`,'--source-size',`${width}x${height}`,'--crop',`${x},${y}`,
    '--category',category,'--name',name],{cwd:root,stdio:'inherit'});
  const current=JSON.parse(readFileSync(output,'utf8')) as Record<string,unknown>;
  current['anchor']=anchor;
  if(previous?.['approved']===true&&JSON.stringify({...previous,approved:false})===JSON.stringify({...current,approved:false}))current['approved']=true;
  writeFileSync(output,JSON.stringify(current,null,2)+'\n');
}

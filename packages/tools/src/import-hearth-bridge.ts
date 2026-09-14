/** Exact native bridge modules; no stretching or palette substitution. */
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'../../..');
for(const [end,x] of [['left',0],['middle',16],['right',112]] as const) {
  for(const [part,y,height] of [['north',1,15],['deck',16,32],['south',48,12]] as const) {
    const name=`prop_cf_hearth_bridge_${end}_${part}`;
    const path=resolve(root,`packages/assets/props/${name}.sprite.json`);
    const previous=existsSync(path)?JSON.parse(readFileSync(path,'utf8')) as Record<string,unknown>:null;
    execFileSync(resolve(root,'node_modules/.bin/tsx'),['packages/tools/src/import-image.ts',
      'references/art/kenmi/cute-fantasy/core/Tiles/Bridge/Bridge_Stone_Horizontal.png',
      '--size',`16x${height}`,'--source-size',`16x${height}`,'--crop',`${x},${y}`,
      '--category','props','--name',name],{cwd:root,stdio:'inherit'});
    const current=JSON.parse(readFileSync(path,'utf8')) as Record<string,unknown>;
    // Omit the sheet's baked bank colours while preserving native vertical alignment.
    // The south module owns a 16px cell but imports only 12 native rows.
    // Transparent bottom padding keeps its reviewed draw position unchanged
    // while placing its existing anchor inside the declared canvas.
    if(part==='south') {
      current['size']=[16,16];
      const frames=current['frames'] as Record<string,string[][]>;
      for(const sequence of Object.values(frames)) for(const frame of sequence) {
        while(frame.length<16)frame.push('.'.repeat(16));
      }
    }
    current['anchor']=[8,part==='south'?15:height-1];
    current['sourceRegions']={base:[[x,y,16,height]]};
    if(previous?.['approved']===true && JSON.stringify({...previous,approved:false})===JSON.stringify({...current,approved:false})) current['approved']=true;
    writeFileSync(path,JSON.stringify(current,null,2)+'\n');
  }
}

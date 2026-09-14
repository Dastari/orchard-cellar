/** Reproduce the native harbour wayfinding sign; changed pixels return to draft. */
import {execFileSync} from 'node:child_process';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'../../..');
const output=resolve(root,'packages/assets/props/prop_cf_hearth_harbour_sign.sprite.json');
const previous=existsSync(output)?JSON.parse(readFileSync(output,'utf8')) as Record<string,unknown>:null;
execFileSync(resolve(root,'node_modules/.bin/tsx'),['packages/tools/src/import-image.ts',
  'references/art/kenmi/cute-fantasy/core/Outdoor decoration/Signs.png',
  '--size','16x32','--source-size','16x32','--crop','16,16',
  '--category','props','--name','prop_cf_hearth_harbour_sign'],{cwd:root,stdio:'inherit'});
const current=JSON.parse(readFileSync(output,'utf8')) as Record<string,unknown>;
if(previous?.['approved']===true&&JSON.stringify({...previous,approved:false})===JSON.stringify({...current,approved:false})) current['approved']=true;
writeFileSync(output,JSON.stringify(current,null,2)+'\n');

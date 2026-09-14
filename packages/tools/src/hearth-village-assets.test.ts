import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import {WILLOWHARBOUR_PLOTS} from './hearth-archipelago-authoring.js';
import {decodePng,hexToRgba} from './assets/png.js';
import type {AssetSource} from './assets/types.js';
const root=resolve(import.meta.dirname,'../../..');
const entries=[...WILLOWHARBOUR_PLOTS.map(plot=>({name:`building_cf_hearth_${plot.id.replaceAll('-','_')}`,category:'buildings',x:0,y:0,visual:'base',count:1})),
  ...[['stall_red',0,0],['stall_blue',96,0],['stall_gold',144,0],['bench',32,0],['hedge_horizontal',32,0],['hedge_vertical',0,16]]
    .map(([name,x,y])=>({name:`prop_cf_hearth_${name}`,category:'props',x:Number(x),y:Number(y),visual:'base',count:1})),
  {name:'prop_cf_hearth_fountain',category:'props',x:0,y:0,visual:'flow',count:8}];
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
it.each(entries)('preserves every native source pixel for $name',async entry=>{
  const asset=JSON.parse(await readFile(resolve(root,`packages/assets/${entry.category}/${entry.name}.sprite.json`),'utf8')) as AssetSource;
  expect(asset.sourcePaletteMode).toBe('exact');expect(asset.sourcePath).toBeTruthy();
  const source=decodePng(await readFile(resolve(root,asset.sourcePath!)));
  const frames=asset.frames[entry.visual]!;expect(frames).toHaveLength(entry.count);
  const [width,height]=asset.size;
  for(let frame=0;frame<entry.count;frame++) {
    const expected=new Uint8Array(width*height*4),actual=new Uint8Array(expected.length);
    expect(entry.x+(frame+1)*width).toBeLessThanOrEqual(source.width);
    expect(entry.y+height).toBeLessThanOrEqual(source.height);
    for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
      const target=(y*width+x)*4,index=((entry.y+y)*source.width+entry.x+frame*width+x)*4;
      if(source.rgba[index+3]!==0) expected.set(source.rgba.subarray(index,index+4),target);
      const symbol=frames[frame]![y]![x]!;
      if(symbol!=='.') actual.set(hexToRgba(asset.sourcePalette![symbol]!),target);
    }
    expect(hash(actual),`frame ${frame}`).toBe(hash(expected));
  }
});

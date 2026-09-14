import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {describe,it,expect} from 'vitest';
import {decodePng} from './assets/png.js';
import type {AssetSource} from './assets/types.js';
import crops from './hearth-architecture-crops.json' with {type:'json'};
const root=resolve(import.meta.dirname,'../../..');
describe('native construction imports',()=>{
  it.each(crops.entries)('preserves exact source pixels for $name',async entry=>{
    const asset=JSON.parse(await readFile(resolve(root,`packages/assets/${entry.category}/${entry.name}.${entry.category==='tiles'?'tile':'sprite'}.json`),'utf8')) as AssetSource;
    expect(asset.anchor).toEqual(entry.anchor);
    expect(asset.size).toEqual([entry.width,entry.height]);
    const source=decodePng(await readFile(resolve(root,`references/art/kenmi/cute-fantasy/core/Buildings/${entry.sheet}.png`)));
    expect(asset.frames.base).toHaveLength(1);
    const pixels=asset.frames.base![0]!;
    for(let y=0;y<entry.height;y++)for(let x=0;x<entry.width;x++){
      const index=((entry.y+y)*source.width+entry.x+x)*4,rgba=source.rgba.slice(index,index+4),symbol=pixels[y]![x]!;
      if(rgba[3]===0){expect(symbol).toBe('.');continue;}
      const hex='#'+[...rgba].slice(0,rgba[3]===255?3:4).map(value=>value.toString(16).padStart(2,'0')).join('');
      expect(asset.sourcePalette?.[symbol],`${x},${y}`).toBe(hex);
    }
  });
});

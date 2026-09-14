import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {it,expect} from 'vitest';
import {decodePng} from './assets/png.js';
import type {AssetSource} from './assets/types.js';
const root=resolve(import.meta.dirname,'../../..');
it('preserves native bridge pixels without the sheet bank colours or stretched deck',async()=>{
  const source=decodePng(await readFile(resolve(root,'references/art/kenmi/cute-fantasy/core/Tiles/Bridge/Bridge_Stone_Horizontal.png')));
  for(const [end,originX] of [['left',0],['middle',16],['right',112]] as const) {
    for(const [part,originY,height,anchorY] of [['north',1,15,14],['deck',16,32,31],['south',48,12,15]] as const) {
      const name=`prop_cf_hearth_bridge_${end}_${part}`;
      const asset=JSON.parse(await readFile(resolve(root,`packages/assets/props/${name}.sprite.json`),'utf8')) as AssetSource;
      expect(asset.size).toEqual([16,part==='south'?16:height]);expect(asset.anchor).toEqual([8,anchorY]);
      expect(asset.frames.base).toHaveLength(1);
      expect(asset.anchor[1]).toBeLessThan(asset.size[1]);
      if(part==='south') expect(asset.frames.base![0]!.slice(height)).toEqual(Array(4).fill('.'.repeat(16)));
      for(let y=0;y<height;y++) for(let x=0;x<16;x++) {
        const index=((originY+y)*source.width+originX+x)*4,rgba=source.rgba.slice(index,index+4);
        const symbol=asset.frames.base![0]![y]![x]!;
        if(rgba[3]===0) {expect(symbol).toBe('.');continue;}
        const hex='#'+[...rgba].slice(0,rgba[3]===255?3:4).map(value=>value.toString(16).padStart(2,'0')).join('');
        expect(asset.sourcePalette?.[symbol],`${name} ${x},${y}`).toBe(hex);
      }
    }
  }
});

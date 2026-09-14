import {readFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {describe,it,expect} from 'vitest';
import {decodePng} from './assets/png.js';
import type {AssetSource} from './assets/types.js';
const root=resolve(import.meta.dirname,'../../..');
describe('native modular seating imports',()=>{
  it('preserves all source pixels and intentional empty hand frames across action and armour layers',async()=>{
    const files=(await readdir(resolve(root,'packages/assets/characters'))).filter(name=>name.startsWith('action_cf_')||[
      'wearable_cf_plate_helmet.sprite.json','wearable_cf_heavy_plate_helmet.sprite.json','wearable_cf_plate_chest.sprite.json','wearable_cf_plate_legs.sprite.json',
    ].includes(name));
    expect(files).toHaveLength(28);
    let frames=0;
    for(const file of files){
      const asset=JSON.parse(await readFile(resolve(root,'packages/assets/characters',file),'utf8')) as AssetSource;
      const source=decodePng(await readFile(resolve(root,asset.sourcePath!)));
      for(const [direction,row] of [['down',50],['right',51],['up',52]] as const){
        const animation=`sitting_${direction}`;
        expect(asset.frames[animation],file).toHaveLength(2);
        expect(asset.animationLoop?.[animation]).toBe(true);
        expect(asset.animationFps?.[animation]).toBe(2);
        for(const [frame,pixels] of asset.frames[animation]!.entries()){
          frames++;
          expect(asset.sourceRegions?.[animation]?.[frame]).toEqual([frame*64+16,row*64+8,32,40]);
          let visible=0;
          for(let y=0;y<40;y++)for(let x=0;x<32;x++){
            const index=((row*64+8+y)*source.width+frame*64+16+x)*4;
            const rgba=source.rgba.slice(index,index+4),symbol=pixels[y]![x]!;
            if(rgba[3]===0){expect(symbol).toBe('.');continue;}
            visible++;
            const hex='#'+[...rgba].slice(0,rgba[3]===255?3:4).map(value=>value.toString(16).padStart(2,'0')).join('');
            expect(asset.sourcePalette?.[symbol],`${file}/${animation}/${frame}/${x},${y}`).toBe(hex);
          }
          if(file==='action_cf_hands.sprite.json'&&direction!=='right')expect(visible).toBe(0);
          else expect(visible).toBeGreaterThan(0);
        }
      }
    }
    expect(frames).toBe(168);
  });
});

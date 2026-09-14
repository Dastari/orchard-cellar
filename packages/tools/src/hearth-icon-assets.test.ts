import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { decodePng, type DecodedPng } from './assets/png.js';
import type { AssetSource } from './assets/types.js';
const root=resolve(import.meta.dirname,'../../..');
it('preserves all fifty native Raven equipment/material icon crops pixel-for-pixel',async()=>{
  const files=(await readdir(resolve(root,'packages/assets/ui'))).filter(name=>name.startsWith('icon_gear_hearth_')||name.startsWith('icon_material_'));
  expect(files).toHaveLength(50);
  const sources=new Map<string,DecodedPng>();
  for(const file of files){
    const asset=JSON.parse(await readFile(resolve(root,'packages/assets/ui',file),'utf8')) as AssetSource;
    expect(asset.size).toEqual([16,16]);expect(asset.sourcePaletteMode).toBe('exact');
    expect(asset.sourcePath).toContain('references/art/clockwork-raven/');
    const [sx,sy,w,h]=asset.sourceRegion!;
    expect([w,h]).toEqual([16,16]);expect(sx%16).toBe(0);expect(sy%16).toBe(0);
    let source=sources.get(asset.sourcePath!);
    if(!source){source=decodePng(await readFile(resolve(root,asset.sourcePath!)));sources.set(asset.sourcePath!,source);}
    expect(sx+w).toBeLessThanOrEqual(source.width);expect(sy+h).toBeLessThanOrEqual(source.height);
    let visible=0;
    for(let y=0;y<16;y++)for(let x=0;x<16;x++){
      const offset=((sy+y)*source.width+sx+x)*4,rgba=source.rgba.slice(offset,offset+4),symbol=asset.frames.base![0]![y]![x]!;
      if(rgba[3]===0){expect(symbol).toBe('.');continue;}
      visible++;
      expect(asset.sourcePalette?.[symbol],`${file}:${x},${y}`).toBe('#'+[...rgba].slice(0,rgba[3]===255?3:4).map(v=>v.toString(16).padStart(2,'0')).join(''));
    }
    expect(visible).toBeGreaterThan(0);
  }
});

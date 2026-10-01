import { existsSync,readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe,it,expect } from 'vitest';
import { islandArtImports } from './import-native-island-art.js';
import { decodePng } from './assets/png.js';
import { compileEmissiveFrames } from './assets/emissive.js';
import { framesForAsset,resolveColor } from './assets/pixels.js';
import type { AssetSource,PaletteSource } from './assets/types.js';

const root=resolve(import.meta.dirname,'../../..');
describe('Native island art provenance and emission',()=>{
  for(const specification of islandArtImports)it(`${specification.name} preserves native frames and optional source bytes`,()=>{
    const suffix=specification.category==='tiles'?'tile':'sprite';
    const asset=JSON.parse(readFileSync(resolve(root,`packages/assets/${specification.category}/${specification.name}.${suffix}.json`),'utf8')) as AssetSource;
    expect(asset.approved).toBe(true);expect(asset.sourcePaletteMode).toBe('exact');
    expect(asset.sourcePath).toBe('references/art/kenmi/cute-fantasy/volcano/'+specification.sheet);
    expect(asset.importedFrom).toBe(specification.sheet.split('/').at(-1));
    const grids=framesForAsset(asset).base!;
    expect(grids.length).toBe(asset.sourceRegions!.base!.length);
    for(const grid of grids){expect(grid.length).toBe(asset.size[1]);expect(grid.every(row=>row.length===asset.size[0])).toBe(true);}
    const file=resolve(root,asset.sourcePath!);
    if(existsSync(file)){
      const png=decodePng(readFileSync(file));
      const palette={colors:{},seasons:{}} as unknown as PaletteSource;
      for(const [index,grid] of grids.entries()){
        const [sx,sy,w,h]=asset.sourceRegions!.base![index]!;
        expect([w,h]).toEqual(asset.size);
        for(let y=0;y<h!;y++)for(let x=0;x<w!;x++){
          const rgba=resolveColor(grid[y]![x]!,palette,{},asset.markers??{},asset.sourcePalette??{});
          const original=[...png.rgba.slice(((sy!+y)*png.width+sx!+x)*4,((sy!+y)*png.width+sx!+x)*4+4)];
          // Transparent RGB is not visible; every visible native RGBA byte is exact.
          if(original[3]===0)expect(rgba[3]).toBe(0);else expect(rgba).toEqual(original);
        }
      }
    }
  });
  it('emits orange molten pixels while leaving gray bank and crust pixels unlit',()=>{
    const asset=JSON.parse(readFileSync(resolve(root,'packages/assets/tiles/tile_cf_volcano_design_sheet.tile.json'),'utf8')) as AssetSource;
    const palette={colors:{},seasons:{}} as unknown as PaletteSource;
    const emission=compileEmissiveFrames(asset,palette)!.base!;
    const grids=framesForAsset(asset).base!;
    let molten=0,nonMolten=0;
    grids.forEach((grid,i)=>{
      const mask=new Set<string>();const spans=emission[i]!;
      for(let j=0;j<spans.length;j+=3)for(let x=spans[j+1]!;x<spans[j+1]!+spans[j+2]!;x++)mask.add(`${x},${spans[j]}`);
      grid.forEach((row,y)=>[...row].forEach((token,x)=>{
        const rgba=resolveColor(token,palette,{},asset.markers??{},asset.sourcePalette??{});
        const expected=rgba[3]===255&&['251,107,29','232,59,59','247,150,23'].includes(rgba.slice(0,3).join(','));
        expect(mask.has(`${x},${y}`)).toBe(expected);if(expected)molten++;else nonMolten++;
      }));
    });
    expect(molten).toBeGreaterThan(1000);expect(nonMolten).toBeGreaterThan(molten);
  });
});

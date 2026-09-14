/** Native candidate contact study; not a gameplay or lighting acceptance capture. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { blendPixel, encodePng, hexToRgba, setPixel } from './assets/png.js';
import type { AssetSource } from './assets/types.js';
const root=resolve(import.meta.dirname,'../../..'), width=1152, height=480, scale=2, baseline=444;
const pixels=new Uint8Array(width*height*4), manifest=[];
for(let y=0;y<height;y++)for(let x=0;x<width;x++)setPixel(pixels,width,x,y,hexToRgba((Math.floor(x/12)+Math.floor(y/12))%2?'#51494f':'#5c5257'));
for(const [index,name] of ['prop_cf_cinder_blossom_small','prop_cf_cinder_blossom_large','prop_cf_cinder_violet_plant','prop_cf_cinder_column_cluster','prop_cf_cinder_broad_pillar','building_cf_cinder_tower'].entries()) {
  const path=`packages/assets/${name.startsWith('building_')?'buildings':'props'}/${name}.sprite.json`, source=await readFile(resolve(root,path),'utf8');
  const asset=JSON.parse(source) as AssetSource, frame=asset.frames.base![0]!;
  const center=index*192+96,left=center-asset.anchor[0]*scale,top=baseline-asset.anchor[1]*scale;
  for(let x=index*192+16;x<(index+1)*192-16;x++)if(x%6<3)setPixel(pixels,width,x,baseline+1,hexToRgba('#eacb84'));
  for(let y=0;y<asset.size[1];y++)for(let x=0;x<asset.size[0];x++){
    const key=frame[y]![x]!; if(key==='.')continue;
    const color=hexToRgba(asset.sourcePalette![key]!);
    for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++)blendPixel(pixels,width,left+x*scale+dx,top+y*scale+dy,color);
  }
  manifest.push({index,name,path,sourcePath:asset.sourcePath,sourceRegions:asset.sourceRegions,anchor:asset.anchor,
    sha256:createHash('sha256').update(source).digest('hex')});
}
const png=encodePng(width,height,pixels), out=resolve(root,'output/doc60'); await mkdir(out,{recursive:true});
await writeFile(resolve(out,'volcano-scenery-candidates.png'),png);
await writeFile(resolve(out,'volcano-scenery-candidates.provenance.json'),JSON.stringify({draft:true,scale,baseline,
  order:'small blossom, large blossom, violet plant, column cluster, broad pillar, tower',assets:manifest,imageSha256:createHash('sha256').update(png).digest('hex'),
  reproduce:'npx tsx packages/tools/src/render-hearth-volcano-scenery.ts'},null,2)+'\n');

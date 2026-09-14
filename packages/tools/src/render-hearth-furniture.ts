import {HEARTH_FURNITURE_SHAPES,hearthFurnitureScene,hearthFurnitureDrawGroup,type HearthFurniturePlacement} from '@orchard/sim';
/** Native-source contact sheets for reviewed furniture crops. */
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname} from 'node:path';
import {blendPixel,encodePng,hexToRgba,setPixel} from './assets/png.js';
import type {AssetSource} from './assets/types.js';
const root=resolve(import.meta.dirname,'../../..');
const all=process.argv.includes('--all');
const names=all?Object.keys(HEARTH_FURNITURE_SHAPES).map(id=>id.replace('furniture_','')):['rustic_chair','rustic_dining_table','rustic_bed','rustic_chest','rustic_woven_rug',
  'townhouse_table_lamp','townhouse_wall_mirror','rustic_potted_fern'];
const width=768,height=Math.ceil(names.length/4)*192,scale=3,pixels=new Uint8Array(width*height*4);
for(let y=0;y<height;y++)for(let x=0;x<width;x++)setPixel(pixels,width,x,y,hexToRgba((Math.floor(x/12)+Math.floor(y/12))%2?'#54464c':'#62545a'));
const manifest=[];
for(const [index,name] of names.entries()){
  const path=`packages/assets/props/prop_cf_furniture_${name}.sprite.json`;
  const source=await readFile(resolve(root,path),'utf8'),asset=JSON.parse(source) as AssetSource;
  const frame=asset.frames['base']?.[0];if(!frame)throw new Error(`Missing native base: ${name}`);
  const left=(index%4)*192+Math.floor((192-asset.size[0]*scale)/2),top=Math.floor(index/4)*192+Math.floor((192-asset.size[1]*scale)/2);
  for(let y=0;y<asset.size[1];y++)for(let x=0;x<asset.size[0];x++){
    const key=frame[y]?.[x];if(key===undefined||key==='.')continue;
    const hex=asset.sourcePalette?.[key];if(!hex)throw new Error(`Missing native colour: ${name}:${key}`);
    for(let sy=0;sy<scale;sy++)for(let sx=0;sx<scale;sx++)blendPixel(pixels,width,left+x*scale+sx,top+y*scale+sy,hexToRgba(hex));
  }
  manifest.push({index,name,path,sourcePath:asset.sourcePath,sourceRegions:asset.sourceRegions,size:asset.size,anchor:asset.anchor,
    sha256:createHash('sha256').update(source).digest('hex')});
}
const output=resolve(root,all?'output/doc60/furniture-base-catalogue.png':'output/doc60/furniture-first-eight.png'),png=encodePng(width,height,pixels);
await mkdir(dirname(output),{recursive:true});await writeFile(output,png);
await writeFile(output.replace('.png','.provenance.json'),JSON.stringify({draft:true,order:'left-to-right then top-to-bottom',
  scale,assets:manifest,imageSha256:createHash('sha256').update(png).digest('hex'),
  reproduce:`npx tsx packages/tools/src/render-hearth-furniture.ts${all?' --all':''}`},null,2)+'\n');
console.log(output);

// Parent-owned composition: supported objects draw on their parent surface,
// rather than being sorted behind it by their lifted visual baseline.
const fixturePixels=new Uint8Array(256*256*4);
for(let y=0;y<256;y++)for(let x=0;x<256;x++)setPixel(fixturePixels,256,x,y,hexToRgba((Math.floor(x/12)+Math.floor(y/12))%2?'#54464c':'#62545a'));
const table:HearthFurniturePlacement={id:'1',shape:HEARTH_FURNITURE_SHAPES['furniture_rustic_dining_table']!,tileX:1,tileY:1};
const lamp:HearthFurniturePlacement={id:'2',shape:HEARTH_FURNITURE_SHAPES['furniture_townhouse_table_lamp']!,tileX:1,tileY:0,supportId:'1'};
const scene=hearthFurnitureScene([lamp,table].map(item=>({id:item.id,kind:item.shape.id,spaceId:30000,
  tileX:item.tileX,tileY:item.tileY,stateJson:JSON.stringify(item.supportId?{hearthFurnitureSupportId:item.supportId}:{})})));
for(const member of hearthFurnitureDrawGroup(scene,'1')){
  const item=member.placement;
  const asset=JSON.parse(await readFile(resolve(root,`packages/assets/props/prop_cf_${item.shape.id}.sprite.json`),'utf8')) as AssetSource;
  const anchor=member.anchor;
  const frame=asset.frames['base']![0]!;
  const left=(anchor.x+16-asset.anchor[0])*3,top=(anchor.y+32-asset.anchor[1])*3;
  for(let y=0;y<asset.size[1];y++)for(let x=0;x<asset.size[0];x++){
    const character=frame[y]?.[x];if(character===undefined||character==='.')continue;
    const color=hexToRgba(asset.sourcePalette![character]!);
    for(let sy=0;sy<3;sy++)for(let sx=0;sx<3;sx++)blendPixel(fixturePixels,256,left+x*3+sx,top+y*3+sy,color);
  }
}
const fixturePng=encodePng(256,256,fixturePixels),fixtureOutput=resolve(root,'output/doc60/furniture-table-lamp.png');
await writeFile(fixtureOutput,fixturePng);
await writeFile(fixtureOutput.replace('.png','.provenance.json'),JSON.stringify({draft:true,
  renderer:'native source pixels with shared presentation anchors; parent then attachment',items:[table,lamp],
  presentationSourceSha256:createHash('sha256').update(await readFile(resolve(root,'packages/sim/src/hearth-furniture-placement.ts'))).digest('hex'),
  groupingSourceSha256:createHash('sha256').update(await readFile(resolve(root,'packages/sim/src/hearth-furniture-scene.ts'))).digest('hex'),
  imageSha256:createHash('sha256').update(fixturePng).digest('hex'),reproduce:'npx tsx packages/tools/src/render-hearth-furniture.ts'},null,2)+'\n');

if(all){
  const surfacePixels=new Uint8Array(768*192*4);
  for(let y=0;y<192;y++)for(let x=0;x<768;x++)setPixel(surfacePixels,768,x,y,hexToRgba((Math.floor(x/12)+Math.floor(y/12))%2?'#54464c':'#62545a'));
  const surfaces=Object.values(HEARTH_FURNITURE_SHAPES).filter(shape=>shape.tabletopSurface);
  for(const [index,shape] of surfaces.entries()){
    const rootItem={id:'1',kind:shape.id,spaceId:30000,tileX:2,tileY:2,stateJson:'{}'};
    const child={id:'2',kind:'furniture_townhouse_table_lamp',spaceId:30000,tileX:2,
      tileY:3-shape.height,stateJson:'{"hearthFurnitureSupportId":"1"}'};
    const composed=hearthFurnitureScene([child,rootItem]);
    const rootAnchor=composed.get('1')!.anchor;
    for(const member of hearthFurnitureDrawGroup(composed,'1')){
      const asset=JSON.parse(await readFile(resolve(root,`packages/assets/props/prop_cf_${member.placement.shape.id}.sprite.json`),'utf8')) as AssetSource;
      const frame=asset.frames['base']![0]!;
      const left=index*192+96+(member.anchor.x-rootAnchor.x-asset.anchor[0])*3;
      const top=156+(member.anchor.y-rootAnchor.y-asset.anchor[1])*3;
      for(let y=0;y<asset.size[1];y++)for(let x=0;x<asset.size[0];x++){
        const key=frame[y]?.[x];if(key===undefined||key==='.')continue;
        for(let sy=0;sy<3;sy++)for(let sx=0;sx<3;sx++)blendPixel(surfacePixels,768,left+x*3+sx,top+y*3+sy,hexToRgba(asset.sourcePalette![key]!));
      }
    }
  }
  await writeFile(resolve(root,'output/doc60/furniture-table-surfaces.png'),encodePng(768,192,surfacePixels));
  await writeFile(resolve(root,'output/doc60/furniture-table-surfaces.provenance.json'),JSON.stringify({
    draft:true,renderer:'shared hearthFurnitureScene/hearthFurnitureDrawGroup native source draw',
    tables:surfaces.map(shape=>shape.id),scale:3,liveData:false,
    sceneSha256:createHash('sha256').update(await readFile(resolve(root,'packages/sim/src/hearth-furniture-scene.ts'))).digest('hex'),
    reproduce:'npx tsx packages/tools/src/render-hearth-furniture.ts --all',
  },null,2)+'\n');
}

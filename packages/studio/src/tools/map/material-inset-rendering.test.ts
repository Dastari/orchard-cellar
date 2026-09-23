import {it,expect} from 'vitest';
import {createEmptyMapDocument,migrateMapDocumentV2,applyMapDocumentV3Edit,terrainDocumentForMapV3} from '@orchard/sim';
import {terrainArrayForMapDocument} from '@orchard/engine/editor-terrain';
import {freshwaterInsetFrameIndicesAt,desertGrassInsetFrameIndicesAt} from '@orchard/engine/terrain';
import {authoredGrassFringeLayersAt} from '@orchard/engine/ground-cache';

it('renders at most one bank inset after smart water or desert/grass boundary strokes',()=>{
 for(const water of [true,false]){
  const base=migrateMapDocumentV2(createEmptyMapDocument({id:'diagonal-render',title:'Diagonal render',width:20,height:20}));
  const before=water?base:{...base,baseBiome:'savanna' as const};
  const points=['##..','###.','.###','..##'].flatMap((row,y)=>[...row].flatMap((cell,x)=>cell==='#'?[{tileX:x+4,tileY:y+4}]:[]));
  const command={kind:'terrain' as const,command:{kind:'paint' as const,points,patch:{surface:water?'water' as const:'sand' as const,feature:'none' as const}},biome:water?'freshwater' as const:'desert' as const};
  const exact=applyMapDocumentV3Edit(before,command).document;
  const result=applyMapDocumentV3Edit(before,{...command,automaticSurround:true});
  expect(result.document).not.toBe(before);
  const original=terrainArrayForMapDocument(terrainDocumentForMapV3(exact),undefined,exact);
  const rendered=terrainArrayForMapDocument(terrainDocumentForMapV3(result.document),undefined,result.document);
  const resolve=water?freshwaterInsetFrameIndicesAt:desertGrassInsetFrameIndicesAt;
  let beforeMaximum=0;
  for(let y=3;y<=8;y++)for(let x=3;x<=8;x++){
   beforeMaximum=Math.max(beforeMaximum,resolve(original,x,y).length);
   expect(resolve(rendered,x,y).length).toBeLessThanOrEqual(1);
  }
  expect(beforeMaximum).toBeGreaterThan(1);
 }
});

it('uses grass family identity when a diagonal stroke crosses another grass family',()=>{
 const base=migrateMapDocumentV2(createEmptyMapDocument({id:'grass-family-insets',title:'Grass families',width:20,height:20}));
 const before={...base,defaultSurfaceFamily:'grass_2' as const};
 const points=['##..','###.','.###','..##'].flatMap((row,y)=>[...row].flatMap((cell,x)=>cell==='#'?[{tileX:x+4,tileY:y+4}]:[]));
 const command={kind:'terrain' as const,command:{kind:'paint' as const,points,patch:{surface:'grass' as const,surfaceFamily:'grass_1' as const}},biome:'plains' as const};
 const result=applyMapDocumentV3Edit(before,{...command,automaticSurround:true});
 expect(result.document).not.toBe(before);expect(result.changed.length).toBeGreaterThan(points.length);
 const terrain=terrainArrayForMapDocument(terrainDocumentForMapV3(result.document),undefined,result.document);
 for(let y=3;y<=8;y++)for(let x=3;x<=8;x++){
  const insets=(authoredGrassFringeLayersAt(terrain,x,y)??[]).filter(layer=>[48,49,64,65].includes(layer.frame));
  expect(insets.length).toBeLessThanOrEqual(1);
 }
});

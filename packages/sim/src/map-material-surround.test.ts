import {it, expect} from 'vitest';
import {createEmptyMapDocument} from './terrain-lab.js';
import {migrateMapDocumentV2, resolvedMapBiomeAt, applyMapDocumentV3Edit, terrainDocumentForMapV3, type MapDocumentV3} from './map-document-v3.js';
import {resolvedMapCellAt} from './map-document.js';
import {createMapDocumentDelta, applyMapDocumentDelta} from './map-document-delta.js';
import {raisedTerrainInsetRolesAt} from './raised-terrain-autotile.js';

function river(): MapDocumentV3 {
 const base = migrateMapDocumentV2(createEmptyMapDocument({id:'shore-test',title:'Shore',width:10,height:10}));
 const cells: Record<string, {surface:'water';biome:'water'|'freshwater'}> = {};
 for(let y=0;y<10;y++)for(let x=4;x<10;x++)cells[`${x},${y}`]={surface:'water',biome:y<4?'freshwater':'water'};
 return {...base,cells};
}
it('continues a bank in the painted cell and generates neighboring Ocean banks in one delta',()=>{
 const before=river();
 const edit=applyMapDocumentV3Edit(before,{kind:'terrain',command:{kind:'paint',points:[{tileX:4,tileY:4}],patch:{surface:'grass'}},biome:'plains',automaticSurround:true});
 expect(edit.document.cells['4,4']).toMatchObject({biome:'freshwater'});
 expect(resolvedMapCellAt(terrainDocumentForMapV3(edit.document),4,4)).toMatchObject({surface:'grass',elevation:0});
 expect(edit.document.cells['4,5']?.biome).toBe('freshwater');
 expect(edit.changed).toContainEqual({tileX:4,tileY:5});
 expect(edit.document.revision).toBe(before.revision+1);
 expect(JSON.parse(applyMapDocumentDelta(before,createMapDocumentDelta(before,edit.document))).cells['4,4'].biome).toBe('freshwater');
});
it('keeps literal painting when Auto surround is disabled',()=>{
 const edit=applyMapDocumentV3Edit(river(),{kind:'terrain',command:{kind:'paint',points:[{tileX:4,tileY:4}],patch:{surface:'grass'}},biome:'plains'});
 expect(resolvedMapBiomeAt(edit.document,4,4)).toBe('plains');
 expect(edit.document.cells['4,5']?.biome).toBe('water');
});
it('does not borrow a bank from a different height or turn beach material into grass banks',()=>{
 const before=river();
 for(const surface of ['grass','sand'] as const){
 const elevated={...before,cells:{...before.cells,'4,4':{...before.cells['4,4'],elevation:1}}};
 const biome=surface==='grass'?'plains':'beach';
 const edit=applyMapDocumentV3Edit(elevated,{kind:'terrain',command:{kind:'paint',points:[{tileX:4,tileY:4}],patch:{surface}},biome,automaticSurround:true});
 expect(resolvedMapBiomeAt(edit.document,4,4)).toBe(biome);
 expect(resolvedMapCellAt(terrainDocumentForMapV3(edit.document),4,4).elevation).toBe(1);
 }
});

it('widens diagonal water and desert grass strokes within their original halo',()=>{
 for(const water of [true,false]){
  const base=migrateMapDocumentV2(createEmptyMapDocument({id:'diagonal-material',title:'Diagonal',width:20,height:20}));
  const ground=water?base:{...base,baseSurface:'sand' as const,baseBiome:'desert' as const};
  const points=['##..','###.','.###','..##'].flatMap((row,y)=>[...row].flatMap((cell,x)=>cell==='#'?[{tileX:x+4,tileY:y+4}]:[]));
  const patch={surface:water?'water' as const:'grass' as const,feature:'none' as const};
  const biome=water?'freshwater' as const:'savanna' as const;
  const command={kind:'terrain' as const,command:{kind:'paint' as const,points,patch},biome};
  const exact=applyMapDocumentV3Edit(ground,command).document;
  const occupancy=(doc:MapDocumentV3)=>{const terrain=terrainDocumentForMapV3(doc);return (x:number,y:number)=>resolvedMapCellAt(terrain,x,y).surface===patch.surface;};
  expect(points.some(p=>raisedTerrainInsetRolesAt({raisedAt:occupancy(exact)},p.tileX,p.tileY).length>1)).toBe(true);
  const result=applyMapDocumentV3Edit(ground,{...command,automaticSurround:true});
  expect(result.document).not.toBe(ground);
  for(let y=3;y<=8;y++)for(let x=3;x<=8;x++)expect(raisedTerrainInsetRolesAt({raisedAt:occupancy(result.document)},x,y).length).toBeLessThanOrEqual(1);
  expect(result.changed.every(p=>points.some(q=>Math.abs(p.tileX-q.tileX)<=1&&Math.abs(p.tileY-q.tileY)<=1))).toBe(true);
  for(const p of points)expect(occupancy(result.document)(p.tileX,p.tileY)).toBe(true);
  expect(result.document.revision).toBe(ground.revision+1);
 }
});


it('rejects a narrow protected material stroke instead of changing its selected cells',()=>{
 const base=migrateMapDocumentV2(createEmptyMapDocument({id:'protected-material',title:'Protected',width:12,height:12}));
 const before={...base,cells:{'3,3':{surface:'water' as const,biome:'freshwater' as const}}};
 const points=[{tileX:5,tileY:5}];
 const command={kind:'terrain' as const,command:{kind:'paint' as const,points,patch:{surface:'water' as const}},biome:'freshwater' as const};
 // The land between two diagonal holes needs two insets. One hole is outside
 // this stroke's halo and the other is protected brush input: reject atomically.
 const smart=applyMapDocumentV3Edit(before,{...command,automaticSurround:true});
 expect(smart).toEqual({document:before,changed:[],rejected:'terrain_inset_conflict'});
 const exact=applyMapDocumentV3Edit(before,command);
 expect(exact.document).not.toBe(before);
});

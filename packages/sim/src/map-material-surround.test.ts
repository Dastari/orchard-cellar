import {it, expect} from 'vitest';
import {createEmptyMapDocument} from './terrain-lab.js';
import {migrateMapDocumentV2, resolvedMapBiomeAt, applyMapDocumentV3Edit, terrainDocumentForMapV3, type MapDocumentV3} from './map-document-v3.js';
import {resolvedMapCellAt} from './map-document.js';
import {createMapDocumentDelta, applyMapDocumentDelta} from './map-document-delta.js';

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

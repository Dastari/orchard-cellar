import {it,expect} from 'vitest';
import {createEmptyMapDocument} from './terrain-lab.js';
import {migrateMapDocumentV2,applyMapDocumentV3Edit,mapDocumentV3Hash,parseMapDocumentV3,serializeMapDocumentV3ForTransport} from './map-document-v3.js';
import {createMapDocumentDelta,applyMapDocumentDelta} from './map-document-delta.js';
import {parseMapResourcePlacements} from './map-resource-placement.js';
const base=migrateMapDocumentV2(createEmptyMapDocument({id:'resource-test',title:'test',width:20,height:20}));
const placement={id:'42',originTileX:3,originTileY:4,tileX:8,tileY:9};
it('round trips functional placement through small deltas and restores historical hashes',()=>{
 const moved=applyMapDocumentV3Edit(base,{kind:'move_resource',placement}).document;
 const delta=createMapDocumentDelta(base,moved);
 expect(JSON.stringify(delta).length).toBeLessThan(500);
 expect(delta.collections?.resourcePlacements).toEqual({'42':placement});
 expect(parseMapDocumentV3(serializeMapDocumentV3ForTransport(moved)).resourcePlacements).toEqual([placement]);
 expect(parseMapDocumentV3(applyMapDocumentDelta(base,delta)).resourcePlacements).toEqual([placement]);
 const restored=applyMapDocumentV3Edit(moved,{kind:'move_resource',placement:{...placement,tileX:3,tileY:4}}).document;
 expect(mapDocumentV3Hash({...restored,revision:base.revision})).toBe(mapDocumentV3Hash(base));
});
it('rejects invalid resource coordinates, identities, duplicates and changed origins',()=>{
 for(const invalid of [[{...placement,id:'-1'}],[{...placement,id:'18446744073709551616'}],[{...placement,tileX:20}],[{...placement,originTileX:0.5}],[placement,placement],null])expect(()=>parseMapResourcePlacements(invalid,20,20)).toThrow();
 const moved=applyMapDocumentV3Edit(base,{kind:'move_resource',placement}).document;
 expect(()=>applyMapDocumentV3Edit(moved,{kind:'move_resource',placement:{...placement,originTileX:2}})).toThrow('origin_changed');
});

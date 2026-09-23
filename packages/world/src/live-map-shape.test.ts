import {it,expect} from 'vitest';
import {createEmptyMapDocument,migrateMapDocumentV2,compileMapDocument,terrainDocumentForMapV3,type MapDocumentV3} from '@orchard/sim';
import {validateLiveMapShape} from './live-map-shape.js';
const base=migrateMapDocumentV2(createEmptyMapDocument({id:'design-test',title:'Design',width:12,height:12}));
it('accepts isolated heights and mismatched manual cliff roles without repairing their geometry',()=>{
 const document:MapDocumentV3={...base,cells:{'4,4':{elevation:3,terrainOverride:{contourLevel:1,role:'top_right'}}}};
 expect(()=>validateLiveMapShape(document)).not.toThrow();
 expect(compileMapDocument(terrainDocumentForMapV3(document)).elevations[4*12+4]).toBe(3);
 expect(document.cells['4,4']?.terrainOverride?.role).toBe('top_right');
});
it('still rejects malformed coordinates and values independently of design conventions',()=>{
 for(const cells of [{'12,1':{elevation:1}},{'2,2':{elevation:0.5}},{'2,2':{surface:'unknown'}},{'2,2':{terrainOverride:{contourLevel:NaN}}}])
 expect(()=>validateLiveMapShape({...base,cells} as MapDocumentV3)).toThrow();
});
it('accepts bounded cell part stacks and rejects malformed or conflicting parts',()=>{
 const parts=[{slot:'path',exact:{frame:12}},{slot:'fringe:grass_2',exact:{frame:1,quarterTurns:1}},{slot:'contour:1',role:'top',exact:{frame:4}}];
 expect(()=>validateLiveMapShape({...base,cells:{'3,3':{parts}}} as MapDocumentV3)).not.toThrow();
 for(const cell of [
  {parts:[{slot:'path'}]},
  {parts:[{slot:'road',exact:{frame:1}}]},
  {parts:[{slot:'path',exact:{frame:-1}}]},
  {parts:[{slot:'path',exact:{frame:1}},{slot:'path',exact:{frame:2}}]},
  {parts:[{slot:'path',role:'top',exact:{frame:1}}]},
  {parts:{slot:'path'}},
  {terrainOverride:{contourLevel:1,frameIndex:3},parts:[{slot:'contour:1',exact:{frame:4}}]},
 ])expect(()=>validateLiveMapShape({...base,cells:{'3,3':cell}} as unknown as MapDocumentV3)).toThrow('map_parts_invalid');
});

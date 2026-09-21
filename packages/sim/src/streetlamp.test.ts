import {expect,it} from 'vitest';
import {streetlampState,mapStreetlampPlans} from './streetlamp.js';
import {AUTHORITY_TICKS_PER_DAY,dayProgressAtClockTime} from './time.js';
import {createLiveIslandMapDocument} from './map-document-v3.js';
const tick=(hour:number)=>BigInt(Math.round(dayProgressAtClockTime(hour)*AUTHORITY_TICKS_PER_DAY));
it('auto follows dawn and dusk while manual settings persist across clock changes',()=>{
 for(const hour of [6,12,17])expect(streetlampState('{}',tick(hour)).lit).toBe(false);
 for(const hour of [18,23,0,5])expect(streetlampState('{}',tick(hour)).lit).toBe(true);
 for(const hour of [0,6,12,18]){
  expect(streetlampState('{"mode":"on"}',tick(hour)).lit).toBe(true);
  expect(streetlampState('{"mode":"off"}',tick(hour)).lit).toBe(false);
 }
 const saved=streetlampState('{"mode":"off"}',tick(12));
 expect(streetlampState(saved.stateJson,tick(23))).toEqual(saved);
 expect(()=>streetlampState('{"mode":"invalid"}',tick(12))).toThrow('Invalid');
});
it('empty maps materialize no lamps',()=>expect(mapStreetlampPlans(createLiveIslandMapDocument())).toEqual([]));
it('materializes stable unique positions and rejects unsupported transforms',()=>{
 const base=createLiveIslandMapDocument();
 const prefab={schemaVersion:2 as const,kind:'map_prefab' as const,id:'lamp',title:'Lamp',width:1,height:3,tileSize:16 as const,pivot:{tileX:0,tileY:2},revision:1,assetRegistryRevision:'test',collection:null,tags:[],behaviors:[{kind:'static' as const}],cells:[],placements:[{id:'visual',assetId:1,assetName:'prop_cf_hearth_streetlamp',visual:{kind:'state' as const,name:'base',frameIndex:0},tileX:0,tileY:2,elevation:0,layer:'object' as const,quarterTurns:0 as const,flipX:false}]};
 const object={id:'town-lamp',prefabId:'lamp',prefabRevision:1,tileX:120,tileY:400,elevation:0,layer:'objects' as const,quarterTurns:0 as const,flipX:false,enabled:true};
 const document={...base,prefabs:[prefab],objects:[object]};
 const plan=mapStreetlampPlans(document);
 expect(plan).toEqual([{id:3_400_204_920n,tileX:120,tileY:400,objectId:'town-lamp'}]);
 expect(mapStreetlampPlans(document)).toBe(plan);
 expect(mapStreetlampPlans({...document,objects:[{...object,id:'renamed'}]})[0]!.id).toBe(plan[0]!.id);
 expect(()=>mapStreetlampPlans({...document,objects:[object,{...object,id:'duplicate'}]})).toThrow('Duplicate');
 for(const change of [{scale:2 as const},{quarterTurns:1 as const},{flipX:true},{prefabRevision:2}])expect(()=>mapStreetlampPlans({...document,objects:[{...object,...change}]})).toThrow('Unsupported');
 expect(()=>mapStreetlampPlans({...document,prefabs:[{...prefab,placements:[{...prefab.placements[0]!,flipX:true}]}]})).toThrow('Unsupported');
 expect(mapStreetlampPlans({...document,objects:[{...object,enabled:false}]})).toEqual([]);
});

import {describe,it,expect} from 'vitest';
import {bootstrapContentRegistry} from './content/bootstrap-registry.js';
import {hearthFurnishingCounts} from './hearth-furnishing-contract.js';
import {questAcceptBaselines,questIsComplete,runtimeQuestDefinition} from './quests.js';
const registry=bootstrapContentRegistry();
const row=(id:number,kind:string,tileX=6,tileY=6,stateJson='{}')=>({id:BigInt(id),kind:'furniture_'+kind,tileX,tileY,stateJson});
const room=[row(1,'rustic_chair',8,7),row(2,'rustic_dining_table',6,6),
  row(3,'townhouse_table_lamp',6,5,'{"hearthFurnitureSupportId":"2"}'),row(4,'rustic_woven_rug',6,9)];
describe('current starter-room furnishing contract',()=>{
  it('credits existing seats, tables, rugs and supported lamps without consuming anything',()=>{
    const before=structuredClone(room);expect(hearthFurnishingCounts(registry,room)).toEqual({seat:1,table:1,lamp:1,rug:1});
    expect(room).toEqual(before);
    const definition=runtimeQuestDefinition(registry,'hearth_furnish_room')!;
    const source={statistic:()=>0n,itemCount:()=>999,furnishingCount:(category:keyof ReturnType<typeof hearthFurnishingCounts>)=>hearthFurnishingCounts(registry,room)[category]};
    const baselines=questAcceptBaselines(definition,source);expect(Object.values(baselines)).toEqual([0n,0n,0n,0n]);
    expect(questIsComplete(definition,baselines,source)).toBe(true);
    room.pop();expect(questIsComplete(definition,baselines,source)).toBe(false);room.push(before[3]!);
    expect(questIsComplete(definition,baselines,{statistic:()=>999n,itemCount:()=>999})).toBe(false);
    expect(definition.prerequisiteQuestIds).toEqual(['hearth_meet_carpenter']);expect(definition.rewards.bronze).toBe(350n);
  });
  it('requires the full footprint in the original room and a real tabletop support',()=>{
    expect(hearthFurnishingCounts(registry,[row(1,'rustic_dining_table',3,6),row(2,'rustic_chair',18,6),row(3,'townhouse_table_lamp')])).toEqual({seat:0,table:0,lamp:0,rug:0});
    const moved=room.map(item=>item.id===3n?{...item,tileX:11}:item);expect(hearthFurnishingCounts(registry,moved).lamp).toBe(0);
    expect(hearthFurnishingCounts(registry,[...room.filter(item=>item.id!==2n)]).lamp).toBe(0);
    expect(hearthFurnishingCounts(registry,[row(5,'rustic_standing_lamp')]).lamp).toBe(1);
  });
  it('rejects corrupt metadata and authored states before resolving lamp supports',()=>{
    for(const stateJson of ['{"hearthFurnitureRevision":"bad"}','{"hearthFurnitureSupportId":"-1"}','{"unknown":true}']){
      const corrupt=room.map(item=>item.id===2n?{...item,stateJson}:item);
      expect(hearthFurnishingCounts(registry,corrupt)).toMatchObject({table:0,lamp:0});
    }
    expect(hearthFurnishingCounts(registry,[row(5,'rustic_standing_lamp',6,6,'{"lit":"yes"}')]).lamp).toBe(0);
    const unsupportedParent=room.map(item=>item.id===2n?{...item,stateJson:'{"hearthFurnitureSupportId":"999"}'}:item);
    unsupportedParent.push(row(5,'rustic_writing_table',10,5));
    expect(hearthFurnishingCounts(registry,unsupportedParent)).toEqual({seat:1,table:1,lamp:0,rug:1});
  });
  it('excludes carried, corrupt, unknown and retired furniture and does not count duplicates twice',()=>{
    expect(hearthFurnishingCounts(registry,[{...row(1,'rustic_chair'),carriedBy:'guest'},row(2,'rustic_chair',6,6,'{'),row(3,'unknown')]).seat).toBe(0);
    expect(hearthFurnishingCounts(registry,[room[0]!,room[0]!]).seat).toBe(1);
    const retired={...registry,items:new Map(registry.items)},item=retired.items.get('item:furniture_rustic_chair')!;
    retired.items.set(item.id,{...item,retired:true});expect(hearthFurnishingCounts(retired,[room[0]!]).seat).toBe(0);
  });
});

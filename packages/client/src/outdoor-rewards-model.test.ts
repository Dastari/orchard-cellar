import {describe,it,expect} from 'vitest';
import {bootstrapContentRows,buildContentRegistry} from '@orchard/sim';
import {OutdoorRewardsModel} from './outdoor-rewards-model.js';
const registry=buildContentRegistry(bootstrapContentRows()).registry;
const row={id:'claim',completionId:'cinder-ash-shore:1',combatExperience:24,itemsJson:JSON.stringify([{itemKind:'basalt',quantity:2}])};
describe('outdoor receipt presentation',()=>{
  it('labels saved items from the current content registry and identifies awarded XP',()=>{
    expect(new OutdoorRewardsModel().entries([row],1,registry)).toEqual([{id:'claim',title:'ash shore',experience:24,valid:true,items:[{itemKind:'basalt',label:'Basalt',quantity:2}]}]);
  });
  it.each(['{','null','{}','[{"itemKind":"missing","quantity":2}]','[{"itemKind":"basalt","quantity":0}]','[{"itemKind":"basalt","quantity":1.5}]','[{"itemKind":"basalt","quantity":16001}]'])('keeps invalid receipts visible without throwing: %s',itemsJson=>{
    expect(new OutdoorRewardsModel().entries([{...row,itemsJson}],1,registry)[0]).toMatchObject({id:'claim',valid:false,items:[]});
  });
  it('invalidates a cached presentation for updates with an unchanged receipt count',()=>{
    const model=new OutdoorRewardsModel(),rows=[row],first=model.entries(rows,1,registry);
    expect(model.entries(rows,1,registry)).toBe(first);
    rows[0]={...row,itemsJson:'[]'};
    const changed=model.entries(rows,2,registry);expect(changed).not.toBe(first);expect(changed[0]?.items).toEqual([]);
    expect(model.entries(rows,2,buildContentRegistry(bootstrapContentRows()).registry)).not.toBe(changed);
  });
  it('does not cache sources without a subscription revision',()=>{
    const model=new OutdoorRewardsModel(),rows=[row],first=model.entries(rows,undefined,registry);
    expect(model.entries(rows,undefined,registry)).not.toBe(first);
  });
});

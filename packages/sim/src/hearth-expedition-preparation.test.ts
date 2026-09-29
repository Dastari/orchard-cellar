import {describe,it,expect} from 'vitest';
import {bootstrapContentRegistry} from './content/bootstrap-registry.js';
import {BASE_BACKPACK_CAPACITY} from './item-containers.js';
import {hearthExpeditionPreparation} from './hearth-expedition-preparation.js';
import {runtimeQuestDefinition,questAcceptBaselines,questIsComplete} from './quests.js';
const registry=bootstrapContentRegistry();
const BASE=BASE_BACKPACK_CAPACITY;
const sword={container:'equipment',index:3,itemKind:'hearth_common_sword',quantity:1,durability:250},body={container:'equipment',index:9,itemKind:'hearth_common_body',quantity:1};
const bow={...sword,itemKind:'hearth_common_bow',durability:300};
describe('expedition preparation and introductory progression',()=>{
  it('accepts current equipped gear and rejects carried, broken, duplicated, retired or wrong-slot equipment',()=>{
    expect(hearthExpeditionPreparation(registry,[sword,body],BASE)).toEqual({weapon:1,body:1});
    for(const invalid of [{...sword,container:'hotbar',index:0},{...sword,container:'backpack',index:23},{...sword,container:'crafting',index:3},{...sword,durability:0},{...sword,durability:999},{...sword,quantity:2}])expect(hearthExpeditionPreparation(registry,[invalid,body],BASE).weapon).toBe(0);
    expect(hearthExpeditionPreparation(registry,[sword,sword,body],BASE).weapon).toBe(0);
    expect(hearthExpeditionPreparation(registry,[sword,{...body,index:1}],BASE).body).toBe(0);
    const retired={...registry,items:new Map(registry.items)};retired.items.set('item:hearth_common_sword',{...registry.items.get('item:hearth_common_sword')!,retired:true});
    expect(hearthExpeditionPreparation(retired,[sword,body],BASE).weapon).toBe(0);
  });
  it('requires ten valid matching bow shots in accessible carried inventory',()=>{
    const arrows={container:'hotbar',index:0,itemKind:'arrow',quantity:10};
    expect(hearthExpeditionPreparation(registry,[bow,body,arrows],BASE).weapon).toBe(1);
    for(const invalid of [{...arrows,quantity:9},{...arrows,container:'crafting'},{...arrows,container:'backpack',index:19},{...arrows,container:'stash'},{...arrows,container:'equipment',index:5},{...arrows,itemKind:'stone'}])expect(hearthExpeditionPreparation(registry,[bow,body,invalid],BASE).weapon).toBe(0);
    expect(hearthExpeditionPreparation(registry,[bow,body,{...arrows,quantity:5},{...arrows,container:'backpack',index:0,quantity:5}],BASE).weapon).toBe(1);
  });
  it('counts shots only in the cells the bow draws from: hotbar and accessible backpack (BUG-056, BUG-068)',()=>{
    const arrowsAt=(container:string,index:number)=>({container,index,itemKind:'arrow',quantity:10});
    const ready=(capacity:number,container:string,index:number)=>hearthExpeditionPreparation(registry,[bow,body,arrowsAt(container,index)],capacity).weapon;
    // A 12-cell bag after a swap from the 20-cell one: arrows left in cells 12-19 are out of reach.
    expect(ready(12,'backpack',11)).toBe(1);
    expect(ready(12,'backpack',12)).toBe(0);
    expect(ready(12,'backpack',19)).toBe(0);
    // The accessible capacity (already resolved, debug slots included) bounds the backpack.
    expect(ready(20,'backpack',19)).toBe(1);
    expect(ready(8,'backpack',7)).toBe(1);
    expect(ready(8,'backpack',8)).toBe(0);
    expect(ready(8,'hotbar',9)).toBe(1);
    expect(ready(8,'hotbar',10)).toBe(0);
    // Never the crafting grid, equipment or the stash, at any index.
    expect(ready(20,'crafting',0)).toBe(0);
    expect(ready(20,'crafting',8)).toBe(0);
    expect(ready(20,'equipment',0)).toBe(0);
    expect(ready(20,'stash',0)).toBe(0);
    expect(ready(20,'backpack',-1)).toBe(0);
    expect(ready(20,'backpack',1.5)).toBe(0);
  });
  it('counts shots in a backpack larger than the legacy 20 cells by container index (Uncapped Storage step 5)',()=>{
    const arrowsAt=(index:number,quantity=10)=>({container:'backpack',index,itemKind:'arrow',quantity});
    const ready=(capacity:number,...arrows:ReturnType<typeof arrowsAt>[])=>hearthExpeditionPreparation(registry,[bow,body,...arrows],capacity).weapon;
    // Cells 30 and 300 are backpack cells; under the legacy numbering 30 was the Neck slot and 300 did not exist.
    expect(ready(32,arrowsAt(30))).toBe(1);
    expect(ready(301,arrowsAt(300))).toBe(1);
    expect(ready(301,arrowsAt(30,4),arrowsAt(300,6))).toBe(1);
    expect(ready(301,arrowsAt(30,4),arrowsAt(300,5))).toBe(0);
    // Past the accessible capacity they stay stranded.
    expect(ready(300,arrowsAt(300))).toBe(0);
    expect(ready(30,arrowsAt(30))).toBe(0);
    // Equipment stays equipment however large the backpack: a 400-cell bag moves no gear.
    const bigBag=[...Array.from({length:40},(_,index)=>({container:'backpack',index,itemKind:'stone',quantity:1})),arrowsAt(399)];
    expect(hearthExpeditionPreparation(registry,[bow,body,...bigBag],400)).toEqual({weapon:1,body:1});
    // Duplicate rows for one cell are invalid, as they were for one slot.
    expect(ready(301,arrowsAt(300),arrowsAt(300))).toBe(0);
  });
  it('credits pre-equipped gear, requires a fresh outpost clear and accepts already-carried basalt',()=>{
    const prepare=runtimeQuestDefinition(registry,'hearth_prepare_expedition')!,clear=runtimeQuestDefinition(registry,'hearth_clear_ash_shore')!,delivery=runtimeQuestDefinition(registry,'hearth_return_basalt')!;
    let clears=3n,basalt=2,gear={weapon:1,body:1};
    const source={statistic:()=>clears,itemCount:()=>basalt,equipmentCount:(category:'weapon'|'body')=>gear[category]};
    expect(prepare.prerequisiteQuestIds).toEqual(['hearth_willowharbour_arrival']);
    const baseline=questAcceptBaselines(prepare,source);expect(questIsComplete(prepare,baseline,source)).toBe(true);
    gear={weapon:0,body:1};expect(questIsComplete(prepare,baseline,source)).toBe(false);
    const accepted=questAcceptBaselines(clear,source);expect(questIsComplete(clear,accepted,source)).toBe(false);clears++;expect(questIsComplete(clear,accepted,source)).toBe(true);
    expect(questIsComplete(delivery,questAcceptBaselines(delivery,source),source)).toBe(true);basalt=1;expect(questIsComplete(delivery,{},source)).toBe(false);
    expect(delivery.objectives[0]).toMatchObject({kind:'collect',consumeOnTurnIn:true});
    expect([prepare,clear,delivery].map(quest=>quest.rewards.bronze)).toEqual([200n,300n,200n]);
  });
});

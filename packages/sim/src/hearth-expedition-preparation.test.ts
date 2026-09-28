import {describe,it,expect} from 'vitest';
import {bootstrapContentRegistry} from './content/bootstrap-registry.js';
import {BASE_BACKPACK_CAPACITY} from './item-containers.js';
import {hearthExpeditionPreparation} from './hearth-expedition-preparation.js';
import {runtimeQuestDefinition,questAcceptBaselines,questIsComplete} from './quests.js';
const registry=bootstrapContentRegistry();
const BASE=BASE_BACKPACK_CAPACITY;
const sword={slot:33,itemKind:'hearth_common_sword',quantity:1,durability:250},body={slot:39,itemKind:'hearth_common_body',quantity:1};
const bow={...sword,itemKind:'hearth_common_bow',durability:300};
describe('expedition preparation and introductory progression',()=>{
  it('accepts current equipped gear and rejects carried, broken, duplicated, retired or wrong-slot equipment',()=>{
    expect(hearthExpeditionPreparation(registry,[sword,body],BASE)).toEqual({weapon:1,body:1});
    for(const invalid of [{...sword,slot:0},{...sword,durability:0},{...sword,durability:999},{...sword,quantity:2}])expect(hearthExpeditionPreparation(registry,[invalid,body],BASE).weapon).toBe(0);
    expect(hearthExpeditionPreparation(registry,[sword,sword,body],BASE).weapon).toBe(0);
    expect(hearthExpeditionPreparation(registry,[sword,{...body,slot:31}],BASE).body).toBe(0);
    const retired={...registry,items:new Map(registry.items)};retired.items.set('item:hearth_common_sword',{...registry.items.get('item:hearth_common_sword')!,retired:true});
    expect(hearthExpeditionPreparation(retired,[sword,body],BASE).weapon).toBe(0);
  });
  it('requires ten valid matching bow shots in accessible carried inventory',()=>{
    const arrows={slot:0,itemKind:'arrow',quantity:10};
    expect(hearthExpeditionPreparation(registry,[bow,body,arrows],BASE).weapon).toBe(1);
    for(const invalid of [{...arrows,quantity:9},{...arrows,slot:40},{...arrows,slot:29},{...arrows,itemKind:'stone'}])expect(hearthExpeditionPreparation(registry,[bow,body,invalid],BASE).weapon).toBe(0);
    expect(hearthExpeditionPreparation(registry,[bow,body,{...arrows,quantity:5},{...arrows,slot:10,quantity:5}],BASE).weapon).toBe(1);
  });
  it('counts shots only in the cells the bow draws from: hotbar and accessible backpack (BUG-056, BUG-068)',()=>{
    const arrowsAt=(slot:number)=>({slot,itemKind:'arrow',quantity:10});
    const ready=(capacity:number,slot:number)=>hearthExpeditionPreparation(registry,[bow,body,arrowsAt(slot)],capacity).weapon;
    // A 12-cell bag after a swap from the 20-cell one: arrows left in cells 12-19 are out of reach.
    expect(ready(12,10+11)).toBe(1);
    expect(ready(12,10+12)).toBe(0);
    expect(ready(12,10+19)).toBe(0);
    // The accessible capacity includes debug slots; the base 8 is the floor, and the rule caps it at the backpack.
    expect(ready(20,10+19)).toBe(1);
    expect(ready(8,10+7)).toBe(1);
    expect(ready(8,10+8)).toBe(0);
    expect(ready(4,10+7)).toBe(1);
    expect(ready(25,30)).toBe(0);
    // Never the crafting grid.
    expect(ready(20,40)).toBe(0);
    expect(ready(20,48)).toBe(0);
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

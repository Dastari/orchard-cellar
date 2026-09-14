import {describe,it,expect} from 'vitest';
import {bootstrapContentRegistry} from './content/bootstrap-registry.js';
import {hearthExpeditionPreparation} from './hearth-expedition-preparation.js';
import {runtimeQuestDefinition,questAcceptBaselines,questIsComplete} from './quests.js';
const registry=bootstrapContentRegistry();
const sword={slot:33,itemKind:'hearth_common_sword',quantity:1,durability:250},body={slot:39,itemKind:'hearth_common_body',quantity:1};
const bow={...sword,itemKind:'hearth_common_bow',durability:300};
describe('expedition preparation and introductory progression',()=>{
  it('accepts current equipped gear and rejects carried, broken, duplicated, retired or wrong-slot equipment',()=>{
    expect(hearthExpeditionPreparation(registry,[sword,body])).toEqual({weapon:1,body:1});
    for(const invalid of [{...sword,slot:0},{...sword,durability:0},{...sword,durability:999},{...sword,quantity:2}])expect(hearthExpeditionPreparation(registry,[invalid,body]).weapon).toBe(0);
    expect(hearthExpeditionPreparation(registry,[sword,sword,body]).weapon).toBe(0);
    expect(hearthExpeditionPreparation(registry,[sword,{...body,slot:31}]).body).toBe(0);
    const retired={...registry,items:new Map(registry.items)};retired.items.set('item:hearth_common_sword',{...registry.items.get('item:hearth_common_sword')!,retired:true});
    expect(hearthExpeditionPreparation(retired,[sword,body]).weapon).toBe(0);
  });
  it('requires ten valid matching bow shots in accessible carried inventory',()=>{
    const arrows={slot:0,itemKind:'arrow',quantity:10};
    expect(hearthExpeditionPreparation(registry,[bow,body,arrows]).weapon).toBe(1);
    for(const invalid of [{...arrows,quantity:9},{...arrows,slot:40},{...arrows,slot:29},{...arrows,itemKind:'stone'}])expect(hearthExpeditionPreparation(registry,[bow,body,invalid]).weapon).toBe(0);
    expect(hearthExpeditionPreparation(registry,[bow,body,{...arrows,quantity:5},{...arrows,slot:10,quantity:5}]).weapon).toBe(1);
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

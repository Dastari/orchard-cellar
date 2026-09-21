import {describe,it,expect} from 'vitest';
import {bootstrapContentRegistry,advanceVillageOrderProgress,EMPTY_VILLAGE_ORDER_PROGRESS,
  villageOrderFamily,villageOrderRewards,villageOrderMilestoneDisplay,validateVillageOrderProgress,
  type VillageOrderProgress,type ContentRegistry,runtimeRecipeDefinition} from './index.js';
const registry=bootstrapContentRegistry();
const advance=(items:readonly string[])=>items.reduce((progress,item)=>advanceVillageOrderProgress(registry,progress,item),EMPTY_VILLAGE_ORDER_PROGRESS);
describe('village order specialist milestones',()=>{
  it('classifies registered items from tags and live fermentation outputs',()=>{
    expect(villageOrderFamily(registry,'carrot')).toBe('raw');expect(villageOrderFamily(registry,'preserved_carrot')).toBe('preserved');
    expect(villageOrderFamily(registry,'bottles')).toBe('bottle');expect(villageOrderFamily(registry,'wood')).toBeNull();
    expect(villageOrderFamily(registry,'invented')).toBeNull();
  });
  it('requires distinct products across growing, preserving and cellar production',()=>{
    const repeated=advance(['carrot','carrot','preserved_carrot','preserved_carrot','bottles']);
    expect(villageOrderRewards(registry,repeated,[])).toEqual([]);
    const first=advance(['carrot','potato','preserved_carrot']);
    expect(villageOrderRewards(registry,first,[])).toEqual(['pantry_lunch']);
    const all=advance(['carrot','potato','preserved_carrot','preserved_potato','bottles']);
    expect(villageOrderRewards(registry,all,[])).toEqual(['pantry_lunch','cellar_supper']);
    expect(villageOrderRewards(registry,all,['pantry_lunch','cellar_supper'])).toEqual([]);
    expect(villageOrderMilestoneDisplay(registry,all,['pantry_lunch','cellar_supper']).milestoneTitle).toBe('BOTH MEAL RECIPES LEARNED');
    expect(villageOrderMilestoneDisplay(registry,repeated,[]).milestoneProgress).toBe('Distinct raw 1/2  Preserved 1/1');
  });
  it('bounds progress at three raw, three preserved and one bottle regardless of future content',()=>{
    const progress=advance(['carrot','potato','grape','apple','preserved_carrot','preserved_potato','preserved_grape','preserved_apple','bottles','bottles']);
    expect(progress).toEqual({rawKinds:['carrot','potato','grape'],preservedKinds:['preserved_carrot','preserved_potato','preserved_grape'],bottleDelivered:true});
    expect(advanceVillageOrderProgress(registry,progress,'wood')).toEqual(progress);
  });
  it('rejects corrupt persisted progress without treating it as fresh eligibility',()=>{
    for(const p of [
      {...EMPTY_VILLAGE_ORDER_PROGRESS,rawKinds:['carrot','carrot']},
      {...EMPTY_VILLAGE_ORDER_PROGRESS,rawKinds:['carrot'],preservedKinds:['carrot']},
      {...EMPTY_VILLAGE_ORDER_PROGRESS,rawKinds:['carrot','potato','grape','apple']},
      {...EMPTY_VILLAGE_ORDER_PROGRESS,rawKinds:['../bad']},
      {...EMPTY_VILLAGE_ORDER_PROGRESS,bottleDelivered:2},
    ])expect(()=>validateVillageOrderProgress(p as VillageOrderProgress)).toThrow('order_progress_invalid');
  });
  it('withholds missing or retired reward content while retaining historical progress',()=>{
    const progress=advance(['carrot','potato','preserved_carrot','preserved_potato','bottles']);
    const recipes=new Map(registry.recipes);recipes.delete('recipe:pantry_lunch');
    recipes.set('recipe:cellar_supper',{...recipes.get('recipe:cellar_supper')!,retired:true});
    const live:ContentRegistry={...registry,recipes};
    expect(villageOrderRewards(live,progress,[])).toEqual([]);
    expect(villageOrderMilestoneDisplay(live,progress,[]).milestoneTitle).toContain('UNAVAILABLE');
    expect(villageOrderRewards(registry,progress,[])).toHaveLength(2);
  });
  it('ships exclusive gated recipes and usable meals with no purchase/plan shortcut',()=>{
    for(const [id,hunger] of [['pantry_lunch',3600],['cellar_supper',4800]] as const){
      const item=registry.items.get(`item:${id}`)!;
      expect(item.food?.restoreCenti).toBe(hunger);expect(item.economy?.buy).toBeNull();
      expect(runtimeRecipeDefinition(registry,id)?.requiresKnowledge).toBe(true);
      expect(registry.recipes.get(`recipe:${id}`)?.unlockHint).toBeUndefined();
    }
  });
});
it('does not re-credit a previously delivered product after live content changes its family',()=>{
  const before=advance(['carrot']);
  const items=new Map(registry.items);items.set('item:carrot',{...items.get('item:carrot')!,tags:['item.crop','item.preserved']});
  const live:ContentRegistry={...registry,items};
  expect(villageOrderFamily(live,'carrot')).toBe('preserved');
  expect(advanceVillageOrderProgress(live,before,'carrot')).toEqual(before);
});

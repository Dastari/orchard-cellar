import { describe,expect,it } from 'vitest';
import { resolveEquipmentSkillRanks,modifiersForEffectiveSkillRanks,type EquipmentSkillContribution } from './equipment-skills.js';
import { parseSkillGearMetadata } from './skill-gear-metadata.js';
import type { SkillNodeDefinition } from './skill-trees.js';
const node=(id: string,maxRank=5): SkillNodeDefinition=>({id,iconAsset:`icon_skill_${id}`,track:'combat',name:id,description:'numeric',position:[0,0],connects:[],
  maxRank,pointCost:1,implemented:true,gearBoostable:true,gearBonusCap:2,overcapLimit:2,
  effectsPerRank:[{target:'attackPower',value:300,context:'global'}]});
const blade=node('blade_training');
const gear=(sourceId: string,quality: EquipmentSkillContribution['quality'],nodeId=blade.id): EquipmentSkillContribution=>({sourceId,quality,nodeId});
describe('equipment skill ranks',()=>{
  it.each([
    [4,[gear('sword','rare')],5],
    [5,[gear('sword','rare')],5],
    [5,[gear('sword','epic')],6],
    [5,[gear('sword','legendary'),gear('helm','rare')],7],
    [0,[gear('sword','legendary')],0],
  ] as const)('resolves trained %s with the authored rarity permission',(trained,items,expected)=>{
    const ranks={blade_training:trained};
    const result=resolveEquipmentSkillRanks([blade],ranks,items);
    expect(result.effective[blade.id]).toBe(expected);
    expect(ranks.blade_training).toBe(trained);
    expect(modifiersForEffectiveSkillRanks([blade],result,'global').reduce((sum,m)=>sum+m.value,0)).toBe(expected*300);
  });
  it('limits a whole loadout to four granted ranks with chosen node priority',()=>{
    const defs=[node('a'),node('b'),node('c')];
    const items=defs.flatMap(n=>[gear(`${n.id}-1`,'rare',n.id),gear(`${n.id}-2`,'rare',n.id)]);
    const result=resolveEquipmentSkillRanks(defs,{a:1,b:1,c:1},items,['c','b']);
    expect(result.bonuses).toEqual({a:0,b:2,c:2});
    expect(result.grantedRanks).toBe(4);
    expect(result.inactive.map(i=>i.reason)).toEqual(['loadout_cap','loadout_cap']);
    expect(resolveEquipmentSkillRanks(defs,{a:1,b:1,c:1},[...items].reverse(),['c','b'])).toEqual(result);
  });
  it('limits over-cap ranks to two across the loadout while retaining below-cap bonuses',()=>{
    const defs=[node('a'),node('b'),node('c')];
    const result=resolveEquipmentSkillRanks(defs,{a:5,b:5,c:1},[
      gear('a1','legendary','a'),gear('a2','rare','a'),gear('b1','epic','b'),gear('c1','rare','c'),gear('c2','rare','c')],['a','b','c']);
    expect(result.bonuses).toEqual({a:2,b:0,c:2});
    expect(result.overcapRanks).toBe(2);
    expect(result.grantedRanks).toBe(4);
    expect(result.inactive).toEqual([{sourceId:'b1',reason:'overcap_budget'}]);
  });
  it('rejects duplicate instances, invalid training and equipment-only prerequisites',()=>{
    expect(resolveEquipmentSkillRanks([blade],{blade_training:5},[gear('same','rare'),gear('same','legendary')]).grantedRanks).toBe(0);
    for(const rank of [NaN,Infinity,-1,6,1.5]) expect(resolveEquipmentSkillRanks([blade],{blade_training:rank},[gear('sword','legendary')]).grantedRanks).toBe(0);
    const gated={...blade,prerequisites:['licence']};
    const result=resolveEquipmentSkillRanks([node('licence',1),gated],{blade_training:5},[gear('sword','legendary'),gear('neck','legendary','licence')]);
    expect(result.grantedRanks).toBe(0);
    expect(result.effective.blade_training).toBe(0);
  });
  it('keeps contextual numeric effects separate and recomputes cleanly on unequip/respec',()=>{
    const mining: SkillNodeDefinition={...node('mining'),effectsPerRank:[{target:'toolVigourCost',value:-500,context:'mining'}]};
    const equipped=resolveEquipmentSkillRanks([mining],{mining:5},[gear('neck','epic','mining')]);
    expect(modifiersForEffectiveSkillRanks([mining],equipped,'mining')[0]?.value).toBe(-3000);
    expect(modifiersForEffectiveSkillRanks([mining],equipped,'fishing')).toEqual([]);
    expect(resolveEquipmentSkillRanks([mining],{mining:5},[]).effective.mining).toBe(5);
    expect(resolveEquipmentSkillRanks([mining],{},[gear('neck','epic','mining')]).effective.mining).toBe(0);
  });
  it('refuses capability, root, unimplemented and unsupported metadata',()=>{
    const valid={...blade};
    expect(parseSkillGearMetadata(valid,'node').gearBonusCap).toBe(2);
    for(const invalid of [{...valid,root:true},{...valid,implemented:false},{...valid,passive:{identifyBuriedOre:true}},
      {...valid,gearBonusCap:3},{...valid,effectsPerRank:[{target:'recipeUnlock',value:1,context:'global'}]}]) {
      expect(()=>parseSkillGearMetadata(invalid,'node')).toThrow();
    }
    expect(parseSkillGearMetadata({id:'legacy'},'node')).toEqual({});
  });
});

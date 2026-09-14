import {describe,it,expect} from 'vitest';
import {bootstrapContentRegistry} from './content/bootstrap-registry.js';
import {runtimeQuestDefinition,questAcceptBaselines,questIsComplete,questLocationContains,type QuestProgressSource} from './quests.js';
import {runtimeDialogueDefinition} from './dialogue.js';
import {runtimeHearthFerryNetwork} from './hearth-travel.js';
import {TILE_SIZE_FIXED} from './state.js';
const registry=bootstrapContentRegistry();
const arrival=runtimeQuestDefinition(registry,'hearth_willowharbour_arrival')!;
const carpenter=runtimeQuestDefinition(registry,'hearth_meet_carpenter')!;
const pip=BigInt(registry.npcs.get('npc:willow_harbour_guide')!.runtimeId),rowan=BigInt(registry.npcs.get('npc:willow_carpenter')!.runtimeId);
const source=(values:Record<string,bigint>):QuestProgressSource=>({statistic:(kind,subject)=>values[`${kind}:${subject}`]??0n,itemCount:()=>0});
describe('Willowharbour introductory contracts',()=>{
  it('requires a new visit and Pip conversation on the Fin-first route',()=>{
    const values:Record<string,bigint>={[`quest_npc_talks:${pip}`]:5n};
    const progress=source(values),baseline=questAcceptBaselines(arrival,progress,7n);
    expect(questIsComplete(arrival,baseline,progress)).toBe(false);
    values[`quest_locations_reached:${arrival.id}:reach_harbour`]=1n;
    expect(questIsComplete(arrival,baseline,progress)).toBe(false);
    values[`quest_npc_talks:${pip}`]=6n;
    expect(questIsComplete(arrival,baseline,progress)).toBe(true);
  });
  it('counts the admitted Pip conversation and covers the landing plus his reachable frontage',()=>{
    const values:Record<string,bigint>={[`quest_npc_talks:${pip}`]:5n},progress=source(values);
    const baseline=questAcceptBaselines(arrival,progress,pip);
    values[`quest_locations_reached:${arrival.id}:reach_harbour`]=1n;
    expect(questIsComplete(arrival,baseline,progress)).toBe(true);
    const location=arrival.objectives.find(objective=>objective.kind==='location')!;
    const dock=runtimeHearthFerryNetwork(registry)!.byId.get('willowharbour')!.arrival;
    expect(questLocationContains(location,{spaceId:0,x:(dock.tileX+.5)*TILE_SIZE_FIXED,y:(dock.tileY+.5)*TILE_SIZE_FIXED})).toBe(true);
    for(const [dx,dy] of [[0,0],[3,0],[-3,0],[0,3],[0,-3]])expect(questLocationContains(location,
      {spaceId:0,x:(207.5+dx!)*TILE_SIZE_FIXED,y:(397.5+dy!)*TILE_SIZE_FIXED})).toBe(true);
    expect(questLocationContains(location,{spaceId:65525,x:location.x,y:location.y})).toBe(false);
  });
  it('does not credit an earlier Rowan visit, but does count acceptance while speaking to Rowan',()=>{
    const progress=source({[`quest_npc_talks:${rowan}`]:9n});
    expect(questIsComplete(carpenter,questAcceptBaselines(carpenter,progress,pip),progress)).toBe(false);
    expect(questIsComplete(carpenter,questAcceptBaselines(carpenter,progress,rowan),progress)).toBe(true);
    expect(questAcceptBaselines(carpenter,source({}),rowan).meet_rowan).toBe(0n);
    expect(carpenter.prerequisiteQuestIds).toEqual([arrival.id]);
  });
  it('offers reachable gated handoffs on both routes without replacing existing services',()=>{
    for(const [dialogueId,questId,npcId] of [
      ['fisherman_fin',arrival.id,'npc:fisherman_fin'],['willow_harbour_guide',arrival.id,'npc:willow_harbour_guide'],
      ['willow_harbour_guide',carpenter.id,'npc:willow_harbour_guide'],['willow_carpenter',carpenter.id,'npc:willow_carpenter'],
    ]){
      const dialogue=runtimeDialogueDefinition(registry,dialogueId!)!;
      const choices=Object.values(dialogue.nodes).flatMap(node=>node.choices).filter(choice=>choice.quest?.questId===questId);
      expect(choices.some(choice=>choice.quest?.requires==='available'&&choice.quest.action==='accept')).toBe(true);
      expect(choices.some(choice=>choice.quest?.requires==='complete'&&choice.quest.action==='turn_in')).toBe(true);
      expect(registry.npcs.get(npcId!)?.questGiver).toContain('quest:'+questId);
    }
    expect(arrival.rewards.bronze+carpenter.rewards.bronze).toBe(300n);
    expect(arrival.rewards.experience).toEqual([]);expect(carpenter.rewards.items).toEqual([]);
    expect(registry.npcs.get('npc:willow_carpenter')?.shop).toBe('shop:willow_carpenter');
  });
});

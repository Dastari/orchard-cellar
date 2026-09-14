import { ownedSkillNodesWithPrerequisites, type SkillNodeDefinition } from './skill-trees.js';
import type { SkillRankEffect } from './skill-gear-metadata.js';
import type { Modifier } from './modifiers.js';

export const EQUIPMENT_SKILL_RANK_BUDGET = 4;
export const EQUIPMENT_OVERCAP_RANK_BUDGET = 2;
export interface EquipmentSkillContribution {
  /** Actual equipped instance/slot identity, never an inventory item definition. */
  readonly sourceId: string;
  readonly nodeId: string;
  readonly quality: 'rare' | 'epic' | 'legendary';
}
export interface EquipmentSkillResolution {
  readonly trained: Readonly<Record<string,number>>;
  readonly effective: Readonly<Record<string,number>>;
  readonly bonuses: Readonly<Record<string,number>>;
  readonly maximums: Readonly<Record<string,number>>;
  readonly grantedRanks: number;
  readonly overcapRanks: number;
  readonly inactive: readonly { readonly sourceId: string; readonly reason: 'duplicate_instance' | 'not_eligible' | 'untrained' | 'node_cap' | 'loadout_cap' | 'overcap_budget' }[];
}

/** Receives only server-validated, eligible equipped items. Training and ownership
 * are resolved first, so equipment cannot qualify a node or unlock its prerequisites. */
export function resolveEquipmentSkillRanks(
  definitions: readonly SkillNodeDefinition[],
  trainedRanks: Readonly<Record<string,number>>,
  contributions: readonly EquipmentSkillContribution[],
  priority: readonly string[] = [],
): EquipmentSkillResolution {
  const owned=ownedSkillNodesWithPrerequisites(definitions,trainedRanks);
  const nodes=new Map(definitions.map(node=>[node.id,node]));
  const trained: Record<string,number>={}, effective: Record<string,number>={}, bonuses: Record<string,number>={}, maximums: Record<string,number>={};
  for(const node of definitions) {
    const rank=trainedRanks[node.id]??0;
    trained[node.id]=node.root!==true && owned.has(node.id) && Number.isSafeInteger(rank) && rank>=0 ? rank : 0;
    effective[node.id]=trained[node.id]!;
    bonuses[node.id]=0; maximums[node.id]=node.maxRank;
  }
  const counts=new Map<string,number>();
  for(const item of contributions) counts.set(item.sourceId,(counts.get(item.sourceId)??0)+1);
  const inactive: { sourceId: string; reason: EquipmentSkillResolution['inactive'][number]['reason'] }[]=[];
  const grouped=new Map<string,EquipmentSkillContribution[]>();
  for(const item of contributions) {
    const node=nodes.get(item.nodeId);
    if(!item.sourceId || counts.get(item.sourceId)!>1) { inactive.push({sourceId:item.sourceId,reason:'duplicate_instance'}); continue; }
    if(node?.gearBoostable!==true || node.implemented!==true || node.root===true || node.passive!==undefined
      || !node.effectsPerRank?.length || !['rare','epic','legendary'].includes(item.quality)
      || !Number.isSafeInteger(node.gearBonusCap) || node.gearBonusCap!<1 || node.gearBonusCap!>2
      || !Number.isSafeInteger(node.overcapLimit) || node.overcapLimit!<0 || node.overcapLimit!>2) {
      inactive.push({sourceId:item.sourceId,reason:'not_eligible'}); continue;
    }
    if((trained[node.id]??0)<1) { inactive.push({sourceId:item.sourceId,reason:'untrained'}); continue; }
    const group=grouped.get(node.id)??[];group.push(item);grouped.set(node.id,group);
  }
  const order=[...new Set([...priority.filter(id=>nodes.has(id)),...grouped.keys()].sort((a,b)=>{
    const pa=priority.indexOf(a),pb=priority.indexOf(b);
    if(pa>=0 || pb>=0) return (pa<0?Number.MAX_SAFE_INTEGER:pa)-(pb<0?Number.MAX_SAFE_INTEGER:pb);
    return a<b?-1:a>b?1:0;
  }))];
  let remaining=EQUIPMENT_SKILL_RANK_BUDGET;
  let overcapRemaining=EQUIPMENT_OVERCAP_RANK_BUDGET;
  for(const id of order) {
    const node=nodes.get(id)!,group=grouped.get(id);
    if(group===undefined) continue;
    group.sort((a,b)=>a.sourceId<b.sourceId?-1:a.sourceId>b.sourceId?1:0);
    const permission=Math.max(...group.map(item=>item.quality==='legendary'?2:item.quality==='epic'?1:0));
    const maximum=node.maxRank+Math.min(node.overcapLimit!,permission);
    maximums[id]=maximum;
    const available=Math.min(node.gearBonusCap!,Math.max(0,maximum-trained[id]!));
    const normalRanks=Math.max(0,node.maxRank-trained[id]!);
    const overcapAllowed=Math.min(available,normalRanks+overcapRemaining);
    const granted=Math.min(overcapAllowed,remaining,group.length);
    overcapRemaining-=Math.max(0,granted-normalRanks);
    bonuses[id]=granted;effective[id]=trained[id]!+granted;remaining-=granted;
    for(let i=granted;i<group.length;i++) inactive.push({sourceId:group[i]!.sourceId,reason:i>=available?'node_cap':i>=overcapAllowed?'overcap_budget':'loadout_cap'});
  }
  return { trained,effective,bonuses,maximums,grantedRanks:EQUIPMENT_SKILL_RANK_BUDGET-remaining,overcapRanks:EQUIPMENT_OVERCAP_RANK_BUDGET-overcapRemaining,inactive };
}

/** Exactly one modifier per authored effect; equipment ranks replace the trained
 * effect instead of stacking a second copy of the same skill modifier. */
export function modifiersForEffectiveSkillRanks(
  definitions: readonly SkillNodeDefinition[],
  resolution: EquipmentSkillResolution,
  context: SkillRankEffect['context'],
): readonly Modifier[] {
  return definitions.flatMap((node): Modifier[] => {
    const rank=resolution.effective[node.id]??0;
    if(node.implemented!==true || rank<=0 || !Number.isSafeInteger(rank)) return [];
    return (node.effectsPerRank??[]).filter(effect=>effect.context==='global' || effect.context===context)
      .map((effect,index)=>({ id:`skill.${node.id}.${index}`,target:effect.target,layer:'pctAdd',
        value:rank*effect.value,source:'skill' }));
  });
}

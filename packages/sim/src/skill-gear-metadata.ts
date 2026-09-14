import { ContentParseError } from './content/parse-contract.js';

export const SKILL_RANK_EFFECT_TARGETS = ['attackPower','rangedPower','toolVigourCost','sprintVigourCost'] as const;
export const SKILL_RANK_EFFECT_CONTEXTS = ['global','weapon','farming','mining','fishing','woodcutting','exploration'] as const;
export interface SkillRankEffect {
  readonly target: typeof SKILL_RANK_EFFECT_TARGETS[number];
  /** Basis points per rank, in the existing additive percentage bucket. */
  readonly value: number;
  readonly context: typeof SKILL_RANK_EFFECT_CONTEXTS[number];
}
export interface SkillGearMetadata {
  readonly gearBoostable?: true;
  readonly gearBonusCap?: number;
  readonly overcapLimit?: number;
  readonly effectsPerRank?: readonly SkillRankEffect[];
}

/** Capabilities and unlock nodes cannot acquire equipment effects via content. */
export function parseSkillGearMetadata(node: Record<string,unknown>, path: string): SkillGearMetadata {
  const fields=['gearBoostable','gearBonusCap','overcapLimit','effectsPerRank'];
  if(fields.every(key=>node[key]===undefined)) return {};
  const fail=(message: string): never => { throw new ContentParseError('invalid_type',path,message); };
  if(node['gearBoostable']!==true || node['implemented']!==true || node['root']===true
    || node['passive']!==undefined) fail('equipment ranks require an implemented numeric node');
  const bonusCap=node['gearBonusCap'], overcap=node['overcapLimit'];
  if(!Number.isSafeInteger(bonusCap) || (bonusCap as number)<1 || (bonusCap as number)>2
    || !Number.isSafeInteger(overcap) || (overcap as number)<0 || (overcap as number)>2) fail('equipment rank limits must be within the reviewed cap of two');
  const raw=node['effectsPerRank'];
  if(!Array.isArray(raw) || raw.length===0 || raw.length>4) fail('numeric rank effects are required');
  const effects=(raw as unknown[]).map((value): SkillRankEffect => {
    if(value===null || typeof value!=='object' || Array.isArray(value)) return fail('invalid rank effect');
    const effect=value as Record<string,unknown>;
    if(!(SKILL_RANK_EFFECT_TARGETS as readonly unknown[]).includes(effect['target'])
      || !(SKILL_RANK_EFFECT_CONTEXTS as readonly unknown[]).includes(effect['context'])
      || !Number.isSafeInteger(effect['value']) || Math.abs(effect['value'] as number)>10_000) return fail('unsupported rank effect');
    return { target: effect['target'] as SkillRankEffect['target'], value: effect['value'] as number,
      context: effect['context'] as SkillRankEffect['context'] };
  });
  return { gearBoostable: true, gearBonusCap: bonusCap as number, overcapLimit: overcap as number, effectsPerRank: effects };
}

import tilesetsJson from '../../assets/content/tilesets.json' with { type: 'json' };
import { parseRuleCatalogue, resolveRuleLayers, type RuleCatalogue, type ResolvedRuleFrame } from './rule-catalogue.js';

/** Immutable bootstrap terrain data, separate from the later hot-registry runtime. */
export const bootstrapTerrainRuleCatalogue = parseRuleCatalogue({schemaVersion:1,families:tilesetsJson.flatMap(t=>t.ruleCatalogue?.families ?? [])});
export const RULE_NEIGHBOUR_OFFSETS = [[0,-1],[1,0],[0,1],[-1,0],[1,-1],[1,1],[-1,1],[-1,-1]] as const;
export function ruleNeighbourMask(matches: (x:number,y:number)=>boolean): number {
  let mask=0;
  for(let i=0;i<RULE_NEIGHBOUR_OFFSETS.length;i++){const [x,y]=RULE_NEIGHBOUR_OFFSETS[i]!;if(matches(x,y))mask|=1<<i;}
  return mask;
}
const compiled = new WeakMap<RuleCatalogue, Map<string, readonly (readonly ResolvedRuleFrame[])[]>>();
/** Compile the finite mask domain once. Returned layers must not be mutated. */
export function terrainRuleLayers(id:string,mask:number,catalogue:RuleCatalogue=bootstrapTerrainRuleCatalogue): readonly ResolvedRuleFrame[] {
  let families=compiled.get(catalogue);
  if(!families){families=new Map();compiled.set(catalogue,families);}
  let masks=families.get(id);
  if(!masks){
    const family=catalogue.families.find(f=>f.id===id);
    if(!family)throw new Error(`terrain_rule_missing:${id}`);
    masks=Array.from({length:256},(_,m)=>Object.freeze(resolveRuleLayers(family,m).map(f=>Object.freeze(f))));
    families.set(id,masks);
  }
  return masks[mask&255]!;
}
export function farmlandRuleLayers(matches:(x:number,y:number)=>boolean): readonly ResolvedRuleFrame[] {
  return terrainRuleLayers('farmland_blob47',ruleNeighbourMask(matches));
}

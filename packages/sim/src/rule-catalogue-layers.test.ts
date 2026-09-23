import { describe,expect,it } from 'vitest';
import { parseRuleCatalogue,resolveRuleFrame,resolveRuleLayers, type AvailableRuleFamily } from './rule-catalogue.js';
import { bootstrapTerrainRuleCatalogue,terrainRuleLayers,ruleNeighbourMask } from './terrain-rule-catalogue.js';
const source=()=>structuredClone(bootstrapTerrainRuleCatalogue.families.find(f=>f.id==='grass_2_fringe')!) as AvailableRuleFamily;
function parse(value:unknown){return parseRuleCatalogue({schemaVersion:1,families:[value]}).families[0]!;}
describe('catalogue mask matching and independent layers',()=>{
 it('preserves transparent bases and independently selected corner order',()=>{
  const family=source();
  expect(resolveRuleFrame(family,240)).toBeNull();
  expect(resolveRuleLayers(family,240).map(f=>f.frame)).toEqual([65,64,49,48]);
  expect(resolveRuleLayers(family,255).map(f=>[f.assetId,f.frame])).toEqual([['tile_cf_grass_2_middle',0]]);
 });
 it('uses first matching mask then ordered fallback within each layer',()=>{
  const f=source();const family=parse({...f,masks:[{mask:0,matchMask:0,roles:['missing_art']},...f.masks],fallback:['edge_1'],roles:{...f.roles,missing_art:{unavailable:'Not authored'}}});
  expect(resolveRuleFrame(family,255)?.frame).toBe(1);
  expect(resolveRuleLayers(family,128).map(f=>f.frame)).toEqual([1,65]);
 });
 it('keeps legacy exact masks and permits distinct bit patterns with the same value',()=>{
  const f=source();
  const exact=parse({...f,masks:[{mask:1,roles:['edge_1']},{mask:1,matchMask:15,roles:['edge_18']}],layers:[]});
  expect(resolveRuleFrame(exact,1)?.frame).toBe(1);
  expect(resolveRuleFrame(exact,17)?.frame).toBe(18);
 });
 it.each([
  {masks:[{mask:16,matchMask:15,roles:[]}]},
  {masks:[{mask:0,matchMask:256,roles:[]}]},
  {masks:[{mask:0,matchMask:-1,roles:[]}]},
  {masks:[{mask:0,matchMask:255,roles:[]},{mask:0,roles:[]}]},
  {layers:[{masks:[{mask:0,roles:['unknown']}],fallback:[]}]},
  {layers:[{masks:[],fallback:[],extra:true}]},
  {layers:null},
 ])('rejects invalid matching/layer declaration %j',change=>expect(()=>parse({...source(),...change})).toThrow(/rule_catalogue_invalid/));
 it('compiles per catalogue identity and reflects authored frame changes',()=>{
  const f=source();const modified=parseRuleCatalogue({schemaVersion:1,families:[{...f,roles:{...f.roles,corner_65:{frame:{assetId:'custom_sheet',frame:99},blocksMovement:false,blocksLight:false,variants:[],seasonalRemaps:{}}}}]});
  expect(terrainRuleLayers(f.id,128,modified)[0]).toMatchObject({assetId:'custom_sheet',frame:99});
  expect(terrainRuleLayers(f.id,128)[0]?.frame).toBe(65);
  expect(terrainRuleLayers(f.id,128)).toBe(terrainRuleLayers(f.id,128));
  expect(Object.isFrozen(terrainRuleLayers(f.id,128)[0])).toBe(true);
  expect(()=>terrainRuleLayers('absent',0)).toThrow('terrain_rule_missing:absent');
 });
 it('normalizes mask bits and samples all eight neighbours exactly once',()=>{
  const seen:string[]=[];
  expect(ruleNeighbourMask((x,y)=>{seen.push(`${x},${y}`);return true;})).toBe(255);
  expect(new Set(seen).size).toBe(8);
  expect(terrainRuleLayers('farmland_blob47',-1)).toBe(terrainRuleLayers('farmland_blob47',255));
 });
 it('resolves unavailable families and independently weighted seasonal layer frames',()=>{
  const unavailable=parseRuleCatalogue({schemaVersion:1,families:[{id:'unavailable',kind:'blob47',unavailable:'No art'}]});
  expect(resolveRuleLayers(unavailable.families[0]!,0)).toEqual([]);
  const f=source();const role=f.roles.corner_65!;
  if('unavailable' in role)throw new Error('expected frame');
  const custom=parse({...f,roles:{...f.roles,corner_65:{...role,variants:[{assetId:'v',frame:70,weight:1}],seasonalRemaps:{winter:{assetId:'winter',frame:80}}}}});
  expect(resolveRuleLayers(custom,128)[0]?.frame).toBe(70);
  expect(resolveRuleLayers(custom,128,0,'winter')[0]?.frame).toBe(80);
 });
});

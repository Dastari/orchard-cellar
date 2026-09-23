import { describe, expect, it } from 'vitest';
import { connectedObjectCatalogue, connectedObjectDefinitionFamily, connectedObjectFamily, connectedObjectIndex, connectedObjectIsExact, connectedObjectFrame } from './connected-objects.js';
import { parseRuleCatalogue, resolveRuleFrame, type AvailableRuleFamily } from './rule-catalogue.js';
import { parseTilesetDefinition } from './content/definitions.js';
import { bootstrapContentDefinitions } from './content/bootstrap-registry.js';
import { parseObjectDefinition } from './content/object-definition.js';
import tilesets from '../../assets/content/tilesets.json' with { type: 'json' };
const source = () => structuredClone(tilesets[0]!.ruleCatalogue!);
const family = () => parseRuleCatalogue(source()).families[0] as AvailableRuleFamily;
const fence = () => {
  const d=bootstrapContentDefinitions().find(d=>d.id==='object:fence');
  if(d?.kind!=='object')throw new Error('fence absent'); return structuredClone(d);
};
describe('versioned rule catalogue', () => {
  it('round trips additive content while old definitions remain unchanged', () => {
    const parsed = parseTilesetDefinition(tilesets[0]);
    expect(parsed.ruleCatalogue).toEqual(source());
    const legacy = {...tilesets[0],ruleCatalogue:undefined};
    expect(parseTilesetDefinition(legacy).ruleCatalogue).toBeUndefined();
    expect(connectedObjectCatalogue(new Map())).toEqual(parsed.ruleCatalogue);
    expect(connectedObjectCatalogue(new Map([[parsed.id,{...parsed,ruleCatalogue:{schemaVersion:1,families:[]}}]]))).toEqual({schemaVersion:1,families:[]});
  });
  it('supports every family kind and explicit unavailable families', () => {
    for(const kind of ['raised','transition','shore','blob47','lane','patch','connect4']) {
      expect(parseRuleCatalogue({schemaVersion:1,families:[{...family(),kind}]}).families[0]?.kind).toBe(kind);
    }
    const c = parseRuleCatalogue({schemaVersion:1,families:[{id:'snow',kind:'raised',unavailable:'No reviewed artwork'}]});
    expect(resolveRuleFrame(c.families[0]!,0)).toBeNull();
  });
  it.each([
    ['version', (c: ReturnType<typeof source>) => ({...c,schemaVersion:2})],
    ['unknown field', (c: ReturnType<typeof source>) => ({...c,typo:true})],
    ['duplicate family', (c: ReturnType<typeof source>) => ({...c,families:[c.families[0],c.families[0]]})],
    ['unknown role', (c: ReturnType<typeof source>) => ({...c,families:[{...c.families[0],fallback:['missing']}]})],
    ['out of range mask', (c: ReturnType<typeof source>) => ({...c,families:[{...c.families[0],masks:[{mask:16,roles:[]}]}]})],
    ['duplicate mask', (c: ReturnType<typeof source>) => ({...c,families:[{...c.families[0],masks:[{mask:0,roles:[]},{mask:0,roles:[]}]}]})],
    ['unknown compatible family', (c: ReturnType<typeof source>) => ({...c,families:[{...c.families[0],compatibleFamilies:['missing']} ]})],
    ['invalid halo', (c: ReturnType<typeof source>) => ({...c,families:[{...c.families[0],smart:{halo:-1,formations:[]}}]})],
    ['invalid topology', (c: ReturnType<typeof source>) => ({...c,families:[{...c.families[0],topology:'eight-way'}]})],
    ['bad unavailable', () => ({schemaVersion:1,families:[{id:'x',kind:'raised',unavailable:''}]})],
  ])('rejects %s', (_,edit) => { expect(()=>parseRuleCatalogue(edit(source()))).toThrow(/rule_catalogue_invalid/); });
  it('resolves first available role, ordered fallback, deterministic weights, seasons and transforms', () => {
    const f: AvailableRuleFamily = {...family(),transforms:[0,1,'flipX'],masks:[{mask:2,roles:['missing_art','first']}],fallback:['second'],roles:{
      missing_art:{unavailable:'not supplied'},
      first:{frame:{assetId:'art',frame:1},blocksMovement:false,blocksLight:true,variants:[{assetId:'art',frame:2,weight:1},{assetId:'art',frame:3,weight:2,transform:1}],seasonalRemaps:{winter:{assetId:'snow',frame:4,transform:'flipX'}}},
      second:{frame:{assetId:'fallback',frame:9},blocksMovement:true,blocksLight:false,variants:[],seasonalRemaps:{}},
    }};
    const parsed = parseRuleCatalogue({schemaVersion:1,families:[f]}).families[0]!;
    expect(resolveRuleFrame(parsed,2,0)).toMatchObject({role:'first',frame:2,blocksMovement:false});
    expect(resolveRuleFrame(parsed,2,2)).toMatchObject({frame:3,transform:1});
    expect(resolveRuleFrame(parsed,2,3)).toMatchObject({frame:2});
    expect(resolveRuleFrame(parsed,2,0,'winter')).toMatchObject({assetId:'snow',frame:4,transform:'flipX'});
    expect(resolveRuleFrame(parsed,0)).toMatchObject({role:'second',frame:9});
    expect(()=>parseRuleCatalogue({schemaVersion:1,families:[{...f,transforms:[0]}]})).toThrow(/transform/);
    expect(()=>parseRuleCatalogue({schemaVersion:1,families:[{...f,roles:{...f.roles,first:{...f.roles.first,variants:[{assetId:'art',frame:0,weight:0}]}}}]})).toThrow(/weight/);
  });
});
describe('definition membership and neighbour contracts', () => {
  it('keeps joins when art changes, rejects sprite-name impersonation', () => {
    const def=fence();
    expect(connectedObjectDefinitionFamily({...def,components:{...def.components,sprite:{...def.components.sprite!,asset:'brand_new_art'}}})).toBe('wood_fence');
    expect(connectedObjectDefinitionFamily(parseObjectDefinition({...def,id:'object:unrelated',components:{...def.components,identity:{tags:[]}}}))).toBeNull();
    expect(connectedObjectFamily('prop_cf_willow_hedge_unregistered')).toBeNull();
    expect(connectedObjectIsExact('prop_cf_fence_gate')).toBe(true);
  });
  it('honours directed connectsTo by id and tag, including exact gates and explicit empty lists', () => {
    const def=fence(); const gate=parseObjectDefinition({...def,id:'object:fence_gate'});
    const cell={tileX:0,tileY:0,elevation:0,space:0,family:'wood_fence',definition:def};
    const neighbor={...cell,tileX:1,definition:gate};
    expect(connectedObjectIndex([cell,neighbor])(cell)).toBe(2);
    for(const connectsTo of [[],['object:other'],['other.tag']]) {
      const c={...cell,definition:parseObjectDefinition({...def,components:{...def.components,placement:{...def.components.placement!,connectsTo}}})};
      expect(connectedObjectIndex([c,neighbor])(c)).toBe(0);
    }
    const c={...cell,definition:parseObjectDefinition({...def,components:{...def.components,placement:{...def.components.placement!,connectsTo:['object:fence_gate']}}})};
    expect(connectedObjectIndex([c,neighbor])(c)).toBe(2);
    expect(connectedObjectIndex([c,{...neighbor,elevation:1}])(c)).toBe(0);
    expect(connectedObjectIndex([c,{...neighbor,space:1}])(c)).toBe(0);
  });
  it('supports authored compatible families and new definitions without code changes', () => {
    const f=family(); const other={...f,id:'new_fence',members:{...f.members,definitionIds:['object:new_fence'],tags:[]},compatibleFamilies:['wood_fence']};
    const c=parseRuleCatalogue({schemaVersion:1,families:[{...f,compatibleFamilies:['new_fence']},other]});
    const def=parseObjectDefinition({...fence(),id:'object:new_fence'});
    expect(connectedObjectDefinitionFamily(def,c)).toBe('new_fence');
    const origin={tileX:0,tileY:0,elevation:0,space:0,family:'wood_fence',definition:fence()};
    expect(connectedObjectIndex([origin,{...origin,tileX:1,family:'new_fence',definition:def}],c)(origin)).toBe(2);
    expect(connectedObjectFrame('new_fence',2,c)).toBe(1);
  });
});

import {describe,it,expect} from 'vitest';
import {activeHearthEncounterDefinitions,HEARTH_ENCOUNTERS,
  runtimeHearthEncounterDefinition,runtimeHearthEnemyDefinition,runtimeRogueEnemyAttackPattern} from './hearth-encounters.js';
import {loadBootstrapPackDefinitions} from './content/bootstrap-pack-loader.js';
import {bootstrapContentRows} from './content/bootstrap-registry.js';
import {buildContentRegistry} from './content/registry.js';

describe('reviewed Cinderwake encounter sites',()=>{
  it('resolves every completion drop to a stackable authored material',()=>{
    const definitions=loadBootstrapPackDefinitions();
    for(const camp of HEARTH_ENCOUNTERS)for(const drop of camp.reward.drops){
      const item=definitions.find(row=>row.id===`item:${drop.itemKind}`);
      expect(item,`${camp.id}: missing ${drop.itemKind}`).toBeDefined();
      if(item?.kind!=='item')throw new Error(`Reward is not an item: ${drop.itemKind}`);
      expect(item.maxStack).toBeGreaterThan(1);
      expect(item.icon.asset).toBeTruthy();
      expect(item.tags).toContain('item.material');
    }
  });
  it('makes the Warden opt-in and guarantees its seal independently of random drops',()=>{
    const warden=HEARTH_ENCOUNTERS.find(row=>row.id==='cinder-caldera-warden')!;
    expect(warden.activation).toBe('interact');expect(warden.members).toHaveLength(1);
    expect(warden.reward.drops).toContainEqual({itemKind:'guardian_seal',minimum:1,maximum:1,chanceBasisPoints:10000});
    expect(warden.respawnDelayTicks).toBe(18000n);
  });
  it('keeps durable encounter/enemy identities across arbitrary authoring-id renames',()=>{
    const rows=bootstrapContentRows().map(row=>{
      const json=JSON.parse(row.json as string) as Record<string,unknown>;
      if(row.id==='enemy:ember_slime')return {...row,id:'enemy:moon_ember',slug:'moon_ember',json:{...json,id:'enemy:moon_ember'}};
      if(row.kind==='encounter'){
        const members=(json.members as Array<Record<string,unknown>>).map(member=>member.enemy==='enemy:ember_slime'
          ?{...member,enemy:'enemy:moon_ember'}:member);
        const summons=json.summons as Record<string,unknown>|undefined;
        const patched={...json,members,...(summons?.enemy==='enemy:ember_slime'?{summons:{...summons,enemy:'enemy:moon_ember'}}:{})};
        if(row.id==='encounter:cinder_ash_shore')return {...row,id:'encounter:moon_shore',slug:'moon_shore',json:{...patched,id:'encounter:moon_shore'}};
        return {...row,json:patched};
      }
      if(row.kind==='resource'&&Array.isArray(json.fixedSites)){
        const fixedSites=(json.fixedSites as unknown[][]).map(site=>site[4]==='encounter:cinder_ash_shore'
          ?[...site.slice(0,4),'encounter:moon_shore']:site);
        return {...row,json:{...json,fixedSites}};
      }
      return row;
    });
    const built=buildContentRegistry(rows);expect(built.report.errors).toEqual([]);
    expect(runtimeHearthEnemyDefinition(built.registry,'ember_slime')).toMatchObject({definitionId:'enemy:moon_ember'});
    expect(runtimeHearthEncounterDefinition(built.registry,'cinder-ash-shore')).toMatchObject({definitionId:'encounter:moon_shore'});
    expect(runtimeHearthEncounterDefinition(built.registry,'cinder-ash-shore')?.members[0]).toMatchObject({
      definitionId:'enemy:moon_ember',kind:'ember_slime',
    });
  });
  it('fails closed instead of reviving missing or retired enemy definitions',()=>{
    const missing=buildContentRegistry(bootstrapContentRows().filter(row=>row.id!=='enemy:ember_slime')).registry;
    expect(runtimeHearthEnemyDefinition(missing,'ember_slime')).toBeNull();
    expect(runtimeHearthEncounterDefinition(missing,'cinder-ash-shore')).toBeNull();
    expect(activeHearthEncounterDefinitions(missing).some(row=>row.id==='cinder-ash-shore')).toBe(false);
    const retired=buildContentRegistry(bootstrapContentRows().map(row=>row.id==='enemy:ember_slime'
      ?{...row,json:{...JSON.parse(row.json as string),retired:true,replacement:'enemy:ember_slime_v2'}}:row)).registry;
    expect(runtimeHearthEnemyDefinition(retired,'enemy:ember_slime')).toBeNull();
    expect(runtimeHearthEncounterDefinition(retired,'cinder-ash-shore')).toBeNull();
  });
  it('fails closed for ambiguous durable enemy runtime kinds',()=>{
    const registry=buildContentRegistry(bootstrapContentRows()).registry;
    const source=registry.enemies.get('enemy:ember_slime')!;
    const enemies=new Map(registry.enemies);enemies.set('enemy:other_ember',{...source,id:'enemy:other_ember'});
    expect(runtimeHearthEnemyDefinition({...registry,enemies},source.runtimeKind)).toBeNull();
    expect(runtimeHearthEnemyDefinition({...registry,enemies},source.id)).toMatchObject({definitionId:source.id});
  });
  it('resolves rogue attack families without NPC-kind branches',()=>{
    const registry=buildContentRegistry(bootstrapContentRows()).registry;
    expect(runtimeRogueEnemyAttackPattern(registry,'cowling','melee')).toBe('charge');
    expect(runtimeRogueEnemyAttackPattern(registry,'flying_skull','flying')).toBe('dive');
    expect(runtimeRogueEnemyAttackPattern(registry,'slime_small','melee')).toBe('pulse');
    expect(runtimeRogueEnemyAttackPattern(registry,'slime_big','melee')).toBe('pulse');
    expect(runtimeRogueEnemyAttackPattern(registry,'skeleton','melee')).toBe('burst');
    expect(runtimeRogueEnemyAttackPattern(registry,'skeleton_bowman','ranged')).toBe('bolt');
  });
  it('follows renamed NPC kinds and enemy definition ids',()=>{
    const registry=buildContentRegistry(bootstrapContentRows()).registry;
    const source=registry.enemies.get('enemy:ember_slime')!;
    const renamed={...source,id:'enemy:moon_blob' as const,npcKind:'moon_blob_red',aliases:['moon_blob_small']};
    const enemies=new Map(registry.enemies);enemies.delete(source.id);enemies.set(renamed.id,renamed);
    expect(runtimeRogueEnemyAttackPattern({...registry,enemies},'moon_blob_small','melee')).toBe('pulse');
  });
  it('fails closed for retired or conflicting authored NPC attack families',()=>{
    const registry=buildContentRegistry(bootstrapContentRows()).registry;
    const skull=registry.enemies.get('enemy:cinder_skull')!;
    const retired=new Map(registry.enemies);retired.set(skull.id,{...skull,retired:true});
    expect(runtimeRogueEnemyAttackPattern({...registry,enemies:retired},'flying_skull','flying')).toBeNull();
    const conflict={...registry.enemies.get('enemy:ember_cowling')!,id:'enemy:conflicting_cowling' as const,
      runtimeKind:'conflicting_cowling',pattern:'burst' as const};
    const conflicting=new Map(registry.enemies);conflicting.set(conflict.id,conflict);
    expect(runtimeRogueEnemyAttackPattern({...registry,enemies:conflicting},'cowling','melee')).toBeNull();
    expect(runtimeRogueEnemyAttackPattern(registry,'unregistered','unknown')).toBeNull();
    expect(runtimeRogueEnemyAttackPattern(registry,'unregistered','melee')).toBeNull();
    expect(runtimeRogueEnemyAttackPattern(registry,'unregistered','ranged')).toBeNull();
  });
  it('rejects conflicting alias patterns while allowing agreeing NPC-kind families',()=>{
    const rows=bootstrapContentRows();
    expect(buildContentRegistry(rows).report.errors.filter(error=>error.path==='npcKind')).toEqual([]);
    const source=JSON.parse(rows.find(row=>row.id==='enemy:ember_slime')!.json as string) as Record<string,unknown>;
    const conflicting={...source,id:'enemy:conflicting_slime_alias',runtimeKind:'conflicting_slime_alias',
      npcKind:'conflicting_visual',aliases:['cowling'],pattern:'pulse'};
    const built=buildContentRegistry([...rows,{id:conflicting.id,kind:'enemy',json:conflicting}]);
    expect(built.report.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({code:'ambiguous_interaction',definitionId:conflicting.id,path:'aliases'}),
    ]));
  });
});

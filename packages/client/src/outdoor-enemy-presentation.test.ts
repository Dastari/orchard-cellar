import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {bootstrapContentRows,buildContentRegistry} from '@orchard/sim';
import {outdoorEnemyPresentation,outdoorWardenDisplayName} from './outdoor-enemy-presentation.js';

const overworldMain=readFileSync(new URL('./overworld-main.ts',import.meta.url),'utf8');

const renamedWardenRegistry=()=>buildContentRegistry(bootstrapContentRows().map(row=>{
  if(row.id!=='enemy:caldera_warden')return row;
  const json=JSON.parse(row.json as string) as Record<string,unknown>;
  return {...row,id:'enemy:moon_guardian',slug:'moon_guardian',json:{...json,
    id:'enemy:moon_guardian',runtimeKind:'moon_guardian',displayName:'Moon Guardian'}};
})).registry;

describe('outdoor enemy presentation authority',()=>{
  it('preserves warden treatment through arbitrary enemy id and runtime-kind renames',()=>{
    const presentation=outdoorEnemyPresentation(renamedWardenRegistry(),'moon_guardian');
    expect(presentation).toEqual({definitionId:'enemy:moon_guardian',displayName:'Moon Guardian',warden:true});
    expect(outdoorWardenDisplayName(presentation!,2)).toBe('Moon Guardian / II');
  });

  it('fails neutral for missing, retired, and ambiguous durable runtime kinds',()=>{
    const registry=renamedWardenRegistry();
    expect(outdoorEnemyPresentation(registry,'caldera_warden')).toBeNull();
    const source=registry.enemies.get('enemy:moon_guardian')!;
    const retired=new Map(registry.enemies);retired.set(source.id,{...source,retired:true});
    expect(outdoorEnemyPresentation({...registry,enemies:retired},'moon_guardian')).toBeNull();
    const ambiguous=new Map(registry.enemies);ambiguous.set('enemy:other_guardian',{...source,
      id:'enemy:other_guardian',displayName:'Other Guardian'});
    expect(outdoorEnemyPresentation({...registry,enemies:ambiguous},'moon_guardian')).toBeNull();
  });

  it('does not grant warden semantics to another active enemy engine',()=>{
    expect(outdoorEnemyPresentation(buildContentRegistry(bootstrapContentRows()).registry,'ember_slime'))
      .toMatchObject({warden:false});
  });

  it('keeps exact enemy kinds out of client gameplay decisions',()=>{
    expect(overworldMain).not.toContain('caldera_warden');
    expect(overworldMain).toContain('outdoorEnemyPresentation(snapshot.content.registry,profile.enemyKind)?.warden');
    expect(overworldMain).toContain('outdoorWardenDisplayName(outdoorPresentation,outdoorProfile.wardenPhase)');
  });
});

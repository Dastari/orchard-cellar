import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {bootstrapContentRegistry,runtimeLandmarkCampfirePlans} from '@orchard/sim';

const world=readFileSync(new URL('./index.ts',import.meta.url),'utf8');
const main=readFileSync(new URL('../../client/src/overworld-main.ts',import.meta.url),'utf8');
const painter=readFileSync(new URL('../../client/src/gameplay-painter-decorations.ts',import.meta.url),'utf8');

it('projects both durable landmark fires from active content without identity branches',()=>{
  expect(runtimeLandmarkCampfirePlans(bootstrapContentRegistry()).map(plan=>({
    id:plan.runtimeId,definition:plan.objectDefinitionId,automated:plan.automation!==undefined,
  }))).toEqual([
    {id:3000000004n,definition:'object:camp_cooking_fire',automated:true},
    {id:3200000003n,definition:'object:campfire',automated:false},
  ]);
  for(const source of [world,main,painter]){
    expect(source).not.toContain('MARLOW_CAMPFIRE_ID');
    expect(source).not.toContain("'camp_campfire'");
    expect(source).not.toContain("'object:campfire'");
  }
});

it('uses active landmark lifecycle authority for materialization, targeting, rendering and NPC automation',()=>{
  expect(world).toContain('runtimeLandmarkCampfirePlans(contentRegistry(ctx))');
  expect(world).toContain('ensureLandmarkCampfireStates(ctx');
  expect(world).toContain('ensureLandmarkPlaceables(ctx');
  expect(main).toContain('runtimeLandmarkCampfirePlans(snapshot.content.registry)');
  expect(painter).toContain('runtimeLandmarkCampfirePlans(snapshot.content.registry)');
});

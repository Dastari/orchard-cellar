import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const sim=readFileSync(new URL('../../sim/src/hearth-travel.ts',import.meta.url),'utf8');
const world=readFileSync(new URL('./index.ts',import.meta.url),'utf8');
const client=readFileSync(new URL('../../client/src/overworld-main.ts',import.meta.url),'utf8');
const menu=readFileSync(new URL('../../ui/src/ferry-menu.ts',import.meta.url),'utf8');
const ferryReducer=world.slice(world.indexOf('export const travelHearthFerry='),world.indexOf('export const usePortal ='));
const ferryTargeting=client.slice(client.indexOf('const ferry=runtimeHearthFerryNetwork'),
  client.indexOf('for(const profile of snapshot.outdoorEnemyProfiles'));

describe('authored ferry destination authority',()=>{
  it('keeps destination identity, labels, coordinates and policy out of runtime source',()=>{
    expect(sim).not.toContain('HEARTH_FERRY_DOCKS');
    expect(sim).not.toContain('HEARTH_ISLANDS');
    for(const source of [sim,ferryReducer,ferryTargeting,menu])for(const literal of [
      "'orchard'","'willowharbour'","'cinderwake'","'cinderwake-landing'",'Orchard Island',
    ])expect(source).not.toContain(literal);
  });

  it('threads the active registry through world, client and canvas UI',()=>{
    expect(world).toContain('runtimeHearthFerryNetwork(registry)');
    expect(client).toContain('runtimeHearthFerryNetwork(snapshot.content.registry)');
    expect(menu).toContain('runtimeHearthFerryNetwork(content)');
    expect(menu).toContain("tone:destination.dangerous?'danger':'success'");
  });
});

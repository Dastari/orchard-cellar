import {expect,it} from 'vitest';
import {buildHearthArchipelagoContribution,WILLOW_BRIDGES,willowRiverCenter} from './hearth-archipelago-authoring.js';
it('continues from the northern spring to sea with only declared bridge decks interrupting water',()=>{
 const {cells}=buildHearthArchipelagoContribution();
 for(let y=360;y<=465;y++){
  const center=willowRiverCenter(y),bridge=WILLOW_BRIDGES.some(([, ,n])=>y===n+1||y===n+2);
  expect((cells[`${center},${y}`]?.surface??'water')==='water',`river row ${y}`).toBe(!bridge);
 }
 for(const [left,right,north] of WILLOW_BRIDGES)for(let x=left;x<=right;x++)for(const y of [north+1,north+2])
  expect(cells[`${x},${y}`]?.biome).toBe('paving');
 expect(cells['133,464']?.biome).toBe('water');
});

it('feeds the lower river from a freshwater lake and spillway on the upper cliff plane',()=>{
 const {cells}=buildHearthArchipelagoContribution();
 expect(cells['138,351']).toMatchObject({surface:'water',biome:'freshwater',elevation:1});
 for(let y=351;y<=359;y++)expect(cells[`140,${y}`]).toMatchObject({surface:'water',elevation:1});
 expect(cells['140,360']).toMatchObject({surface:'water',biome:'freshwater'});
 expect(cells['140,360']?.elevation??0).toBe(0);
});

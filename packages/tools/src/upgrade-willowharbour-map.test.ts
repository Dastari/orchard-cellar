import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {createLiveIslandMapDocument} from '@orchard/sim';
import {composeHearthContentMap} from './hearth-map-composition.js';
import {prepareWillowharbourUpgrade} from './upgrade-willowharbour-map.js';
const assetFor=(name:string)=>{
  const category=name.startsWith('wildlife_')?'characters':name.startsWith('building_')?'buildings':name.startsWith('tree_')?'trees':name.startsWith('crop_')?'crops':'props';
  const asset=JSON.parse(readFileSync(new URL(`../../assets/${category}/${name}.sprite.json`,import.meta.url),'utf8')) as {size:[number,number];anchor:[number,number]};
  return {id:1,width:asset.size[0],height:asset.size[1],anchor:asset.anchor};
};
const baseline=composeHearthContentMap(createLiveIslandMapDocument(),assetFor,'fixture').document!;
it('upgrades only an unchanged reviewed village and preserves remote island edits',()=>{
  const input={...baseline,cells:{...baseline.cells,'400,400':{surface:'sand' as const}}};
  const prepared=prepareWillowharbourUpgrade(input,baseline);
  expect(prepared.cells['400,400']).toEqual({surface:'sand'});
  expect(prepared.cells['721,117']).toEqual(baseline.cells['721,117']);
  const rebuilt=composeHearthContentMap(prepared,assetFor,'fixture');
  expect(rebuilt.conflicts).toEqual([]);
  expect(rebuilt.document?.objects.toSorted((a,b)=>a.id.localeCompare(b.id))).toEqual(input.objects.toSorted((a,b)=>a.id.localeCompare(b.id)));
  expect(rebuilt.document?.cells).toEqual(input.cells);
  expect(rebuilt.document?.revision).toBe(input.revision+1);
});
it('refuses independent cell, object, prefab and transition edits',()=>{
  expect(()=>prepareWillowharbourUpgrade({...baseline,cells:{...baseline.cells,'204,400':{surface:'sand'}}},baseline)).toThrow('cell_conflict');
  const first=baseline.objects.find(row=>row.tileX<224)!;
  expect(()=>prepareWillowharbourUpgrade({...baseline,objects:baseline.objects.map(row=>row.id===first.id?{...row,tileX:row.tileX+1}:row)},baseline)).toThrow('object_conflict');
  expect(()=>prepareWillowharbourUpgrade({...baseline,prefabs:baseline.prefabs.map(row=>row.id===first.prefabId?{...row,title:'changed'}:row)},baseline)).toThrow('prefab_conflict');
  expect(()=>prepareWillowharbourUpgrade({...baseline,transitions:baseline.transitions.filter(row=>row.lowerTileX>224)},baseline)).toThrow('transition_conflict');
  expect(()=>prepareWillowharbourUpgrade(baseline,createLiveIslandMapDocument())).toThrow('baseline_empty');
});

import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import {createLiveIslandMapDocument,parseMapDocumentV3,serializeMapDocumentV3ForTransport,type MapDocumentV3} from '@orchard/sim';
import {buildHearthArchipelagoContribution} from './hearth-archipelago-authoring.js';
import {composeHearthContentMap} from './hearth-map-composition.js';
const assetFor=(name:string)=>{
  const category=name.startsWith('wildlife_')?'characters':name.startsWith('building_')?'buildings':name.startsWith('tree_')?'trees':name.startsWith('crop_')?'crops':'props';
  const source=JSON.parse(readFileSync(new URL(`../../assets/${category}/${name}.sprite.json`,import.meta.url),'utf8')) as {size:[number,number];anchor:[number,number]};
  return {id:1,width:source.size[0],height:source.size[1],anchor:source.anchor};
};
const compose=(input:MapDocumentV3)=>composeHearthContentMap(input,assetFor,'fixture-registry');
const sha256=(value:string)=>createHash('sha256').update(value).digest('hex');
it('preserves the reviewed map, prefab, and object composition hashes at the tools boundary',()=>{
  const document=compose(createLiveIslandMapDocument()).document!;
  // Reviewed workbench native dimensions/anchor change only its prefab; object positions remain stable.
  expect(sha256(serializeMapDocumentV3ForTransport(document))).toBe('470c7e0b23d0de2995ca0bae4bd5a571fcc0fbace690c7d192f10481a14904c7');
  expect(sha256(JSON.stringify(document.prefabs))).toBe('1e0c1fa93299024180b88c2f0e3f493b5eb5bea215fec1762b1d2e7cf1112f43');
  expect(sha256(JSON.stringify(document.objects))).toBe('74dd1cba00c950f5fb631c8c2a6b5ee04c2b43e8a943b1210ad1f57bcbd0022c');
});
it('composes once, preserves original authoring and is exactly idempotent',()=>{
  const base=createLiveIslandMapDocument();
  const input={...base,cells:{'400,400':{surface:'sand' as const}},anchors:[{id:'old-spawn',kind:'spawn' as const,tileX:400,tileY:400,elevation:0}]};
  const before=JSON.stringify(input),result=compose(input);
  expect(result.conflicts).toEqual([]);expect(result.document).not.toBeNull();
  const document=result.document!;
  expect(document.revision).toBe(input.revision+1);
  expect(document.cells['400,400']).toEqual(input.cells['400,400']);
  expect(document.anchors).toEqual(input.anchors);expect(document.landmarks).toEqual(input.landmarks);
  expect(document.provenance).toEqual(input.provenance);
  expect(compose(document)).toEqual({document,conflicts:[]});
  const saved=parseMapDocumentV3(serializeMapDocumentV3ForTransport(document));
  expect(compose(saved)).toEqual({document:saved,conflicts:[]});
  expect(JSON.stringify(input)).toBe(before);
});
it('rejects edited owned rows and duplicate IDs without mutating saved content',()=>{
  const document=compose(createLiveIslandMapDocument()).document!;
  const object=document.objects[0]!;
  for(const objects of [[{...object,tileX:object.tileX+1},...document.objects.slice(1)],[...document.objects,object]]) {
    const input={...document,objects},before=JSON.stringify(input),result=compose(input);
    expect(result.document).toBeNull();expect(result.conflicts.some(row=>row.startsWith('object:'))).toBe(true);
    expect(JSON.stringify(input)).toBe(before);
  }
});
it('rejects island terrain and foreign disabled objects whose art reaches across the boundary',()=>{
  const base=createLiveIslandMapDocument(),first=compose(base).document!;
  expect(compose({...base,cells:{'140,378':{surface:'sand'}}}).conflicts).toContain('cell:140,378');
  const prefab=first.prefabs.find(row=>row.id==='hearth-village-inn')!;
  const foreign={...first.objects[0]!,id:'foreign-house',prefabId:prefab.id,prefabRevision:prefab.revision,
    tileX:225,tileY:390,quarterTurns:1 as const,scale:2 as const,enabled:false};
  const result=compose({...base,prefabs:[prefab],objects:[foreign]});
  expect(result.document).toBeNull();expect(result.conflicts).toContain('object:area:foreign-house');
});

it('rejects extra island land and does not duplicate a transition with reordered keys',()=>{
  const base=createLiveIslandMapDocument();
  expect(compose({...base,cells:{'220,400':{surface:'stone',biome:'paving'}}}).conflicts).toContain('cell:unreviewed:220,400');
  const transition=buildHearthArchipelagoContribution().transitions[0]!;
  const reversed={upperTileY:transition.upperTileY,upperTileX:transition.upperTileX,lowerTileY:transition.lowerTileY,
    lowerTileX:transition.lowerTileX,direction:transition.direction,kind:transition.kind,contourLevel:transition.contourLevel};
  const result=compose({...base,transitions:[...base.transitions,reversed]});
  expect(result.conflicts).toEqual([]);
  expect(result.document!.transitions).toHaveLength(compose(base).document!.transitions.length);
});
it('preserves moved ordinary old-island landmarks but rejects native overhang into the new island',()=>{
  const base=createLiveIslandMapDocument(),house=base.landmarks.find(row=>row.kind==='farm_house')!;
  const moved={...house,tileX:400,tileY:400,quarterTurns:1 as const,flipX:true,scale:2 as const,enabled:false};
  const input={...base,landmarks:base.landmarks.map(row=>row.id===house.id?moved:row)};
  const result=compose(input);expect(result.conflicts).toEqual([]);expect(result.document!.landmarks).toEqual(input.landmarks);
  const overlapping={...moved,tileX:225,tileY:400,quarterTurns:3 as const};
  expect(compose({...input,landmarks:input.landmarks.map(row=>row.id===house.id?overlapping:row)}).conflicts).toContain(`landmark:area:${house.id}`);
});

it('rejects fractional artwork entering the last eastern or southern island tile',()=>{
  const base=createLiveIslandMapDocument(),original=base.landmarks[0]!;
  for(const [x,y,rotation] of [[224,400,3],[150,479,0]] as const) {
    const row={...original,kind:'poi_flowers_pink' as const,tileX:x,tileY:y,quarterTurns:rotation,flipX:false,scale:1 as const,enabled:false};
    const result=composeHearthContentMap({...base,landmarks:base.landmarks.map(old=>old.id===row.id?row:old)},
      assetFor,'fixture-registry');
    expect(result.conflicts).toContain(`landmark:area:${row.id}`);
  }
});

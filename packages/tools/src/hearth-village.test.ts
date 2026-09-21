import { readFileSync } from 'node:fs';
import {createHash} from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createLiveIslandMapDocument, mapObjectCollisionCells, parseMapDocumentV3,
  serializeMapDocumentV3ForTransport, parseMapPrefabDocument } from '@orchard/sim';
import {WILLOWHARBOUR_PLOTS,composeHearthArchipelago} from './hearth-archipelago-authoring.js';
import {buildHearthVillageFacades,buildHearthVillageScenery} from './hearth-village.js';

const assetFor = (name: string) => {
  const category = name.startsWith('wildlife_')?'characters':name.startsWith('crop_') ? 'crops' : name.startsWith('tree_') ? 'trees' : (name.startsWith('prop_') || name.startsWith('vehicle_') || name.startsWith('nature_') || name.startsWith('sign_')) ? 'props' : 'buildings';
  const source = JSON.parse(readFileSync(new URL(`../../assets/${category}/${name}.sprite.json`, import.meta.url),'utf8')) as {
    size: [number,number]; anchor: [number,number];
  };
  return { id: 1, width: source.size[0], height: source.size[1], anchor: source.anchor };
};
const facades = buildHearthVillageFacades(assetFor, 'test-registry');
const sha256=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');

describe('Willowharbour facades', () => {
  it('preserves reviewed facade and scenery output hashes across the tools boundary',()=>{
    const base=composeHearthArchipelago(createLiveIslandMapDocument()).document;
    const scenery=buildHearthVillageScenery(base.cells,assetFor,'test-registry');
    expect(sha256(facades.prefabs)).toBe('d4560bfebcdb9fef42448e87d89d8a47c428e133a518b305d97d1de9248e25d4');
    expect(sha256(facades.objects)).toBe('3b0a10762d476fb7fda1c70a2d24f0ebf685032435512d65b541c672a37e6fb0');
    expect(sha256(scenery.prefabs)).toBe('681763826026ebd2078f2891388ab52565f91da45f64e92257e8dd6d571d44d5');
    expect(sha256(scenery.objects)).toBe('3f8fdca2464c49a99db29b65a29f19d9d460d4c5f60e68ca484a3c0cf86742e9');
  });
  it('marks only public service thresholds with nonblocking ground runners',()=>{
    const base=composeHearthArchipelago(createLiveIslandMapDocument()).document;
    const scenery=buildHearthVillageScenery(base.cells,assetFor,'test-registry');
    const markers=scenery.objects.filter(o=>o.prefabId==='hearth-prop-cf-furniture-rustic-runner');
    expect(markers).toHaveLength(10);
    for(const plot of WILLOWHARBOUR_PLOTS) {
      expect(markers.some(o=>o.tileX===plot.door.tileX && o.tileY===plot.door.tileY),plot.id).toBe(plot.enterable);
    }
    for(const marker of markers) {
      expect(marker.layer).toBe('ground');
      const prefab=scenery.prefabs.find(p=>p.id===marker.prefabId)!;
      expect(prefab.cells).toEqual([]);
      expect(prefab.placements[0]!.layer).toBe('ground');
      for(let dy=0;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {
        expect(base.cells[`${marker.tileX+dx},${marker.tileY+dy}`]?.biome).toBe('paving');
      }
    }
  });
  it('keeps ten unique native facades valid and every reserved plot separate', () => {
    expect(facades.objects).toHaveLength(10);
    expect(new Set(facades.prefabs.map((prefab) => prefab.placements[0]!.assetName)).size).toBe(10);
    for (const prefab of facades.prefabs) {
      expect(parseMapPrefabDocument(JSON.stringify(prefab)).cells).toHaveLength(prefab.cells.length);
      expect(prefab.cells.length).toBeLessThan(prefab.width*prefab.height);
    }
    for (let i=0; i<WILLOWHARBOUR_PLOTS.length; i++) for (let j=i+1; j<WILLOWHARBOUR_PLOTS.length; j++) {
      const a=WILLOWHARBOUR_PLOTS[i]!, b=WILLOWHARBOUR_PLOTS[j]!;
      expect(a.maxX<b.minX || b.maxX<a.minX || a.maxY<b.minY || b.maxY<a.minY, `${a.id}/${b.id}`).toBe(true);
    }
  });
  it('preserves every exterior door and paved approach when foundations are installed', () => {
    const base = composeHearthArchipelago(createLiveIslandMapDocument()).document;
    const document = { ...base, prefabs: facades.prefabs, objects: facades.objects };
    const blocked = new Set(document.objects.flatMap((object) => mapObjectCollisionCells(document,object))
      .filter((cell) => cell.collisionMask!==0).map((cell) => `${cell.tileX},${cell.tileY}`));
    for (const plot of WILLOWHARBOUR_PLOTS) {
      const key = `${plot.door.tileX},${plot.door.tileY}`;
      expect(blocked.has(key),plot.id).toBe(false);
      expect(document.cells[key]?.biome,plot.id).toBe('paving');
    }
    for (const [key,cell] of Object.entries(document.cells)) {
      if (cell.biome==='paving') expect(blocked.has(key),key).toBe(false);
    }
    const serialized = serializeMapDocumentV3ForTransport(document);
    expect(serialized.length).toBeLessThan(4_000_000);
    expect(parseMapDocumentV3(serialized).objects).toHaveLength(10);
  });
  it('joins every service, cottage and farm door to the ferry on public paving', () => {
    const { cells }=composeHearthArchipelago(createLiveIslandMapDocument()).document;
    const queue: [number,number][]=[[209,400]], seen=new Set(['209,400']);
    for(let i=0;i<queue.length;i++) {
      const [x,y]=queue[i]!;
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
        const nx=x+dx,ny=y+dy,key=`${nx},${ny}`;
        if(seen.has(key) || cells[key]?.biome!=='paving') continue;
        seen.add(key);queue.push([nx,ny]);
      }
    }
    for(const plot of WILLOWHARBOUR_PLOTS) expect(seen.has(`${plot.door.tileX},${plot.door.tileY}`),plot.id).toBe(true);
    // Both pond banks must connect through the visible crossing and its eastern continuation.
    for(const x of [130,140,150,153]) expect(seen.has(`${x},379`),`pond bank ${x}`).toBe(true);
    for(let y=382;y<=394;y++) expect(seen.has(`153,${y}`),`inn garden continuation ${y}`).toBe(true);
  });
  it('keeps the decorated market and gardens connected to every service and ferry', () => {
    const base=composeHearthArchipelago(createLiveIslandMapDocument()).document;
    const scenery=buildHearthVillageScenery(base.cells,assetFor,'test-registry');
    const document={ ...base, prefabs: [...facades.prefabs,...scenery.prefabs], objects: [...facades.objects,...scenery.objects] };
    const blocked=new Set(document.objects.flatMap(o=>mapObjectCollisionCells(document,o))
      .filter(c=>c.collisionMask!==0).map(c=>`${c.tileX},${c.tileY}`));
    const queue: [number,number][]=[[209,400]], seen=new Set(['209,400']);
    for(let i=0;i<queue.length;i++) {
      const [x,y]=queue[i]!;
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
        const nx=x+dx,ny=y+dy,key=`${nx},${ny}`,cell=document.cells[key];
        if(nx<64 || nx>223 || ny<320 || ny>479 || seen.has(key) || blocked.has(key)
          || cell===undefined || cell.surface==='water') continue;
        seen.add(key);queue.push([nx,ny]);
      }
    }
    for(const plot of WILLOWHARBOUR_PLOTS) expect(seen.has(`${plot.door.tileX},${plot.door.tileY}`),plot.id).toBe(true);
    expect(new Set(document.objects.map(o=>o.id)).size).toBe(document.objects.length);
    for(const prefab of scenery.prefabs) expect(parseMapPrefabDocument(JSON.stringify(prefab)).id).toBe(prefab.id);
    expect(serializeMapDocumentV3ForTransport(document).length).toBeLessThan(4_000_000);
  });

});

it('grows reproducible mixed-age groves on level land without planting across roads or cliffs',()=>{
  const cells=composeHearthArchipelago(createLiveIslandMapDocument()).document.cells;
  const first=buildHearthVillageScenery(cells,assetFor,'fixture');
  expect(buildHearthVillageScenery(cells,assetFor,'fixture')).toEqual(first);
  const trees=first.objects.filter(row=>row.layer==='canopy');
  expect(trees.length).toBeGreaterThan(450);
  expect(trees.some(row=>row.prefabId.includes('young'))).toBe(true);
  expect(trees.some(row=>row.prefabId.includes('sapling'))).toBe(true);
  expect(trees.some(row=>row.elevation>0)).toBe(true);
  for(const row of trees) {
    const cell=cells[`${row.tileX},${row.tileY}`];
    expect(cell?.biome,row.id).toBe('meadow');
    expect(cell?.elevation??0,row.id).toBe(row.elevation);
  }
  // A grove has close canopy companions; the main square remains clear.
  expect(trees.filter(a=>trees.some(b=>a!==b&&(a.tileX-b.tileX)**2+(a.tileY-b.tileY)**2<=8)).length).toBeGreaterThan(100);
  expect(trees.some(row=>row.tileX>=163&&row.tileX<=183&&row.tileY>=394&&row.tileY<=406)).toBe(false);
});

it('keeps mature woodland independent of the decorative asset catalog order',()=>{
  const cells=composeHearthArchipelago(createLiveIslandMapDocument()).document.cells;
  const scenery=buildHearthVillageScenery(cells,assetFor,'fixture');
  const mature=scenery.objects.filter(row=>row.layer==='canopy'&&row.prefabId.includes('-mature'));
  expect(mature.length).toBeGreaterThan(300);
  expect(new Set(mature.map(row=>row.prefabId)).size).toBe(4);
  expect(scenery.objects.filter(row=>row.prefabId.includes('boundary-picket-')&&(Number(row.prefabId.split('-').at(-1))&5)!==0).length).toBeGreaterThan(8);
  for(const suffix of [6,12,3,9])expect(scenery.objects.some(row=>row.prefabId.endsWith(`boundary-hedge-${suffix}`))).toBe(true);
  expect(scenery.objects.filter(row=>row.prefabId.endsWith('streetlamp')).length).toBeGreaterThan(30);
});

it('closes the farm pen on dry land with only the authored two-cell east gate',()=>{
  const map=composeHearthArchipelago(createLiveIslandMapDocument()).document;
  const scenery=buildHearthVillageScenery(map.cells,assetFor,'test-registry');
  const fence=(x:number,y:number)=>scenery.objects.find(o=>o.tileX===x&&o.tileY===y&&o.prefabId.includes('boundary-wood-'));
  for(let x=121;x<=126;x++)for(const y of [442,451])expect(fence(x,y),`${x},${y}`).toBeDefined();
  for(let y=443;y<451;y++){
    expect(fence(121,y)).toBeDefined();
    expect(Boolean(fence(126,y))).toBe(![447,448].includes(y));
  }
  expect(fence(126,442)?.prefabId).toMatch(/-12$/);
  expect(scenery.objects.some(o=>o.prefabId.includes('chest'))).toBe(false);
});

it('keeps fences off shallow shelves and plants out of their gateways',()=>{
 const base=composeHearthArchipelago(createLiveIslandMapDocument()).document;
 const scenery=buildHearthVillageScenery(base.cells,assetFor,'test-registry');
 const fences=scenery.objects.filter(o=>o.prefabId.includes('boundary-'));
 const banks=scenery.objects.filter(o=>o.prefabId.includes('willow-bank-'));
 for(const bank of banks)expect(fences.some(o=>o.tileX===bank.tileX&&o.tileY===bank.tileY)).toBe(false);
 // Southern garden rail must terminate before the raised footprint at x170.
 expect(fences.some(o=>o.tileY===433&&o.tileX>=170&&o.tileX<=177)).toBe(false);
 for(const [gate,y] of [[123,383],[112,431],[164,426],[187,429],[191,406],[113,437],[158,433]]){
  for(const plant of scenery.objects.filter(o=>o.prefabId.includes('flower')))
   expect(Math.abs(plant.tileX-gate!)<=1&&Math.abs(plant.tileY-y!)<=1,`plant in gateway ${gate},${y}`).toBe(false);
 }
 for(const fence of fences)expect(scenery.objects.some(o=>o.prefabId.includes('flower')&&o.tileX===fence.tileX&&o.tileY===fence.tileY)).toBe(false);
});

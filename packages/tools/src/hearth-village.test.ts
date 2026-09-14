import { readFileSync } from 'node:fs';
import {createHash} from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createLiveIslandMapDocument, mapObjectCollisionCells, parseMapDocumentV3,
  serializeMapDocumentV3ForTransport, parseMapPrefabDocument } from '@orchard/sim';
import {WILLOWHARBOUR_PLOTS,composeHearthArchipelago} from './hearth-archipelago-authoring.js';
import {buildHearthVillageFacades,buildHearthVillageScenery} from './hearth-village.js';

const assetFor = (name: string) => {
  const category = name.startsWith('crop_') ? 'crops' : name.startsWith('tree_') ? 'trees' : (name.startsWith('prop_') || name.startsWith('vehicle_')) ? 'props' : 'buildings';
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
    expect(sha256(scenery.prefabs)).toBe('6ef1e2553dffb64ddf3f50bc93f1578af8e27b1887b8c0d2a04e26895a0e2ba8');
    expect(sha256(scenery.objects)).toBe('c54309aac07791626b8d4a9567f9f53c04a13af6e8d4aa208619c119b83f365d');
  });
  it('marks only public service thresholds with nonblocking ground runners',()=>{
    const base=composeHearthArchipelago(createLiveIslandMapDocument()).document;
    const scenery=buildHearthVillageScenery(base.cells,assetFor,'test-registry');
    const markers=scenery.objects.filter(o=>o.prefabId==='hearth-prop-cf-furniture-rustic-runner');
    expect(markers).toHaveLength(6);
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

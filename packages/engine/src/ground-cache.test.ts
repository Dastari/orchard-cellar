import { describe, expect, it, vi } from 'vitest';
import {
  authoredFarmlandGroundLayersAt,
  ChunkLruCache,
  GroundChunkCache,
  cellarGroundVisualLayersAt,
  groundCacheCapacityForViewport,
  groundTileInsideTerrain,
} from './ground-cache.js';
import {terrainForSpace,type TerrainArray} from './terrain.js';
import {spaceDefinitionFor} from '@orchard/sim';
import type {OverworldArt} from './overworld-art.js';

describe('chunked ground cache', () => {
  it('rebuilds remote residence chunks after saved edits and same-size expansion',()=>{
    const cache=new GroundChunkCache();
    const render=vi.spyOn(cache as unknown as {renderChunk:(...args:unknown[])=>HTMLCanvasElement},'renderChunk')
      .mockImplementation(()=>({}) as HTMLCanvasElement);
    const context={drawImage:vi.fn()} as unknown as CanvasRenderingContext2D;
    const art={} as OverworldArt;
    const terrain=(rank:number,revision:number,cells:unknown[]=[])=>terrainForSpace(spaceDefinitionFor(30000,{
      spaceId:60000,residenceSpaceId:30000,residenceExpansionRank:rank,
      residenceArchitectureJson:JSON.stringify({recipeVersion:1,revision:String(revision),cells}),
    })!,1,1);
    const draw=(value:TerrainArray)=>cache.drawTilePreview(context,art,value,20,20,0,0,1);
    const east=terrain(1,0);draw(east);draw(east);
    expect(render).toHaveBeenCalledTimes(1);
    const south=terrain(2,0);draw(south);
    expect(render).toHaveBeenCalledTimes(2);
    const edited=terrain(2,1,[{tileX:20,tileY:20,floor:'townhouse',partition:'wall'}]);
    draw(edited);draw(edited);
    expect(render).toHaveBeenCalledTimes(3);
    expect(render.mock.calls[2]?.slice(2)).toEqual([1,1]);
    expect(cache.residentCount).toBe(1);
    expect(edited.blocked[20*32+20]).toBe(true);
    expect(edited.residenceEnvelopeBlocked?.[20*32+20]).toBe(false);
  });

  it('leaves unused cells in a partial boundary chunk transparent', () => {
    const terrain = { width: 80, height: 56 };
    expect(groundTileInsideTerrain(terrain, 79, 55)).toBe(true);
    expect(groundTileInsideTerrain(terrain, 80, 55)).toBe(false);
    expect(groundTileInsideTerrain(terrain, 79, 56)).toBe(false);
  });

  it('invalidates only the resource chunk', () => {
    const cache = new ChunkLruCache<number>(64);
    const build = vi.fn(() => 1);
    cache.getOrCreate(0, 0, build);
    cache.getOrCreate(1, 0, build);
    cache.invalidateResource(17, 3);
    cache.getOrCreate(0, 0, build);
    cache.getOrCreate(1, 0, build);
    expect(build).toHaveBeenCalledTimes(3);
  });

  it('only composes cellar floor details from tile-sized cave sheets', () => {
    const width = 32;
    const height = 32;
    const terrain: TerrainArray = {
      spaceId: 30_001,
      seed: 42,
      version: 1,
      width,
      height,
      generator: 'cellar',
      biomes: new Uint8Array(width * height).fill(4),
      blocked: Array<boolean>(width * height).fill(false),
      horseJumpableTerrain: Array<boolean>(width * height).fill(false),
      elevations: new Int16Array(width * height),
      raisedTerrainCollisionClassified: true,
      dirtCliffRoles: new Uint8Array(width * height),
      dirtTerraces: new Uint8Array(width * height),
    };
    const assets = new Set<string>();
    for (let tileY = 2; tileY < height - 2; tileY += 1) {
      for (let tileX = 2; tileX < width - 2; tileX += 1) {
        for (const layer of cellarGroundVisualLayersAt(terrain, tileX, tileY)) {
          assets.add(layer.asset);
        }
      }
    }
    expect(assets).toContain('tile_cf_cave_floor_middle');
    expect(assets).toContain('tile_cf_cave_floor_decoration');
    expect(assets).not.toContain('tile_cf_cave_floor_stalagmite');
  });

  it('caches authored farmland as dry fill plus topology inset only', () => {
    const mask = new Uint8Array(9);
    mask[4] = 1;
    const terrain: TerrainArray = {
      spaceId: 1, seed: 1, version: 1, width: 3, height: 3,
      biomes: new Uint8Array(9).fill(4),
      blocked: Array<boolean>(9).fill(false),
      horseJumpableTerrain: Array<boolean>(9).fill(false),
      elevations: new Int16Array(9),
      raisedTerrainCollisionClassified: true,
      dirtCliffRoles: new Uint8Array(9),
      dirtTerraces: new Uint8Array(9),
      authoredFarmland: mask,
    };

    expect(authoredFarmlandGroundLayersAt(terrain, 1, 1)).toEqual([
      { asset: 'tile_cf_farmland', frame: 0 },
    ]);
    mask[1] = 1;
    expect(authoredFarmlandGroundLayersAt(terrain, 1, 1)).toEqual([
      expect.objectContaining({ asset: 'tile_cf_farmland' }),
      expect.objectContaining({ asset: 'tile_cf_farmland_grass_inset' }),
    ]);
    expect(authoredFarmlandGroundLayersAt(terrain, 0, 0)).toEqual([]);
    expect(authoredFarmlandGroundLayersAt(terrain, 1, 1))
      .not.toContainEqual(expect.objectContaining({ asset: 'tile_cf_farmland_wet' }));
  });

  it('evicts the least recently used chunk beyond capacity', () => {
    const cache = new ChunkLruCache<string>(2);
    cache.getOrCreate(0, 0, () => 'a');
    cache.getOrCreate(1, 0, () => 'b');
    cache.getOrCreate(0, 0, () => 'unused');
    cache.getOrCreate(2, 0, () => 'c');
    expect(cache.has(0, 0)).toBe(true);
    expect(cache.has(1, 0)).toBe(false);
    expect(cache.has(2, 0)).toBe(true);
  });

  it('34§6 keeps a 4K minimum-zoom frame resident without evict-then-rebake', () => {
    const viewportWidth = 4096;
    const viewportHeight = 2160;
    const minimumZoom = 1.5;
    const columns = Math.ceil(viewportWidth / minimumZoom / 256) + 1;
    const rows = Math.ceil(viewportHeight / minimumZoom / 256) + 1;
    const cache = new ChunkLruCache<number>(
      groundCacheCapacityForViewport(viewportWidth, viewportHeight, minimumZoom),
    );
    const build = vi.fn((value: number) => value);
    for (let y = 0; y < rows; y += 1) for (let x = 0; x < columns; x += 1) {
      cache.getOrCreate(x, y, () => build(y * columns + x));
    }
    const firstPassBuilds = build.mock.calls.length;
    for (let y = 0; y < rows; y += 1) for (let x = 0; x < columns; x += 1) {
      cache.getOrCreate(x, y, () => build(y * columns + x));
    }
    expect(cache.capacity).toBeGreaterThanOrEqual(columns * rows);
    expect(build).toHaveBeenCalledTimes(firstPassBuilds);
  });
});

it('selects the authored grass family and interior floor independently of the world projection',async()=>{
 const {groundAssetForTile}=await import('./ground-cache.js');
 const {terrainArrayForMapDocument}=await import('./editor-terrain.js');
 const {createEmptyMapDocument,applyMapEdit}=await import('@orchard/sim');
 const base=createEmptyMapDocument({id:'materials',title:'Materials',width:8,height:8});
 const document=applyMapEdit(base,{kind:'paint',points:[{tileX:2,tileY:2}],patch:{surface:'cave_floor',cliffFamily:'dungeon_1'}}).document;
 const terrain=terrainArrayForMapDocument(document);
 const dungeon={} as OverworldArt['rogueDungeonFloor'],grass={} as OverworldArt['grass'];
 const art={rogueDungeonFloor:dungeon,grass,terrainAssets:{tile_cf_grass_2_middle:grass}} as unknown as OverworldArt;
 expect(groundAssetForTile(art,terrain,2,2,'highland')).toBe(dungeon);
 const meadow={...terrain,defaultSurfaceFamily:'grass_2' as const};
 expect(groundAssetForTile(art,meadow,1,1,'meadow')).toBe(grass);
});

it('uses neighboring grass palette fringe art without crossing height planes',async()=>{
 const {authoredGrassFringeLayersAt}=await import('./ground-cache.js');
 const {terrainArrayForMapDocument}=await import('./editor-terrain.js');
 const {createEmptyMapDocument,applyMapEdit}=await import('@orchard/sim');
 let document=createEmptyMapDocument({id:'fringe',title:'Fringe',width:5,height:5});
 document=applyMapEdit(document,{kind:'paint',points:[{tileX:2,tileY:2}],patch:{surface:'sand'}}).document;
 document=applyMapEdit(document,{kind:'paint',points:[{tileX:2,tileY:1}],patch:{surface:'grass',surfaceFamily:'grass_2'}}).document;
 const terrain=terrainArrayForMapDocument(document);
 expect(authoredGrassFringeLayersAt(terrain,2,2)).toEqual(expect.arrayContaining([expect.objectContaining({assetId:'tile_cf_grass_2_sheet',frame:1})]));
 terrain.elevations[1*5+2]=1;
 expect(authoredGrassFringeLayersAt(terrain,2,2)).toBeNull();
});

it('selects complete native cardinal and diagonal grass fringes for all four palettes',async()=>{
 const {authoredGrassFringeLayersAt}=await import('./ground-cache.js');
 const {terrainArrayForMapDocument}=await import('./editor-terrain.js');
 const {createEmptyMapDocument,applyMapEdit}=await import('@orchard/sim');
 for(const family of ['grass_1','grass_2','grass_3','grass_4'] as const){
  for(const [dx,dy,frame] of [[0,-1,1],[0,1,33],[-1,0,16],[1,0,18],[-1,-1,65],[1,-1,64],[-1,1,49],[1,1,48]]){
   let document=createEmptyMapDocument({id:'fringe-directions',title:'Fringe',width:5,height:5});
   document=applyMapEdit(document,{kind:'paint',points:Array.from({length:25},(_,i)=>({tileX:i%5,tileY:Math.floor(i/5)})),patch:{surface:family==='grass_4'?'sand':'grass',surfaceFamily:'grass_4'}}).document;
   document=applyMapEdit(document,{kind:'paint',points:[{tileX:2+dx!,tileY:2+dy!}],patch:{surface:'grass',surfaceFamily:family}}).document;
   const terrain=terrainArrayForMapDocument(document);
   // Grass 1–3 fringe onto lower-priority grass 4; grass 4 fringes onto beach.
   expect(authoredGrassFringeLayersAt(terrain,2,2)).toEqual([{assetId:`tile_cf_${family}_sheet`,frame}]);
  }
 }
});

it('uses native corners and opaque fill for combined grass neighbors',async()=>{
 const {authoredGrassFringeLayersAt}=await import('./ground-cache.js');
 const {terrainArrayForMapDocument}=await import('./editor-terrain.js');
 const {createEmptyMapDocument,applyMapEdit}=await import('@orchard/sim');
 const frames=[null,1,18,2,33,-1,34,-1,16,0,-1,-1,32,-1,-1,-1];
 for(let mask=0;mask<16;mask++){
  let document=createEmptyMapDocument({id:'fringe-masks',title:'Fringe',width:5,height:5});
  document=applyMapEdit(document,{kind:'paint',points:Array.from({length:25},(_,i)=>({tileX:i%5,tileY:Math.floor(i/5)})),patch:{surface:'grass',surfaceFamily:'grass_4'}}).document;
  const points=[[0,-1],[1,0],[0,1],[-1,0]].flatMap(([dx,dy],index)=>mask&(1<<index)?[{tileX:2+dx!,tileY:2+dy!}]:[]);
  document=applyMapEdit(document,{kind:'paint',points,patch:{surface:'grass',surfaceFamily:'grass_2'}}).document;
  const frame=frames[mask];
  expect(authoredGrassFringeLayersAt(terrainArrayForMapDocument(document),2,2)).toEqual(frame===null?[]:[{assetId:frame===-1?'tile_cf_grass_2_middle':'tile_cf_grass_2_sheet',frame:frame===-1?0:frame}]);
 }
});

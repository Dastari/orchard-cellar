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

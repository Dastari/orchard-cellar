import {describe, expect, it} from 'vitest';
import {bootstrapContentRegistry, runtimeSpaceDefinition, residencePlayableTile, residenceReservedTiles} from '@orchard/sim';
import {terrainForSpace} from '../packages/engine/src/terrain.js';
import {spacePresentationKey} from '../packages/client/src/content/space-authority.js';
import {terrainCollisionForSpace,createAuthoritySpaceCollisionMap} from '../packages/world/src/world-rules.js';

describe('purchased residence envelope', () => {
  const registry = bootstrapContentRegistry();
  const row = {spaceId: 60_000, residenceSpaceId: 30_000, sizeTier: 0};
  it('preserves existing floor and keeps all additions connected inside the envelope', () => {
    let previous = new Set<string>();
    for (const rank of [0, 1, 2]) {
      const definition = runtimeSpaceDefinition(registry, 30_000, {...row, residenceExpansionRank: rank})!;
      expect(definition.sizeTiles).toBe(rank === 0 ? 16 : 32);
      const floor = new Set<string>();
      for (let y = 0; y < definition.sizeTiles; y++) for (let x = 0; x < definition.sizeTiles; x++) {
        if (residencePlayableTile(x, y, rank)) floor.add(`${x},${y}`);
      }
      expect(floor.size).toBe([100, 209, 318][rank]);
      for (const key of previous) expect(floor.has(key)).toBe(true);
      for (const key of ['8,11', '8,12', '11,7', '11,8']) expect(floor.has(key)).toBe(true);
      const reached = new Set(['8,11']);
      const queue = [[8, 11]];
      for (const [x, y] of queue) for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const key = `${x!+dx!},${y!+dy!}`;
        if (floor.has(key) && !reached.has(key)) {reached.add(key); queue.push([x!+dx!,y!+dy!]);}
      }
      expect(reached).toEqual(floor);
      previous = floor;
    }
  });
  it('invalidates both renderer and authority caches for the same-sized second expansion', () => {
    const results = [0,1,2,1].map(rank => {
      const instance = {...row, residenceExpansionRank: rank};
      const definition = runtimeSpaceDefinition(registry, 30_000, instance)!;
      const terrain = terrainForSpace(definition, 1, 1);
      const collision = createAuthoritySpaceCollisionMap(registry, 30_000, [], [], 'ground', [], instance);
      expect(terrain.width).toBe(collision.width);
      expect(terrain.blocked).toEqual(collision.blocked);
      return {terrain, key: spacePresentationKey(definition)};
    });
    expect(results[1]!.key).not.toBe(results[2]!.key);
    expect(results[1]!.terrain.blocked[20*32+20]).toBe(true);
    expect(results[2]!.terrain.blocked[20*32+20]).toBe(false);
    expect(results[3]!.terrain).toBe(results[1]!.terrain);
  });
  it('reserves connector mouths as well as the whole passage', () => {
    for (const rank of [0,1,2]) {
      const cells = residenceReservedTiles(rank);
      expect(cells.every(cell => residencePlayableTile(cell.tileX, cell.tileY, rank))).toBe(true);
      expect(cells.some(cell => cell.tileX === 12 && cell.tileY === 9)).toBe(rank >= 1);
      expect(cells.some(cell => cell.tileX === 21 && cell.tileY === 16)).toBe(rank === 2);
    }
  });
  it('does not open rooms from an invalid persisted rank', () => {
    for (const residenceExpansionRank of [-1,3,1.5,NaN]) {
      expect(runtimeSpaceDefinition(registry, 30_000, {...row, residenceExpansionRank})!.sizeTiles).toBe(16);
      expect(residencePlayableTile(20,20,residenceExpansionRank)).toBe(false);
    }
  });
});

it('bounds persisted construction revisions and keeps renderer/authority collision aligned',()=>{
  const registry=bootstrapContentRegistry();
  const make=(revision:number)=>({spaceId:60000,residenceSpaceId:30000,residenceExpansionRank:0,
    residenceArchitectureJson:JSON.stringify({recipeVersion:1,revision:String(revision),cells:[{tileX:6,tileY:8,partition:'wall'}]})});
  const render=(revision:number)=>terrainForSpace(runtimeSpaceDefinition(registry,30000,make(revision))!,1,1);
  const first=render(0);
  const firstAuthority=terrainCollisionForSpace(registry,30000,'ground',make(0));
  for(let i=1;i<=12;i++) {
    const terrain=render(i),collision=createAuthoritySpaceCollisionMap(registry,30000,[],[],'ground',[],make(i));
    expect(terrain.blocked).toEqual(collision.blocked);expect(terrain.blocked[8*16+6]).toBe(true);
  }
  expect(terrainCollisionForSpace(registry,30000,'ground',make(0))).not.toBe(firstAuthority);
  const recreated=render(0);
  expect(recreated).not.toBe(first);expect(recreated.biomes).not.toBe(first.biomes);
  expect(render(0)).toBe(recreated);
  const corrupt={...make(0),residenceArchitectureJson:'broken'};
  expect(terrainForSpace(runtimeSpaceDefinition(registry,30000,corrupt)!,1,1).blocked.every(Boolean)).toBe(true);
  expect(createAuthoritySpaceCollisionMap(registry,30000,[],[],'ground',[],corrupt).blocked.every(Boolean)).toBe(true);
});

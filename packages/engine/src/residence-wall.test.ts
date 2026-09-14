import {describe, expect, it} from 'vitest';
import {spaceDefinitionFor} from '@orchard/sim';
import {terrainForSpace} from './terrain.js';
import {residenceWallAt} from './residence-wall.js';
describe('native residence wall footprint', () => {
  it.each([0,1,2])('keeps all three courses outside playable floor at rank%s', rank => {
    const definition = spaceDefinitionFor(30000,{spaceId:60000,residenceSpaceId:30000,residenceExpansionRank:rank})!;
    const terrain = terrainForSpace(definition,1,1);
    let walls = 0;
    for (let y = 0; y < terrain.height; y++) for (let x = 0; x < terrain.width; x++) {
      if (!residenceWallAt(terrain,x,y)) continue;
      walls++;
      expect(terrain.blocked[(y+1)*terrain.width+x]).toBe(false);
      for (let offset=0; offset<3; offset++) expect(terrain.blocked[(y-offset)*terrain.width+x]).toBe(true);
    }
    expect(walls).toBe([10,23,30][rank]);
  });
  it('rejects thin partitions whose projected courses would cover another room', () => {
    const terrain = {width:4,height:6,blocked:Array<boolean>(24).fill(true)};
    terrain.blocked[4*4+1]=false;
    terrain.blocked[1*4+1]=false;
    expect(residenceWallAt(terrain,1,3)).toBe(false);
    terrain.blocked[1*4+1]=true;
    expect(residenceWallAt(terrain,1,3)).toBe(true);
  });
});

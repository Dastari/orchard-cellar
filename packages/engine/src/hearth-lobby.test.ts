import {describe,it,expect} from 'vitest';
import {hearthLobbyCollision,type SpaceDefinition} from '@orchard/sim';
import {terrainForSpace} from './terrain.js';

describe('Delve lobby presentation collision',()=>{
  it('uses the same finite excavation and wall-plane bytes as authority',()=>{
    const definition:SpaceDefinition={spaceId:65532,name:'Lobby fixture',sizeTiles:24,generator:'delve_lobby',
      environment:'underground',ambient:{r:160,g:150,b:145},weather:false,audioBed:'cave'};
    const terrain=terrainForSpace(definition,1,1),collision=hearthLobbyCollision();
    expect(terrain.width).toBe(24);expect(terrain.height).toBe(24);
    expect(terrain.blocked).toEqual(collision.blocked);
    expect(terrain.elevations).toEqual(collision.elevations);
    expect(terrain.terrainPlaneBlocked).toEqual(collision.terrainPlaneBlocked);
    expect(terrain.rogueHazards).toBeUndefined();
    expect(terrain.projectionStyle).toBe('interior');
  });
});

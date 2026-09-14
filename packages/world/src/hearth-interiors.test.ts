import {describe,it,expect} from 'vitest';
import {HEARTH_INTERIORS,bootstrapContentRegistry,hearthInteriorCollision} from '@orchard/sim';
import {createAuthoritySpaceCollisionMap} from './world-rules.js';

describe('authored village interior authority',()=>{
  it.each(HEARTH_INTERIORS)('$kind preserves furniture and floor collision through the active content registry',interior=>{
    const registry=bootstrapContentRegistry();
    const collision=createAuthoritySpaceCollisionMap(registry,interior.spaceId,[]);
    const shared=hearthInteriorCollision(interior.spaceId);
    expect(collision.blocked).toEqual(shared.blocked);
    expect(collision.obstacles).toEqual(shared.obstacles);
    expect(collision.elevations).toEqual(shared.elevations);
    expect(createAuthoritySpaceCollisionMap(registry,interior.spaceId,[],[],'air').blocked.every(Boolean)).toBe(true);
    expect(createAuthoritySpaceCollisionMap(registry,interior.spaceId,[],[],'water').blocked.every(Boolean)).toBe(true);
  });
});

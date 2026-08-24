import { describe, expect, it } from 'vitest';
import { createClientCollisionMap } from './collision.js';
import { terrainForWorld } from './terrain.js';

describe('client collision cache', () => {
  it('reuses terrain blocking and rebuilds only live subscribed obstacles', () => {
    const terrain = terrainForWorld(0x4f434852, 3);
    const resources = [
      { tileX: 10, tileY: 10, depleted: false },
      { tileX: 11, tileY: 10, depleted: true },
    ] as never;
    const collision = createClientCollisionMap(terrain, resources);
    expect(collision.blocked).toBe(terrain.blocked);
    expect(collision.obstacles).toHaveLength(1);
  });
});

import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry, runtimeTraversalPolicy, SURVIVAL_WORLD_SEED, survivalBiomeAt } from '@orchard/sim';
import { createAuthoritySpaceCollisionMap, terrainCollisionForSpace } from './world-rules.js';

/** Static world S6 review: the server's homestead traversal reads the published island (the live
 * island runtime's static view), the same biomes the client samples from the topside chunks. */
describe('homestead exterior traversal from the published island', () => {
  const registry = bootstrapContentRegistry();
  const home = { spaceId: 10_000, overworldTileX: 349, overworldTileY: 402, sizeTier: 0 };

  it('equals the generator on an unedited island, and follows an edited one', () => {
    expect(runtimeTraversalPolicy(registry)).not.toBeNull();
    const generator = terrainCollisionForSpace(registry, home.spaceId, 'ground', home);
    expect(generator.traversalChannels).toBeDefined();
    const unedited = terrainCollisionForSpace(registry, home.spaceId, 'ground', home,
      { key: 'published-unedited', biomeAt: (x, y) => survivalBiomeAt(SURVIVAL_WORLD_SEED, x, y) });
    expect(unedited.traversalChannels).toEqual(generator.traversalChannels);
    // A published island that turned the site's surroundings into lake: its water is water here too.
    const flooded = terrainCollisionForSpace(registry, home.spaceId, 'ground', home, { key: 'published-flooded', biomeAt: () => 'freshwater' });
    expect(flooded.traversalChannels).not.toEqual(generator.traversalChannels);
    // Cached per publication: the generator result is untouched by the other sources.
    expect(terrainCollisionForSpace(registry, home.spaceId, 'ground', home).traversalChannels).toBe(generator.traversalChannels);
  });

  it('reaches the authority collision map (ground and water)', () => {
    const source = { key: 'published-flooded-2', biomeAt: () => 'freshwater' as const };
    for (const medium of ['ground', 'water'] as const) {
      const generator = createAuthoritySpaceCollisionMap(registry, home.spaceId, [], [], medium, [], home);
      const published = createAuthoritySpaceCollisionMap(registry, home.spaceId, [], [], medium, [], home, [], source);
      expect(published.traversalChannels, medium).not.toEqual(generator.traversalChannels);
    }
  });
});

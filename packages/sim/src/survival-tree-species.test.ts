import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry } from './content/bootstrap-registry.js';
import { homesteadBiomeAt } from './homestead-biome.js';
import { homesteadBiomeWith } from './homestead-biome-rules.js';
import { SURVIVAL_WORLD_SEED, SURVIVAL_WORLD_SIZE, survivalBiomeAt, survivalStreamAt, survivalTreeKindAt } from './survival-world.js';
import { survivalTreeKindWith } from './survival-tree-species.js';

/** Static world S6: homestead exteriors choose biomes and tree species without the generator, from an
 * island biome sampler (the client's is the published topside chunks, which equal the generator on an
 * unedited island: the chunk parity suites pin that). These pin the rules to the generator itself. */
describe('generator-free homestead exterior rules (static world S6)', () => {
  const registry = bootstrapContentRegistry();
  const seed = SURVIVAL_WORLD_SEED;
  const biome = (x: number, y: number) => survivalBiomeAt(seed, x, y);
  const streamNear = (x: number, y: number) => {
    for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) if (survivalStreamAt(seed, x + dx, y + dy)) return true;
    return false;
  };

  it('choose exactly the generator tree species, given its biome and stream adjacency', () => {
    let checked = 0;
    for (let y = 0; y < SURVIVAL_WORLD_SIZE; y += 7) for (let x = 0; x < SURVIVAL_WORLD_SIZE; x += 7) {
      expect(survivalTreeKindWith(biome(x, y), streamNear(x, y), seed, x, y, registry), `${x},${y}`).toBe(survivalTreeKindAt(seed, x, y, registry));
      checked += 1;
    }
    expect(checked).toBeGreaterThan(10_000);
  }, 120_000);

  it('choose exactly the generator homestead biome for any site', () => {
    for (const site of [{ worldTileX: 120, worldTileY: 90 }, { worldTileX: 400, worldTileY: 410 }, { worldTileX: 300, worldTileY: 520 }]) {
      for (let y = 0; y < 32; y += 1) for (let x = 0; x < 32; x += 1) {
        expect(homesteadBiomeWith(biome, site, x, y), `${site.worldTileX},${site.worldTileY} ${x},${y}`).toBe(homesteadBiomeAt(seed, site, x, y));
      }
    }
  });
});

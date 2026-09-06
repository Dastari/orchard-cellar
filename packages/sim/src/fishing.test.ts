import { describe, expect, it } from 'vitest';
import { resolveFishingLoot } from './behaviour/handlers/loot.js';
import { bootstrapContentRows } from './content/bootstrap-registry.js';
import { buildContentRegistry } from './content/registry.js';

const loots = buildContentRegistry(bootstrapContentRows()).registry.loots;

describe('fishing catch resolution', () => {
  it('is deterministic for the same authority seed', () => {
    const seed = [1234, 'identity', 90, 3, 'fishing.catch'] as const;
    expect(resolveFishingLoot(loots, seed, 10, 3)).toEqual(resolveFishingLoot(loots, seed, 10, 3));
  });

  it('always yields fish and protects the final catch from common quality', () => {
    for (let worldSeed = 0; worldSeed < 200; worldSeed += 1) {
      const result = resolveFishingLoot(loots, [worldSeed, 'player', 7, 1, 'fishing.catch'], 1, 1);
      expect(result.quality).not.toBe('common');
      expect(result.drops[0]).toEqual({ itemKind: 'raw_fish', quantity: 2 });
    }
  });

  it('only adds weighted treasure to rare catches', () => {
    for (let worldSeed = 0; worldSeed < 500; worldSeed += 1) {
      const result = resolveFishingLoot(loots, [worldSeed, 'player', 7, 3, 'fishing.catch'], 10, 3);
      expect(result.drops).toHaveLength(result.quality === 'rare' ? 2 : 1);
    }
  });
});

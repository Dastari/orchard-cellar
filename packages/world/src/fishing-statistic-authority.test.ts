import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const world = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');

describe('fishing depletion statistic authority', () => {
  it('attributes depletion to the active runtime resource kind', () => {
    const start = world.indexOf('function applyFishingReelLifecycle(');
    const end = world.indexOf('\nfunction authorityBowChargeMs(', start);
    const reel = world.slice(start, end);
    expect(reel).toContain("'resources_depleted', 1n, clock.authorityTick, pool.kind");
    expect(reel).not.toContain("'resources_depleted', 1n, clock.authorityTick, 'fish_pool'");
  });
});

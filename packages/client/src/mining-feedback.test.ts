import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry, TILE_SIZE_FIXED } from '@orchard/sim';
import { glancingSwingNodes, miningToolNeeded, miningWorkAdvanced, toolCanMine } from './mining-feedback.js';

const registry = bootstrapContentRegistry();
const vein = (kind: string, tileX = 5, tileY = 4) => ({ id: BigInt(tileX * 100 + tileY), kind, tileX, tileY, depleted: false, health: 6, yieldProgress: 0 });
// Standing on the tile south of the vein, facing it.
const below = { x: 5.5 * TILE_SIZE_FIXED, y: 5.5 * TILE_SIZE_FIXED };

describe('mining feedback', () => {
  it('agrees with the server gates: a wooden pickaxe works copper but not gold', () => {
    expect(toolCanMine(registry, 'pickaxe', vein('ore_copper'))).toBe(true);
    expect(toolCanMine(registry, 'pickaxe', vein('ore_gold'))).toBe(false);
    expect(toolCanMine(registry, 'copper_pickaxe', vein('ore_gold'))).toBe(true);
  });

  it('finds the vein a swing glances off, and only inside the swing sector', () => {
    const gold = vein('ore_gold'), copper = vein('ore_copper', 6, 4), far = vein('ore_gold', 20, 20);
    expect(glancingSwingNodes(registry, 'pickaxe', below, 'up', [gold, copper, far])).toEqual([gold]);
    expect(glancingSwingNodes(registry, 'copper_pickaxe', below, 'up', [gold])).toEqual([]);
    expect(glancingSwingNodes(registry, 'pickaxe', below, 'up', [{ ...gold, depleted: true }])).toEqual([]);
    // A swing that also lands a real mining hit doesn't glance.
    const copperBeside = vein('ore_copper', 5, 4);
    expect(glancingSwingNodes(registry, 'pickaxe', below, 'up', [gold, { ...copperBeside, id: 1n }])).toEqual([]);
  });

  it('matches the server elevation check: a vein up a cliff never sparks', () => {
    const gold = vein('ore_gold'), width = 12, height = 12;
    const flat = { width, height, blocked: new Array(width * height).fill(false), elevations: new Array(width * height).fill(0) };
    const cliff = { ...flat, elevations: flat.elevations.map((_, index) => Math.floor(index / width) <= 4 ? 1 : 0) };
    expect(glancingSwingNodes(registry, 'pickaxe', below, 'up', [gold], flat as never)).toEqual([gold]);
    expect(glancingSwingNodes(registry, 'pickaxe', below, 'up', [gold], cliff as never)).toEqual([]);
  });

  it('counts the strikes between payouts', () => {
    const before = vein('ore_copper');
    expect(miningWorkAdvanced(0, { ...before, yieldProgress: 3 })).toBe(true);
    expect(miningWorkAdvanced(3, before)).toBe(false);
    expect(miningWorkAdvanced(3, { ...before, yieldProgress: 3 })).toBe(false);
    expect(miningWorkAdvanced(0, { ...before, yieldProgress: 3, depleted: true })).toBe(false);
  });

  it('names the pickaxe a vein needs only when that helps', () => {
    expect(miningToolNeeded(registry, vein('ore_gold'), 'pickaxe')).toBe('NEEDS COPPER PICKAXE');
    expect(miningToolNeeded(registry, vein('ore_gold'), null)).toBe('NEEDS COPPER PICKAXE');
    expect(miningToolNeeded(registry, vein('ore_gold'), 'copper_pickaxe')).toBeNull();
    // Starter-tier nodes say nothing unless a pickaxe that can't work them is in hand.
    expect(miningToolNeeded(registry, vein('ore_copper'), null)).toBeNull();
    expect(miningToolNeeded(registry, vein('ore_copper'), 'pickaxe')).toBeNull();
  });
});

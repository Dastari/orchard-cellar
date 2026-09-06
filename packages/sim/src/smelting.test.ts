import { describe, expect, it } from 'vitest';
import {
  FURNACE_SMELT_TICKS,
  furnaceFuelSmelts,
  furnaceProgress,
  furnaceRemainingTicks,
  smeltingOutputFor,
} from './smelting.js';

describe('slow furnace smelting loop', () => {
  it('smelts only the three authored metals and excludes gems', () => {
    expect(smeltingOutputFor('iron_ore')).toBe('iron_bar');
    expect(smeltingOutputFor('copper_ore')).toBe('copper_bar');
    expect(smeltingOutputFor('gold_ore')).toBe('gold_bar');
    expect(smeltingOutputFor('ruby_ore')).toBeNull();
  });

  it('uses wood or planks as one-bar fuel, never sticks', () => {
    expect(furnaceFuelSmelts('wood')).toBe(1);
    expect(furnaceFuelSmelts('plank')).toBe(1);
    expect(furnaceFuelSmelts('stick')).toBe(0);
  });

  it('derives partial progress and remaining time from the durable boundary', () => {
    expect(furnaceProgress(
      100n + FURNACE_SMELT_TICKS * 2n,
      100n + FURNACE_SMELT_TICKS * 2n + FURNACE_SMELT_TICKS / 2n,
    )).toBeCloseTo(0.5);
    expect(furnaceRemainingTicks(100n, 100n + FURNACE_SMELT_TICKS / 2n))
      .toBe(FURNACE_SMELT_TICKS / 2n);
    expect(furnaceRemainingTicks(undefined, 100n)).toBeNull();
  });

});

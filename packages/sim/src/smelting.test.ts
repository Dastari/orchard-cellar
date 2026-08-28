import { describe, expect, it } from 'vitest';
import {
  FURNACE_SMELT_TICKS,
  furnaceFuelSmelts,
  furnaceMutationIsValid,
  furnaceProgress,
  settleFurnace,
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

  it('starts lazily, catches up completed bars, and preserves partial progress', () => {
    const started = settleFurnace({
      slots: [{ itemKind: 'iron_ore', quantity: 3 }, { itemKind: 'wood', quantity: 3 }, null],
      smeltStartTick: undefined,
    }, 100n);
    expect(started.smeltStartTick).toBe(100n);
    const settled = settleFurnace(started, 100n + FURNACE_SMELT_TICKS * 2n + FURNACE_SMELT_TICKS / 2n);
    expect(settled.completed).toBe(2);
    expect(settled.slots).toEqual([
      { itemKind: 'iron_ore', quantity: 1 },
      { itemKind: 'wood', quantity: 1 },
      { itemKind: 'iron_bar', quantity: 2 },
    ]);
    expect(furnaceProgress(settled.smeltStartTick, 100n + FURNACE_SMELT_TICKS * 2n + FURNACE_SMELT_TICKS / 2n)).toBeCloseTo(0.5);
  });

  it('pauses when output is full and protects output from manual insertion', () => {
    const full = settleFurnace({
      slots: [{ itemKind: 'gold_ore', quantity: 1 }, { itemKind: 'plank', quantity: 1 }, { itemKind: 'gold_bar', quantity: 99 }],
      smeltStartTick: 0n,
    }, FURNACE_SMELT_TICKS * 2n);
    expect(full.completed).toBe(0);
    expect(full.smeltStartTick).toBeUndefined();
    expect(furnaceMutationIsValid(
      [null, null, null],
      [null, null, { itemKind: 'iron_bar', quantity: 1 }],
    )).toBe(false);
    expect(furnaceMutationIsValid(
      [null, null, { itemKind: 'iron_bar', quantity: 2 }],
      [null, null, { itemKind: 'iron_bar', quantity: 1 }],
    )).toBe(true);
  });
});

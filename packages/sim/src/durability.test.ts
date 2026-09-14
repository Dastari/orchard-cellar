import { describe, expect, it } from 'vitest';
import { BOOTSTRAP_ITEM_CONTAINER_CONTENT, moveItemStacks, quickMoveItemStack } from './item-containers.js';
import {
  durabilityFraction,
  normalizeToolDurability,
  repairTool,
  wearTool,
} from './durability.js';

describe('tool durability', () => {
  const axe = { maximum: 200, repairItemKind: 'wood' };
  const pickaxe = { maximum: 250, repairItemKind: 'stone' };

  it('initializes new tools full while preserving explicit broken state', () => {
    expect(normalizeToolDurability(axe)).toBe(200);
    expect(normalizeToolDurability(axe, 0)).toBe(0);
  });

  it('wears and repairs arbitrary authored tool definitions without kind lookup', () => {
    expect(wearTool(pickaxe, 2)).toEqual({ durability: 1, broken: false });
    expect(wearTool(pickaxe, 1)).toEqual({ durability: 0, broken: true });
    expect(wearTool(pickaxe, 0)).toEqual({ durability: 0, broken: true });
    expect(repairTool(pickaxe)).toBe(250);
    expect(durabilityFraction(pickaxe, 125)).toBe(0.5);
    expect(repairTool({ maximum: 731, repairItemKind: 'renamed_material' })).toBe(731);
  });

  it('preserves durability through ordinary moves, swaps, and quick moves', () => {
    const base = {
      hotbar: { id: 'hotbar', capacity: 2, slots: [{ itemKind: 'axe', quantity: 1, durability: 73 }, null] },
      backpack: { id: 'backpack', capacity: 1, slots: [null] },
    } as const;
    const moved = moveItemStacks(base, {
      fromContainer: 'hotbar', fromIndex: 0, toContainer: 'hotbar', toIndex: 1, quantity: 1,
    }, BOOTSTRAP_ITEM_CONTAINER_CONTENT);
    expect(moved.ok && moved.containers.hotbar?.slots[1]?.durability).toBe(73);
    const quick = quickMoveItemStack(base, {
      fromContainer: 'hotbar', fromIndex: 0, toContainers: ['backpack'],
    }, BOOTSTRAP_ITEM_CONTAINER_CONTENT);
    expect(quick.ok && quick.containers.backpack?.slots[0]?.durability).toBe(73);
  });
});

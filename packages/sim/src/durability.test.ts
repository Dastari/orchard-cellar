import { describe, expect, it } from 'vitest';
import { TOOL_DURABILITY_BALANCE } from './balance.js';
import { moveItemStacks, quickMoveItemStack } from './item-containers.js';
import {
  durabilityFraction,
  normalizeToolDurability,
  repairTool,
  toolDurabilityDefinition,
  wearTool,
} from './durability.js';

describe('tool durability', () => {
  it('quotes the durability and renewable repair balance table', () => {
    expect(TOOL_DURABILITY_BALANCE).toEqual({
      axe: { maximum: 200, repairItemKind: 'wood' },
      pickaxe: { maximum: 250, repairItemKind: 'stone' },
      hoe: { maximum: 180, repairItemKind: 'wood' },
      watering_can: { maximum: 160, repairItemKind: 'stone' },
      bow: { maximum: 300, repairItemKind: 'wood' },
      shovel: { maximum: 220, repairItemKind: 'stone' },
      hammer: { maximum: 300, repairItemKind: 'stone' },
      fishing_rod: { maximum: 160, repairItemKind: 'wood' },
      sword: { maximum: 250, repairItemKind: 'stone' },
    });
  });

  it('initializes new tools full while preserving explicit broken state', () => {
    expect(normalizeToolDurability('axe')).toBe(200);
    expect(normalizeToolDurability('axe', 0)).toBe(0);
    expect(normalizeToolDurability('wood', 99)).toBe(0);
  });

  it('wears without deleting, clamps, and repairs to full', () => {
    expect(wearTool('pickaxe', 2)).toEqual({ durability: 1, broken: false });
    expect(wearTool('pickaxe', 1)).toEqual({ durability: 0, broken: true });
    expect(wearTool('pickaxe', 0)).toEqual({ durability: 0, broken: true });
    expect(repairTool('pickaxe')).toBe(250);
    expect(durabilityFraction('pickaxe', 125)).toBe(0.5);
    expect(toolDurabilityDefinition('apple')).toBeNull();
  });

  it('preserves durability through ordinary moves, swaps, and quick moves', () => {
    const base = {
      hotbar: { id: 'hotbar', capacity: 2, slots: [{ itemKind: 'axe', quantity: 1, durability: 73 }, null] },
      backpack: { id: 'backpack', capacity: 1, slots: [null] },
    } as const;
    const moved = moveItemStacks(base, {
      fromContainer: 'hotbar', fromIndex: 0, toContainer: 'hotbar', toIndex: 1, quantity: 1,
    });
    expect(moved.ok && moved.containers.hotbar?.slots[1]?.durability).toBe(73);
    const quick = quickMoveItemStack(base, {
      fromContainer: 'hotbar', fromIndex: 0, toContainers: ['backpack'],
    });
    expect(quick.ok && quick.containers.backpack?.slots[0]?.durability).toBe(73);
  });
});

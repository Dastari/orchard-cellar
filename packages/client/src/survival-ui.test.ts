import { TILE_SIZE_FIXED } from '@orchard/sim';
import { describe, expect, it } from 'vitest';
import { cycleHotbarSlot, facedResource, harvestPrompt, hotbarItemLabel, hotbarSlotForCode } from './survival-ui.js';

const tree = { id: 2n, kind: 'tree', tileX: 12, tileY: 10, depleted: false };

describe('survival controls', () => {
  it('targets only a live resource in reach and in front of the player', () => {
    const x = 10 * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
    const y = 10 * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
    expect(facedResource(x, y, 'right', [tree])).toEqual(tree);
    expect(facedResource(x, y, 'left', [tree])).toBeNull();
    expect(facedResource(x, y, 'right', [{ ...tree, tileX: 13 }])).toBeNull();
    expect(facedResource(x, y, 'right', [{ ...tree, depleted: true }])).toBeNull();
  });

  it('maps both number rows to nine persisted hotbar slots', () => {
    expect(hotbarSlotForCode('Digit1')).toBe(0);
    expect(hotbarSlotForCode('Numpad9')).toBe(8);
    expect(hotbarSlotForCode('Digit0')).toBeNull();
  });

  it('gives occupied hotbar tools compact unambiguous labels', () => {
    expect(['axe', 'pickaxe', 'hoe', 'watering_can', 'empty'].map(hotbarItemLabel))
      .toEqual(['AXE', 'PICK', 'HOE', 'WATER', '--']);
  });

  it('wraps mouse-wheel selection around the nine-slot inventory', () => {
    expect(cycleHotbarSlot(0, -1)).toBe(8);
    expect(cycleHotbarSlot(8, 1)).toBe(0);
    expect(cycleHotbarSlot(3, 1)).toBe(4);
  });

  it('describes the selected tool requirement', () => {
    expect(harvestPrompt(tree, 'axe')).toBe('[E] CHOP TREE');
    expect(harvestPrompt(tree, 'hoe')).toBe('SELECT AXE TO CHOP');
  });
});

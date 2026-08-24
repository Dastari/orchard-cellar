import { FIXED_UNITS_PER_PIXEL, TILE_SIZE_FIXED } from '@orchard/sim';
import { describe, expect, it } from 'vitest';
import { facedResource, facedWorldItem, harvestPrompt, hotbarItemLabel, hotbarSlotForCode } from './survival-ui.js';

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
    expect(['axe', 'pickaxe', 'hoe', 'watering_can', 'wood', 'empty'].map(hotbarItemLabel))
      .toEqual(['AXE', 'PICK', 'HOE', 'WATER', 'WOOD', '--']);
  });

  it('selects the nearest faced ground item inside pickup reach', () => {
    const x = 10 * TILE_SIZE_FIXED;
    const y = 10 * TILE_SIZE_FIXED;
    const near = { id: 1n, x: x + TILE_SIZE_FIXED, y };
    const far = { id: 2n, x: x + 25 * FIXED_UNITS_PER_PIXEL, y };
    expect(facedWorldItem(x, y, 'right', [far, near])).toEqual(near);
    expect(facedWorldItem(x, y, 'left', [near])).toBeNull();
  });

  it('describes the selected tool requirement', () => {
    expect(harvestPrompt(tree, 'axe')).toBe('[F] CHOP TREE');
    expect(harvestPrompt(tree, 'hoe')).toBe('SELECT AXE TO CHOP');
  });
});

import { FIXED_UNITS_PER_PIXEL, TILE_SIZE_FIXED } from '@orchard/sim';
import { describe, expect, it } from 'vitest';
import {
  facedResource,
  facedWorldItem,
  hotbarItemLabel,
  hotbarItemName,
  hotbarLayout,
  hotbarSlotAtPoint,
  hotbarSlotForCode,
} from './survival-ui.js';

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

  it('gives occupied slots full hover names', () => {
    expect(['axe', 'pickaxe', 'hoe', 'watering_can', 'wood', 'empty'].map(hotbarItemName))
      .toEqual(['AXE', 'PICKAXE', 'HOE', 'WATERING CAN', 'WOOD', null]);
  });

  it('centers nine pointer-selectable slots and excludes their one-pixel gaps', () => {
    expect(hotbarLayout(480, 270)).toEqual({ startX: 83, y: 231, width: 315, height: 34 });
    expect(hotbarSlotAtPoint(83, 231, 480, 270)).toBe(0);
    expect(hotbarSlotAtPoint(116, 264, 480, 270)).toBe(0);
    expect(hotbarSlotAtPoint(117, 240, 480, 270)).toBeNull();
    expect(hotbarSlotAtPoint(118, 240, 480, 270)).toBe(1);
    expect(hotbarSlotAtPoint(396, 264, 480, 270)).toBe(8);
    expect(hotbarSlotAtPoint(397, 264, 480, 270)).toBeNull();
  });

  it('selects the nearest faced ground item inside pickup reach', () => {
    const x = 10 * TILE_SIZE_FIXED;
    const y = 10 * TILE_SIZE_FIXED;
    const near = { id: 1n, x: x + TILE_SIZE_FIXED, y };
    const far = { id: 2n, x: x + 25 * FIXED_UNITS_PER_PIXEL, y };
    expect(facedWorldItem(x, y, 'right', [far, near])).toEqual(near);
    expect(facedWorldItem(x, y, 'left', [near])).toBeNull();
  });
});

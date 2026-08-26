import { FIXED_UNITS_PER_PIXEL, TILE_SIZE_FIXED } from '@orchard/sim';
import { describe, expect, it } from 'vitest';
import {
  facedResource,
  facedInteractionTile,
  interactionTileAtWorldPoint,
  interactionTileInReach,
  facedWorldItem,
  equippedItemTracksCursor,
  hotbarItemLabel,
  hotbarItemName,
  hotbarLayout,
  hotbarSlotAtPoint,
  hotbarSlotForCode,
  formatDayTime,
  weatherControlAtPoint,
  weatherPanelLayout,
  weatherTimeFractionAtPoint,
  worldPlacementTileIsBlocked,
} from './survival-ui.js';

const tree = { id: 2n, kind: 'tree', tileX: 12, tileY: 10, depleted: false };

describe('survival controls', () => {
  it('targets the adjacent farm tile in all eight facing directions', () => {
    const x = 10 * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
    const y = 20 * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
    expect(facedInteractionTile(x, y, 'up')).toEqual({ tileX: 10, tileY: 19 });
    expect(facedInteractionTile(x, y, 'downRight')).toEqual({ tileX: 11, tileY: 21 });
    expect(facedInteractionTile(x, y, 'left')).toEqual({ tileX: 9, tileY: 20 });
  });

  it('maps a world pointer to any shared tile target up to three tiles away', () => {
    const playerX = 10 * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
    const playerY = 10 * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2;
    expect(interactionTileAtWorldPoint(playerX, playerY, 11 * 16 + 4, 10 * 16 + 12, 192))
      .toEqual({ tileX: 11, tileY: 10 });
    expect(interactionTileAtWorldPoint(playerX, playerY, 13 * 16, 10 * 16, 192))
      .toEqual({ tileX: 13, tileY: 10 });
    expect(interactionTileAtWorldPoint(playerX, playerY, 14 * 16, 10 * 16, 192)).toBeNull();
    expect(interactionTileAtWorldPoint(playerX, playerY, -1, 10 * 16, 192)).toBeNull();
    expect(interactionTileInReach(playerX, playerY, { tileX: 11, tileY: 11 })).toBe(true);
  });

  it('marks placement over terrain, obstacles, and player hitboxes as blocked', () => {
    const collision = {
      width: 20,
      height: 20,
      blocked: Array.from({ length: 400 }, (_, index) => index === 10 * 20 + 12),
      obstacles: [{
        left: 11 * TILE_SIZE_FIXED,
        top: 10 * TILE_SIZE_FIXED,
        right: 12 * TILE_SIZE_FIXED - 1,
        bottom: 11 * TILE_SIZE_FIXED - 1,
      }],
    };
    const player = { x: 10 * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2, y: 10 * TILE_SIZE_FIXED + TILE_SIZE_FIXED / 2 };
    expect(worldPlacementTileIsBlocked(collision, { tileX: 10, tileY: 10 }, [player])).toBe(true);
    expect(worldPlacementTileIsBlocked(collision, { tileX: 11, tileY: 10 }, [])).toBe(true);
    expect(worldPlacementTileIsBlocked(collision, { tileX: 12, tileY: 10 }, [])).toBe(true);
    expect(worldPlacementTileIsBlocked(collision, { tileX: 13, tileY: 10 }, [])).toBe(false);
  });

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
      .toEqual(['IRON AXE', 'IRON PICKAXE', 'IRON HOE', 'WATERING CAN', 'WOOD', '--']);
  });

  it('gives occupied slots full hover names', () => {
    expect(['axe', 'pickaxe', 'hoe', 'watering_can', 'wood', 'empty'].map(hotbarItemName))
      .toEqual(['IRON AXE', 'IRON PICKAXE', 'IRON HOE', 'WATERING CAN', 'WOOD', null]);
  });

  it('continuously faces the cursor only while the bow is equipped', () => {
    expect(equippedItemTracksCursor('bow')).toBe(true);
    for (const item of ['axe', 'pickaxe', 'hoe', 'watering_can', 'wood', 'empty']) {
      expect(equippedItemTracksCursor(item)).toBe(false);
    }
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

  it('lays out and hit-tests the top-right weather test controls', () => {
    const layout = weatherPanelLayout(480);
    expect(layout.x).toBe(334);
    expect(weatherControlAtPoint(layout.sliderX + 20, layout.sliderY, 480)).toBe('time');
    expect(weatherControlAtPoint(layout.rainX + 10, layout.rainY + 5, 480)).toBe('rain');
    expect(weatherControlAtPoint(20, 20, 480)).toBeNull();
    expect(weatherTimeFractionAtPoint(layout.sliderX - 50, 480)).toBe(0);
    expect(weatherTimeFractionAtPoint(layout.sliderX + layout.sliderWidth / 2, 480)).toBe(0.5);
    expect(weatherTimeFractionAtPoint(layout.sliderX + layout.sliderWidth + 50, 480)).toBe(1);
  });

  it('formats slider ticks as a full 24-hour day', () => {
    expect(formatDayTime(0, 54_000)).toBe('06:00');
    expect(formatDayTime(13_500, 54_000)).toBe('11:00');
    expect(formatDayTime(27_000, 54_000)).toBe('16:00');
    expect(formatDayTime(48_600, 54_000)).toBe('00:00');
    expect(formatDayTime(53_999, 54_000)).toBe('01:59');
  });
});

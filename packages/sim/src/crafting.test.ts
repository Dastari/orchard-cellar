import { describe, expect, it } from 'vitest';
import {
  ANVIL_REPAIR_COST_BRONZE,
  FENCE_JOIN_EAST,
  FENCE_JOIN_NORTH,
  FENCE_JOIN_SOUTH,
  FENCE_JOIN_WEST,
  PLACEABLE_DEFINITIONS,
  placeableSlotCapacity,
  craftingStationWithinReach,
  fenceJoinMask,
  fiberDropsFromTilling,
} from './crafting.js';
import { itemDefinition, placeableHasInterface, placeableInterface } from './item-containers.js';

describe('28§8 deterministic fiber drops', () => {
  it('returns the same result for the same authority inputs', () => {
    const input = [0x4f434852, 0, 320, 320, 42n] as const;
    expect(fiberDropsFromTilling(...input)).toBe(fiberDropsFromTilling(...input));
  });

  it('holds the documented 30 percent gate across a stable distribution fixture', () => {
    const drops = Array.from({ length: 10_000 }, (_, tick) =>
      fiberDropsFromTilling(0x4f434852, 0, 320, 320, BigInt(tick)));
    expect(drops.filter(Boolean).length).toBeGreaterThanOrEqual(2_800);
    expect(drops.filter(Boolean).length).toBeLessThanOrEqual(3_200);
  });
});

describe('28§7 fence joins', () => {
  it('resolves isolated, straight, corner, tee, and cross masks', () => {
    const mask = (neighbors: readonly string[]) => fenceJoinMask(10, 10, (x, y) => neighbors.includes(`${x},${y}`));
    expect(mask([])).toBe(0);
    expect(mask(['10,9', '10,11'])).toBe(FENCE_JOIN_NORTH | FENCE_JOIN_SOUTH);
    expect(mask(['11,10', '10,11'])).toBe(FENCE_JOIN_EAST | FENCE_JOIN_SOUTH);
    expect(mask(['10,9', '11,10', '9,10'])).toBe(FENCE_JOIN_NORTH | FENCE_JOIN_EAST | FENCE_JOIN_WEST);
    expect(mask(['10,9', '11,10', '10,11', '9,10'])).toBe(15);
  });

  it('keeps gates in the fence connection family and standing torches passable', () => {
    expect(PLACEABLE_DEFINITIONS.fence_gate.connectsFence).toBe(true);
    expect(PLACEABLE_DEFINITIONS.standing_torch.blocksMovement).toBe(false);
  });

  it('registers the one-tile blocking anvil and its copper repair cost', () => {
    expect(PLACEABLE_DEFINITIONS.anvil).toMatchObject({ blocksMovement: true, slotCapacity: 0 });
    expect(itemDefinition('anvil')).toMatchObject({ maxStack: 1, iconKey: 'prop_cf_anvil', iconAnimation: 'animate' });
    expect(ANVIL_REPAIR_COST_BRONZE).toBe(5);
  });

  it('derives processor UI contracts and capacities from item tags', () => {
    expect(placeableInterface('cooking_fire')).toBe('cooking');
    expect(placeableInterface('camp_cooking_fire')).toBe('cooking');
    expect(placeableHasInterface('furnace', 'furnace')).toBe(true);
    expect(placeableHasInterface('barrel', 'barrel')).toBe(true);
    expect(placeableHasInterface('fruit_press', 'press')).toBe(true);
    expect(placeableHasInterface('fermentation_cask', 'fermentation')).toBe(true);
    expect(placeableInterface('campfire')).toBeNull();
    expect(placeableSlotCapacity('cooking_fire')).toBe(2);
    expect(placeableSlotCapacity('camp_cooking_fire')).toBe(2);
    expect(placeableSlotCapacity('furnace')).toBe(3);
    expect(placeableSlotCapacity('barrel')).toBe(8);
    expect(placeableSlotCapacity('fruit_press')).toBe(3);
    expect(placeableSlotCapacity('fermentation_cask')).toBe(2);
  });
});

describe('28§14 workbench proximity', () => {
  it('accepts the inclusive two-tile boundary and rejects distance three or another space', () => {
    const player = { spaceId: 0, tileX: 10, tileY: 10 };
    expect(craftingStationWithinReach(player, { spaceId: 0, tileX: 12, tileY: 12 }, 2)).toBe(true);
    expect(craftingStationWithinReach(player, { spaceId: 0, tileX: 13, tileY: 10 }, 2)).toBe(false);
    expect(craftingStationWithinReach(player, { spaceId: 1, tileX: 10, tileY: 10 }, 2)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  FENCE_JOIN_EAST,
  FENCE_JOIN_NORTH,
  FENCE_JOIN_SOUTH,
  FENCE_JOIN_WEST,
  PLACEABLE_DEFINITIONS,
  fenceJoinMask,
  fiberDropsFromTilling,
} from './crafting.js';

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
});

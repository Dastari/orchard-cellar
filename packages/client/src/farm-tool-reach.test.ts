import { describe, expect, it } from 'vitest';
import { FIXED_UNITS_PER_PIXEL, tileToolInteractionOrigin, tileToolTargetInReach, type RuntimeToolDefinition } from '@orchard/sim';
import { tileToolInputOutOfReach } from './action-input-preflight.js';

const fixed = (x: number, y: number) => ({ x: x * FIXED_UNITS_PER_PIXEL, y: y * FIXED_UNITS_PER_PIXEL });
const player = fixed(168, 177);
const hoe: RuntimeToolDefinition = { specialization: 'farming', tier: 0, reachTiles: 2, swingTicks: 6 };

describe('farm tool circle and quiet target preflight', () => {
  it('centres on the physical player and accepts the pictured north-west tile', () => {
    expect(tileToolInteractionOrigin(hoe, player)).toEqual(fixed(168, 168));
    expect(tileToolTargetInReach(hoe, player, { tileX: 9, tileY: 9 })).toBe(true);
    expect(tileToolInputOutOfReach(hoe, player, { tileX: 9, tileY: 9 }, player)).toBe(false);
    expect(tileToolInputOutOfReach(hoe, player, { tileX: 8, tileY: 8 }, player)).toBe(true);
    expect(tileToolInputOutOfReach(hoe, player, { tileX: 10, tileY: 8 }, player)).toBe(false);
  });

  it('does not show a usable edge target while prediction is ahead of the confirmed player', () => {
    expect(tileToolInputOutOfReach(hoe, player, { tileX: 12, tileY: 10 }, fixed(167, 177))).toBe(true);
    expect(tileToolInputOutOfReach(hoe, fixed(167, 177), { tileX: 12, tileY: 10 }, player)).toBe(true);
    expect(tileToolInputOutOfReach(hoe, player, { tileX: 12, tileY: 10 }, player)).toBe(false);
  });

  it('preserves fishing origins and radius while farm tools follow their authored radius', () => {
    const fishing = { ...hoe, specialization: 'fishing' as const, reachTiles: 3 };
    expect(tileToolInteractionOrigin(fishing, player)).toBe(player);
    expect(tileToolInputOutOfReach({ ...hoe, reachTiles: 1 }, player, { tileX: 9, tileY: 9 })).toBe(true);
  });
});

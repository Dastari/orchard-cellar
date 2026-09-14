import { describe, expect, it } from 'vitest';
import { fishingLinePose, fishingRodTipOffset } from './fishing-line.js';

describe('procedural fishing line', () => {
  it('attaches to the mirrored side-facing rod tips', () => {
    expect(fishingRodTipOffset('right')).toEqual({ x: 17, y: -15 });
    expect(fishingRodTipOffset('downRight')).toEqual({ x: 17, y: -15 });
    expect(fishingRodTipOffset('left')).toEqual({ x: -17, y: -15 });
    expect(fishingRodTipOffset('upLeft')).toEqual({ x: -17, y: -15 });
    expect(fishingRodTipOffset('up')).toEqual({ x: 0, y: -32 });
    expect(fishingRodTipOffset('down')).toEqual({ x: -1, y: -12 });
    expect(fishingRodTipOffset('right', 3)).toEqual({ x: -3, y: -29 });
    expect(fishingRodTipOffset('left', 3)).toEqual({ x: 3, y: -29 });
  });

  it('lands exactly on the selected water tile and retains a downward sag', () => {
    const start = { x: 20, y: 30 };
    const target = { x: 80, y: 70 };
    const pose = fishingLinePose(start, target, 2_000);
    expect(pose.end).toEqual(target);
    expect(pose.settled).toBe(true);
    expect(pose.bobberVisible).toBe(true);
    expect(pose.control.y).toBeGreaterThan((start.y + target.y) / 2);
  });

  it('uses an airborne twirl during the cast and skips it for reduced motion', () => {
    const start = { x: 20, y: 50 };
    const target = { x: 100, y: 50 };
    const moving = fishingLinePose(start, target, 320);
    const reduced = fishingLinePose(start, target, 320, true);
    expect(moving.end.y).toBeLessThan(50);
    expect(moving.settled).toBe(false);
    expect(reduced.end).toEqual(target);
    expect(reduced.settled).toBe(true);
  });
});

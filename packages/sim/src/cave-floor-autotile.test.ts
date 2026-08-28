import { describe, expect, it } from 'vitest';
import {
  caveFloorAutotilePlan,
  caveFloorDecorationFrameAt,
  caveFloorPatchVariantAt,
} from './cave-floor-autotile.js';

const plan = (...rock: readonly (readonly [number, number])[]) => caveFloorAutotilePlan(
  (x, y) => rock.some(([rockX, rockY]) => x === rockX && y === rockY),
);

describe('cave floor rocky transition autotile', () => {
  it('maps the dense centre and eight surrounding transition cells', () => {
    expect(plan([0, 0])).toEqual({ transitionFrame: 10, insetFrames: [] });
    expect(plan([0, -1]).transitionFrame).toBe(13);
    expect(plan([1, 0]).transitionFrame).toBe(9);
    expect(plan([0, 1]).transitionFrame).toBe(7);
    expect(plan([-1, 0]).transitionFrame).toBe(11);
    expect(plan([0, -1], [-1, 0]).transitionFrame).toBe(14);
    expect(plan([0, -1], [1, 0]).transitionFrame).toBe(12);
    expect(plan([0, 1], [-1, 0]).transitionFrame).toBe(8);
    expect(plan([0, 1], [1, 0]).transitionFrame).toBe(6);
  });

  it('adds the four diagonal inset overlays without replacing plain floor', () => {
    expect(plan([-1, -1])).toEqual({ transitionFrame: null, insetFrames: [4] });
    expect(plan([1, -1])).toEqual({ transitionFrame: null, insetFrames: [3] });
    expect(plan([-1, 1])).toEqual({ transitionFrame: null, insetFrames: [1] });
    expect(plan([1, 1])).toEqual({ transitionFrame: null, insetFrames: [0] });
  });

  it('generates deterministic connected patches in both supplied floor variants', () => {
    const patches = new Map<string, 0 | 1>();
    for (let y = 0; y < 96; y += 1) for (let x = 0; x < 96; x += 1) {
      const variant = caveFloorPatchVariantAt(42, 30_001, x, y);
      expect(caveFloorPatchVariantAt(42, 30_001, x, y)).toBe(variant);
      if (variant !== null) patches.set(`${x},${y}`, variant);
    }
    expect(patches.size).toBeGreaterThan(100);
    expect(new Set(patches.values())).toEqual(new Set([0, 1]));
    for (const key of patches.keys()) {
      const [x, y] = key.split(',').map(Number) as [number, number];
      expect([
        `${x},${y - 1}`,
        `${x + 1},${y}`,
        `${x},${y + 1}`,
        `${x - 1},${y}`,
      ].some((neighbour) => patches.has(neighbour))).toBe(true);
    }
  });

  it('selects sparse deterministic decoration frames from the three-frame strip', () => {
    const frames = new Set<number>();
    let decorated = 0;
    for (let y = 0; y < 80; y += 1) for (let x = 0; x < 80; x += 1) {
      const frame = caveFloorDecorationFrameAt(42, 30_001, x, y);
      expect(caveFloorDecorationFrameAt(42, 30_001, x, y)).toBe(frame);
      if (frame !== null) {
        frames.add(frame);
        decorated += 1;
      }
    }
    expect(decorated).toBeGreaterThan(50);
    expect(frames).toEqual(new Set([0, 1, 2]));
  });
});

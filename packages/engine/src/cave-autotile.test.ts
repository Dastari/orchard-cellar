import { describe, expect, it } from 'vitest';
import { caveFloorFrame } from '@orchard/sim';

describe('cave excavation autotile', () => {
  it('uses only the four opaque seamless floor cells', () => {
    const frames = new Set<number>();
    for (let y = 0; y < 16; y += 1) for (let x = 0; x < 16; x += 1) frames.add(caveFloorFrame(x, y, 42));
    expect([...frames].sort()).toEqual([0, 1, 2, 3]);
  });
});

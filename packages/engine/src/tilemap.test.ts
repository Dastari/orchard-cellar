import { describe, expect, it } from 'vitest';
import { blob47FrameIndex } from './tilemap.js';

function pathGrid(points: readonly (readonly [number, number])[]): number[] {
  const tiles = Array.from({ length: 9 }, () => 0);
  for (const [x, y] of points) tiles[y * 3 + x] = 3;
  return tiles;
}

describe('blob47 path selection', () => {
  it('selects isolated, straight-edge, and corner frames in canonical order', () => {
    expect(blob47FrameIndex(pathGrid([[1, 1]]), 3, 4, 3)).toBe(0);
    expect(blob47FrameIndex(pathGrid([[1, 1], [1, 0]]), 3, 4, 3)).toBe(1);
    expect(blob47FrameIndex(pathGrid([[1, 1], [2, 1]]), 3, 4, 3)).toBe(2);
    expect(blob47FrameIndex(pathGrid([[1, 1], [1, 0], [2, 1]]), 3, 4, 3)).toBe(3);
    expect(blob47FrameIndex(pathGrid([[1, 1], [1, 0], [2, 1], [2, 0]]), 3, 4, 3)).toBe(4);
  });

  it('selects the fully surrounded center frame', () => {
    expect(blob47FrameIndex(pathGrid([
      [0, 0], [1, 0], [2, 0],
      [0, 1], [1, 1], [2, 1],
      [0, 2], [1, 2], [2, 2],
    ]), 3, 4, 3)).toBe(46);
  });
});

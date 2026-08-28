import { describe, expect, it } from 'vitest';
import {
  CAVE_WALL_ATLAS_FRAMES,
  CAVE_WALL_EAST,
  CAVE_WALL_NORTH,
  CAVE_WALL_NORTH_EAST,
  CAVE_WALL_NORTH_WEST,
  CAVE_WALL_SOUTH,
  CAVE_WALL_SOUTH_EAST,
  CAVE_WALL_SOUTH_WEST,
  CAVE_WALL_WEST,
  caveFloorFrame,
  caveWallAtlasFrameFor,
  caveWallFrameFor,
} from '@orchard/sim';

const frame = (...dug: readonly (readonly [number, number])[]): number | null => caveWallFrameFor(
  (x, y) => dug.some(([dugX, dugY]) => dugX === x && dugY === y),
);
const atlasFrame = (...dug: readonly (readonly [number, number])[]): number | null => caveWallAtlasFrameFor(
  (x, y) => dug.some(([dugX, dugY]) => dugX === x && dugY === y),
);

describe('cave excavation autotile', () => {
  it('maps every cardinal wall face to the authored 3x3 excavation ring', () => {
    expect(frame([0, -1])).toBe(CAVE_WALL_NORTH);
    expect(frame([1, 0])).toBe(CAVE_WALL_EAST);
    expect(frame([0, 1])).toBe(CAVE_WALL_SOUTH);
    expect(frame([-1, 0])).toBe(CAVE_WALL_WEST);
  });

  it('maps all corners and diagonal-only contacts', () => {
    expect(frame([0, -1], [1, 0])).toBe(CAVE_WALL_NORTH_EAST);
    expect(frame([0, 1], [1, 0])).toBe(CAVE_WALL_SOUTH_EAST);
    expect(frame([0, 1], [-1, 0])).toBe(CAVE_WALL_SOUTH_WEST);
    expect(frame([0, -1], [-1, 0])).toBe(CAVE_WALL_NORTH_WEST);
    expect(frame([1, -1])).toBe(CAVE_WALL_NORTH_EAST);
    expect(CAVE_WALL_ATLAS_FRAMES[CAVE_WALL_NORTH_EAST]).toBe(18);
    expect(CAVE_WALL_ATLAS_FRAMES[CAVE_WALL_SOUTH_EAST]).toBe(6);
    expect(CAVE_WALL_ATLAS_FRAMES[CAVE_WALL_SOUTH_WEST]).toBe(4);
    expect(CAVE_WALL_ATLAS_FRAMES[CAVE_WALL_NORTH_WEST]).toBe(20);
  });

  it('rotates cardinal inset corners without rotating diagonal-only outsets', () => {
    expect(atlasFrame([0, -1], [1, 0])).toBe(26);
    expect(atlasFrame([0, -1], [-1, 0])).toBe(25);
    expect(atlasFrame([0, 1], [1, 0])).toBe(33);
    expect(atlasFrame([0, 1], [-1, 0])).toBe(32);
    expect(atlasFrame([1, -1])).toBe(18);
    expect(atlasFrame([-1, -1])).toBe(20);
  });

  it('does not draw walls inside dug space or untouched distant rock', () => {
    expect(frame([0, 0], [0, -1])).toBeNull();
    expect(frame()).toBeNull();
  });

  it('uses only the four opaque seamless floor cells', () => {
    const frames = new Set<number>();
    for (let y = 0; y < 16; y += 1) for (let x = 0; x < 16; x += 1) frames.add(caveFloorFrame(x, y, 42));
    expect([...frames].sort()).toEqual([0, 1, 2, 3]);
  });
});

import { describe, expect, it } from 'vitest';
import { avatarFrameIndex, canonicalBlob47Index, isOverworldRoad } from './overworld-art.js';

describe('overworld art topology', () => {
  it('uses the generated atlas canonical blob ordering', () => {
    expect(canonicalBlob47Index(0, 0)).toBe(0);
    expect(canonicalBlob47Index(3, 1)).toBe(4);
    expect(canonicalBlob47Index(15, 15)).toBe(46);
  });

  it('lays two-tile roads between sixteen-tile parcels without a left-edge stripe', () => {
    expect(isOverworldRoad(0, 8)).toBe(false);
    expect(isOverworldRoad(15, 8)).toBe(true);
    expect(isOverworldRoad(16, 8)).toBe(true);
    expect(isOverworldRoad(17, 8)).toBe(false);
    expect(isOverworldRoad(8, 15)).toBe(true);
  });

  it('never advances the idle avatar animation', () => {
    expect(avatarFrameIndex(false, 0)).toBe(0);
    expect(avatarFrameIndex(false, 999)).toBe(0);
    expect(avatarFrameIndex(true, 8)).toBe(1);
  });
});

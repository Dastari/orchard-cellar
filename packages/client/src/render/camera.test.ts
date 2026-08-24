import { describe, expect, it } from 'vitest';
import { cameraAxisOffset, visibleWorldBounds, worldPointVisible } from './camera.js';

describe('screen-sized world culling', () => {
  it('keeps fractional camera motion for interpolated diagonal travel', () => {
    expect(cameraAxisOffset(100.25, 100, 1_000)).toBe(50.25);
  });

  it('derives world bounds from actual canvas size and camera zoom', () => {
    const bounds = visibleWorldBounds(100, 50, 960, 540, 2, 32);
    expect(bounds).toEqual({ left: 68, top: 18, right: 612, bottom: 352 });
    expect(worldPointVisible(612, 352, bounds)).toBe(true);
    expect(worldPointVisible(613, 352, bounds)).toBe(false);
  });
});

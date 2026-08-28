import { describe, expect, it } from 'vitest';
import { cameraAxisOffset, cameraAxisOffsetWithEndPadding, visibleWorldBounds, worldPointVisible } from './camera.js';

describe('screen-sized world culling', () => {
  it('keeps fractional camera motion for interpolated diagonal travel', () => {
    expect(cameraAxisOffset(100.25, 100, 1_000)).toBe(50.25);
  });

  it('centres a finite map when the zoomed-out viewport is larger', () => {
    expect(cameraAxisOffset(256, 800, 512)).toBe(-144);
  });

  it('retains finite clamping while allowing presentation room after the final edge', () => {
    expect(cameraAxisOffsetWithEndPadding(496, 400, 512, 128)).toBe(240);
    expect(cameraAxisOffsetWithEndPadding(16, 400, 512, 128)).toBe(0);
  });

  it('derives world bounds from actual canvas size and camera zoom', () => {
    const bounds = visibleWorldBounds(100, 50, 960, 540, 2, 32);
    expect(bounds).toEqual({ left: 68, top: 18, right: 612, bottom: 352 });
    expect(worldPointVisible(612, 352, bounds)).toBe(true);
    expect(worldPointVisible(613, 352, bounds)).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  STUDIO_CANVAS_MAX_BACKING_PIXELS,
  studioCanvasDevicePixelRatio,
} from './app.js';

describe('Studio canvas backing-store budget', () => {
  it('retains 2x detail at 1280x800 without exceeding the pixel budget', () => {
    const ratio = studioCanvasDevicePixelRatio(1280, 800, 2);
    expect(ratio).toBe(2);
    expect(1280 * ratio * 800 * ratio).toBeLessThanOrEqual(STUDIO_CANVAS_MAX_BACKING_PIXELS + 1);
  });

  it('caps a measured T3 fill viewport instead of allocating a 10MP canvas', () => {
    const ratio = studioCanvasDevicePixelRatio(2019, 1262, 2);
    expect(ratio).toBeGreaterThan(1.2);
    expect(ratio).toBeLessThan(1.3);
    expect(2019 * ratio * 1262 * ratio).toBeLessThanOrEqual(STUDIO_CANVAS_MAX_BACKING_PIXELS + 1);
  });

  it('never upscales a normal 1x display', () => {
    expect(studioCanvasDevicePixelRatio(960, 700, 1)).toBe(1);
  });
});

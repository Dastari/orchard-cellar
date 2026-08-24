import { describe, expect, it } from 'vitest';
import { integerCanvasScale, stepWorldZoom } from './display.js';

describe('pixel display controls', () => {
  it('fits only whole virtual pixels', () => {
    expect(integerCanvasScale(1920, 1080)).toBe(4);
    expect(integerCanvasScale(1000, 700)).toBe(2);
    expect(integerCanvasScale(320, 200)).toBe(1);
  });

  it('steps and clamps world zoom', () => {
    expect(stepWorldZoom(2, 1)).toBe(3);
    expect(stepWorldZoom(3, 1)).toBe(3);
    expect(stepWorldZoom(2, -1)).toBe(1);
    expect(stepWorldZoom(1, -1)).toBe(1);
  });
});

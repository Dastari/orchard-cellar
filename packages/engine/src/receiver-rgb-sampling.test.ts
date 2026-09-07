import { describe, expect, it } from 'vitest';
import { blackReceiverRgb, sampleReceiverRgb } from './receiver-rgb-sampling.js';

const pixels = () => new Uint8ClampedArray([
  0, 255, 20, 255, 100, 200, 80, 255,
  200, 100, 160, 255, 255, 0, 240, 255,
]);
describe('receiver RGB sampling storage', () => {
  it('preserves rounded bilinear colour, clamped edge support and outside black', () => {
    const buffer = pixels(), output = { r: 99, g: 99, b: 99 };
    expect(sampleReceiverRgb(buffer, 2, 2, 0.25, 0.75, output)).toBe(output);
    expect(output).toEqual({ r: 167, g: 117, b: 144 });
    expect(sampleReceiverRgb(buffer, 2, 2, 1.75, 1.99, output)).toEqual({ r: 255, g: 0, b: 240 });
    for (const [x, y] of [[-0.01, 0], [0, -0.01], [2, 1], [1, 2]]) {
      output.r = output.g = output.b = 99;
      expect(sampleReceiverRgb(buffer, 2, 2, x!, y!, output)).toBe(output);
      expect(output).toEqual({ r: 0, g: 0, b: 0 });
    }
  });
  it('reuses caller storage across 600 changing fields while ordinary callers stay independent', () => {
    const buffer = pixels(), output = { r: 0, g: 0, b: 0 };
    const first = sampleReceiverRgb(buffer, 2, 2, 0, 0), second = sampleReceiverRgb(buffer, 2, 2, 0, 0);
    expect(first).not.toBe(second); first.r = 99; expect(second.r).toBe(0);
    for (let frame = 0; frame < 600; frame++) {
      const color = { r: frame % 255, g: frame * 3 % 255, b: frame * 7 % 255 };
      for (let i = 0; i < buffer.length; i += 4) buffer.set([color.r, color.g, color.b, 255], i);
      expect(sampleReceiverRgb(buffer, 2, 2, 0.75, 0.25, output)).toBe(output);
      expect(output).toEqual(color);
    }
    expect(blackReceiverRgb(output)).toBe(output); expect(output).toEqual({ r: 0, g: 0, b: 0 });
    expect(blackReceiverRgb()).not.toBe(blackReceiverRgb());
  });
});

import { describe, expect, it } from 'vitest';
import { clampProgress } from './progress-bar.js';

describe('clampProgress', () => {
  it('keeps progress inside its drawable range', () => {
    expect(clampProgress(-1)).toBe(0);
    expect(clampProgress(0.58)).toBe(0.58);
    expect(clampProgress(2)).toBe(1);
  });

  it('treats non-finite values as empty', () => {
    expect(clampProgress(Number.NaN)).toBe(0);
    expect(clampProgress(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

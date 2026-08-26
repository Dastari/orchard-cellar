import { describe, expect, it } from 'vitest';
import { axesFromCodes, directionFromAxes } from './input.js';

describe('input mapping', () => {
  it('maps WASD combinations to eight directions', () => {
    expect(directionFromAxes(...axesFromCodes(new Set(['KeyW', 'KeyD'])))).toBe('upRight');
    expect(directionFromAxes(...axesFromCodes(new Set(['KeyS'])))).toBe('down');
  });

  it('applies an analog dead zone', () => {
    expect(directionFromAxes(0.2, -0.1)).toBeNull();
    expect(directionFromAxes(-0.8, 0)).toBe('left');
  });
});


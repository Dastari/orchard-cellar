import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WORLD_ZOOM,
  WORLD_ZOOM_LEVELS,
  canvasViewport,
  fittedCanvasScale,
  fittedUiScale,
  integerCanvasScale,
  stepUiScale,
  stepWorldZoom,
  worldZoomLabel,
} from './display.js';

describe('pixel display controls', () => {
  it('fits only whole virtual pixels', () => {
    expect(integerCanvasScale(1920, 1080)).toBe(4);
    expect(integerCanvasScale(1000, 700)).toBe(2);
    expect(integerCanvasScale(320, 200)).toBe(1);
  });

  it('uses the full browser area as logical canvas pixels', () => {
    expect(canvasViewport(1920, 1080)).toEqual({ width: 1920, height: 1080 });
    expect(canvasViewport(1000.8, 700.9)).toEqual({ width: 1000, height: 700 });
    expect(canvasViewport(0, 0)).toEqual({ width: 1, height: 1 });
  });

  it('still fits fixed-layout account screens without distortion', () => {
    expect(fittedCanvasScale(1000, 700)).toBeCloseTo(1000 / 480);
  });

  it('steps and clamps world zoom', () => {
    expect(DEFAULT_WORLD_ZOOM).toBe(2);
    expect(WORLD_ZOOM_LEVELS).toEqual([1, 2, 3]);
    expect(stepWorldZoom(2, -1)).toBe(1);
    expect(stepWorldZoom(1, -1)).toBe(1);
    expect(stepWorldZoom(2, 1)).toBe(3);
    expect(stepWorldZoom(3, 1)).toBe(3);
    expect(worldZoomLabel(1)).toBe('0.5X');
    expect(worldZoomLabel(2)).toBe('1X');
    expect(worldZoomLabel(3)).toBe('1.5X');
  });

  it('scales the HUD only by whole pixels that fit the current canvas', () => {
    expect(stepUiScale(1, 1)).toBe(2);
    expect(stepUiScale(3, 1)).toBe(3);
    expect(fittedUiScale(3, 1920, 1080)).toBe(3);
    expect(fittedUiScale(3, 640, 480)).toBe(1);
  });
});

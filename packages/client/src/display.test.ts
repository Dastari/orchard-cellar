import { describe, expect, it } from 'vitest';
import {
  DEFAULT_UI_SCALE,
  DEFAULT_WORLD_ZOOM,
  MIN_WORLD_ZOOM,
  canvasViewport,
  centeredFixedSceneLayout,
  easeWorldZoom,
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

  it('centers account UI at its default scale inside a full-screen canvas', () => {
    expect(centeredFixedSceneLayout(1920, 1080)).toEqual({
      x: 480, y: 270, width: 960, height: 540, scale: 2,
    });
    expect(centeredFixedSceneLayout(800, 600)).toEqual({
      x: 160, y: 165, width: 480, height: 270, scale: 1,
    });
    const compact = centeredFixedSceneLayout(320, 180);
    expect(compact).toEqual({ x: 0, y: 0, width: 320, height: 180, scale: 2 / 3 });
  });

  it('steps and clamps world zoom', () => {
    expect(DEFAULT_WORLD_ZOOM).toBe(2);
    expect(MIN_WORLD_ZOOM).toBe(1.5);
    expect(stepWorldZoom(2, -1)).toBe(1.75);
    expect(stepWorldZoom(1.5, -1)).toBe(1.5);
    expect(stepWorldZoom(2, 1)).toBe(2.25);
    expect(stepWorldZoom(8, 1)).toBe(8);
    expect(worldZoomLabel(1)).toBe('0.5X');
    expect(worldZoomLabel(2)).toBe('1X');
    expect(worldZoomLabel(3)).toBe('1.5X');
    expect(easeWorldZoom(2, 2.25)).toBeCloseTo(2.075);
  });

  it('scales the HUD only by whole pixels that fit the current canvas', () => {
    expect(DEFAULT_UI_SCALE).toBe(2);
    expect(stepUiScale(1, 1)).toBe(2);
    expect(stepUiScale(3, 1)).toBe(3);
    expect(fittedUiScale(3, 1920, 1080)).toBe(3);
    expect(fittedUiScale(3, 640, 480)).toBe(1);
  });
});

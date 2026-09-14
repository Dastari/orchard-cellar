import { describe, expect, it } from 'vitest';
import {
  AUTHORED_EDITOR_MIN_ZOOM,
  EDITOR_OBJECT_SPRITE_MIN_ZOOM,
  EDITOR_MAX_ZOOM,
  PROCEDURAL_EDITOR_MIN_ZOOM,
  editorClampMapCamera,
  editorDetailedMinimumZoom,
  editorFrameMapCamera,
  editorMapFitZoom,
  editorMinimumZoomForMap,
  editorShowsObjectSprites,
  editorUsesOverviewLod,
  editorWorldCullBounds,
  editorWorldZoomAfterWheel,
} from './editor-viewport.js';
import { worldPassLayout } from '@orchard/engine/renderer';

const WIDE_EDITOR_VIEWPORT = { x: 408, y: 68, width: 1_028, height: 584 };

describe('offline editor viewport zoom', () => {
  it('zooms exponentially around the current scale', () => {
    expect(editorWorldZoomAfterWheel(3, 100, true)).toBeLessThan(3);
    expect(editorWorldZoomAfterWheel(3, -100, true)).toBeGreaterThan(3);
  });

  it('allows seed inspection thirty-two times below native scale', () => {
    expect(editorWorldZoomAfterWheel(3, 100_000, true)).toBe(PROCEDURAL_EDITOR_MIN_ZOOM);
    expect(PROCEDURAL_EDITOR_MIN_ZOOM).toBe(1 / 32);
  });

  it('keeps authored maps and extreme zoom-in bounded', () => {
    expect(editorWorldZoomAfterWheel(3, 100_000, false)).toBe(AUTHORED_EDITOR_MIN_ZOOM);
    expect(editorWorldZoomAfterWheel(3, -100_000, true)).toBe(EDITOR_MAX_ZOOM);
  });

  it('switches to the overview before the detailed backing pass can clip', () => {
    expect(editorDetailedMinimumZoom(2_048, 1_080)).toBe(0.5);
    expect(editorDetailedMinimumZoom(3_840, 2_160)).toBeCloseTo(0.9375);
    expect(editorUsesOverviewLod(0.49, 2_048, 1_080)).toBe(true);
    expect(editorUsesOverviewLod(0.5, 2_048, 1_080)).toBe(false);
  });

  it('frames the complete square island inside the usable centre viewport', () => {
    const mapPixels = 832 * 16;
    const zoom = editorMapFitZoom(mapPixels, mapPixels, WIDE_EDITOR_VIEWPORT);
    const framed = editorFrameMapCamera(mapPixels, mapPixels, WIDE_EDITOR_VIEWPORT);
    expect(zoom).toBeCloseTo(584 * 0.94 / mapPixels);
    expect(framed.zoom).toBe(zoom);
    expect((mapPixels / 2 - framed.cameraX) * zoom)
      .toBeCloseTo(WIDE_EDITOR_VIEWPORT.x + WIDE_EDITOR_VIEWPORT.width / 2);
    expect((mapPixels / 2 - framed.cameraY) * zoom)
      .toBeCloseTo(WIDE_EDITOR_VIEWPORT.y + WIDE_EDITOR_VIEWPORT.height / 2);
  });

  it('frames offset island content rather than the surrounding document ocean', () => {
    const framed = editorFrameMapCamera(
      4_800, 5_120, WIDE_EDITOR_VIEWPORT, 3_200, 2_560,
    );
    expect((3_200 + 4_800 / 2 - framed.cameraX) * framed.zoom)
      .toBeCloseTo(WIDE_EDITOR_VIEWPORT.x + WIDE_EDITOR_VIEWPORT.width / 2);
    expect((2_560 + 5_120 / 2 - framed.cameraY) * framed.zoom)
      .toBeCloseTo(WIDE_EDITOR_VIEWPORT.y + WIDE_EDITOR_VIEWPORT.height / 2);
  });

  it('centres undersized axes and clamps oversized axes against black void', () => {
    const centred = editorClampMapCamera(
      50_000, -50_000, 0.04, 13_312, 13_312, WIDE_EDITOR_VIEWPORT,
    );
    expect(centred.cameraX).toBeCloseTo(13_312 / 2
      - (WIDE_EDITOR_VIEWPORT.x + WIDE_EDITOR_VIEWPORT.width / 2) / 0.04);
    expect(centred.cameraY).toBeCloseTo(13_312 / 2
      - (WIDE_EDITOR_VIEWPORT.y + WIDE_EDITOR_VIEWPORT.height / 2) / 0.04);

    const clamped = editorClampMapCamera(
      -50_000, 50_000, 1, 13_312, 13_312, WIDE_EDITOR_VIEWPORT,
    );
    expect(clamped.cameraX).toBe(-WIDE_EDITOR_VIEWPORT.x);
    expect(clamped.cameraY).toBe(13_312
      - WIDE_EDITOR_VIEWPORT.y - WIDE_EDITOR_VIEWPORT.height);
  });

  it('lets a finite authored island reach frame-all scale', () => {
    const minimum = editorMinimumZoomForMap(
      832 * 16, 832 * 16, WIDE_EDITOR_VIEWPORT,
    );
    expect(minimum).toBeLessThan(AUTHORED_EDITOR_MIN_ZOOM);
    expect(editorWorldZoomAfterWheel(1, 100_000, false, minimum)).toBe(minimum);
  });

  it('omits object sprites once tiles become smaller than two screen pixels', () => {
    expect(EDITOR_OBJECT_SPRITE_MIN_ZOOM).toBe(0.125);
    expect(editorShowsObjectSprites(0.125)).toBe(true);
    expect(editorShowsObjectSprites(0.124)).toBe(false);
  });

  it('culls against world-pass dimensions at fractional zoom and high DPR', () => {
    const layout = worldPassLayout(1_016, 964, 2, 2 / 3);
    const viewportWorldWidth = layout.width / layout.integerScale;
    const viewportWorldHeight = layout.height / layout.integerScale;
    const bounds = editorWorldCullBounds(
      2_000, 3_000, viewportWorldWidth, viewportWorldHeight, 96, 128,
    );

    expect(viewportWorldHeight).toBeCloseTo(964 / (2 / 3), 0);
    expect(bounds.maximumX).toBeCloseTo(2_000 + 1_016 / (2 / 3) + 96, 0);
    expect(bounds.maximumY).toBeCloseTo(3_000 + 964 / (2 / 3) + 128, 0);
    expect(bounds.maximumY).toBeGreaterThan(3_000 + 964 / layout.integerScale + 128);
  });
});

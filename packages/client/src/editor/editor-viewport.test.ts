import { describe, expect, it } from 'vitest';
import {
  AUTHORED_EDITOR_MIN_ZOOM,
  EDITOR_MAX_ZOOM,
  PROCEDURAL_EDITOR_MIN_ZOOM,
  editorDetailedMinimumZoom,
  editorUsesOverviewLod,
  editorWorldZoomAfterWheel,
} from './editor-viewport.js';

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
});

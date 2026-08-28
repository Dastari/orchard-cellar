import { MAX_WORLD_PASS_HEIGHT, MAX_WORLD_PASS_WIDTH } from '../render/renderer.js';

export const PROCEDURAL_EDITOR_MIN_ZOOM = 1 / 32;
export const AUTHORED_EDITOR_MIN_ZOOM = 1 / 8;
export const EDITOR_MAX_ZOOM = 8;

/** The detailed renderer has a finite backing canvas. Below this scale the
 * editor switches to its chunk/biome overview instead of stretching a
 * clipped detailed pass. DPR cancels out of this bound. */
export function editorDetailedMinimumZoom(cssWidth: number, cssHeight: number): number {
  return Math.max(
    PROCEDURAL_EDITOR_MIN_ZOOM,
    Math.max(1, cssWidth) / MAX_WORLD_PASS_WIDTH,
    Math.max(1, cssHeight) / MAX_WORLD_PASS_HEIGHT,
  );
}

export function editorUsesOverviewLod(
  zoom: number,
  cssWidth: number,
  cssHeight: number,
): boolean {
  return zoom < editorDetailedMinimumZoom(cssWidth, cssHeight);
}

/** Exponential wheel zoom keeps trackpads smooth while reaching seed-map scale
 * in a practical number of wheel gestures. */
export function editorWorldZoomAfterWheel(
  currentZoom: number,
  deltaY: number,
  procedural: boolean,
): number {
  const minimum = procedural ? PROCEDURAL_EDITOR_MIN_ZOOM : AUTHORED_EDITOR_MIN_ZOOM;
  const factor = Math.exp(-deltaY * 0.0022);
  return Math.max(minimum, Math.min(EDITOR_MAX_ZOOM, currentZoom * factor));
}

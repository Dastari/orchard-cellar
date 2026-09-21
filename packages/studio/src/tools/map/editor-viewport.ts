import { MAX_WORLD_PASS_HEIGHT, MAX_WORLD_PASS_WIDTH } from '@orchard/engine/renderer';

export const PROCEDURAL_EDITOR_MIN_ZOOM = 1 / 32;
export const AUTHORED_EDITOR_MIN_ZOOM = 1 / 8;
export const EDITOR_MAX_ZOOM = 8;
export const EDITOR_OBJECT_SPRITE_MIN_ZOOM = 1 / 128;
export const EDITOR_ABSOLUTE_MIN_ZOOM = 1 / 128;

export interface EditorWorldViewport {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface EditorCamera {
  readonly cameraX: number;
  readonly cameraY: number;
}

export interface EditorFramedCamera extends EditorCamera {
  readonly zoom: number;
}

export interface EditorWorldCullBounds {
  readonly minimumX: number;
  readonly minimumY: number;
  readonly maximumX: number;
  readonly maximumY: number;
}

function positiveDimension(value: number): number {
  return Math.max(1, Number.isFinite(value) ? value : 1);
}

/** World-space bounds for visibility checks. The viewport dimensions must be
 * measured in world pixels, not CSS pixels or offscreen-pass pixels: those
 * coordinate systems diverge at fractional zoom and high DPR. */
export function editorWorldCullBounds(
  cameraX: number,
  cameraY: number,
  viewportWorldWidth: number,
  viewportWorldHeight: number,
  horizontalOverscan = 0,
  verticalOverscan = horizontalOverscan,
): EditorWorldCullBounds {
  const safeHorizontalOverscan = Math.max(0, horizontalOverscan);
  const safeVerticalOverscan = Math.max(0, verticalOverscan);
  return {
    minimumX: cameraX - safeHorizontalOverscan,
    minimumY: cameraY - safeVerticalOverscan,
    maximumX: cameraX + positiveDimension(viewportWorldWidth)
      + safeHorizontalOverscan,
    maximumY: cameraY + positiveDimension(viewportWorldHeight)
      + safeVerticalOverscan,
  };
}

export function editorMapFitZoom(
  mapWidth: number,
  mapHeight: number,
  viewport: EditorWorldViewport,
  padding = 0.94,
): number {
  const safePadding = Math.max(0.1, Math.min(1, padding));
  return Math.min(
    EDITOR_MAX_ZOOM,
    viewport.width * safePadding / positiveDimension(mapWidth),
    viewport.height * safePadding / positiveDimension(mapHeight),
  );
}

/** Authored maps may zoom far enough out to frame their complete finite
 * bounds. The old fixed 1/8 floor prevented an 832x832 island from fitting in
 * the short centre viewport on ordinary widescreen displays. */
export function editorMinimumZoomForMap(
  mapWidth: number,
  mapHeight: number,
  viewport: EditorWorldViewport,
): number {
  return Math.max(
    EDITOR_ABSOLUTE_MIN_ZOOM,
    Math.min(
      AUTHORED_EDITOR_MIN_ZOOM,
      editorMapFitZoom(mapWidth, mapHeight, viewport) * 0.85,
    ),
  );
}

function clampedCameraAxis(
  camera: number,
  zoom: number,
  mapStart: number,
  mapSize: number,
  viewportStart: number,
  viewportSize: number,
): number {
  const safeZoom = Math.max(EDITOR_ABSOLUTE_MIN_ZOOM, zoom);
  const screenSize = mapSize * safeZoom;
  if (screenSize <= viewportSize) {
    return mapStart + mapSize / 2 - (viewportStart + viewportSize / 2) / safeZoom;
  }
  const minimum = mapStart - viewportStart / safeZoom;
  const maximum = mapStart + mapSize - (viewportStart + viewportSize) / safeZoom;
  return Math.max(minimum, Math.min(maximum, camera));
}

/** Prevent black void from entering the usable map viewport. If a map axis is
 * smaller than the viewport at the current zoom, it is centred on that axis. */
export function editorClampMapCamera(
  cameraX: number,
  cameraY: number,
  zoom: number,
  mapWidth: number,
  mapHeight: number,
  viewport: EditorWorldViewport,
  mapX = 0,
  mapY = 0,
): EditorCamera {
  return {
    cameraX: clampedCameraAxis(
      cameraX, zoom, mapX, positiveDimension(mapWidth), viewport.x, viewport.width,
    ),
    cameraY: clampedCameraAxis(
      cameraY, zoom, mapY, positiveDimension(mapHeight), viewport.y, viewport.height,
    ),
  };
}

export function editorFrameMapCamera(
  mapWidth: number,
  mapHeight: number,
  viewport: EditorWorldViewport,
  mapX = 0,
  mapY = 0,
): EditorFramedCamera {
  const zoom = editorMapFitZoom(mapWidth, mapHeight, viewport);
  const camera = editorClampMapCamera(
    mapX, mapY, zoom, mapWidth, mapHeight, viewport, mapX, mapY,
  );
  return { ...camera, zoom };
}

export function editorShowsObjectSprites(zoom: number): boolean {
  return zoom >= EDITOR_OBJECT_SPRITE_MIN_ZOOM;
}

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
  authoredMinimum = AUTHORED_EDITOR_MIN_ZOOM,
): number {
  const minimum = procedural ? PROCEDURAL_EDITOR_MIN_ZOOM : authoredMinimum;
  const factor = Math.exp(-deltaY * 0.0022);
  return Math.max(minimum, Math.min(EDITOR_MAX_ZOOM, currentZoom * factor));
}

export const VIRTUAL_WIDTH = 480;
export const VIRTUAL_HEIGHT = 270;
export const WORLD_ZOOM_LEVELS = [1, 2, 3] as const;
export type WorldZoom = typeof WORLD_ZOOM_LEVELS[number];
export const DEFAULT_WORLD_ZOOM: WorldZoom = 2;
export const UI_SCALE_LEVELS = [1, 2, 3] as const;
export type UiScale = typeof UI_SCALE_LEVELS[number];
export const DEFAULT_UI_SCALE: UiScale = 1;

export function integerCanvasScale(viewportWidth: number, viewportHeight: number): number {
  return Math.max(1, Math.floor(Math.min(viewportWidth / VIRTUAL_WIDTH, viewportHeight / VIRTUAL_HEIGHT)));
}

export interface CanvasViewport {
  readonly width: number;
  readonly height: number;
}

export function canvasViewport(viewportWidth: number, viewportHeight: number): CanvasViewport {
  return {
    width: Math.max(1, Math.floor(viewportWidth)),
    height: Math.max(1, Math.floor(viewportHeight)),
  };
}

export function fittedCanvasScale(viewportWidth: number, viewportHeight: number): number {
  return Math.max(0.01, Math.min(viewportWidth / VIRTUAL_WIDTH, viewportHeight / VIRTUAL_HEIGHT));
}

/** Keep fixed-layout screens responsive without changing their logical grid. */
export function resizeFixedPixelCanvas(
  canvas: HTMLCanvasElement,
  viewportWidth = innerWidth,
  viewportHeight = innerHeight,
): number {
  const scale = fittedCanvasScale(viewportWidth, viewportHeight);
  if (canvas.width !== VIRTUAL_WIDTH) canvas.width = VIRTUAL_WIDTH;
  if (canvas.height !== VIRTUAL_HEIGHT) canvas.height = VIRTUAL_HEIGHT;
  canvas.style.width = `${VIRTUAL_WIDTH * scale}px`;
  canvas.style.height = `${VIRTUAL_HEIGHT * scale}px`;
  return scale;
}

export function stepWorldZoom(current: WorldZoom, direction: -1 | 1): WorldZoom {
  const index = Math.max(0, WORLD_ZOOM_LEVELS.indexOf(current));
  const next = Math.max(0, Math.min(WORLD_ZOOM_LEVELS.length - 1, index + direction));
  return WORLD_ZOOM_LEVELS[next] ?? DEFAULT_WORLD_ZOOM;
}

export function worldZoomLabel(zoom: WorldZoom): string {
  return `${zoom / DEFAULT_WORLD_ZOOM}X`;
}

export function stepUiScale(current: UiScale, direction: -1 | 1): UiScale {
  const index = Math.max(0, UI_SCALE_LEVELS.indexOf(current));
  const next = Math.max(0, Math.min(UI_SCALE_LEVELS.length - 1, index + direction));
  return UI_SCALE_LEVELS[next] ?? DEFAULT_UI_SCALE;
}

export function fittedUiScale(desired: UiScale, canvasWidth: number, canvasHeight: number): UiScale {
  const widthLimit = Math.max(1, Math.floor(canvasWidth / 323));
  const heightLimit = Math.max(1, Math.floor(canvasHeight / 110));
  const limit = Math.min(desired, widthLimit, heightLimit);
  return UI_SCALE_LEVELS.findLast((scale) => scale <= limit) ?? 1;
}

export function resizePixelCanvas(
  canvas: HTMLCanvasElement,
  viewportWidth = innerWidth,
  viewportHeight = innerHeight,
): CanvasViewport {
  const viewport = canvasViewport(viewportWidth, viewportHeight);
  if (canvas.width !== viewport.width) canvas.width = viewport.width;
  if (canvas.height !== viewport.height) canvas.height = viewport.height;
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;
  return viewport;
}

export async function toggleFullscreen(element: HTMLElement): Promise<void> {
  if (document.fullscreenElement === null) await element.requestFullscreen();
  else await document.exitFullscreen();
}

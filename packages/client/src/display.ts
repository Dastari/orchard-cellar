export const VIRTUAL_WIDTH = 480;
export const VIRTUAL_HEIGHT = 270;
export const WORLD_ZOOM_STEP = 0.25;
export const DEFAULT_WORLD_ZOOM = 2;
export const UI_SCALE_LEVELS = [1, 2, 3] as const;
export type UiScale = typeof UI_SCALE_LEVELS[number];
export const DEFAULT_UI_SCALE: UiScale = 2;

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

export function stepWorldZoom(current: number, direction: -1 | 1, minimum = 0.25, maximum = 8): number {
  const next = Math.round((current + direction * WORLD_ZOOM_STEP) / WORLD_ZOOM_STEP) * WORLD_ZOOM_STEP;
  return Math.max(minimum, Math.min(maximum, next));
}

export function easeWorldZoom(current: number, target: number): number {
  const distance = target - current;
  return Math.abs(distance) < 0.001 ? target : current + distance * 0.3;
}

export function worldZoomLabel(zoom: number): string {
  const relative = Math.round(zoom / DEFAULT_WORLD_ZOOM * 100) / 100;
  return `${relative}X`;
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

export async function toggleFullscreen(element: HTMLElement): Promise<void> {
  if (document.fullscreenElement === null) await element.requestFullscreen();
  else await document.exitFullscreen();
}

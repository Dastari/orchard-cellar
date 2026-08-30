export const VIRTUAL_WIDTH = 480;
export const VIRTUAL_HEIGHT = 270;
export const WORLD_ZOOM_STEP = 0.25;
/** Keep the widest view at the normal authored scale. The former 1.5 floor
 * exposed too much of finite zones at once and made them read like map views. */
export const MIN_WORLD_ZOOM = 2;
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

export interface CenteredFixedSceneLayout extends CanvasViewport {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

export function canvasViewport(viewportWidth: number, viewportHeight: number): CanvasViewport {
  return {
    width: Math.max(1, Math.floor(viewportWidth)),
    height: Math.max(1, Math.floor(viewportHeight)),
  };
}

export interface CanvasViewportInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export function insetCanvasViewport(
  viewportWidth: number,
  viewportHeight: number,
  insets: CanvasViewportInsets,
): CanvasViewport {
  return canvasViewport(
    viewportWidth - insets.left - insets.right,
    viewportHeight - insets.top - insets.bottom,
  );
}

const SAFE_AREA_CUSTOM_PROPERTIES = {
  top: '--game-safe-area-top',
  right: '--game-safe-area-right',
  bottom: '--game-safe-area-bottom',
  left: '--game-safe-area-left',
} as const;

/** Reads the device cutout/home-indicator insets without shrinking the Canvas. */
export function canvasSafeAreaInsets(canvas: HTMLCanvasElement): CanvasViewportInsets {
  const host = canvas.parentElement;
  if (host === null) return { top: 0, right: 0, bottom: 0, left: 0 };
  const style = getComputedStyle(host);
  const pixelValue = (property: string): number => Math.max(
    0,
    Number.parseFloat(style.getPropertyValue(property)) || 0,
  );
  return {
    top: pixelValue(SAFE_AREA_CUSTOM_PROPERTIES.top),
    right: pixelValue(SAFE_AREA_CUSTOM_PROPERTIES.right),
    bottom: pixelValue(SAFE_AREA_CUSTOM_PROPERTIES.bottom),
    left: pixelValue(SAFE_AREA_CUSTOM_PROPERTIES.left),
  };
}

/** Returns the full-bleed box occupied by the Canvas inside its host. */
export function canvasHostViewport(
  canvas: HTMLCanvasElement,
  fallbackWidth = innerWidth,
  fallbackHeight = innerHeight,
): CanvasViewport {
  const host = canvas.parentElement;
  if (host === null) return canvasViewport(fallbackWidth, fallbackHeight);
  return canvasViewport(host.clientWidth, host.clientHeight);
}

export function fittedCanvasScale(viewportWidth: number, viewportHeight: number): number {
  return Math.max(0.01, Math.min(viewportWidth / VIRTUAL_WIDTH, viewportHeight / VIRTUAL_HEIGHT));
}

/** Centers a fixed pixel scene without allowing large displays to enlarge it indefinitely. */
export function centeredFixedSceneLayout(
  viewportWidth: number,
  viewportHeight: number,
  maximumScale = DEFAULT_UI_SCALE,
): CenteredFixedSceneLayout {
  const viewport = canvasViewport(viewportWidth, viewportHeight);
  const fittedScale = fittedCanvasScale(viewport.width, viewport.height);
  const scale = fittedScale < 1
    ? fittedScale
    : Math.max(1, Math.min(maximumScale, Math.floor(fittedScale)));
  const width = VIRTUAL_WIDTH * scale;
  const height = VIRTUAL_HEIGHT * scale;
  return {
    x: Math.round((viewport.width - width) / 2),
    y: Math.round((viewport.height - height) / 2),
    width,
    height,
    scale,
  };
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

export function stepWorldZoom(current: number, direction: -1 | 1, minimum = MIN_WORLD_ZOOM, maximum = 8): number {
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

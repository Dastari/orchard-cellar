export const VIRTUAL_WIDTH = 480;
export const VIRTUAL_HEIGHT = 270;
export const WORLD_ZOOM_LEVELS = [1, 2, 3] as const;
export type WorldZoom = typeof WORLD_ZOOM_LEVELS[number];

export function integerCanvasScale(viewportWidth: number, viewportHeight: number): number {
  return Math.max(1, Math.floor(Math.min(viewportWidth / VIRTUAL_WIDTH, viewportHeight / VIRTUAL_HEIGHT)));
}

export function stepWorldZoom(current: WorldZoom, direction: -1 | 1): WorldZoom {
  const index = Math.max(0, WORLD_ZOOM_LEVELS.indexOf(current));
  const next = Math.max(0, Math.min(WORLD_ZOOM_LEVELS.length - 1, index + direction));
  return WORLD_ZOOM_LEVELS[next] ?? 1;
}

export function resizePixelCanvas(
  canvas: HTMLCanvasElement,
  viewportWidth = innerWidth,
  viewportHeight = innerHeight,
): number {
  const scale = integerCanvasScale(viewportWidth, viewportHeight);
  canvas.style.width = `${VIRTUAL_WIDTH * scale}px`;
  canvas.style.height = `${VIRTUAL_HEIGHT * scale}px`;
  return scale;
}

export async function toggleFullscreen(element: HTMLElement): Promise<void> {
  if (document.fullscreenElement === null) await element.requestFullscreen();
  else await document.exitFullscreen();
}

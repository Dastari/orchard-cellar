import type { UiRect } from './geometry.js';

export interface ProgressBarPalette {
  readonly border: string;
  readonly bevel: string;
  readonly track: string;
  readonly fill: string;
  readonly highlight: string;
}

export const GREEN_PROGRESS_PALETTE: ProgressBarPalette = {
  border: '#3f2832',
  bevel: '#b86f50',
  track: '#6f4538',
  fill: '#3e8948',
  highlight: '#63c74d',
};

export const RED_PROGRESS_PALETTE: ProgressBarPalette = {
  ...GREEN_PROGRESS_PALETTE,
  fill: '#a43b2f',
  highlight: '#d15b4d',
};

export function clampProgress(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

/** A compact atlas-independent meter for places where the authored player HUD
 * bar cannot be resized. Every edge retains its original pixel thickness. */
export function drawProgressBar(
  context: CanvasRenderingContext2D,
  destination: UiRect,
  value: number,
  palette: ProgressBarPalette = GREEN_PROGRESS_PALETTE,
): void {
  const x = Math.round(destination.x);
  const y = Math.round(destination.y);
  const width = Math.max(8, Math.round(destination.width));
  const height = Math.max(7, Math.round(destination.height));
  const progress = clampProgress(value);

  context.save();
  context.imageSmoothingEnabled = false;
  context.fillStyle = palette.border;
  context.fillRect(x, y, width, height);
  context.fillStyle = palette.bevel;
  context.fillRect(x + 1, y + 1, width - 2, height - 2);
  context.fillStyle = palette.track;
  context.fillRect(x + 3, y + 3, width - 6, height - 6);

  const innerWidth = width - 8;
  const fillWidth = Math.round(innerWidth * progress);
  if (fillWidth > 0) {
    context.fillStyle = palette.fill;
    context.fillRect(x + 4, y + 4, fillWidth, height - 8);
    context.fillStyle = palette.highlight;
    context.fillRect(x + 4, y + 4, fillWidth, 1);
    context.fillStyle = `${palette.border}66`;
    for (let offset = 12; offset < fillWidth; offset += 12) {
      context.fillRect(x + 4 + offset, y + 4, 1, height - 8);
    }
  }
  context.restore();
}

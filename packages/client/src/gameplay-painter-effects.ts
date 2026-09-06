import { saveSpriteTransform, restoreSpriteTransform } from '@orchard/engine/painter-context';
import type { MapLandmarkInstance } from '@orchard/sim';

/** Share the gameplay item state pair while retaining standalone isolation. */
export function drawLandmarkTransform(context: CanvasRenderingContext2D,
  landmark: Pick<MapLandmarkInstance, 'quarterTurns' | 'scale' | 'flipX'>,
  screenX: number, screenY: number, drawRawDecoration: () => void): void {
  const saved = saveSpriteTransform(context, true);
  context.translate(screenX, screenY);
  context.rotate(landmark.quarterTurns * Math.PI / 2);
  const landmarkScale = landmark.scale ?? 1;
  context.scale(landmark.flipX ? -landmarkScale : landmarkScale, landmarkScale);
  context.translate(-screenX, -screenY);
  try { drawRawDecoration(); } finally { restoreSpriteTransform(context, saved); }
}

export function drawWildlifeHitFlash(context: CanvasRenderingContext2D,
  flashing: () => boolean, draw: () => void): void {
  const enabled = flashing();
  const previousFilter = context.filter;
  const saved = saveSpriteTransform(context, false);
  if (enabled) context.filter = 'brightness(2.15) saturate(0.25)';
  try { draw(); } finally {
    if (enabled) context.filter = previousFilter;
    restoreSpriteTransform(context, saved);
  }
}

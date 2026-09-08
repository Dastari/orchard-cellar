import { withWorldFrameEffect } from '@orchard/engine/world-frame-effect';
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
  const saved = saveSpriteTransform(context, false);
  try { withWorldFrameEffect(context, enabled ? 'wildlife-hit' : undefined, draw); } finally {
    restoreSpriteTransform(context, saved);
  }
}

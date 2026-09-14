import type { MapLandmarkInstance } from '@orchard/sim';

/** Mechanical extraction of the existing enqueue callers. Native state
 * ownership is deliberately unchanged until the P6 implementation commit. */
export function drawLandmarkTransform(context: CanvasRenderingContext2D,
  landmark: Pick<MapLandmarkInstance, 'quarterTurns' | 'scale' | 'flipX'>,
  screenX: number, screenY: number, drawRawDecoration: () => void): void {
  context.save();
  context.translate(screenX, screenY);
  context.rotate(landmark.quarterTurns * Math.PI / 2);
  const landmarkScale = landmark.scale ?? 1;
  context.scale(landmark.flipX ? -landmarkScale : landmarkScale, landmarkScale);
  context.translate(-screenX, -screenY);
  drawRawDecoration();
  context.restore();
}

export function drawWildlifeHitFlash(context: CanvasRenderingContext2D,
  flashing: () => boolean, draw: () => void): void {
  if (flashing()) {
    context.save();
    context.filter = 'brightness(2.15) saturate(0.25)';
  }
  draw();
  if (flashing()) context.restore();
}

import type { Vec2Fixed } from '@orchard/sim';

export function interpolateFixedPosition(
  previous: Vec2Fixed,
  current: Vec2Fixed,
  alpha: number,
): Vec2Fixed {
  const amount = Math.max(0, Math.min(1, alpha));
  return {
    x: previous.x + (current.x - previous.x) * amount,
    y: previous.y + (current.y - previous.y) * amount,
  };
}

/** Local interpolation starts each simulation frame at zero displacement, so
 * it cannot be used as a locomotion flag without producing idle/walk chatter.
 * Authority/prediction owns local movement; sampled displacement remains the
 * fallback for remote presentation. */
export function presentationMoving(
  local: boolean,
  predictedMoving: boolean | undefined,
  displayedDx: number,
  displayedDy: number,
  jumping: boolean,
): boolean {
  if (jumping) return true;
  if (local && predictedMoving !== undefined) return predictedMoving;
  return Math.abs(displayedDx) + Math.abs(displayedDy) > 0.01;
}

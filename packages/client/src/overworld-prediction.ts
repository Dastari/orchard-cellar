import { AUTHORITY_TICK_MS, type Vec2Fixed } from '@orchard/sim';

export interface LocalProjectilePrediction {
  readonly origin: Vec2Fixed;
  readonly velocity: Vec2Fixed;
  readonly lifetimeTicks: number;
  readonly startedAtMs: number;
}

export function sampleLocalProjectilePrediction(
  prediction: LocalProjectilePrediction,
  nowMs: number,
): Vec2Fixed | null {
  const elapsedTicks = Math.max(0, nowMs - prediction.startedAtMs) / AUTHORITY_TICK_MS;
  if (elapsedTicks > prediction.lifetimeTicks) return null;
  return {
    x: prediction.origin.x + prediction.velocity.x * elapsedTicks,
    y: prediction.origin.y + prediction.velocity.y * elapsedTicks,
  };
}

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

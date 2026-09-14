import type { Direction } from '@orchard/sim';

export interface FishingLinePoint {
  readonly x: number;
  readonly y: number;
}

export interface FishingLinePose {
  readonly end: FishingLinePoint;
  readonly control: FishingLinePoint;
  readonly bobberVisible: boolean;
  readonly settled: boolean;
}

const CAST_FLIGHT_MS = 850;
const DOWN_ROD_TIPS: readonly FishingLinePoint[] = [
  { x: -1, y: -12 }, { x: -3, y: -13 }, { x: -8, y: -30 },
  { x: -4, y: -34 }, { x: -3, y: -18 }, { x: -1, y: -12 },
];
const SIDE_ROD_TIPS: readonly FishingLinePoint[] = [
  { x: 17, y: -15 }, { x: 15, y: -20 }, { x: 6, y: -26 },
  { x: -3, y: -29 }, { x: 15, y: -19 }, { x: 17, y: -15 },
];
const UP_ROD_TIPS: readonly FishingLinePoint[] = [
  { x: 0, y: -32 }, { x: 3, y: -26 }, { x: 9, y: -27 },
  { x: 4, y: -30 }, { x: 3, y: -29 }, { x: 0, y: -32 },
];

/** The final authored rod poses all share the 64x64 player action anchor at
 * (32,47). These offsets attach the procedural line to the visible rod tip. */
export function fishingRodTipOffset(facing: Direction, actionFrame = Number.MAX_SAFE_INTEGER): FishingLinePoint {
  const pose = facing === 'up'
    ? UP_ROD_TIPS[Math.min(actionFrame, UP_ROD_TIPS.length - 1)]!
    : facing === 'down'
      ? DOWN_ROD_TIPS[Math.min(actionFrame, DOWN_ROD_TIPS.length - 1)]!
      : SIDE_ROD_TIPS[Math.min(actionFrame, SIDE_ROD_TIPS.length - 1)]!;
  if (facing === 'up') return pose;
  if (facing === 'down') return pose;
  if (facing === 'left' || facing === 'upLeft' || facing === 'downLeft') {
    return { x: -pose.x, y: pose.y };
  }
  return pose;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Computes a cast in screen-pixel space. During flight the end follows a
 * high, tightening spiral; once landed, gravity supplies a stable soft sag. */
export function fishingLinePose(
  start: FishingLinePoint,
  target: FishingLinePoint,
  elapsedMs: number,
  reducedMotion = false,
): FishingLinePose {
  const raw = clamp01(elapsedMs / CAST_FLIGHT_MS);
  const progress = reducedMotion ? (raw > 0 ? 1 : 0) : raw;
  const eased = 1 - (1 - progress) ** 3;
  const dx = target.x - start.x;
  const dy = target.y - start.y;
  const distance = Math.hypot(dx, dy);
  const inverseDistance = distance > 0 ? 1 / distance : 0;
  const perpendicularX = -dy * inverseDistance;
  const perpendicularY = dx * inverseDistance;
  const flightLift = Math.sin(Math.PI * progress) * Math.min(34, 8 + distance * 0.28);
  const twirlRadius = reducedMotion
    ? 0
    : Math.sin(Math.PI * progress) * Math.min(12, 3 + distance * 0.08);
  const twirlAngle = progress * Math.PI * 4;
  const end = progress >= 1 ? target : {
    x: start.x + dx * eased
      + perpendicularX * Math.cos(twirlAngle) * twirlRadius,
    y: start.y + dy * eased - flightLift
      + perpendicularY * Math.cos(twirlAngle) * twirlRadius
      + Math.sin(twirlAngle) * twirlRadius * 0.45,
  };
  const travelledDistance = Math.hypot(end.x - start.x, end.y - start.y);
  const sag = progress >= 1
    ? Math.min(22, Math.max(5, distance * 0.14))
    : Math.max(2, travelledDistance * 0.05) * progress;
  return {
    end,
    control: {
      x: (start.x + end.x) / 2 + perpendicularX * Math.sin(twirlAngle) * twirlRadius * 0.65,
      y: (start.y + end.y) / 2 + sag,
    },
    bobberVisible: progress >= 0.38,
    settled: progress >= 1,
  };
}

export interface DrawFishingLineOptions {
  readonly start: FishingLinePoint;
  readonly target: FishingLinePoint;
  readonly elapsedMs: number;
  readonly timeMs: number;
  readonly pixelScale: number;
  readonly reducedMotion?: boolean;
}

/** Draws one cheap quadratic line and a tiny pixel bobber. It runs inside the
 * existing world frame; no timers, allocations retained across frames, or
 * independent animation loop are introduced. */
export function drawFishingLine(
  context: CanvasRenderingContext2D,
  options: DrawFishingLineOptions,
): void {
  const pose = fishingLinePose(
    options.start,
    options.target,
    options.elapsedMs,
    options.reducedMotion,
  );
  const pixel = Math.max(1, Math.round(options.pixelScale));
  const bob = pose.settled && options.reducedMotion !== true
    ? Math.sin(options.timeMs / 260) * Math.max(0.5, options.pixelScale * 0.35)
    : 0;
  const endX = Math.round(pose.end.x);
  const endY = Math.round(pose.end.y + bob);

  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  context.moveTo(Math.round(options.start.x), Math.round(options.start.y));
  context.quadraticCurveTo(
    Math.round(pose.control.x),
    Math.round(pose.control.y),
    endX,
    endY,
  );
  context.strokeStyle = '#271625cc';
  context.lineWidth = Math.max(2, options.pixelScale * 1.15);
  context.stroke();
  context.strokeStyle = '#f5e6ca';
  context.lineWidth = Math.max(1, options.pixelScale * 0.48);
  context.stroke();

  if (pose.bobberVisible) {
    if (pose.settled) {
      const ripple = options.reducedMotion === true
        ? 1
        : 0.7 + (Math.sin(options.timeMs / 310) + 1) * 0.22;
      context.globalAlpha = 0.58;
      context.strokeStyle = '#9be8ed';
      context.lineWidth = Math.max(1, options.pixelScale * 0.35);
      context.beginPath();
      context.ellipse(
        endX,
        endY + 2 * pixel,
        4 * pixel * ripple,
        1.35 * pixel * ripple,
        0,
        0,
        Math.PI * 2,
      );
      context.stroke();
      context.globalAlpha = 1;
    }
    context.fillStyle = '#180d1d';
    context.fillRect(endX - pixel, endY - 3 * pixel, 2 * pixel, 5 * pixel);
    context.fillStyle = '#f5e6ca';
    context.fillRect(endX, endY - 2 * pixel, pixel, 2 * pixel);
    context.fillStyle = '#e83b45';
    context.fillRect(endX - pixel, endY, 2 * pixel, 2 * pixel);
  }
  context.restore();
}

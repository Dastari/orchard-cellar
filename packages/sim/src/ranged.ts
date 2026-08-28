import { FIXED_UNITS_PER_PIXEL, TILE_SIZE_FIXED, type CollisionMap, type Direction } from './state.js';
import { PLAYER_HITBOX_FOOT_OFFSET } from './movement.js';
import { AUTHORITY_HZ } from './net-timing.js';

export const BOW_MIN_CHARGE_MS = 120;
export const BOW_MAX_CHARGE_MS = 1_000;
export const BOW_MIN_VIGOUR_COST_CENTI = 100;
export const BOW_MAX_VIGOUR_COST_CENTI = 3_000;
export const BOW_AIM_SCALE = 1_000;
export const BOW_MIN_TARGET_RANGE_PIXELS = 16;
export const BOW_MAX_TARGET_RANGE_PIXELS = 240;
export const BOW_PROJECTILE_MAX_SPEED_PIXELS_PER_TICK = 10;
export const RECOVERABLE_ARROW_SECONDS = 30;
export const RECOVERABLE_ARROW_LIFETIME_TICKS = RECOVERABLE_ARROW_SECONDS * AUTHORITY_HZ;
export const BOW_ORIGIN_HEIGHT_PIXELS = 16;
export const MOUNTED_BOW_ORIGIN_HEIGHT_PIXELS = 26;
export const BOW_MUZZLE_OFFSET_PIXELS = 8;
export const BOW_MAX_PROJECTILE_FLIGHT_TICKS = Math.ceil(
  (BOW_MAX_TARGET_RANGE_PIXELS - BOW_MUZZLE_OFFSET_PIXELS) / BOW_PROJECTILE_MAX_SPEED_PIXELS_PER_TICK,
);
export const BOW_ARC_MIN_APEX_PIXELS = 8;
export const BOW_ARC_MAX_APEX_PIXELS = 36;
/** The authored east/west bow shaft sits three pixels below the generic
 * standing action origin. Keep that art-specific correction in the shared
 * origin helper so authority, the aim guide, and projectile rendering agree. */
export const BOW_SIDE_ORIGIN_DROP_PIXELS = 3;

export interface BowShot {
  readonly velocityX: number;
  readonly velocityY: number;
  readonly lifetimeTicks: number;
  readonly rangeFraction: number;
}

export interface ProjectilePoint {
  readonly x: number;
  readonly y: number;
}

export interface ProjectileArcPresentation {
  readonly point: ProjectilePoint;
  readonly velocity: ProjectilePoint;
  readonly liftPixels: number;
}

const PLAYER_TERRAIN_CONTACT_OFFSET_PIXELS = PLAYER_HITBOX_FOOT_OFFSET / FIXED_UNITS_PER_PIXEL + 1;

export interface ProjectileTarget {
  readonly kind: string;
  readonly id: string;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface ProjectileHit {
  readonly kind: string;
  readonly id: string;
  readonly fraction: number;
  readonly x: number;
  readonly y: number;
}

export function bowOriginHeightPixels(mounted: boolean): number {
  return mounted ? MOUNTED_BOW_ORIGIN_HEIGHT_PIXELS : BOW_ORIGIN_HEIGHT_PIXELS;
}

function bowSideOriginDropPixels(aim: Readonly<{ x: number; y: number }>): number {
  const facing = directionFromAim(aim.x, aim.y);
  return facing === 'left' || facing === 'right' ? BOW_SIDE_ORIGIN_DROP_PIXELS : 0;
}

export function bowProjectileRenderLiftPixels(
  aim: Readonly<{ x: number; y: number }>,
  mounted: boolean,
): number {
  return bowOriginHeightPixels(mounted)
    - PLAYER_TERRAIN_CONTACT_OFFSET_PIXELS
    - bowSideOriginDropPixels(aim);
}

/** Starts the authoritative projectile on the ground-plane path beneath the
 * visual bow. Collision and chunk membership must never use the raised sprite
 * coordinate or horizontal arrows pass above same-level actor hitboxes. */
export function bowProjectileOrigin(
  player: ProjectilePoint,
  aim: Readonly<{ x: number; y: number }>,
  mounted: boolean,
): ProjectilePoint {
  void mounted;
  const targetOrigin = bowProjectileTargetOrigin(player);
  return {
    x: targetOrigin.x + Math.round(aim.x * BOW_MUZZLE_OFFSET_PIXELS * FIXED_UNITS_PER_PIXEL),
    y: targetOrigin.y + Math.round(aim.y * BOW_MUZZLE_OFFSET_PIXELS * FIXED_UNITS_PER_PIXEL),
  };
}

/** Range is measured from this collision-plane point. Since the shot starts
 * one muzzle offset farther along the same ray, subtracting that offset from
 * travel makes the final physical point coincide with the selected cursor. */
export function bowProjectileTargetOrigin(player: ProjectilePoint): ProjectilePoint {
  return {
    x: player.x,
    y: player.y - PLAYER_TERRAIN_CONTACT_OFFSET_PIXELS * FIXED_UNITS_PER_PIXEL,
  };
}

/** Converts a ground-plane projectile point to the authored arrow-sprite
 * anchor. The east/west action frame has its shaft three pixels lower. */
export function bowProjectileRenderPoint(
  projectile: ProjectilePoint,
  aim: Readonly<{ x: number; y: number }>,
  mounted: boolean,
): ProjectilePoint {
  const liftPixels = bowProjectileRenderLiftPixels(aim, mounted);
  return {
    x: projectile.x,
    y: projectile.y - liftPixels * FIXED_UNITS_PER_PIXEL,
  };
}

export function bowProjectileRangePixels(
  velocity: Readonly<{ x: number; y: number }>,
  flightTicks: number,
): number {
  return Math.hypot(velocity.x, velocity.y) / FIXED_UNITS_PER_PIXEL
    * Math.max(1, flightTicks);
}

export function bowProjectileArcApexPixels(rangePixels: number): number {
  return Math.max(
    BOW_ARC_MIN_APEX_PIXELS,
    Math.min(BOW_ARC_MAX_APEX_PIXELS, rangePixels / 6),
  );
}

/** Shared visual trajectory for the tracer, local prediction, and confirmed
 * projectile. Authority continues to sweep the ground-plane `point`; this
 * function only raises the rendered point and rotates it along the parabola. */
export function bowProjectileArcPresentation(
  point: ProjectilePoint,
  velocity: ProjectilePoint,
  mounted: boolean,
  progress: number,
  flightTicks: number,
): ProjectileArcPresentation {
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const aim = normalizedBowAim(velocity.x, velocity.y) ?? { x: 1, y: 0 };
  const startLift = bowProjectileRenderLiftPixels(aim, mounted);
  const rangePixels = bowProjectileRangePixels(velocity, flightTicks);
  const apex = bowProjectileArcApexPixels(rangePixels);
  const liftPixels = startLift * (1 - clampedProgress)
    + 4 * apex * clampedProgress * (1 - clampedProgress);
  const liftDerivativePerProgress = -startLift + 4 * apex * (1 - 2 * clampedProgress);
  const liftVelocityPerTick = liftDerivativePerProgress / Math.max(1, flightTicks);
  return {
    point: {
      x: point.x,
      y: point.y - liftPixels * FIXED_UNITS_PER_PIXEL,
    },
    velocity: {
      x: velocity.x,
      y: velocity.y - liftVelocityPerTick * FIXED_UNITS_PER_PIXEL,
    },
    liftPixels,
  };
}

export function bowChargeFraction(chargeMs: number): number {
  if (!Number.isFinite(chargeMs)) return 0;
  return Math.max(0, Math.min(1, chargeMs / BOW_MAX_CHARGE_MS));
}

/** Charge owns the maximum selectable distance. The cursor may still select a
 * nearer landing point, but it cannot extend the tracer beyond the drawn bow. */
export function bowChargedRangePixels(
  chargeMs: number,
  maximumRangePixels = BOW_MAX_TARGET_RANGE_PIXELS,
): number {
  const maximum = Math.max(BOW_MIN_TARGET_RANGE_PIXELS, maximumRangePixels);
  return BOW_MIN_TARGET_RANGE_PIXELS
    + (maximum - BOW_MIN_TARGET_RANGE_PIXELS) * bowChargeFraction(chargeMs);
}

/** Portion of the cursor-directed maximum-range tracer that is currently
 * reachable. The tracer itself stays fixed on the cursor while this fraction
 * grows, allowing presentation to recolor charged dots without moving them. */
export function bowChargeTracerFraction(
  chargeMs: number,
  targetDistancePixels: number,
  maximumRangePixels = BOW_MAX_TARGET_RANGE_PIXELS,
): number {
  const maximum = Math.max(BOW_MIN_TARGET_RANGE_PIXELS, maximumRangePixels);
  const targetDistance = Math.max(
    BOW_MIN_TARGET_RANGE_PIXELS,
    Math.min(maximum, targetDistancePixels),
  );
  return Math.min(1, bowChargedRangePixels(chargeMs, maximum) / targetDistance);
}

/** Base charge cost before the normal toolVigourCost modifier pipeline. A tap
 * has a one-point floor; a one-second full draw costs 30 displayed Vigour. */
export function bowChargeVigourCostCenti(
  chargeMs: number,
  maximumCostCenti = BOW_MAX_VIGOUR_COST_CENTI,
): number {
  const maximum = Math.max(BOW_MIN_VIGOUR_COST_CENTI, Math.floor(maximumCostCenti));
  return Math.max(
    BOW_MIN_VIGOUR_COST_CENTI,
    Math.ceil(maximum * bowChargeFraction(chargeMs)),
  );
}

/** Scales already-resolved bow damage by the same base draw fraction used for
 * Vigour pricing. A tap therefore deals only 1/30 of a full draw instead of
 * granting full damage for the one-Vigour floor. Keep a single centi-point so
 * every valid hit remains observable by authority and combat feedback. */
export function bowChargeScaledDamageCenti(
  resolvedDamageCenti: number,
  chargeMs: number,
): number {
  const damage = Number.isFinite(resolvedDamageCenti)
    ? Math.max(0, Math.floor(resolvedDamageCenti))
    : 0;
  if (damage === 0) return 0;
  const chargeCost = bowChargeVigourCostCenti(chargeMs);
  return Math.max(1, Math.floor(damage * chargeCost / BOW_MAX_VIGOUR_COST_CENTI));
}

/** Client presentation caps charge where the current authoritative Vigour
 * snapshot would be exhausted. The server independently timestamps and prices
 * the release, so this is UX rather than authority. */
export function bowAffordableChargeMs(
  availableVigourCenti: number,
  maximumCostCenti = BOW_MAX_VIGOUR_COST_CENTI,
): number {
  if (!Number.isFinite(availableVigourCenti) || availableVigourCenti < BOW_MIN_VIGOUR_COST_CENTI) return 0;
  const maximum = Math.max(BOW_MIN_VIGOUR_COST_CENTI, Math.floor(maximumCostCenti));
  return Math.min(BOW_MAX_CHARGE_MS, Math.floor(availableVigourCenti * BOW_MAX_CHARGE_MS / maximum));
}

/** The purchased six-frame ranged sequence is draw followed by release. While
 * the button is held, advance only through the draw half and clamp on its final
 * pose; mouse-up is responsible for playing the release half. */
export function bowHeldAnimationFrame(chargeMs: number, animationFrames: number): number {
  const totalFrames = Math.max(1, Math.floor(animationFrames));
  const drawFrames = Math.max(1, Math.ceil(totalFrames / 2));
  return Math.min(drawFrames - 1, Math.floor(bowChargeFraction(chargeMs) * drawFrames));
}

/** Converts a cursor delta into the same eight-way facing vocabulary used by movement. */
export function directionFromAim(dx: number, dy: number): Direction | null {
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return null;
  const angle = Math.atan2(dy, dx);
  const octant = Math.round(angle / (Math.PI / 4));
  switch ((octant + 8) % 8) {
    case 0: return 'right';
    case 1: return 'downRight';
    case 2: return 'down';
    case 3: return 'downLeft';
    case 4: return 'left';
    case 5: return 'upLeft';
    case 6: return 'up';
    default: return 'upRight';
  }
}

export function normalizedBowAim(dx: number, dy: number): { readonly x: number; readonly y: number } | null {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  const length = Math.hypot(dx, dy);
  if (length < 0.001) return null;
  return { x: dx / length, y: dy / length };
}

/** Encodes a cursor-selected destination into the existing signed aim vector.
 * Its magnitude is the requested fraction of the player's resolved max range;
 * authority clamps it again before constructing the shot. */
export function encodedBowTargetAim(
  dx: number,
  dy: number,
  maximumRangePixels = BOW_MAX_TARGET_RANGE_PIXELS,
): { readonly x: number; readonly y: number } | null {
  const aim = normalizedBowAim(dx, dy);
  if (aim === null) return null;
  const cursorDistance = Math.hypot(dx, dy);
  const safeMaximum = Math.max(BOW_MIN_TARGET_RANGE_PIXELS, maximumRangePixels);
  const targetDistance = Math.max(
    BOW_MIN_TARGET_RANGE_PIXELS,
    Math.min(safeMaximum, cursorDistance),
  );
  const encodedLength = targetDistance / safeMaximum * BOW_AIM_SCALE;
  return {
    x: Math.round(aim.x * encodedLength),
    y: Math.round(aim.y * encodedLength),
  };
}

/** Builds the authoritative path to a cursor-selected destination. Callers
 * pass the charge-resolved maximum; encoded magnitude may select anywhere up
 * to that server-owned budget. */
export function bowShotForTarget(
  encodedX: number,
  encodedY: number,
  maximumRangePixels = BOW_MAX_TARGET_RANGE_PIXELS,
): BowShot | null {
  const aim = normalizedBowAim(encodedX, encodedY);
  if (aim === null) return null;
  const safeMaximum = Math.max(BOW_MIN_TARGET_RANGE_PIXELS, maximumRangePixels);
  const rangeFraction = Math.max(0, Math.min(
    1,
    Math.hypot(encodedX, encodedY) / BOW_AIM_SCALE,
  ));
  const targetDistance = Math.max(BOW_MIN_TARGET_RANGE_PIXELS, safeMaximum * rangeFraction);
  const travelPixels = Math.max(1, targetDistance - BOW_MUZZLE_OFFSET_PIXELS);
  const lifetimeTicks = Math.max(
    2,
    Math.ceil(travelPixels / BOW_PROJECTILE_MAX_SPEED_PIXELS_PER_TICK),
  );
  const speed = travelPixels / lifetimeTicks * FIXED_UNITS_PER_PIXEL;
  return {
    velocityX: Math.round(aim.x * speed),
    velocityY: Math.round(aim.y * speed),
    lifetimeTicks,
    rangeFraction,
  };
}

/** Non-durable arrows use the otherwise-zero world-item durability field to
 * retain their landing angle. Values 1..360 identify projectile-landed arrows;
 * inventory insertion normalizes the value back to zero. */
export function recoverableArrowAngle(
  velocityX: number,
  velocityY: number,
): number {
  if (!Number.isFinite(velocityX) || !Number.isFinite(velocityY)) return 1;
  const speed = Math.hypot(velocityX, velocityY);
  if (speed < 0.001) return 1;
  const landingAngle = Math.atan2(velocityY + speed * 0.75, velocityX);
  const degrees = Math.round((landingAngle * 180 / Math.PI + 360) % 360) % 360;
  return degrees + 1;
}

export function recoverableArrowDirection(
  encodedAngle: number,
): ProjectilePoint | null {
  if (!Number.isInteger(encodedAngle) || encodedAngle < 1 || encodedAngle > 360) return null;
  const radians = (encodedAngle - 1) * Math.PI / 180;
  return { x: Math.cos(radians), y: Math.sin(radians) };
}

export function isRecoverableArrow(itemKind: string, durability: number): boolean {
  return itemKind === 'arrow' && recoverableArrowDirection(durability) !== null;
}

function segmentAabbFraction(
  from: ProjectilePoint,
  to: ProjectilePoint,
  target: Pick<ProjectileTarget, 'left' | 'top' | 'right' | 'bottom'>,
): number | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let entry = 0;
  let exit = 1;
  for (const [origin, delta, minimum, maximum] of [
    [from.x, dx, target.left, target.right],
    [from.y, dy, target.top, target.bottom],
  ] as const) {
    if (delta === 0) {
      if (origin < minimum || origin > maximum) return null;
      continue;
    }
    const first = (minimum - origin) / delta;
    const second = (maximum - origin) / delta;
    entry = Math.max(entry, Math.min(first, second));
    exit = Math.min(exit, Math.max(first, second));
    if (entry > exit) return null;
  }
  return entry >= 0 && entry <= 1 ? entry : null;
}

export function firstProjectileTargetHit(
  from: ProjectilePoint,
  to: ProjectilePoint,
  targets: readonly ProjectileTarget[],
): ProjectileHit | null {
  let nearest: ProjectileHit | null = null;
  for (const target of targets) {
    const fraction = segmentAabbFraction(from, to, target);
    if (fraction === null || (nearest !== null && fraction >= nearest.fraction)) continue;
    nearest = {
      kind: target.kind,
      id: target.id,
      fraction,
      x: Math.round(from.x + (to.x - from.x) * fraction),
      y: Math.round(from.y + (to.y - from.y) * fraction),
    };
  }
  return nearest;
}

/** An arcing arrow damages an entity only where it lands. This keeps the
 * selected cursor point as both the visual resting point and authoritative
 * hit point instead of embedding at the first edge crossed by its ground ray. */
export function projectileTargetAtLanding(
  landing: ProjectilePoint,
  targets: readonly ProjectileTarget[],
): ProjectileHit | null {
  const target = targets.find((candidate) => landing.x >= candidate.left
    && landing.x <= candidate.right
    && landing.y >= candidate.top
    && landing.y <= candidate.bottom);
  return target === undefined ? null : {
    kind: target.kind,
    id: target.id,
    fraction: 1,
    x: landing.x,
    y: landing.y,
  };
}

/** Finds the first blocked terrain cell crossed by a point projectile. */
export function firstProjectileTerrainHit(
  from: ProjectilePoint,
  to: ProjectilePoint,
  collision: CollisionMap,
): ProjectileHit | null {
  const distance = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  const steps = Math.max(1, Math.ceil(distance / FIXED_UNITS_PER_PIXEL));
  for (let step = 1; step <= steps; step += 1) {
    const fraction = step / steps;
    const x = Math.round(from.x + (to.x - from.x) * fraction);
    const y = Math.round(from.y + (to.y - from.y) * fraction);
    const tileX = Math.floor(x / TILE_SIZE_FIXED);
    const tileY = Math.floor(y / TILE_SIZE_FIXED);
    const blocked = tileX < 0 || tileY < 0 || tileX >= collision.width || tileY >= collision.height
      || collision.blocked[tileY * collision.width + tileX] === true;
    if (blocked) return { kind: 'terrain', id: `${tileX}:${tileY}`, fraction, x, y };
  }
  return null;
}

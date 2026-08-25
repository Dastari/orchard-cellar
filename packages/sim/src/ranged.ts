import { FIXED_UNITS_PER_PIXEL, TILE_SIZE_FIXED, type CollisionMap, type Direction } from './state.js';

export const BOW_MIN_CHARGE_MS = 120;
export const BOW_MAX_CHARGE_MS = 1_000;
export const BOW_AIM_SCALE = 1_000;
export const BOW_ORIGIN_HEIGHT_PIXELS = 16;
export const MOUNTED_BOW_ORIGIN_HEIGHT_PIXELS = 26;
export const BOW_MUZZLE_OFFSET_PIXELS = 8;

export interface BowShot {
  readonly velocityX: number;
  readonly velocityY: number;
  readonly lifetimeTicks: number;
  readonly charge: number;
}

export interface ProjectilePoint {
  readonly x: number;
  readonly y: number;
}

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

/** Places the projectile at the visual bow rather than at the player's
 * foot-point collision anchor. */
export function bowProjectileOrigin(
  player: ProjectilePoint,
  aim: Readonly<{ x: number; y: number }>,
  mounted: boolean,
): ProjectilePoint {
  return {
    x: player.x + Math.round(aim.x * BOW_MUZZLE_OFFSET_PIXELS * FIXED_UNITS_PER_PIXEL),
    y: player.y - bowOriginHeightPixels(mounted) * FIXED_UNITS_PER_PIXEL
      + Math.round(aim.y * BOW_MUZZLE_OFFSET_PIXELS * FIXED_UNITS_PER_PIXEL),
  };
}

export function bowChargeFraction(chargeMs: number): number {
  if (!Number.isFinite(chargeMs)) return 0;
  return Math.max(0, Math.min(1, (chargeMs - BOW_MIN_CHARGE_MS) / (BOW_MAX_CHARGE_MS - BOW_MIN_CHARGE_MS)));
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

/** Charge controls both arrow speed and lifetime, making a held shot travel materially farther. */
export function bowShotForCharge(dx: number, dy: number, chargeMs: number): BowShot | null {
  const aim = normalizedBowAim(dx, dy);
  if (aim === null) return null;
  const charge = bowChargeFraction(chargeMs);
  const speed = (4 + charge * 6) * FIXED_UNITS_PER_PIXEL;
  return {
    velocityX: Math.round(aim.x * speed),
    velocityY: Math.round(aim.y * speed),
    lifetimeTicks: Math.round(8 + charge * 16),
    charge,
  };
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

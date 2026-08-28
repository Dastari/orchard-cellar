import { describe, expect, it } from 'vitest';
import { FIXED_UNITS_PER_PIXEL } from './state.js';
import { playerHitboxBounds } from './movement.js';
import {
  BOW_MAX_CHARGE_MS,
  BOW_MAX_TARGET_RANGE_PIXELS,
  BOW_MAX_VIGOUR_COST_CENTI,
  BOW_MIN_CHARGE_MS,
  BOW_MIN_TARGET_RANGE_PIXELS,
  BOW_MUZZLE_OFFSET_PIXELS,
  BOW_ORIGIN_HEIGHT_PIXELS,
  BOW_SIDE_ORIGIN_DROP_PIXELS,
  MOUNTED_BOW_ORIGIN_HEIGHT_PIXELS,
  bowAffordableChargeMs,
  bowChargedRangePixels,
  bowChargeFraction,
  bowChargeTracerFraction,
  bowChargeVigourCostCenti,
  bowChargeScaledDamageCenti,
  bowHeldAnimationFrame,
  bowProjectileArcPresentation,
  bowProjectileOrigin,
  bowProjectileRangePixels,
  bowProjectileRenderPoint,
  bowProjectileTargetOrigin,
  bowShotForTarget,
  directionFromAim,
  encodedBowTargetAim,
  firstProjectileTargetHit,
  firstProjectileTerrainHit,
  isRecoverableArrow,
  recoverableArrowAngle,
  recoverableArrowDirection,
  projectileTargetAtLanding,
} from './ranged.js';

describe('ranged combat helpers', () => {
  it('maps cursor vectors to eight-way character facings', () => {
    expect(directionFromAim(10, 0)).toBe('right');
    expect(directionFromAim(-10, -10)).toBe('upLeft');
    expect(directionFromAim(0, 10)).toBe('down');
    expect(directionFromAim(0, 0)).toBeNull();
  });

  it('uses charge for the range budget while the cursor may select a nearer point', () => {
    expect(bowChargeFraction(0)).toBe(0);
    expect(bowChargeFraction(BOW_MAX_CHARGE_MS)).toBe(1);
    const halfRange = bowChargedRangePixels(BOW_MAX_CHARGE_MS / 2);
    expect(halfRange).toBe((BOW_MIN_TARGET_RANGE_PIXELS + BOW_MAX_TARGET_RANGE_PIXELS) / 2);
    const nearAim = encodedBowTargetAim(32, 0, halfRange)!;
    const farAim = encodedBowTargetAim(9_999, 0, halfRange)!;
    const near = bowShotForTarget(nearAim.x, nearAim.y, halfRange)!;
    const far = bowShotForTarget(farAim.x, farAim.y, halfRange)!;
    expect(near.lifetimeTicks).toBeLessThan(far.lifetimeTicks);
    expect(near.velocityY).toBe(0);
    expect(bowProjectileRangePixels(
      { x: near.velocityX, y: near.velocityY }, near.lifetimeTicks,
    ) + BOW_MUZZLE_OFFSET_PIXELS)
      .toBeCloseTo(32, 0);
    expect(bowProjectileRangePixels(
      { x: far.velocityX, y: far.velocityY }, far.lifetimeTicks,
    ) + BOW_MUZZLE_OFFSET_PIXELS)
      .toBeLessThanOrEqual(halfRange + 1);
    expect(Math.hypot(farAim.x, farAim.y)).toBeLessThanOrEqual(1_000);
  });

  it('prices charge from one to thirty Vigour and caps presentation at available Vigour', () => {
    expect(bowChargeVigourCostCenti(0)).toBe(100);
    expect(bowChargeVigourCostCenti(BOW_MAX_CHARGE_MS / 2)).toBe(1_500);
    expect(bowChargeVigourCostCenti(BOW_MAX_CHARGE_MS)).toBe(BOW_MAX_VIGOUR_COST_CENTI);
    expect(bowAffordableChargeMs(1_500)).toBe(500);
    expect(bowAffordableChargeMs(50)).toBe(0);
  });

  it('scales resolved arrow damage by authoritative charge', () => {
    expect(bowChargeScaledDamageCenti(1_400, 0)).toBe(46);
    expect(bowChargeScaledDamageCenti(1_400, BOW_MAX_CHARGE_MS / 2)).toBe(700);
    expect(bowChargeScaledDamageCenti(1_400, BOW_MAX_CHARGE_MS)).toBe(1_400);
  });

  it('keeps the cursor tracer fixed while charge fills only its reachable portion', () => {
    expect(bowChargeTracerFraction(0, BOW_MAX_TARGET_RANGE_PIXELS))
      .toBeCloseTo(BOW_MIN_TARGET_RANGE_PIXELS / BOW_MAX_TARGET_RANGE_PIXELS);
    expect(bowChargeTracerFraction(BOW_MAX_CHARGE_MS / 2, BOW_MAX_TARGET_RANGE_PIXELS))
      .toBeCloseTo(bowChargedRangePixels(BOW_MAX_CHARGE_MS / 2) / BOW_MAX_TARGET_RANGE_PIXELS);
    expect(bowChargeTracerFraction(BOW_MAX_CHARGE_MS / 2, 64)).toBe(1);
    expect(bowChargeTracerFraction(BOW_MAX_CHARGE_MS, BOW_MAX_TARGET_RANGE_PIXELS)).toBe(1);
  });

  it('clamps cursor-selected targets to the minimum and resolved maximum', () => {
    const closeAim = encodedBowTargetAim(1, 0)!;
    const close = bowShotForTarget(closeAim.x, closeAim.y)!;
    expect(bowProjectileRangePixels(
      { x: close.velocityX, y: close.velocityY }, close.lifetimeTicks,
    ) + BOW_MUZZLE_OFFSET_PIXELS)
      .toBeCloseTo(BOW_MIN_TARGET_RANGE_PIXELS, 0);
    const limitedAim = encodedBowTargetAim(500, 0, 80)!;
    const limited = bowShotForTarget(limitedAim.x, limitedAim.y, 80)!;
    expect(bowProjectileRangePixels(
      { x: limited.velocityX, y: limited.velocityY }, limited.lifetimeTicks,
    ) + BOW_MUZZLE_OFFSET_PIXELS)
      .toBeCloseTo(80, 0);
  });

  it('lands at the cursor-selected collision-plane point', () => {
    const player = { x: 100 * FIXED_UNITS_PER_PIXEL, y: 100 * FIXED_UNITS_PER_PIXEL };
    const targetOrigin = bowProjectileTargetOrigin(player);
    const target = { x: targetOrigin.x + 120 * FIXED_UNITS_PER_PIXEL, y: targetOrigin.y };
    const encoded = encodedBowTargetAim(
      (target.x - targetOrigin.x) / FIXED_UNITS_PER_PIXEL,
      (target.y - targetOrigin.y) / FIXED_UNITS_PER_PIXEL,
    )!;
    const aimLength = Math.hypot(encoded.x, encoded.y);
    const aim = { x: encoded.x / aimLength, y: encoded.y / aimLength };
    const origin = bowProjectileOrigin(player, aim, false);
    const shot = bowShotForTarget(encoded.x, encoded.y)!;
    expect(origin.x + shot.velocityX * shot.lifetimeTicks).toBeCloseTo(target.x, -1);
    expect(origin.y + shot.velocityY * shot.lifetimeTicks).toBeCloseTo(target.y, -1);
  });

  it('holds on the final draw frame instead of entering the release frames', () => {
    expect(bowHeldAnimationFrame(BOW_MIN_CHARGE_MS, 6)).toBe(0);
    expect(bowHeldAnimationFrame(BOW_MAX_CHARGE_MS, 6)).toBe(2);
    expect(bowHeldAnimationFrame(BOW_MAX_CHARGE_MS * 10, 6)).toBe(2);
    expect(bowHeldAnimationFrame(BOW_MAX_CHARGE_MS, 1)).toBe(0);
  });

  it('keeps arrow authority on the collision plane and renders it at the authored bow shaft', () => {
    const player = { x: 100 * FIXED_UNITS_PER_PIXEL, y: 100 * FIXED_UNITS_PER_PIXEL };
    const east = bowProjectileOrigin(player, { x: 1, y: 0 }, false);
    expect(east).toEqual({
      x: 108 * FIXED_UNITS_PER_PIXEL,
      y: 93 * FIXED_UNITS_PER_PIXEL,
    });
    expect(bowProjectileRenderPoint(east, { x: 1, y: 0 }, false)).toEqual({
      x: 108 * FIXED_UNITS_PER_PIXEL,
      y: (100 - BOW_ORIGIN_HEIGHT_PIXELS + BOW_SIDE_ORIGIN_DROP_PIXELS) * FIXED_UNITS_PER_PIXEL,
    });
    const west = bowProjectileOrigin(player, { x: -1, y: 0 }, false);
    expect(west).toEqual({
      x: 92 * FIXED_UNITS_PER_PIXEL,
      y: 93 * FIXED_UNITS_PER_PIXEL,
    });
    expect(bowProjectileRenderPoint(west, { x: -1, y: 0 }, false)).toEqual({
      x: 92 * FIXED_UNITS_PER_PIXEL,
      y: (100 - BOW_ORIGIN_HEIGHT_PIXELS + BOW_SIDE_ORIGIN_DROP_PIXELS) * FIXED_UNITS_PER_PIXEL,
    });
    const mountedUp = bowProjectileOrigin(player, { x: 0, y: -1 }, true);
    expect(mountedUp).toEqual({
      x: 100 * FIXED_UNITS_PER_PIXEL,
      y: 85 * FIXED_UNITS_PER_PIXEL,
    });
    expect(bowProjectileRenderPoint(mountedUp, { x: 0, y: -1 }, true)).toEqual({
      x: 100 * FIXED_UNITS_PER_PIXEL,
      y: (100 - MOUNTED_BOW_ORIGIN_HEIGHT_PIXELS - 8) * FIXED_UNITS_PER_PIXEL,
    });
  });

  it('selects the nearest entity crossed by a fast arrow', () => {
    expect(firstProjectileTargetHit({ x: 0, y: 0 }, { x: 100, y: 0 }, [
      { kind: 'npc', id: 'far', left: 70, right: 80, top: -5, bottom: 5 },
      { kind: 'player', id: 'near', left: 20, right: 30, top: -5, bottom: 5 },
    ])).toMatchObject({ kind: 'player', id: 'near', x: 20, y: 0 });
  });

  it('hits an arched-shot target only at the selected landing point', () => {
    const targets = [{
      kind: 'combat_target', id: 'target', left: 40, right: 60, top: 20, bottom: 80,
    }];
    expect(projectileTargetAtLanding({ x: 30, y: 50 }, targets)).toBeNull();
    expect(projectileTargetAtLanding({ x: 50, y: 35 }, targets)).toEqual({
      kind: 'combat_target', id: 'target', fraction: 1, x: 50, y: 35,
    });
  });

  it('keeps a horizontal shot on the same-level player collision plane', () => {
    const shooter = { x: 100 * FIXED_UNITS_PER_PIXEL, y: 100 * FIXED_UNITS_PER_PIXEL };
    const target = { x: 130 * FIXED_UNITS_PER_PIXEL, y: 100 * FIXED_UNITS_PER_PIXEL };
    const from = bowProjectileOrigin(shooter, { x: 1, y: 0 }, false);
    const hit = firstProjectileTargetHit(from, {
      x: from.x + 40 * FIXED_UNITS_PER_PIXEL,
      y: from.y,
    }, [{ kind: 'player', id: 'target', ...playerHitboxBounds(target) }]);
    expect(hit).toMatchObject({ kind: 'player', id: 'target' });
  });

  it('draws one parabola from the bow shaft to the ground and rotates along its tangent', () => {
    const velocity = { x: 4 * FIXED_UNITS_PER_PIXEL, y: 0 };
    expect(bowProjectileRangePixels(velocity, 8)).toBe(32);

    const point = { x: 100 * FIXED_UNITS_PER_PIXEL, y: 100 * FIXED_UNITS_PER_PIXEL };
    const launch = bowProjectileArcPresentation(point, velocity, false, 0, 8);
    const apex = bowProjectileArcPresentation(point, velocity, false, 0.5, 8);
    const landing = bowProjectileArcPresentation(point, velocity, false, 1, 8);
    expect(launch.liftPixels).toBe(BOW_ORIGIN_HEIGHT_PIXELS - 7 - BOW_SIDE_ORIGIN_DROP_PIXELS);
    expect(apex.liftPixels).toBeGreaterThan(launch.liftPixels);
    expect(landing.liftPixels).toBe(0);
    expect(launch.velocity.y).toBeLessThan(0);
    expect(landing.velocity.y).toBeGreaterThan(0);
  });

  it('encodes landed-arrow direction and distinguishes it from ordinary drops', () => {
    const encoded = recoverableArrowAngle(-10, 0);
    const direction = recoverableArrowDirection(encoded);
    expect(direction).not.toBeNull();
    expect(direction!.x).toBeLessThan(0);
    expect(direction!.y).toBeGreaterThan(0);
    expect(isRecoverableArrow('arrow', encoded)).toBe(true);
    expect(isRecoverableArrow('arrow', 0)).toBe(false);
    expect(isRecoverableArrow('bow', encoded)).toBe(false);
  });

  it('detects blocked terrain crossed between authority ticks', () => {
    const blocked = Array.from({ length: 9 }, () => false);
    blocked[4] = true;
    expect(firstProjectileTerrainHit(
      { x: 0, y: 24 * 16 },
      { x: 48 * 16, y: 24 * 16 },
      { width: 3, height: 3, blocked },
    )).toMatchObject({ kind: 'terrain', id: '1:1' });
  });
});

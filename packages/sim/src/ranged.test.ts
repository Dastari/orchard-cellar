import { describe, expect, it } from 'vitest';
import { FIXED_UNITS_PER_PIXEL } from './state.js';
import {
  BOW_MAX_CHARGE_MS,
  BOW_MIN_CHARGE_MS,
  BOW_ORIGIN_HEIGHT_PIXELS,
  MOUNTED_BOW_ORIGIN_HEIGHT_PIXELS,
  bowChargeFraction,
  bowHeldAnimationFrame,
  bowProjectileOrigin,
  bowShotForCharge,
  directionFromAim,
  firstProjectileTargetHit,
  firstProjectileTerrainHit,
} from './ranged.js';

describe('ranged combat helpers', () => {
  it('maps cursor vectors to eight-way character facings', () => {
    expect(directionFromAim(10, 0)).toBe('right');
    expect(directionFromAim(-10, -10)).toBe('upLeft');
    expect(directionFromAim(0, 10)).toBe('down');
    expect(directionFromAim(0, 0)).toBeNull();
  });

  it('makes a fully charged arrow faster and longer-ranged', () => {
    expect(bowChargeFraction(BOW_MIN_CHARGE_MS)).toBe(0);
    expect(bowChargeFraction(BOW_MAX_CHARGE_MS)).toBe(1);
    const tap = bowShotForCharge(1, 0, BOW_MIN_CHARGE_MS)!;
    const held = bowShotForCharge(1, 0, BOW_MAX_CHARGE_MS)!;
    expect(held.velocityX).toBeGreaterThan(tap.velocityX);
    expect(held.lifetimeTicks).toBeGreaterThan(tap.lifetimeTicks);
    expect(held.velocityY).toBe(0);
  });

  it('holds on the final draw frame instead of entering the release frames', () => {
    expect(bowHeldAnimationFrame(BOW_MIN_CHARGE_MS, 6)).toBe(0);
    expect(bowHeldAnimationFrame(BOW_MAX_CHARGE_MS, 6)).toBe(2);
    expect(bowHeldAnimationFrame(BOW_MAX_CHARGE_MS * 10, 6)).toBe(2);
    expect(bowHeldAnimationFrame(BOW_MAX_CHARGE_MS, 1)).toBe(0);
  });

  it('starts arrows at the character bow and raises that origin when mounted', () => {
    const player = { x: 100 * FIXED_UNITS_PER_PIXEL, y: 100 * FIXED_UNITS_PER_PIXEL };
    expect(bowProjectileOrigin(player, { x: 1, y: 0 }, false)).toEqual({
      x: 108 * FIXED_UNITS_PER_PIXEL,
      y: (100 - BOW_ORIGIN_HEIGHT_PIXELS) * FIXED_UNITS_PER_PIXEL,
    });
    expect(bowProjectileOrigin(player, { x: 0, y: -1 }, true)).toEqual({
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

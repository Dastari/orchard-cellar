import { describe, expect, it } from 'vitest';
import { CombatRegionPolicy, validateCombatRegions, type CombatRegion } from './combat-regions.js';

const volcano: CombatRegion = { id: 'volcano', spaceId: 0, minX: 600, minY: 40, maxX: 799, maxY: 239, policy: 'hostile' };
const dock: CombatRegion = { id: 'dock', spaceId: 0, minX: 610, minY: 200, maxX: 629, maxY: 219, policy: 'sanctuary', parentId: 'volcano' };
const point = (tileX: number, tileY: number, spaceId = 0) => ({ spaceId, tileX, tileY });

describe('authored combat region authority', () => {
  const policy = new CombatRegionPolicy([volcano, dock]);
  it('defaults home, town, unknown spaces and invalid coordinates to peaceful', () => {
    for (const p of [point(400, 400), point(120, 350), point(700, 100, 42), point(NaN, 100), point(Infinity, 100)]) {
      expect(policy.allowsHostileDamage(p)).toBe(false);
    }
    expect(policy.allowsHostileDamage(point(700, 100))).toBe(true);
  });
  it('protects dock arrivals regardless of definition order and rejects attacks out of safety', () => {
    expect(new CombatRegionPolicy([dock, volcano]).regionAt(point(620, 210))?.id).toBe('dock');
    expect(policy.allowsHostileSegment(point(620, 210), point(650, 210))).toBe(false);
    expect(policy.allowsHostileSegment(point(650, 210), point(620, 210))).toBe(false);
  });
  it('rejects projectiles crossing a sanctuary even when both endpoints are dangerous', () => {
    expect(policy.allowsHostileSegment(point(605, 210), point(650, 210))).toBe(false);
    expect(policy.allowsHostileSegment(point(605, 199), point(650, 199))).toBe(true);
    expect(policy.allowsHostileSegment(point(605, 220), point(650, 220))).toBe(false);
    expect(policy.allowsHostileSegment(point(650, 100), point(800, 100))).toBe(false);
  });
  it('rejects contradictory overlaps, missing parents and malformed bounds', () => {
    expect(validateCombatRegions([volcano, { id: 'unsafe-overlap', spaceId: 0, minX: 610, minY: 200, maxX: 629, maxY: 219, policy: 'sanctuary' }])).not.toEqual([]);
    expect(validateCombatRegions([volcano, { ...dock, parentId: 'missing' }])).not.toEqual([]);
    expect(validateCombatRegions([volcano, { ...volcano, id: 'other' }])).not.toEqual([]);
    expect(validateCombatRegions([{ ...volcano, minX: 800 }])).not.toEqual([]);
    expect(() => new CombatRegionPolicy([volcano, { ...dock, maxX: 900 }])).toThrow();
  });
  it('freezes the installed policy against later source mutations', () => {
    const mutable = { ...volcano };
    const installed = new CombatRegionPolicy([mutable]);
    mutable.minX = 0;
    expect(installed.allowsHostileDamage(point(1, 100))).toBe(false);
    expect(Object.isFrozen(installed.regionAt(point(700, 100)))).toBe(true);
  });
});

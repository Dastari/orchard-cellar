import { describe, expect, it } from 'vitest';
import { BOW_BASE_DAMAGE_CENTI } from './balance.js';
import { regeneratedCombatTargetHealth, resolveCombatDamage } from './combat.js';

describe('32§3 deterministic combat damage', () => {
  const damage = (seed: string) => resolveCombatDamage({
    attackKind: 'ranged',
    weaponBaseCenti: BOW_BASE_DAMAGE_CENTI,
    scalingAttribute: 10,
    armorCenti: 0,
    armorPctBasisPoints: 0,
    seedParts: [0x4f434852, 'archer', 42n, seed],
  });

  it('replays the same authoritative roll exactly', () => {
    expect(damage('same')).toEqual(damage('same'));
  });

  it('keeps variance in the binding 90–110% range and applies the one-damage floor', () => {
    for (let index = 0; index < 500; index += 1) {
      const result = damage(String(index));
      expect(result.variancePermille).toBeGreaterThanOrEqual(900);
      expect(result.variancePermille).toBeLessThanOrEqual(1_100);
    }
    expect(resolveCombatDamage({
      attackKind: 'melee', weaponBaseCenti: 0, scalingAttribute: 10,
      armorCenti: 99_999, armorPctBasisPoints: 9_000, seedParts: ['floor'],
    }).damageCenti).toBe(100);
  });

  it('applies flat and percentage armor after power, variance, and crit', () => {
    const unarmored = damage('armor-fixture');
    const armored = resolveCombatDamage({
      attackKind: 'ranged', weaponBaseCenti: BOW_BASE_DAMAGE_CENTI,
      scalingAttribute: 10, armorCenti: 200, armorPctBasisPoints: 2_000,
      seedParts: [0x4f434852, 'archer', 42n, 'armor-fixture'],
    });
    expect(armored.damageCenti).toBe(Math.max(100, Math.floor((unarmored.damageCenti - 200) * 0.8)));
  });
});

describe('combat target regeneration', () => {
  it('catches up lazily and clamps at maximum without per-tick state', () => {
    expect(regeneratedCombatTargetHealth(5_000, 10_000, 100, 10n, 30n, 20)).toBe(5_100);
    expect(regeneratedCombatTargetHealth(9_990, 10_000, 100, 0n, 20n, 20)).toBe(10_000);
  });
});

import { describe, expect, it } from 'vitest';
import { BASE_ATTRIBUTES, advanceVitals, checkModifier, createFullVitalState, resolveStats } from './stats.js';
import type { Modifier } from './modifiers.js';

describe('25§1 attributes and §2 derived vitals', () => {
  it('resolves the documented baseline and D&D check modifiers', () => {
    expect(resolveStats(BASE_ATTRIBUTES)).toEqual({
      attributes: BASE_ATTRIBUTES,
      maxHealthCenti: 10_000,
      maxManaCenti: 10_000,
      maxVigourCenti: 10_000,
      healthRegenCentiPerSecond: 20,
      manaRegenCentiPerSecond: 100,
      vigourRegenCentiPerSecond: 1_200,
    });
    expect([7, 8, 9, 10, 11, 12].map(checkModifier)).toEqual([-2, -1, -1, 0, 0, 1]);
  });

  it('resolves attributes before their dependent maxima and regen', () => {
    const modifiers: Modifier[] = [
      { id: 'tea', target: 'con', layer: 'flat', value: 2, source: 'effect' },
      { id: 'vital', target: 'maxVigour', layer: 'flat', value: 500, source: 'equipment' },
    ];
    const stats = resolveStats(BASE_ATTRIBUTES, modifiers);
    expect(stats.attributes.con).toBe(12);
    expect(stats.maxVigourCenti).toBe(12_500);
    expect(stats.vigourRegenCentiPerSecond).toBe(1_440);
  });

  it('makes one large lazy catch-up exactly equal step-by-step remainder carry', () => {
    const stats = resolveStats({ ...BASE_ATTRIBUTES, wis: 11 });
    const empty = {
      ...createFullVitalState(stats),
      healthCenti: 0,
      manaCenti: 0,
      vigourCenti: 0,
    };
    const once = advanceVitals(empty, stats, 20n);
    let stepped = empty;
    for (let tick = 1n; tick <= 20n; tick += 1n) stepped = advanceVitals(stepped, stats, tick);
    expect(stepped).toEqual(once);
    expect(once).toMatchObject({ healthCenti: 20, manaCenti: 110, vigourCenti: 1_200 });
  });

  it('does not regenerate vigour while an ability is actively consuming it', () => {
    const stats = resolveStats();
    const depleted = {
      ...createFullVitalState(stats),
      vigourCenti: 4_000,
    };
    const whileConsumingVigour = {
      ...stats,
      vigourRegenCentiPerSecond: 0,
    };

    expect(advanceVitals(depleted, whileConsumingVigour, 20n).vigourCenti).toBe(4_000);
  });

  it('clamps current values when a maximum drops and never banks regen at full', () => {
    const baseline = resolveStats();
    const reduced = resolveStats({ ...BASE_ATTRIBUTES, str: 5, int: 5, con: 5 });
    const full = createFullVitalState(baseline, 10n);
    const clamped = advanceVitals({
      ...full,
      healthRemainder: 19,
      manaRemainder: 19,
      vigourRemainder: 19,
    }, reduced, 1_000_000n);
    expect(clamped).toMatchObject({
      healthCenti: 5_000,
      manaCenti: 5_000,
      vigourCenti: 5_000,
      healthRemainder: 0,
      manaRemainder: 0,
      vigourRemainder: 0,
    });
  });

  it('preserves a fractional remainder across repeated reads in one authority tick', () => {
    const stats = resolveStats({ ...BASE_ATTRIBUTES, wis: 11 });
    const state = {
      ...createFullVitalState(stats, 5n),
      manaCenti: 0,
      manaRemainder: 13,
    };
    expect(advanceVitals(state, stats, 5n).manaRemainder).toBe(13);
  });
});

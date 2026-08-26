import { describe, expect, it } from 'vitest';
import { modifierDataWarnings, resolveModifierTarget, resolveModifierTargetDetailed, type Modifier } from './modifiers.js';

const modifier = (entry: Partial<Modifier> & Pick<Modifier, 'id' | 'layer' | 'value'>): Modifier => ({
  target: 'maxHealth',
  source: 'equipment',
  ...entry,
});

describe('25§3 modifier resolution', () => {
  it('resolves flat, summed additive percent, then id-sorted multiplicative percent', () => {
    const modifiers = [
      modifier({ id: 'flat', layer: 'flat', value: 1_000 }),
      modifier({ id: 'add-a', layer: 'pctAdd', value: 1_000 }),
      modifier({ id: 'add-b', layer: 'pctAdd', value: 500 }),
      modifier({ id: 'mult-b', layer: 'pctMult', value: 1_000 }),
      modifier({ id: 'mult-a', layer: 'pctMult', value: 2_000 }),
    ];
    expect(resolveModifierTarget('maxHealth', 10_000, modifiers)).toBe(16_698);
    expect(resolveModifierTarget('maxHealth', 10_000, [...modifiers].reverse())).toBe(16_698);
  });

  it('keeps the strongest absolute modifier within each target family', () => {
    const weaker = modifier({ id: 'family-a', layer: 'flat', value: 2_000, family: 'stance' });
    const stronger = modifier({ id: 'family-b', layer: 'flat', value: -3_000, family: 'stance' });
    const result = resolveModifierTargetDetailed('maxHealth', 10_000, [weaker, stronger]);
    expect(result.value).toBe(7_000);
    expect(result.applied).toContain(stronger);
    expect(result.excludedByFamily).toEqual([weaker]);
  });

  it('uses the highest surviving override and clamps hard-bounded targets', () => {
    expect(resolveModifierTarget('str', 10, [
      modifier({ id: 'low', target: 'str', layer: 'override', value: 18 }),
      modifier({ id: 'high', target: 'str', layer: 'override', value: 40 }),
    ])).toBe(30);
  });

  it('softcaps regen while preserving linear debuffs', () => {
    const boosted = resolveModifierTarget('healthRegen', 20, [modifier({
      id: 'huge', target: 'healthRegen', layer: 'flat', value: 99_980,
    })]);
    expect(boosted).toBeGreaterThan(63_000);
    expect(boosted).toBeLessThan(64_000);
    expect(resolveModifierTarget('healthRegen', 20, [modifier({
      id: 'debuff', target: 'healthRegen', layer: 'flat', value: -10,
    })])).toBe(10);
  });

  it('rejects non-integer modifier data before it can enter deterministic state', () => {
    expect(() => resolveModifierTarget('maxHealth', 10_000, [modifier({
      id: 'float', layer: 'flat', value: 0.5,
    })])).toThrow('must be a safe integer');
  });

  it('warns when override data bypasses an exclusive family', () => {
    expect(modifierDataWarnings([
      modifier({ id: 'a', layer: 'override', value: 10 }),
      modifier({ id: 'b', layer: 'override', value: 20 }),
    ])).toEqual(['maxHealth has multiple overrides outside one exclusive family']);
    expect(modifierDataWarnings([
      modifier({ id: 'a', layer: 'override', value: 10, family: 'form' }),
      modifier({ id: 'b', layer: 'override', value: 20, family: 'form' }),
    ])).toEqual([]);
  });
});

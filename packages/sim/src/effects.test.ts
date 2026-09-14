import { describe, expect, it } from 'vitest';
import {
  activeEffects, modifiersForEffects, refreshEffect, type EffectDefinition,
} from './effects.js';
import { resolveStats } from './stats.js';

const DEFINITIONS = Object.freeze({
  fruitful_energy: {
    name: 'Fruitful Energy', maxStacks: 1, durationTicks: 6_000,
    modifiers: [{
      id: 'effect.fruitful_energy.vigour_regen', target: 'vigourRegen',
      layer: 'pctAdd', value: 5_000, source: 'effect',
    }],
  },
  orchard_tea: {
    name: 'Orchard Tea', maxStacks: 1, durationTicks: 6_000,
    modifiers: [{
      id: 'effect.orchard_tea.constitution', target: 'con',
      layer: 'flat', value: 2, source: 'effect',
    }],
  },
  well_rested: {
    name: 'Well Rested', maxStacks: 1, durationTicks: 144_000,
    modifiers: [{
      id: 'effect.well_rested.vigour_regen', target: 'vigourRegen',
      layer: 'pctAdd', value: 2_500, source: 'effect',
    }],
  },
  renamed_focus: {
    name: 'Renamed Focus', maxStacks: 2, durationTicks: 300,
    modifiers: [{
      id: 'effect.renamed_focus.vigour_regen', target: 'vigourRegen',
      layer: 'pctAdd', value: 1_000, source: 'effect',
    }],
  },
} as const satisfies Readonly<Record<string, EffectDefinition>>);

const definitionFor = (kind: string): EffectDefinition | null => (
  DEFINITIONS as Readonly<Record<string, EffectDefinition>>
)[kind] ?? null;

describe('25§6 effect definitions', () => {
  it('uses the documented durations and refreshes without exceeding max stacks', () => {
    const first = refreshEffect(null, 'renamed_focus', 100n, DEFINITIONS.renamed_focus, 7n);
    const refreshed = refreshEffect(first, 'renamed_focus', 200n, DEFINITIONS.renamed_focus);
    expect(refreshed).toEqual({
      id: 7n,
      effectKind: 'renamed_focus',
      stacks: 2,
      appliedTick: 200n,
      expiresTick: 500n,
    });
    expect(refreshEffect(null, 'renamed_focus', 300n, DEFINITIONS.renamed_focus, 9n, 2).stacks)
      .toBe(2);
    expect(() => refreshEffect(null, 'renamed_focus', 300n, DEFINITIONS.renamed_focus, 9n, 0))
      .toThrow('effect stacks');
  });

  it('gives fruit a five-minute vigour-regeneration boon', () => {
    const fruit = refreshEffect(null, 'fruitful_energy', 0n, DEFINITIONS.fruitful_energy, 3n);
    // Integer stat resolution floors the 1,199-centi baseline after applying
    // the exact +50% boon.
    expect(resolveStats(undefined, modifiersForEffects([fruit], 1n, definitionFor)).vigourRegenCentiPerSecond)
      .toBe(1_798);
  });

  it('filters expiry at every read and compiles live effects into modifiers', () => {
    const rested = refreshEffect(null, 'well_rested', 0n, DEFINITIONS.well_rested, 1n);
    expect(activeEffects([rested], 143_999n)).toEqual([rested]);
    expect(activeEffects([rested], 144_000n)).toEqual([]);
    expect(resolveStats(undefined, modifiersForEffects([rested], 1n, definitionFor)).vigourRegenCentiPerSecond)
      .toBe(1_500);
    expect(modifiersForEffects([{
      ...rested, id: 9n, effectKind: 'retired_or_missing', expiresTick: 10n,
    }], 1n, definitionFor)).toEqual([]);
  });

  it('applies Orchard Tea through the same attribute pipeline', () => {
    const tea = refreshEffect(null, 'orchard_tea', 0n, DEFINITIONS.orchard_tea, 2n);
    const stats = resolveStats(undefined, modifiersForEffects([tea], 1n, definitionFor));
    expect(stats.attributes.con).toBe(12);
    expect(stats.maxVigourCenti).toBe(12_000);
  });
});

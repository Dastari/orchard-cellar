import { describe, expect, it } from 'vitest';
import { ABILITY_DEFINITIONS, resolveSprintAbility, sprintVigourCostForSteps } from './abilities.js';
import type { Modifier } from './modifiers.js';
import { BASE_ATTRIBUTES } from './stats.js';

describe('sprint ability', () => {
  it('is tagged for Constitution, Vigour, and every modifier producer', () => {
    expect(ABILITY_DEFINITIONS.sprint.primaryAttribute).toBe('con');
    expect(ABILITY_DEFINITIONS.sprint.tags).toEqual(expect.arrayContaining([
      'resource.vigour', 'attribute.con', 'modifier.effect', 'modifier.skill',
    ]));
    expect(ABILITY_DEFINITIONS.sprint.modifierTargets).toEqual([
      'sprintSpeed', 'sprintVigourCost',
    ]);
  });

  it('runs 25% faster at baseline and Constitution improves efficiency', () => {
    expect(resolveSprintAbility(BASE_ATTRIBUTES)).toEqual({
      speedPermille: 1_250,
      vigourDrainCentiPerSecond: 1_000,
    });
    expect(resolveSprintAbility({ ...BASE_ATTRIBUTES, con: 20 }).vigourDrainCentiPerSecond).toBe(500);
    expect(resolveSprintAbility({ ...BASE_ATTRIBUTES, con: 5 }).vigourDrainCentiPerSecond).toBe(2_000);
  });

  it('accepts buffs, skills, debuffs, and equipment through modifier targets', () => {
    const modifiers: Modifier[] = [
      { id: 'skill.runner', target: 'sprintSpeed', layer: 'pctAdd', value: 1_000, source: 'skill' },
      { id: 'effect.slow', target: 'sprintSpeed', layer: 'pctAdd', value: -2_000, source: 'effect' },
      { id: 'boots.efficient', target: 'sprintVigourCost', layer: 'pctAdd', value: -2_500, source: 'equipment' },
    ];
    expect(resolveSprintAbility(BASE_ATTRIBUTES, modifiers)).toEqual({
      speedPermille: 1_125,
      vigourDrainCentiPerSecond: 750,
    });
  });

  it('charges cumulative fixed-step costs exactly over a second', () => {
    expect(sprintVigourCostForSteps(1_000, 1)).toBe(17);
    expect(sprintVigourCostForSteps(1_000, 3)).toBe(50);
    expect(sprintVigourCostForSteps(1_000, 60)).toBe(1_000);
  });
});

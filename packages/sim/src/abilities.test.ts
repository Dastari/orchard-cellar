import { describe, expect, it } from 'vitest';
import { resolveSprintAbility, runtimeSprintAbilityDefinition, sprintVigourCostForSteps } from './abilities.js';
import { bootstrapContentDefinitions, bootstrapContentRegistry } from './content/bootstrap-registry.js';
import { buildContentRegistry } from './content/registry.js';
import type { Modifier } from './modifiers.js';
import { BASE_ATTRIBUTES } from './stats.js';

describe('sprint ability', () => {
  const sprint = runtimeSprintAbilityDefinition(bootstrapContentRegistry())!;

  it('is tagged for Constitution, Vigour, and every modifier producer', () => {
    expect(sprint.primaryAttribute).toBe('con');
    expect(sprint.tags).toEqual(expect.arrayContaining([
      'resource.vigour', 'attribute.con', 'modifier.effect', 'modifier.skill',
    ]));
    expect(sprint.modifierTargets).toEqual([
      'sprintSpeed', 'sprintVigourCost',
    ]);
  });

  it('runs 25% faster at baseline and Constitution improves efficiency', () => {
    expect(resolveSprintAbility(sprint, BASE_ATTRIBUTES)).toEqual({
      speedPermille: 1_250,
      vigourDrainCentiPerSecond: 1_000,
    });
    expect(resolveSprintAbility(sprint, { ...BASE_ATTRIBUTES, con: 20 }).vigourDrainCentiPerSecond).toBe(500);
    expect(resolveSprintAbility(sprint, { ...BASE_ATTRIBUTES, con: 5 }).vigourDrainCentiPerSecond).toBe(2_000);
  });

  it('accepts buffs, skills, debuffs, and equipment through modifier targets', () => {
    const modifiers: Modifier[] = [
      { id: 'skill.runner', target: 'sprintSpeed', layer: 'pctAdd', value: 1_000, source: 'skill' },
      { id: 'effect.slow', target: 'sprintSpeed', layer: 'pctAdd', value: -2_000, source: 'effect' },
      { id: 'boots.efficient', target: 'sprintVigourCost', layer: 'pctAdd', value: -2_500, source: 'equipment' },
    ];
    expect(resolveSprintAbility(sprint, BASE_ATTRIBUTES, modifiers)).toEqual({
      speedPermille: 1_125,
      vigourDrainCentiPerSecond: 750,
    });
  });

  it('resolves by semantic adapter across renamed ids and fails closed when unavailable', () => {
    const definitions = bootstrapContentDefinitions().map((definition) => definition.kind === 'loadout' ? {
      ...definition,
      id: 'loadout:renamed_arrival' as const,
      abilities: definition.abilities.map((ability) => ({
        ...ability, id: 'ability:burst' as const,
        speedPermille: 1_400, vigourDrainCentiPerSecond: 800,
      })),
    } : definition);
    const renamed = buildContentRegistry(definitions.map((definition) => ({
      id: definition.id, kind: definition.kind, json: definition,
    })));
    expect(renamed.report.valid).toBe(true);
    expect(runtimeSprintAbilityDefinition(renamed.registry)?.id).toBe('ability:burst');
    expect(resolveSprintAbility(runtimeSprintAbilityDefinition(renamed.registry)!, BASE_ATTRIBUTES))
      .toEqual({ speedPermille: 1_400, vigourDrainCentiPerSecond: 800 });
    expect(runtimeSprintAbilityDefinition(buildContentRegistry([]).registry)).toBeNull();
    const withoutSprint = buildContentRegistry(definitions.filter(({ kind }) => kind !== 'loadout').map((definition) => ({
      id: definition.id, kind: definition.kind, json: definition,
    })));
    expect(runtimeSprintAbilityDefinition(withoutSprint.registry)).toBeNull();
    const loadout = bootstrapContentDefinitions().find((definition) => definition.kind === 'loadout')!;
    const retired = buildContentRegistry([{
      id: loadout.id, kind: loadout.kind, json: { ...loadout, retired: true },
    }]);
    expect(runtimeSprintAbilityDefinition(retired.registry)).toBeNull();
  });

  it('charges cumulative fixed-step costs exactly over a second', () => {
    expect(sprintVigourCostForSteps(1_000, 1)).toBe(17);
    expect(sprintVigourCostForSteps(1_000, 3)).toBe(50);
    expect(sprintVigourCostForSteps(1_000, 60)).toBe(1_000);
  });
});

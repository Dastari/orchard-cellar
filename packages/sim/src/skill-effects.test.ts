import { describe, expect, it } from 'vitest';
import { modifiersForSkillRanks } from './skill-effects.js';

describe('live skill effects', () => {
  it('compiles reviewed combat ranks into the shared modifier pipeline', () => {
    expect(modifiersForSkillRanks({ archery_basics: 3, blade_training: 2, battle_conditioning: 1 }))
      .toEqual([
        { id: 'skill.archery_basics', target: 'rangedPower', layer: 'pctAdd', value: 900, source: 'skill' },
        { id: 'skill.blade_training', target: 'attackPower', layer: 'pctAdd', value: 600, source: 'skill' },
        { id: 'skill.battle_conditioning', target: 'toolVigourCost', layer: 'pctAdd', value: -500, source: 'skill' },
      ]);
  });
});

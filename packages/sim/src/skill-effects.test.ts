import { describe, expect, it } from 'vitest';
import { modifiersForSkillRanks, modifiersForToolSpecialization } from './skill-effects.js';

describe('live skill effects', () => {
  it('compiles reviewed combat ranks into the shared modifier pipeline', () => {
    expect(modifiersForSkillRanks({ archery_basics: 3, blade_training: 2, battle_conditioning: 1 }))
      .toEqual([
        { id: 'skill.archery_basics', target: 'rangedPower', layer: 'pctAdd', value: 900, source: 'skill' },
        { id: 'skill.blade_training', target: 'attackPower', layer: 'pctAdd', value: 600, source: 'skill' },
        { id: 'skill.battle_conditioning', target: 'toolVigourCost', layer: 'pctAdd', value: -500, source: 'skill' },
      ]);
  });

  it('applies running and profession vigour reductions only in their contexts', () => {
    expect(modifiersForSkillRanks({ measured_stride: 2 })).toEqual([{
      id: 'skill.measured_stride', target: 'sprintVigourCost', layer: 'pctAdd', value: -1_200, source: 'skill',
    }]);
    expect(modifiersForToolSpecialization({ mining_endurance: 3 }, 'mining')).toEqual([{
      id: 'skill.mining_endurance.tool_vigour', target: 'toolVigourCost', layer: 'pctAdd', value: -1_500, source: 'skill',
    }]);
    expect(modifiersForToolSpecialization({ mining_endurance: 3 }, 'fishing')).toEqual([]);
  });
});

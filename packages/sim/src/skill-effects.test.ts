import { describe, expect, it } from 'vitest';
import { buildContentRegistry } from './content/registry.js';
import {
  modifiersForSkillRanks,
  modifiersForToolSpecialization,
  runtimeSkillCapabilities,
} from './skill-effects.js';
import { runtimeSpecializationRankTotal } from './skill-trees.js';

function authoredRegistry(retired = false) {
  const definition = {
    id: 'skill_tree:renamed', kind: 'skill_tree', schemaVersion: 1, track: 'farming', levelCap: 50,
    ...(retired ? { retired: true } : {}),
    nodes: [
      {
        id: 'root', iconAsset: 'icon_skill_root', track: 'farming', name: 'Root', description: 'Root',
        position: [0, 0], connects: ['renamed_mastery'], maxRank: 0, pointCost: 0, root: true,
        implemented: true,
      },
      {
        id: 'renamed_mastery', iconAsset: 'icon_skill_mastery', track: 'farming', name: 'Mastery',
        description: 'Renamed mastery', position: [1, 0], connects: ['root'], prerequisites: ['root'],
        maxRank: 2, pointCost: 1, specialization: 'mining', implemented: true,
        gearBoostable: true, gearBonusCap: 1, overcapLimit: 0,
        effectsPerRank: [{ target: 'toolVigourCost', value: -375, context: 'mining' }],
        capabilities: [
          'foot_gap_jump', 'foot_cliff_climb', 'minimap_player_tracking',
          'mining_efficient_strikes', 'mining_yield_inspection', 'mining_ore_dressing',
          'mining_rockhound', 'mining_mother_lode',
        ],
      },
    ],
  };
  return buildContentRegistry([{ id: definition.id, kind: definition.kind, json: definition }]).registry;
}

describe('live skill effects', () => {
  it('compiles reviewed combat ranks into the shared modifier pipeline', () => {
    expect(modifiersForSkillRanks({ archery_basics: 3, blade_training: 2, battle_conditioning: 1 }))
      .toEqual([
        { id: 'skill.archery_basics.0', target: 'rangedPower', layer: 'pctAdd', value: 900, source: 'skill' },
        { id: 'skill.blade_training.0', target: 'attackPower', layer: 'pctAdd', value: 600, source: 'skill' },
        { id: 'skill.battle_conditioning.0', target: 'toolVigourCost', layer: 'pctAdd', value: -500, source: 'skill' },
      ]);
  });

  it('applies running and profession vigour reductions only in their contexts', () => {
    expect(modifiersForSkillRanks({ measured_stride: 2 })).toEqual([{
      id: 'skill.measured_stride.0', target: 'sprintVigourCost', layer: 'pctAdd', value: -1_200, source: 'skill',
    }]);
    expect(modifiersForToolSpecialization({ mining_endurance: 3 }, 'mining')).toEqual([{
      id: 'skill.mining_endurance.0', target: 'toolVigourCost', layer: 'pctAdd', value: -1_500, source: 'skill',
    }]);
    expect(modifiersForToolSpecialization({ mining_endurance: 3 }, 'fishing')).toEqual([]);
  });

  it('uses active authored effects and capability roles after a node rename', () => {
    const registry = authoredRegistry();
    const ranks = { renamed_mastery: 2 };
    expect(modifiersForToolSpecialization(ranks, 'mining', registry)).toEqual([{
      id: 'skill.renamed_mastery.0', target: 'toolVigourCost', layer: 'pctAdd', value: -750,
      source: 'skill',
    }]);
    expect(runtimeSpecializationRankTotal(registry, ranks, 'mining')).toBe(2);
    expect(runtimeSkillCapabilities(registry, ranks)).toMatchObject({
      maximumFootGapTiles: 2,
      maximumFootCliffLevels: 2,
      efficientStrikesRank: 2,
      minimapPlayerTracking: true,
      miningYieldInspection: true,
      oreDressingRank: 2,
      rockhoundRank: 2,
      motherLodeRank: 2,
    });
    expect(runtimeSkillCapabilities(authoredRegistry(true), ranks)).toMatchObject({
      efficientStrikesRank: 0,
      minimapPlayerTracking: false,
    });
    expect(modifiersForToolSpecialization(ranks, 'mining', authoredRegistry(true))).toEqual([]);
    expect(runtimeSpecializationRankTotal(authoredRegistry(true), ranks, 'mining')).toBe(0);
    expect(runtimeSkillCapabilities(registry, { missing_mastery: 2 })).toMatchObject({
      efficientStrikesRank: 0,
      minimapPlayerTracking: false,
    });
    expect(modifiersForToolSpecialization({ missing_mastery: 2 }, 'mining', registry)).toEqual([]);
    expect(runtimeSpecializationRankTotal(registry, { missing_mastery: 2 }, 'mining')).toBe(0);
  });
});

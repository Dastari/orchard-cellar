import { describe, expect, it } from 'vitest';
import {
  SKILL_NODE_DEFINITIONS,
  SKILL_TRACKS,
  availableSkillPoints,
  skillExperienceForLevel,
  skillLevelForExperience,
  skillNodeDefinition,
  skillNodesForTrack,
  skillPurchaseRejection,
  skillRespecCostBronze,
} from './skill-trees.js';

describe('36§3 skill track progression', () => {
  it('pins the XP curve and level derivation', () => {
    expect(skillExperienceForLevel(0)).toBe(0n);
    expect(skillExperienceForLevel(1)).toBe(100n);
    expect(skillExperienceForLevel(2)).toBe(324n);
    expect(skillExperienceForLevel(10)).toBe(5_011n);
    expect(skillExperienceForLevel(50)).toBe(77_312n);
    expect(skillLevelForExperience(99n)).toBe(0);
    expect(skillLevelForExperience(100n)).toBe(1);
    expect(skillLevelForExperience(5_010n)).toBe(9);
    expect(skillLevelForExperience(999_999n)).toBe(50);
  });

  it('derives unspent points from level, developer grants, and spending', () => {
    expect(availableSkillPoints(324n, 1, 2)).toBe(3);
    expect(availableSkillPoints(0n, 20, 0)).toBe(0);
  });

  it('uses a bounded escalating respec ladder with a free first reset', () => {
    expect([0, 1, 2, 3, 4, 99].map(skillRespecCostBronze)).toEqual([
      0n, 100n, 500n, 2_500n, 10_000n, 10_000n,
    ]);
  });
});

describe('36§4 skill graph registry', () => {
  it('has one connected root per track, unique ids, and bidirectional edges', () => {
    expect(new Set(SKILL_NODE_DEFINITIONS.map((node) => node.id)).size).toBe(SKILL_NODE_DEFINITIONS.length);
    for (const track of SKILL_TRACKS) {
      const trackNodes = skillNodesForTrack(track);
      expect(trackNodes.filter((node) => node.root === true)).toHaveLength(1);
      expect(trackNodes.length).toBeGreaterThanOrEqual(12);
      for (const node of trackNodes) {
        expect(node.maxRank).toBeGreaterThanOrEqual(0);
        if (node.root === true) expect(node.pointCost).toBe(0);
        else expect(node.pointCost).toBeGreaterThan(0);
        for (const connectedId of node.connects) {
          const connected = skillNodeDefinition(connectedId);
          expect(connected?.track).toBe(track);
          expect(connected?.connects).toContain(node.id);
        }
      }
    }
  });

  it('validates ranks, level gates, adjacency, and track-local points', () => {
    const noProgress = { experience: 0n, spentPoints: 0, bonusPoints: 0, ranks: {} };
    expect(skillPurchaseRejection('explorer_root', noProgress)).toBe('skill_root_owned');
    expect(skillPurchaseRejection('missing', noProgress)).toBe('skill_not_found');
    expect(skillPurchaseRejection('trailblazer', noProgress)).toBe('skill_points_required');
    expect(skillPurchaseRejection('trailblazer', { ...noProgress, bonusPoints: 1 })).toBeNull();
    expect(skillPurchaseRejection('pathfinder', { ...noProgress, bonusPoints: 10 })).toBe('skill_level_required');
    expect(skillPurchaseRejection('pathfinder', {
      experience: skillExperienceForLevel(3), spentPoints: 0, bonusPoints: 10, ranks: {},
    })).toBe('skill_not_connected');
    expect(skillPurchaseRejection('pathfinder', {
      experience: skillExperienceForLevel(3), spentPoints: 0, bonusPoints: 10, ranks: { trailblazer: 1 },
    })).toBeNull();
    expect(skillPurchaseRejection('surefooted', {
      experience: skillExperienceForLevel(10), spentPoints: 0, bonusPoints: 10, ranks: { trailblazer: 5, surefooted: 1 },
    })).toBe('skill_rank_maxed');
  });
});

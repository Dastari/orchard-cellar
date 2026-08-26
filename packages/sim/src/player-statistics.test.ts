import { describe, expect, it } from 'vitest';
import {
  MAX_PLAYER_STATISTIC_VALUE,
  PLAYER_STATISTIC_DEFINITIONS,
  playerStatisticDefinition,
  statisticMilestonesCrossed,
  statisticSubjectIsValid,
  statisticValueAfter,
} from './player-statistics.js';

describe('player statistics registry', () => {
  it('contains unique ordered positive milestones and documents reserved hooks', () => {
    for (const definition of Object.values(PLAYER_STATISTIC_DEFINITIONS)) {
      expect(definition.milestones.length).toBeGreaterThan(0);
      expect(definition.milestones.every((threshold) => threshold > 0n)).toBe(true);
      expect([...definition.milestones].sort((a, b) => a < b ? -1 : 1)).toEqual(definition.milestones);
      expect(new Set(definition.milestones).size).toBe(definition.milestones.length);
    }
    expect(PLAYER_STATISTIC_DEFINITIONS.damage_dealt.reserved).toBe(true);
    expect(PLAYER_STATISTIC_DEFINITIONS.fish_caught.reserved).toBe(true);
  });

  it('resolves only registered definitions and validates their subject contract', () => {
    expect(playerStatisticDefinition('trees_cut_down')?.unit).toBe('count');
    expect(playerStatisticDefinition('made_up')).toBeNull();
    expect(statisticSubjectIsValid('trees_cut_down', '')).toBe(true);
    expect(statisticSubjectIsValid('trees_cut_down', 'oak')).toBe(false);
    expect(statisticSubjectIsValid('items_obtained', 'apple')).toBe(true);
    expect(statisticSubjectIsValid('items_obtained', '')).toBe(false);
    expect(statisticSubjectIsValid('messages_sent', 'whisper')).toBe(true);
    expect(statisticSubjectIsValid('messages_sent', 'email')).toBe(false);
    expect(statisticSubjectIsValid('distance_travelled', 'horse')).toBe(true);
    expect(statisticSubjectIsValid('distance_travelled', 'boat')).toBe(false);
  });

  it('applies counter saturation and maximum aggregation deterministically', () => {
    expect(statisticValueAfter('trees_cut_down', 10n, 3n)).toBe(13n);
    expect(statisticValueAfter('trees_cut_down', MAX_PLAYER_STATISTIC_VALUE - 1n, 5n))
      .toBe(MAX_PLAYER_STATISTIC_VALUE);
    expect(statisticValueAfter('longest_horse_jump', 100n, 90n)).toBe(100n);
    expect(statisticValueAfter('longest_horse_jump', 100n, 120n)).toBe(120n);
    expect(() => statisticValueAfter('trees_cut_down', -1n, 1n)).toThrow('invalid_statistic_value');
  });

  it('returns every threshold crossed by a single atomic update', () => {
    expect(statisticMilestonesCrossed('trees_cut_down', 0n, 100n)).toEqual([1n, 10n, 50n, 100n]);
    expect(statisticMilestonesCrossed('trees_cut_down', 100n, 101n)).toEqual([]);
    expect(() => statisticMilestonesCrossed('trees_cut_down', 10n, 9n)).toThrow('invalid_statistic_range');
  });
});

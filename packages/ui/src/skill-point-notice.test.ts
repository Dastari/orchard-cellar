import { describe, expect, it } from 'vitest';
import { skillExperienceForLevel } from '@orchard/sim';
import { SkillPointNoticeTracker } from './skill-point-notice.js';

describe('skill point notice tracker', () => {
  it('uses the first subscribed row as a silent baseline', () => {
    const tracker = new SkillPointNoticeTracker();
    expect(tracker.observe([{
      track: 'farming', experience: skillExperienceForLevel(8), bonusPoints: 2,
    }])).toEqual([]);
  });

  it('reports level and bonus point gains for the affected tree', () => {
    const tracker = new SkillPointNoticeTracker();
    tracker.observe([{ track: 'explorer', experience: 0n, bonusPoints: 0 }]);
    expect(tracker.observe([{
      track: 'explorer', experience: skillExperienceForLevel(2), bonusPoints: 0,
    }])).toEqual([{ track: 'explorer', points: 2 }]);
    expect(tracker.observe([{
      track: 'explorer', experience: skillExperienceForLevel(2), bonusPoints: 1,
    }])).toEqual([{ track: 'explorer', points: 1 }]);
  });

  it('ignores unknown tracks and can reset for another signed-in player', () => {
    const tracker = new SkillPointNoticeTracker();
    tracker.observe([{ track: 'combat', experience: 0n, bonusPoints: 0 }]);
    expect(tracker.observe([
      { track: 'unknown', experience: skillExperienceForLevel(5), bonusPoints: 0 },
      { track: 'combat', experience: skillExperienceForLevel(1), bonusPoints: 0 },
    ])).toEqual([{ track: 'combat', points: 1 }]);
    tracker.reset();
    expect(tracker.observe([{
      track: 'combat', experience: skillExperienceForLevel(12), bonusPoints: 0,
    }])).toEqual([]);
  });
});

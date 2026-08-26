import { describe, expect, it } from 'vitest';
import { SKILL_CHECK_DCS, fishingCatchQuality, forageFindBonus, skillCheck } from './checks.js';

describe('25§7 deterministic skill checks', () => {
  it('replays identical seed parts and includes attribute plus check bonuses', () => {
    const seed = [0x4f434852, 'identity-a', 42n, 'fishing.quality'] as const;
    const modifiers = [{
      id: 'lucky', target: 'checkBonus', layer: 'flat', value: 2, source: 'skill',
    }] as const;
    const first = skillCheck(seed, 14, SKILL_CHECK_DCS.medium, modifiers);
    expect(skillCheck(seed, 14, SKILL_CHECK_DCS.medium, modifiers)).toEqual(first);
    expect(first.total).toBe(first.roll + 4);
    expect(first.success).toBe(first.total >= 15);
  });

  it('covers every d20 face without material distribution bias', () => {
    const counts = Array.from({ length: 20 }, () => 0);
    for (let index = 0; index < 20_000; index += 1) {
      const roll = skillCheck([0x4f434852, 'distribution', index, 'forage'], 10, 10).roll;
      counts[roll - 1] = (counts[roll - 1] ?? 0) + 1;
    }
    expect(counts.every((count) => count > 850 && count < 1_150)).toBe(true);
  });

  it('provides deterministic fishing-quality and forage-find integration points', () => {
    const seed = ['world', 'player', 42n] as const;
    expect(fishingCatchQuality(seed, 10)).toBe(fishingCatchQuality(seed, 10));
    expect(['common', 'good', 'rare']).toContain(fishingCatchQuality(seed, 10));
    expect([0, 1]).toContain(forageFindBonus(seed, 10));
  });
});

import { describe, expect, it } from 'vitest';
import { STAT_TARGETS } from '@orchard/sim';
import {
  BASE_TYPES, LEGENDARIES, LINEAGES, MATERIALS_BY_LINE, PREFIXES, STATS, SUFFIXES,
  baseType, coins, material, sellValue,
} from './catalogue.js';
import { HEAD_DESIGNS } from './designs.js';

const SKILL_NODES = ['farmcraft', 'mining_endurance', 'fishing_endurance', 'woodcutting_endurance', 'blade_training', 'archery_basics', 'battle_conditioning', 'measured_stride'];

describe('gear catalogue', () => {
  it('maps every stat to a simulation modifier target or a gear-boostable skill node', () => {
    for (const stat of Object.values(STATS)) {
      if (stat.unit === 'rank') expect(SKILL_NODES).toContain(stat.target);
      else expect(STAT_TARGETS as readonly string[]).toContain(stat.target);
    }
    for (const affix of [...PREFIXES, ...SUFFIXES]) expect(STATS[affix.stat], affix.id).toBeDefined();
    for (const lineage of LINEAGES) for (const stat of [...lineage.stats, lineage.equip]) expect(STATS[stat], lineage.id).toBeDefined();
    for (const legendary of LEGENDARIES) for (const [stat] of legendary.stats) expect(STATS[stat], legendary.id).toBeDefined();
  });

  it('only grants skill ranks from rare upward, matching the equipment-skill rule', () => {
    for (const affix of SUFFIXES) {
      if (STATS[affix.stat]!.unit === 'rank') expect(affix.from).toBe('rare');
    }
  });

  it('gives every base type a material line, a valid icon family and a known worn design', () => {
    const designs = new Set([...HEAD_DESIGNS.map((design) => design.name), 'kenmi_plate', 'kenmi_heavy']);
    const limits = { weapons: 164, armor: 185, tools: 56, treasure: 88 };
    for (const base of BASE_TYPES) {
      expect(MATERIALS_BY_LINE.some((entry) => base.lines.includes(entry.line)), base.id).toBe(true);
      for (const row of base.icon.rows) expect(row, base.id).toBeLessThan(limits[base.icon.sheet]);
      if (base.visual.kind === 'head') {
        for (const family of [base.visual.fallback, ...Object.values(base.visual.families)]) expect(designs, base.id).toContain(family);
      }
      if (base.icon.rows.length === 0) expect(base.visual.kind, base.id).toBe('head');
    }
    expect(new Set(BASE_TYPES.map((base) => base.id)).size).toBe(BASE_TYPES.length);
  });

  it('resolves legendary bases and materials and sits them at high tiers', () => {
    for (const legendary of LEGENDARIES) {
      expect(() => baseType(legendary.base)).not.toThrow();
      expect(() => material(legendary.material)).not.toThrow();
      expect(legendary.tier).toBeGreaterThanOrEqual(5);
    }
  });

  it('prices items in bronze and splits them into coins', () => {
    expect(sellValue(4, 'rare', 1)).toBe(1600);
    expect(sellValue(7, 'legendary', 1)).toBeGreaterThan(sellValue(7, 'epic', 1));
    expect(coins(30_625)).toEqual({ gold: 3, silver: 6, bronze: 25 });
  });
});

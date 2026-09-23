import { describe, expect, it } from 'vitest';
import { BOOTSTRAP_PROGRESSION, activityExperience, runtimeActivityExperience, runtimeProgression } from './progression.js';
import { parseProgressionDefinition } from './content/progression-definition.js';
import { bootstrapContentDefinitions, bootstrapContentRegistry } from './content/bootstrap-registry.js';
import { buildContentRegistry } from './content/registry.js';
import { parseBalanceDefinition } from './content/definitions.js';
import { balanceFieldsTuple } from './content/balance-fields.js';
import { availableSkillPoints, runtimeSkillPurchaseRejection, skillExperienceForLevel, skillLevelForExperience, skillRespecCostBronze } from './skill-trees.js';

const legacyTuples = {
  character_combat: [10,1,30,10000,100,1000,1000,1000,20,10,120,10,1400,1800,100,10000,100,20],
  world_policy: [30,2,24000,60,16,32000,12,3,3,4,24],
  residence_construction: [1,'item:wood','item:stone','item:copper_piece',2,2,1,4,2,4,2,2],
};

describe('named balance migration', () => {
  for (const [profile, values] of Object.entries(legacyTuples)) it(`${profile}: legacy and named forms round-trip without value changes`, () => {
    const definition = bootstrapContentDefinitions().find(row => row.kind === 'balance' && 'profile' in row && row.profile === profile)!;
    const legacy = parseBalanceDefinition({ ...definition, fields: undefined, values });
    expect(legacy).toEqual(definition);
    expect(parseBalanceDefinition(JSON.stringify(legacy))).toEqual(definition);
    expect('values' in legacy).toBe(false);
    if (!('profile' in legacy)) throw new Error('expected profile');
    expect(balanceFieldsTuple(legacy.profile, legacy.fields)).toEqual(values);
    expect(() => parseBalanceDefinition({ ...definition, values })).toThrow('never both');
    expect(() => parseBalanceDefinition({ ...definition, fields: { ...legacy.fields, typo: 1 } })).toThrow('unknown balance field');
  });
});

describe('authored progression', () => {
  it('preserves every level boundary, cap, earned point and respec cost', () => {
    for (let level = 0; level <= 50; level++) {
      const old = BigInt(Math.floor(100 * level ** 1.7));
      expect(skillExperienceForLevel(level)).toBe(old);
      expect(skillLevelForExperience(old)).toBe(level);
      if (level > 0) expect(skillLevelForExperience(old - 1n)).toBe(level - 1);
      expect(availableSkillPoints(old, 2, 1)).toBe(Math.max(0, level - 1));
    }
    expect(skillLevelForExperience((1n << 64n) - 1n)).toBe(50);
    expect(skillLevelForExperience(-1n)).toBe(0);
    for (let i = -2; i <= 12; i++) expect(skillRespecCostBronze(i)).toBe([0n,100n,500n,2500n,10000n][Math.max(0, Math.min(4,i))]);
  });
  it('preserves all current literal activity award formulas', () => {
    const p = BOOTSTRAP_PROGRESSION;
    const fixed = { plant_seed:2, plant_fruit_seed:2, mine_rock:2, mine_mixed_stone:3,
      mine_mixed_ore:6, mine_ore:10, fish_catch:5, fish_depletion:10, cultivate:2, water:1, seal_barrel:5 } as const;
    for (const [key, value] of Object.entries(fixed)) expect(activityExperience(p, key as keyof typeof fixed)).toBe(BigInt(value));
    for (const quantity of [0,1,2,6,32,8192]) {
      expect(activityExperience(p,'homestead_upgrade',quantity)).toBe(BigInt(20*quantity));
      expect(activityExperience(p,'orchard_harvest',quantity)).toBe(BigInt(2*quantity));
      expect(activityExperience(p,'resource_fruit_harvest',quantity)).toBe(BigInt(2*quantity));
      expect(activityExperience(p,'mine_depletion',quantity)).toBe(BigInt(quantity));
      expect(activityExperience(p,'crop_harvest',quantity)).toBe(BigInt(8+quantity));
    }
    expect(() => activityExperience(p,'crop_harvest',-1)).toThrow('invalid_experience_units');
  });
  it('reads changed published data, supports pre-backfill rows, and rejects ambiguous or retired owners', () => {
    const changed = parseProgressionDefinition({ ...BOOTSTRAP_PROGRESSION, levelCap: 7,
      xpCurve: { scale: 20, exponent: 2 }, respecCostsBronze: [4,9],
      awards: { ...BOOTSTRAP_PROGRESSION.awards, fish_catch: { base: 19, perUnit: 0 } } });
    const rows = bootstrapContentDefinitions().filter(row => row.kind !== 'progression')
      .map(row => ({ id: row.id, kind: row.kind, json: row }));
    const build = buildContentRegistry([...rows,{ id:changed.id,kind:changed.kind,json:changed }]);
    expect(build.report.errors).toEqual([]);
    const p = runtimeProgression(build.registry);
    expect(skillExperienceForLevel(3,p)).toBe(180n);
    expect(skillLevelForExperience(100000n,p)).toBe(7);
    expect(skillRespecCostBronze(4,p)).toBe(9n);
    expect(runtimeActivityExperience(build.registry,'fish_catch')).toBe(19n);
    // At 20 XP the authored curve grants level 1 and a point; the old curve grants none.
    const state={experience:20n,spentPoints:0,bonusPoints:0,ranks:{}};
    expect(runtimeSkillPurchaseRejection(build.registry,'archery_basics',state)).toBeNull();
    expect(runtimeSkillPurchaseRejection(bootstrapContentRegistry(),'archery_basics',state)).toBe('skill_points_required');
    expect(runtimeProgression(buildContentRegistry(rows).registry)).toEqual(BOOTSTRAP_PROGRESSION);
    const duplicate = { ...changed, id: 'progression:duplicate' as const };
    const invalid = buildContentRegistry([changed, duplicate].map(row => ({ id:row.id,kind:row.kind,json:row })));
    expect(invalid.report.valid).toBe(false);
    expect(() => runtimeProgression(invalid.registry)).toThrow('progression_unavailable');
    expect(() => runtimeProgression({progressions:new Map([[changed.id,{...changed,retired:true}]])})).toThrow('progression_unavailable');
    expect(bootstrapContentRegistry().progressions.size).toBe(1);
  });
  it.each([
    {levelCap:0},{levelCap:1001},{xpCurve:{scale:1,exponent:0}},
    {xpCurve:{scale:1000000,exponent:5},levelCap:1000},
    {respecCostsBronze:[]},{respecCostsBronze:[-1]},{awards:{}},
    {awards:{...BOOTSTRAP_PROGRESSION.awards,fish_catch:{base:1.5,perUnit:0}}},
  ])('rejects invalid authored values %j', patch => {
    expect(() => parseProgressionDefinition({...BOOTSTRAP_PROGRESSION,...patch})).toThrow();
  });
});

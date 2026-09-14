import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry } from './content/bootstrap-registry.js';
import { farmingSkillEffects } from './skill-effects.js';
import { farmingBarrelTicks, farmingCropDefinition, farmingHarvestReward, firstHarvestOfDay } from './farming-skills.js';
import { CROP_DEFINITIONS, CROP_WATERING_TICKS, cropGrowthAt } from './crops.js';
import { AUTHORITY_TICKS_PER_DAY, DAYS_PER_SEASON } from './time.js';
import { runtimeSkillPurchaseRejection, skillExperienceForLevel } from './skill-trees.js';

const registry = bootstrapContentRegistry();
const none = farmingSkillEffects(registry, {});
const ranks = { green_thumb: 5, farmcraft: 3, seed_saver: 3, bountiful_harvest: 3,
  tender_hand: 3, soil_whisperer: 1, barreling: 1, master_grower: 1,
  sprinkler_engineering: 1, greenhouse_charter: 1, harvest_festival: 1 };

describe('harvest and cellar skill effects', () => {
  it('allows the implemented farming path and rejects orphaned ranks', () => {
    expect(farmingSkillEffects(registry, { seed_saver: 3, barreling: 1 })).toEqual(none);
    const owned: Record<string, number> = {};
    for (const id of Object.keys(ranks)) {
      expect(runtimeSkillPurchaseRejection(registry, id, {
        experience: skillExperienceForLevel(50), spentPoints: 0, bonusPoints: 100, ranks: owned,
      }), id).toBeNull();
      owned[id] = ranks[id as keyof typeof ranks];
    }
    expect(farmingSkillEffects(registry, owned)).toMatchObject({ greenThumb: 5, tenderHand: 3, barreling: 1, masterGrower: true, harvestFestival: true });
  });

  it('keeps harvest rolls deterministic and gives the authored average yield/seed bonuses', () => {
    expect(farmingHarvestReward(4, none, 9, true)).toEqual({ quantity: 4, seeds: 0 });
    const skills = farmingSkillEffects(registry, ranks);
    let quantity = 0, seeds = 0;
    for (let seed = 0; seed < 10_000; seed++) {
      const reward = farmingHarvestReward(4, skills, seed, false);
      expect(farmingHarvestReward(4, skills, seed, true).quantity).toBe(reward.quantity * 2);
      expect(farmingHarvestReward(4, skills, seed, false)).toEqual(reward);
      quantity += reward.quantity; seeds += reward.seeds;
    }
    expect(quantity / 10_000).toBeCloseTo(5.8, 1);
    expect(seeds / 10_000).toBeCloseTo(0.3, 1);
  });

  it('awards the daily bonus only across forward game-day boundaries', () => {
    const day = BigInt(AUTHORITY_TICKS_PER_DAY);
    expect(firstHarvestOfDay(0n, undefined)).toBe(true);
    expect(firstHarvestOfDay(day - 1n, 0n)).toBe(false);
    expect(firstHarvestOfDay(day, day - 1n)).toBe(true);
    expect(firstHarvestOfDay(day, day)).toBe(false);
    expect(firstHarvestOfDay(0n, day)).toBe(false);
  });

  it('extends real watered growth and allows Master Grower through winter', () => {
    const base = { ...CROP_DEFINITIONS[0]!, growthTicks: CROP_WATERING_TICKS * 10n };
    const skills = farmingSkillEffects(registry, ranks);
    const crop = farmingCropDefinition(base, skills);
    const winter = BigInt(AUTHORITY_TICKS_PER_DAY * DAYS_PER_SEASON * 3);
    const tick = winter + CROP_WATERING_TICKS * 3n / 2n;
    expect(cropGrowthAt(base, 0n, winter, winter, tick).growthTicks).toBe(0n);
    const growth = cropGrowthAt(crop, 0n, winter, winter, tick);
    expect(growth.growthTicks).toBe(CROP_WATERING_TICKS * 3n / 2n);
    expect(growth.watered).toBe(true);
    expect(growth.inSeason).toBe(true);
    expect(cropGrowthAt(crop, 0n, winter, winter, winter + CROP_WATERING_TICKS * 2n).watered).toBe(false);
  });

  it('composes Barreling with upgraded preserving and fermentation durations', () => {
    expect(farmingBarrelTicks(36_000n, 0)).toBe(36_000n);
    expect(farmingBarrelTicks(36_000n, 1)).toBe(30_000n);
    expect(farmingBarrelTicks(108_000n, 1)).toBe(90_000n);
  });

  it('resolves renamed capabilities and ignores retired trees', () => {
    const trees = new Map(registry.skillTrees);
    const tree = [...trees.values()].find(t => t.track === 'farming')!;
    const renamed = { ...tree, nodes: tree.nodes.map(n => n.id === 'green_thumb' ? { ...n, id: 'crop_expert' } : n) };
    trees.set(tree.id, renamed);
    expect(farmingSkillEffects({ ...registry, skillTrees: trees }, { crop_expert: 5 }).greenThumb).toBe(5);
    trees.set(tree.id, { ...renamed, retired: true });
    expect(farmingSkillEffects({ ...registry, skillTrees: trees }, { crop_expert: 5 })).toEqual(none);
  });
});

it('keeps Farmcraft at five percent Vigour reduction per rank and scoped to farming tools', async () => {
  const { modifiersForToolSpecialization } = await import('./skill-effects.js');
  expect(modifiersForToolSpecialization({ farmcraft: 3 }, 'farming', registry))
    .toContainEqual(expect.objectContaining({ target: 'toolVigourCost', value: -1500 }));
  expect(modifiersForToolSpecialization({ farmcraft: 3 }, 'mining', registry)).toEqual([]);
});

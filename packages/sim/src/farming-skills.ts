import type { CropDefinition } from './crops.js';
import { CROP_WATERING_TICKS } from './crops.js';
import { AUTHORITY_TICKS_PER_DAY } from './time.js';
import type { FarmingSkillEffects } from './skill-effects.js';

/** Independent deterministic rolls remain stable across retries and reconnects. */
function harvestRoll(seed: number, salt: number): number {
  let value = (seed ^ salt) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) % 10_000;
}

export function farmingHarvestReward(
  baseQuantity: number, skills: FarmingSkillEffects, seed: number, firstHarvest: boolean,
): { quantity: number; seeds: number } {
  const bonus = baseQuantity * Math.min(5, skills.greenThumb) * 300;
  let quantity = baseQuantity + Math.floor(bonus / 10_000)
    + Number(harvestRoll(seed, 1) < bonus % 10_000);
  if (harvestRoll(seed, 2) < Math.min(3, skills.bountifulHarvest) * 1_000) quantity += baseQuantity;
  if (firstHarvest && skills.harvestFestival) quantity *= 2;
  return { quantity, seeds: Number(harvestRoll(seed, 3) < Math.min(3, skills.seedSaver) * 1_000) };
}

export function firstHarvestOfDay(authorityTick: bigint, previousHarvestTick: bigint | undefined): boolean {
  return previousHarvestTick === undefined
    || previousHarvestTick / BigInt(AUTHORITY_TICKS_PER_DAY) < authorityTick / BigInt(AUTHORITY_TICKS_PER_DAY);
}

export function farmingCropDefinition(definition: CropDefinition, skills: FarmingSkillEffects): CropDefinition {
  return {
    ...definition,
    wateringTicks: CROP_WATERING_TICKS * BigInt(4 + Math.min(3, skills.tenderHand)) / 4n,
    seasonless: definition.seasonless === true || skills.masterGrower,
  };
}

export function farmingBarrelTicks(baseTicks: bigint, rank: number): bigint {
  return baseTicks * 5n / BigInt(5 + Math.min(1, Math.max(0, Math.floor(rank))));
}

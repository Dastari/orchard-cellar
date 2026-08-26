import { resolveModifierTarget, type Modifier } from './modifiers.js';
import { checkModifier } from './stats.js';

export const SKILL_CHECK_DCS = {
  trivial: 5,
  easy: 10,
  medium: 15,
  hard: 20,
} as const;

export type SkillCheckSeedPart = string | number | bigint;

export interface SkillCheckResult {
  readonly roll: number;
  readonly total: number;
  readonly success: boolean;
}

function hashSeedParts(parts: readonly SkillCheckSeedPart[]): number {
  let hash = 0x811c9dc5;
  for (const part of parts) {
    const encoded = `${typeof part}:${part.toString()}\u0000`;
    for (let index = 0; index < encoded.length; index += 1) {
      hash ^= encoded.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b) >>> 0;
  }
  return (hash ^ (hash >>> 13)) >>> 0;
}

/** Stateless, replayable d20 check. Seed parts should include world seed,
 * identity, authority tick, and a stable context tag at call sites. */
export function skillCheck(
  seedParts: readonly SkillCheckSeedPart[],
  attributeValue: number,
  dc: number,
  modifiers: readonly Modifier[] = [],
): SkillCheckResult {
  const roll = 1 + hashSeedParts(seedParts) % 20;
  const total = roll + checkModifier(attributeValue)
    + resolveModifierTarget('checkBonus', 0, modifiers);
  return { roll, total, success: total >= dc };
}

export type FishingCatchQuality = 'common' | 'good' | 'rare';

/** Typed integration point for fishing. One deterministic roll is compared
 * against the documented DC ladder so catch quality is replayable. */
export function fishingCatchQuality(
  seedParts: readonly SkillCheckSeedPart[],
  dexterity: number,
  modifiers: readonly Modifier[] = [],
): FishingCatchQuality {
  const check = skillCheck([...seedParts, 'fishing.quality'], dexterity, SKILL_CHECK_DCS.medium, modifiers);
  if (check.total >= SKILL_CHECK_DCS.hard) return 'rare';
  return check.success ? 'good' : 'common';
}

/** Live forage integration: an easy Wisdom success finds one bonus unit. */
export function forageFindBonus(
  seedParts: readonly SkillCheckSeedPart[],
  wisdom: number,
  modifiers: readonly Modifier[] = [],
): number {
  return Number(skillCheck([...seedParts, 'forage.find'], wisdom, SKILL_CHECK_DCS.easy, modifiers).success);
}

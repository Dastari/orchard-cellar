import { BASIS_POINTS, MAX_ATTRIBUTE, MIN_ATTRIBUTE, soften } from './balance.js';

export const STAT_TARGETS = [
  'str', 'dex', 'con', 'int', 'wis', 'cha',
  'maxHealth', 'maxMana', 'maxVigour',
  'healthRegen', 'manaRegen', 'vigourRegen',
  'toolVigourCost', 'swingSpeed', 'sprintSpeed', 'sprintVigourCost', 'checkBonus',
  'attackPower', 'rangedPower', 'armor', 'armorPct',
] as const;
export type StatTarget = typeof STAT_TARGETS[number];

export const MODIFIER_LAYERS = ['flat', 'pctAdd', 'pctMult', 'override'] as const;
export type ModifierLayer = typeof MODIFIER_LAYERS[number];
export type ModifierSource = 'equipment' | 'effect' | 'skill' | 'environment';

export interface Modifier {
  readonly id: string;
  readonly target: StatTarget;
  readonly layer: ModifierLayer;
  readonly value: number;
  readonly family?: string;
  readonly source: ModifierSource;
}

export interface StatTargetRule {
  readonly minimum: number;
  readonly maximum: number;
  readonly softcap: boolean;
}

const U32_MAX = 0xffff_ffff;

/** Regen's high technical ceiling is intentionally not a balance target. It
 * keeps the documented soft-cap path live without constraining ordinary v1
 * values; future equipment tuning can lower it in one table. */
export const STAT_TARGET_RULES: Readonly<Record<StatTarget, StatTargetRule>> = {
  str: { minimum: MIN_ATTRIBUTE, maximum: MAX_ATTRIBUTE, softcap: false },
  dex: { minimum: MIN_ATTRIBUTE, maximum: MAX_ATTRIBUTE, softcap: false },
  con: { minimum: MIN_ATTRIBUTE, maximum: MAX_ATTRIBUTE, softcap: false },
  int: { minimum: MIN_ATTRIBUTE, maximum: MAX_ATTRIBUTE, softcap: false },
  wis: { minimum: MIN_ATTRIBUTE, maximum: MAX_ATTRIBUTE, softcap: false },
  cha: { minimum: MIN_ATTRIBUTE, maximum: MAX_ATTRIBUTE, softcap: false },
  maxHealth: { minimum: 1, maximum: U32_MAX, softcap: false },
  maxMana: { minimum: 0, maximum: U32_MAX, softcap: false },
  maxVigour: { minimum: 0, maximum: U32_MAX, softcap: false },
  healthRegen: { minimum: 0, maximum: 100_000, softcap: true },
  manaRegen: { minimum: 0, maximum: 100_000, softcap: true },
  vigourRegen: { minimum: 0, maximum: 100_000, softcap: true },
  toolVigourCost: { minimum: 0, maximum: U32_MAX, softcap: false },
  swingSpeed: { minimum: 0, maximum: U32_MAX, softcap: false },
  sprintSpeed: { minimum: 1_000, maximum: 4_000, softcap: false },
  sprintVigourCost: { minimum: 0, maximum: U32_MAX, softcap: false },
  checkBonus: { minimum: -1_000, maximum: 1_000, softcap: false },
  attackPower: { minimum: 0, maximum: U32_MAX, softcap: false },
  rangedPower: { minimum: 0, maximum: U32_MAX, softcap: false },
  armor: { minimum: 0, maximum: U32_MAX, softcap: false },
  armorPct: { minimum: 0, maximum: 9_000, softcap: true },
};

export interface ModifierResolution {
  readonly target: StatTarget;
  readonly base: number;
  readonly value: number;
  readonly applied: readonly Modifier[];
  readonly excludedByFamily: readonly Modifier[];
}

function compareIds(left: Modifier, right: Modifier): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function validateInteger(label: string, value: number): void {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer`);
}

function selectExclusiveFamilies(modifiers: readonly Modifier[]): {
  readonly applied: readonly Modifier[];
  readonly excluded: readonly Modifier[];
} {
  const ordered = [...modifiers].sort(compareIds);
  const strongestByFamily = new Map<string, Modifier>();
  for (const modifier of ordered) {
    if (modifier.family === undefined) continue;
    const current = strongestByFamily.get(modifier.family);
    if (current === undefined || Math.abs(modifier.value) > Math.abs(current.value)) {
      strongestByFamily.set(modifier.family, modifier);
    }
  }
  const applied = ordered.filter((modifier) => (
    modifier.family === undefined || strongestByFamily.get(modifier.family) === modifier
  ));
  return {
    applied,
    excluded: ordered.filter((modifier) => !applied.includes(modifier)),
  };
}

function clampResolved(target: StatTarget, base: number, value: number): number {
  const rule = STAT_TARGET_RULES[target];
  const bounded = Math.max(rule.minimum, Math.min(rule.maximum, value));
  if (!rule.softcap || bounded <= base || base >= rule.maximum) return Math.floor(bounded);
  return Math.round(soften(rule.maximum, base, bounded - base));
}

/** Resolves exactly one target through the binding flat → pctAdd → pctMult →
 * override order. Inputs are copied and id-sorted; caller ordering is irrelevant. */
export function resolveModifierTargetDetailed(
  target: StatTarget,
  base: number,
  modifiers: readonly Modifier[],
): ModifierResolution {
  validateInteger(`${target} base`, base);
  const relevant = modifiers.filter((modifier) => modifier.target === target);
  for (const modifier of relevant) validateInteger(`modifier ${modifier.id}`, modifier.value);
  const selected = selectExclusiveFamilies(relevant);
  const flats = selected.applied.filter((modifier) => modifier.layer === 'flat');
  const additivePercent = selected.applied
    .filter((modifier) => modifier.layer === 'pctAdd')
    .reduce((sum, modifier) => sum + modifier.value, 0);
  const multiplicative = selected.applied
    .filter((modifier) => modifier.layer === 'pctMult')
    .sort(compareIds);
  const overrides = selected.applied
    .filter((modifier) => modifier.layer === 'override')
    .sort((left, right) => right.value - left.value || compareIds(left, right));

  let value = base + flats.reduce((sum, modifier) => sum + modifier.value, 0);
  value = Math.floor(value * (BASIS_POINTS + additivePercent) / BASIS_POINTS);
  for (const modifier of multiplicative) {
    value = Math.floor(value * (BASIS_POINTS + modifier.value) / BASIS_POINTS);
  }
  if (overrides[0] !== undefined) value = overrides[0].value;
  return {
    target,
    base,
    value: clampResolved(target, base, value),
    applied: selected.applied,
    excludedByFamily: selected.excluded,
  };
}

export function resolveModifierTarget(
  target: StatTarget,
  base: number,
  modifiers: readonly Modifier[],
): number {
  return resolveModifierTargetDetailed(target, base, modifiers).value;
}

/** Static data lint used by item/effect definition tests. Multiple overrides
 * for one target are legal only when every one participates in one family. */
export function modifierDataWarnings(modifiers: readonly Modifier[]): readonly string[] {
  const warnings: string[] = [];
  for (const target of STAT_TARGETS) {
    const overrides = modifiers.filter((modifier) => (
      modifier.target === target && modifier.layer === 'override'
    ));
    if (overrides.length <= 1) continue;
    const family = overrides[0]?.family;
    if (family === undefined || overrides.some((modifier) => modifier.family !== family)) {
      warnings.push(`${target} has multiple overrides outside one exclusive family`);
    }
  }
  return warnings;
}

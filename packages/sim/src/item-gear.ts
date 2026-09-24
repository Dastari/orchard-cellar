import {
  gearRarityRank,
  gearStatDisplayValue,
  gearStatModifierValue,
  legendaryEffectCount,
  type GearCatalogue,
} from './content/gear-catalogue.js';
import {
  GEAR_RARITY_IDS,
  type GearBaseContentDefinition,
  type GearRarityId,
  type GearStatDefinition,
} from './content/gear-definition.js';
import type { EquipmentSkillContribution } from './equipment-skills.js';
import type { Modifier } from './modifiers.js';

/**
 * One gear item copy (Gear-D2). The record names content by key and never
 * stores numbers: every value is derived from the content tables and the item
 * level, so balance changes also reach items players already own.
 *
 * `instanceId` is the canonical decimal string of a non-zero u64. A string
 * (not a bigint) survives JSON, structured clones, `===` stack comparisons and
 * modifier/source ids unchanged; the future u64 column converts once at the
 * row boundary with `BigInt(instanceId)`.
 */
export interface ItemGear {
  readonly instanceId: string;
  /** Roll rules this copy was created under; lets later roll changes keep old copies stable. */
  readonly rollVersion: number;
  readonly rarity: GearRarityId;
  /** Material key, for example `steel`. */
  readonly material: string;
  readonly itemLevel: number;
  /** Prefix, suffix, lineage and legendary keys; `''` means none. */
  readonly prefix: string;
  readonly suffix: string;
  readonly lineage: string;
  readonly legendary: string;
  /** u32 kept for later random variance; no value reads it yet. */
  readonly seed: number;
}

export const GEAR_ROLL_VERSION = 1;

const U64_MAX = (1n << 64n) - 1n;
const U32_MAX = 0xffff_ffff;
const INSTANCE_ID_PATTERN = /^[1-9][0-9]{0,19}$/u;

export function isGearInstanceId(value: unknown): value is string {
  return typeof value === 'string' && INSTANCE_ID_PATTERN.test(value) && BigInt(value) <= U64_MAX;
}

/** Numeric order of canonical instance ids without converting to bigint. */
export function compareGearInstanceIds(left: string, right: string): number {
  if (left.length !== right.length) return left.length - right.length;
  return left < right ? -1 : left > right ? 1 : 0;
}

export type ItemGearIssueCode =
  | 'invalid_instance_id'
  | 'invalid_roll_version'
  | 'invalid_seed'
  | 'unknown_rarity'
  | 'unknown_base'
  | 'unknown_material'
  | 'material_not_allowed'
  | 'invalid_item_level'
  | 'item_level_out_of_band'
  | 'effect_count'
  | 'unknown_prefix'
  | 'unknown_suffix'
  | 'unknown_lineage'
  | 'unknown_legendary'
  | 'legendary_mismatch'
  | 'affix_rarity'
  | 'affix_suits'
  | 'skill_rank_rarity';

export interface ItemGearIssue {
  readonly code: ItemGearIssueCode;
  readonly field: keyof ItemGear | 'base';
  readonly message: string;
}

export type ItemGearEffectSource = 'prefix' | 'suffix' | 'lineage' | 'legendary';

export interface ItemGearEffect {
  readonly source: ItemGearEffectSource;
  readonly stat: GearStatDefinition;
  /** Tooltip number: points, percent, per second (tenths) or 1 rank. */
  readonly displayValue: number;
  /** Simulation units for modifier stats; null for skill ranks. */
  readonly modifierValue: number | null;
}

function text(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Checks one copy against the gear content for the base it belongs to (the
 * base comes from the item definition; the record does not repeat it).
 * Returns every problem found; an empty list means the copy is valid.
 */
export function validateItemGear(gear: ItemGear, baseKey: string, catalogue: GearCatalogue): readonly ItemGearIssue[] {
  const issues: ItemGearIssue[] = [];
  const add = (code: ItemGearIssueCode, field: ItemGearIssue['field'], message: string): void => {
    issues.push({ code, field, message });
  };
  if (!isGearInstanceId(gear.instanceId)) add('invalid_instance_id', 'instanceId', 'instance id must be a canonical non-zero u64 decimal');
  if (!Number.isSafeInteger(gear.rollVersion) || gear.rollVersion < 1 || gear.rollVersion > GEAR_ROLL_VERSION) {
    add('invalid_roll_version', 'rollVersion', `roll version must be 1-${GEAR_ROLL_VERSION}`);
  }
  if (!Number.isSafeInteger(gear.seed) || gear.seed < 0 || gear.seed > U32_MAX) add('invalid_seed', 'seed', 'seed must be a u32');
  for (const field of ['material', 'prefix', 'suffix', 'lineage', 'legendary'] as const) {
    if (!text(gear[field])) add(field === 'material' ? 'unknown_material' : `unknown_${field}`, field, `${field} must be a key or ''`);
  }

  const rarity = (GEAR_RARITY_IDS as readonly unknown[]).includes(gear.rarity) ? catalogue.rarities.get(gear.rarity) : undefined;
  if (rarity === undefined) {
    add('unknown_rarity', 'rarity', `unknown rarity ${String(gear.rarity)}`);
    return issues;
  }
  const base = catalogue.bases.get(baseKey);
  if (base === undefined) add('unknown_base', 'base', `unknown base ${baseKey}`);
  const material = catalogue.materials.get(gear.material);
  if (material === undefined) add('unknown_material', 'material', `unknown material ${gear.material}`);
  else if (base !== undefined && !base.lines.includes(material.line)) {
    add('material_not_allowed', 'material', `${base.name} is not made from ${material.line}`);
  }

  // Effect slots by rarity (Gear-D1): the record shape fixes which may be set.
  const used = {
    prefix: gear.prefix !== '', suffix: gear.suffix !== '', lineage: gear.lineage !== '', legendary: gear.legendary !== '',
  };
  const allowed: Record<GearRarityId, readonly (keyof typeof used)[]> = {
    poor: [], common: [], uncommon: ['prefix', 'suffix'], rare: ['prefix', 'suffix'], epic: ['lineage'], legendary: ['legendary'],
  };
  for (const slot of ['prefix', 'suffix', 'lineage', 'legendary'] as const) {
    if (used[slot] && !allowed[rarity.id].includes(slot)) add('effect_count', slot, `${rarity.id} items have no ${slot}`);
  }
  const affixCount = Number(used.prefix) + Number(used.suffix);
  if ((rarity.id === 'uncommon' || rarity.id === 'rare') && affixCount !== rarity.effects) {
    add('effect_count', used.prefix ? 'suffix' : 'prefix',
      rarity.id === 'uncommon' ? 'uncommon items carry exactly one of prefix or suffix' : 'rare items carry both a prefix and a suffix');
  }
  if (rarity.id === 'epic' && !used.lineage) add('effect_count', 'lineage', 'epic items carry a lineage');
  if (rarity.id === 'legendary' && !used.legendary) add('effect_count', 'legendary', 'legendary items name their legendary');

  const effectStats: GearStatDefinition[] = [];
  for (const slot of ['prefix', 'suffix'] as const) {
    if (!used[slot] || !allowed[rarity.id].includes(slot)) continue;
    const affix = (slot === 'prefix' ? catalogue.prefixes : catalogue.suffixes).get(gear[slot]);
    if (affix === undefined) { add(`unknown_${slot}`, slot, `unknown ${slot} ${gear[slot]}`); continue; }
    if (gearRarityRank(rarity.id) < gearRarityRank(affix.from)) add('affix_rarity', slot, `${affix.name} rolls from ${affix.from}`);
    if (base !== undefined && affix.suits.length > 0 && !affix.suits.includes(base.group)) {
      add('affix_suits', slot, `${affix.name} does not suit ${base.group}`);
    }
    const stat = catalogue.stats.get(affix.stat);
    if (stat !== undefined) effectStats.push(stat);
  }
  if (rarity.id === 'epic' && used.lineage) {
    const lineage = catalogue.lineages.get(gear.lineage);
    if (lineage === undefined) add('unknown_lineage', 'lineage', `unknown lineage ${gear.lineage}`);
    else {
      if (lineage.effects.length !== rarity.effects) add('effect_count', 'lineage', `epic items carry ${rarity.effects} effects`);
      for (const effect of lineage.effects) { const stat = catalogue.stats.get(effect); if (stat !== undefined) effectStats.push(stat); }
    }
  }

  const levels = catalogue.rules.legendaryItemLevels;
  if (!Number.isSafeInteger(gear.itemLevel) || gear.itemLevel < 1 || gear.itemLevel > catalogue.rules.maxItemLevel) {
    add('invalid_item_level', 'itemLevel', `item level must be 1-${catalogue.rules.maxItemLevel}`);
  } else if (rarity.id === 'legendary') {
    if (gear.itemLevel < levels.minimum || gear.itemLevel > levels.maximum) {
      add('item_level_out_of_band', 'itemLevel', `legendaries are item level ${levels.minimum}-${levels.maximum}`);
    }
  } else if (material !== undefined) {
    const band = catalogue.bands.get(material.tier);
    if (band === undefined || gear.itemLevel < band.minimum || gear.itemLevel > band.maximum) {
      add('item_level_out_of_band', 'itemLevel',
        band === undefined ? `no band for tier ${material.tier}` : `${material.name} is item level ${band.minimum}-${band.maximum}`);
    }
  }

  if (rarity.id === 'legendary' && used.legendary) {
    const legendary = catalogue.legendaries.get(gear.legendary);
    if (legendary === undefined) add('unknown_legendary', 'legendary', `unknown legendary ${gear.legendary}`);
    else {
      if (legendary.base !== baseKey) add('legendary_mismatch', 'base', `${legendary.name} is a ${legendary.base}`);
      if (legendary.material !== gear.material) add('legendary_mismatch', 'material', `${legendary.name} is ${legendary.material}`);
      const legendaryBase = catalogue.bases.get(legendary.base);
      if (legendaryBase !== undefined && legendary.effects.length !== legendaryEffectCount(catalogue, legendaryBase)) {
        add('effect_count', 'legendary', `${legendary.name} carries the wrong number of effects`);
      }
      for (const effect of legendary.effects) { const stat = catalogue.stats.get(effect); if (stat !== undefined) effectStats.push(stat); }
    }
  }

  if (gearRarityRank(rarity.id) < gearRarityRank('rare') && effectStats.some((stat) => stat.skillNode !== undefined)) {
    add('skill_rank_rarity', used.prefix ? 'prefix' : 'suffix', 'skill-rank effects are rare or better');
  }
  return issues;
}

/**
 * Resolves the copy's effects. Rarity decides which slots count, so a copy can
 * never gain more effects than its rarity allows; unknown keys contribute
 * nothing. Call validateItemGear first at authority boundaries.
 */
export function itemGearEffects(gear: ItemGear, catalogue: GearCatalogue): readonly ItemGearEffect[] {
  const effect = (source: ItemGearEffectSource, statId: string | undefined): ItemGearEffect[] => {
    const stat = statId === undefined ? undefined : catalogue.stats.get(statId);
    return stat === undefined ? [] : [{
      source, stat,
      displayValue: gearStatDisplayValue(stat, gear.itemLevel),
      modifierValue: gearStatModifierValue(stat, gear.itemLevel),
    }];
  };
  if (!Number.isSafeInteger(gear.itemLevel) || gear.itemLevel < 1 || gear.itemLevel > catalogue.rules.maxItemLevel) return [];
  switch (gear.rarity) {
    case 'uncommon':
    case 'rare':
      return [
        ...(gear.prefix === '' ? [] : effect('prefix', catalogue.prefixes.get(gear.prefix)?.stat)),
        ...(gear.suffix === '' ? [] : effect('suffix', catalogue.suffixes.get(gear.suffix)?.stat)),
      ];
    case 'epic':
      return (catalogue.lineages.get(gear.lineage)?.effects ?? []).flatMap((stat) => effect('lineage', stat));
    case 'legendary':
      return (catalogue.legendaries.get(gear.legendary)?.effects ?? []).flatMap((stat) => effect('legendary', stat));
    default:
      return [];
  }
}

/** Equipment modifiers for the copy, ids `gear.<instanceId>.<source>.<stat>`.
 * Skill ranks are not modifiers; see itemGearSkillContributions. */
export function gearModifiers(gear: ItemGear, catalogue: GearCatalogue): readonly Modifier[] {
  return itemGearEffects(gear, catalogue).flatMap(({ source, stat, modifierValue }): Modifier[] => (
    stat.modifier === undefined || modifierValue === null ? [] : [{
      id: `gear.${gear.instanceId}.${source}.${stat.id}`,
      target: stat.modifier.target,
      layer: stat.modifier.layer,
      value: modifierValue,
      source: 'equipment',
    }]
  ));
}

/** Skill-rank grants in the shape resolveEquipmentSkillRanks consumes. Only
 * rare or better copies contribute, matching the equipment-rank rule. */
export function itemGearSkillContributions(gear: ItemGear, catalogue: GearCatalogue): readonly EquipmentSkillContribution[] {
  if (gear.rarity !== 'rare' && gear.rarity !== 'epic' && gear.rarity !== 'legendary') return [];
  const quality = gear.rarity;
  return itemGearEffects(gear, catalogue).flatMap(({ source, stat }) => (
    stat.skillNode === undefined ? [] : [{ sourceId: `gear.${gear.instanceId}.${source}.${stat.id}`, nodeId: stat.skillNode, quality }]
  ));
}

function fnv1a(value: string): number {
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function gearBase(gear: ItemGear, baseKey: string, catalogue: GearCatalogue): GearBaseContentDefinition | undefined {
  const legendary = gear.rarity === 'legendary' ? catalogue.legendaries.get(gear.legendary) : undefined;
  return catalogue.bases.get(legendary?.base ?? baseKey);
}

/**
 * Display name by the naming grammar:
 * - poor: {Damage} {Material} {Base}, the word chosen deterministically from base and material;
 * - common: {Material} {Base};
 * - uncommon: {Prefix} {Material} {Base} or {Material} {Base} {Suffix};
 * - rare: {Prefix} {Base} {Suffix} (material shows in the tooltip);
 * - epic: {Lineage} {Base};
 * - legendary: its unique name.
 */
export function itemGearDisplayName(gear: ItemGear, baseKey: string, catalogue: GearCatalogue): string {
  const base = gearBase(gear, baseKey, catalogue);
  const baseName = base?.name ?? baseKey;
  const material = catalogue.materials.get(gear.material);
  if (gear.rarity === 'legendary') return catalogue.legendaries.get(gear.legendary)?.name ?? baseName;
  if (gear.rarity === 'epic') {
    const lineage = catalogue.lineages.get(gear.lineage);
    return lineage === undefined ? baseName : `${lineage.name} ${baseName}`;
  }
  if (gear.rarity === 'poor' && material !== undefined) {
    const words = catalogue.rules.poorWords[material.line];
    const word = words[fnv1a(`${baseKey}${gear.material}`) % words.length]!;
    return `${word} ${material.name} ${baseName}`;
  }
  const prefix = gear.rarity === 'uncommon' || gear.rarity === 'rare' ? catalogue.prefixes.get(gear.prefix)?.name : undefined;
  const suffix = gear.rarity === 'uncommon' || gear.rarity === 'rare' ? catalogue.suffixes.get(gear.suffix)?.name : undefined;
  if (gear.rarity === 'rare' && prefix !== undefined && suffix !== undefined) return `${prefix} ${baseName} ${suffix}`;
  return [prefix, material?.name, baseName, suffix].filter((part): part is string => part !== undefined).join(' ');
}

/** Merchant sell value in bronze: bronzePerLevel × itemLevel^levelExponent ×
 * rarity multiplier × max(minimumWeight, base weight), at least 1. */
export function itemGearSellValue(gear: ItemGear, baseKey: string, catalogue: GearCatalogue): number {
  const rarity = catalogue.rarities.get(gear.rarity);
  const base = gearBase(gear, baseKey, catalogue);
  if (rarity === undefined || base === undefined || !Number.isSafeInteger(gear.itemLevel) || gear.itemLevel < 1) return 0;
  const { bronzePerLevel, levelExponent, minimumWeight } = catalogue.rules.sellValue;
  return Math.max(1, Math.round(bronzePerLevel * gear.itemLevel ** levelExponent * rarity.priceMultiplier
    * Math.max(minimumWeight, base.weight)));
}

/** Records are equal only when every field matches (same copy, same roll). */
export function itemGearEquals(left: ItemGear, right: ItemGear): boolean {
  return left.instanceId === right.instanceId && left.rollVersion === right.rollVersion && left.rarity === right.rarity
    && left.material === right.material && left.itemLevel === right.itemLevel && left.prefix === right.prefix
    && left.suffix === right.suffix && left.lineage === right.lineage && left.legendary === right.legendary && left.seed === right.seed;
}

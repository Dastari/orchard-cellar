import {
  GEAR_RARITY_IDS,
  GEAR_RULES_ID,
  gearDefinitionKey,
  gearPerLevelMilli,
  type GearAffixContentDefinition,
  type GearBaseContentDefinition,
  type GearContentDefinition,
  type GearItemLevelBand,
  type GearLegendaryContentDefinition,
  type GearLineageContentDefinition,
  type GearMaterialContentDefinition,
  type GearRarityDefinition,
  type GearRarityId,
  type GearRulesContentDefinition,
  type GearStatDefinition,
  type GearTable,
} from './gear-definition.js';

/** Active (non-retired) gear content, keyed by the short keys item copies store. */
export interface GearCatalogue {
  readonly rules: GearRulesContentDefinition;
  readonly rarities: ReadonlyMap<GearRarityId, GearRarityDefinition>;
  readonly bands: ReadonlyMap<number, GearItemLevelBand>;
  readonly stats: ReadonlyMap<string, GearStatDefinition>;
  readonly materials: ReadonlyMap<string, GearMaterialContentDefinition>;
  readonly prefixes: ReadonlyMap<string, GearAffixContentDefinition>;
  readonly suffixes: ReadonlyMap<string, GearAffixContentDefinition>;
  readonly lineages: ReadonlyMap<string, GearLineageContentDefinition>;
  readonly legendaries: ReadonlyMap<string, GearLegendaryContentDefinition>;
  readonly bases: ReadonlyMap<string, GearBaseContentDefinition>;
}

export interface GearCatalogueIssue {
  readonly code: 'invalid_gear_definition' | 'unresolved_reference';
  readonly definitionId: string;
  readonly path?: string;
  readonly message: string;
}

/** Position on the rarity ladder (poor = 0). */
export function gearRarityRank(rarity: GearRarityId): number {
  return GEAR_RARITY_IDS.indexOf(rarity);
}

/** Main-hand and two-hand bases are weapons; shields, armour and tools are not. */
export function isGearWeaponBase(base: Pick<GearBaseContentDefinition, 'slot'>): boolean {
  return base.slot === 'main_hand' || base.slot === 'two_hand';
}

/** Effects a legendary must carry: 3 for armour, 4 for weapons (Gear-D1). */
export function legendaryEffectCount(catalogue: Pick<GearCatalogue, 'rarities'>, base: Pick<GearBaseContentDefinition, 'slot'>): number {
  const legendary = catalogue.rarities.get('legendary');
  if (legendary === undefined) return 0;
  return isGearWeaponBase(base) ? legendary.weaponEffects ?? legendary.effects : legendary.effects;
}

function roundHalfUp(numerator: number, denominator: number): number {
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

/**
 * Effect size in thousandths of a display unit. Item level alone sets it
 * (rarity only sets how many effects exist). Points and percentages round to
 * whole units with a minimum of 1; per-second values round to tenths with a
 * minimum of 0.1; skill ranks are always 1. Integer arithmetic keeps client
 * previews and the authority identical.
 */
export function gearStatDisplayMilli(stat: Pick<GearStatDefinition, 'display' | 'perLevel'>, itemLevel: number): number {
  if (stat.display === 'rank') return 1000;
  const raw = itemLevel * gearPerLevelMilli(stat.perLevel);
  if (stat.display === 'perSecond') return Math.max(100, roundHalfUp(raw, 100) * 100);
  return Math.max(1000, roundHalfUp(raw, 1000) * 1000);
}

/** Tooltip value: +7 Intelligence, 15 (%), 0.6 (per second) or 1 (rank). */
export function gearStatDisplayValue(stat: Pick<GearStatDefinition, 'display' | 'perLevel'>, itemLevel: number): number {
  return gearStatDisplayMilli(stat, itemLevel) / 1000;
}

/** Modifier value in simulation units, or null for skill-rank stats. */
export function gearStatModifierValue(stat: GearStatDefinition, itemLevel: number): number | null {
  if (stat.modifier === undefined) return null;
  return gearStatDisplayMilli(stat, itemLevel) * stat.modifier.unitsPerDisplay / 1000;
}

/** Required level follows item level, capped at the rules' level cap. */
export function gearRequiredLevel(catalogue: Pick<GearCatalogue, 'rules'>, itemLevel: number): number {
  return Math.min(catalogue.rules.requiredLevelCap, itemLevel);
}

function isGear(definition: { readonly kind: string }): definition is GearContentDefinition {
  return definition.kind === 'gear';
}

function keyed<T extends GearContentDefinition>(rows: readonly GearContentDefinition[], table: Exclude<GearTable, 'rules'>): ReadonlyMap<string, T> {
  const entries: [string, T][] = [];
  for (const row of rows) {
    if (row.table !== table) continue;
    const key = gearDefinitionKey(row.id, table);
    if (key !== null) entries.push([key, row as T]);
  }
  return new Map(entries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)));
}

/** Builds the lookup view from active gear rows; null without an active rules row.
 * Retired rows are left out, so copies naming them fail validation closed. */
export function compileGearCatalogue(definitions: Iterable<{ readonly kind: string }>): GearCatalogue | null {
  const rows = [...definitions].filter(isGear).filter((row) => row.retired !== true);
  const rules = rows.find((row): row is GearRulesContentDefinition => row.table === 'rules' && row.id === GEAR_RULES_ID);
  if (rules === undefined) return null;
  return Object.freeze({
    rules,
    rarities: new Map(rules.rarities.map((rarity) => [rarity.id, rarity] as const)),
    bands: new Map(rules.itemLevelBands.map((band) => [band.tier, band] as const)),
    stats: new Map(rules.stats.map((stat) => [stat.id, stat] as const)),
    materials: keyed<GearMaterialContentDefinition>(rows, 'material'),
    prefixes: keyed<GearAffixContentDefinition>(rows, 'prefix'),
    suffixes: keyed<GearAffixContentDefinition>(rows, 'suffix'),
    lineages: keyed<GearLineageContentDefinition>(rows, 'lineage'),
    legendaries: keyed<GearLegendaryContentDefinition>(rows, 'legendary'),
    bases: keyed<GearBaseContentDefinition>(rows, 'base'),
  });
}

/** Expected effect counts are fixed by the item-copy shape (Gear-D1/D2):
 * uncommon holds one prefix or suffix and rare holds both. */
const FIXED_EFFECT_COUNTS: Partial<Record<GearRarityId, number>> = { poor: 0, common: 0, uncommon: 1, rare: 2 };

/**
 * Cross-row gear checks for the content pack. Row shape (unknown stat
 * targets, bad bands, duplicate stat ids and so on) is rejected earlier by
 * the parser; duplicate row ids by the pack's `duplicate_id` check.
 */
export function gearCatalogueIssues(
  definitions: readonly { readonly kind: string }[],
  gearSkillNodes: ReadonlySet<string>,
): readonly GearCatalogueIssue[] {
  const issues: GearCatalogueIssue[] = [];
  const add = (code: GearCatalogueIssue['code'], definitionId: string, message: string, path?: string): void => {
    issues.push({ code, definitionId, message, ...(path === undefined ? {} : { path }) });
  };
  const rows = definitions.filter(isGear);
  if (rows.length === 0) return issues;
  const catalogue = compileGearCatalogue(rows);
  if (catalogue === null) {
    add('invalid_gear_definition', rows[0]!.id, `gear rows need one active ${GEAR_RULES_ID} row`);
    return issues;
  }
  const { rules } = catalogue;

  for (const rarity of rules.rarities) {
    const expected = FIXED_EFFECT_COUNTS[rarity.id];
    if (expected !== undefined ? rarity.effects !== expected : rarity.effects < 1) {
      add('invalid_gear_definition', rules.id, `${rarity.id} items carry ${expected ?? 'at least 1'} effect(s)`, `rarities.${rarity.id}.effects`);
    }
  }
  for (const stat of rules.stats) {
    if (stat.skillNode !== undefined && !gearSkillNodes.has(stat.skillNode)) {
      add('unresolved_reference', rules.id, `stat ${stat.id} names ${stat.skillNode}, which is not a gear-boostable skill node`, `stats.${stat.id}.skillNode`);
    }
    for (let level = 1; level <= rules.maxItemLevel; level += 1) {
      const value = gearStatModifierValue(stat, level);
      if (value !== null && !Number.isSafeInteger(value)) {
        add('invalid_gear_definition', rules.id, `stat ${stat.id} is not a whole modifier at item level ${level}`, `stats.${stat.id}`);
        break;
      }
    }
  }

  const groups = new Set([...catalogue.bases.values()].map((base) => base.group));
  const affixes = [...catalogue.prefixes.values(), ...catalogue.suffixes.values()];
  for (const affix of affixes) {
    const stat = catalogue.stats.get(affix.stat);
    if (stat === undefined) add('unresolved_reference', affix.id, `unknown stat ${affix.stat}`, 'stat');
    else if (stat.skillNode !== undefined && gearRarityRank(affix.from) < gearRarityRank('rare')) {
      add('invalid_gear_definition', affix.id, 'skill-rank affixes are rare or better', 'from');
    }
    if (gearRarityRank(affix.from) < gearRarityRank('uncommon') || gearRarityRank(affix.from) > gearRarityRank('rare')) {
      add('invalid_gear_definition', affix.id, 'affixes roll on uncommon and rare items only', 'from');
    }
    affix.suits.forEach((group, index) => {
      if (!groups.has(group)) add('unresolved_reference', affix.id, `no base belongs to group ${group}`, `suits[${index}]`);
    });
  }

  for (const material of catalogue.materials.values()) {
    if (!catalogue.bands.has(material.tier)) add('unresolved_reference', material.id, `no item-level band for tier ${material.tier}`, 'tier');
  }

  const epicEffects = catalogue.rarities.get('epic')?.effects ?? 0;
  for (const lineage of catalogue.lineages.values()) {
    if (lineage.effects.length !== epicEffects) {
      add('invalid_gear_definition', lineage.id, `epic lineages carry exactly ${epicEffects} effects`, 'effects');
    }
    lineage.effects.forEach((effect, index) => {
      if (!catalogue.stats.has(effect)) add('unresolved_reference', lineage.id, `unknown stat ${effect}`, `effects[${index}]`);
    });
  }

  const band = rules.legendaryItemLevels;
  for (const legendary of catalogue.legendaries.values()) {
    const base = catalogue.bases.get(legendary.base);
    const material = catalogue.materials.get(legendary.material);
    if (base === undefined) add('unresolved_reference', legendary.id, `unknown base ${legendary.base}`, 'base');
    if (material === undefined) add('unresolved_reference', legendary.id, `unknown material ${legendary.material}`, 'material');
    if (base !== undefined && material !== undefined && !base.lines.includes(material.line)) {
      add('invalid_gear_definition', legendary.id, `${base.name} is not made from ${material.line}`, 'material');
    }
    if (base !== undefined) {
      const expected = legendaryEffectCount(catalogue, base);
      if (legendary.effects.length !== expected) {
        add('invalid_gear_definition', legendary.id,
          `legendary ${isGearWeaponBase(base) ? 'weapons' : 'armour'} carry exactly ${expected} effects plus a signature`, 'effects');
      }
    }
    legendary.effects.forEach((effect, index) => {
      if (!catalogue.stats.has(effect)) add('unresolved_reference', legendary.id, `unknown stat ${effect}`, `effects[${index}]`);
    });
    if (legendary.itemLevel < band.minimum || legendary.itemLevel > band.maximum) {
      add('invalid_gear_definition', legendary.id, `legendaries are item level ${band.minimum}-${band.maximum}`, 'itemLevel');
    }
  }
  return issues;
}

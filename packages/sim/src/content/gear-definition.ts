import { STAT_TARGETS, type StatTarget } from '../modifiers.js';
import { ContentParseError } from './parse-contract.js';

/**
 * Gear catalogue content (Gear-D1/D2). One `gear` content kind carries seven
 * row tables so Cellar Studio can edit each material, affix, lineage,
 * legendary and base as its own row, while one `gear:rules` row owns the
 * global tables (rarities, item-level bands, stat sizes, poor-item words and
 * the sell formula).
 *
 * Row ids are `gear:<table>_<key>`; the `<key>` is what an item copy's
 * `ItemGear` record stores (for example `gear:material_bronze` is material
 * `bronze`). Keys are durable once items exist, so rename by retiring.
 */
export type GearDefinitionId = `gear:${string}`;

export const GEAR_TABLES = ['rules', 'material', 'prefix', 'suffix', 'lineage', 'legendary', 'base'] as const;
export type GearTable = typeof GEAR_TABLES[number];

/** Closed rarity ladder, lowest first (Gear-D1). Order is the rank used by
 * affix `from` gates and the rare-or-better skill-rank rule. */
export const GEAR_RARITY_IDS = ['poor', 'common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
export type GearRarityId = typeof GEAR_RARITY_IDS[number];

export const GEAR_MATERIAL_LINES = ['metal', 'cloth', 'leather', 'gem', 'wood'] as const;
export type GearMaterialLine = typeof GEAR_MATERIAL_LINES[number];

export const GEAR_SLOTS = ['head', 'body', 'legs', 'hands', 'feet', 'back', 'main_hand', 'off_hand', 'two_hand', 'tool', 'ammo'] as const;
export type GearSlot = typeof GEAR_SLOTS[number];

export const GEAR_ARMOUR_CLASSES = ['cloth', 'leather', 'plate'] as const;
export type GearArmourClass = typeof GEAR_ARMOUR_CLASSES[number];

/** Premium-icon columns / worn colour ramps (the gear rig's material ramps). */
export const GEAR_PALETTES = ['silver', 'iron', 'bronze', 'gold', 'jade', 'frost', 'ember', 'ruby', 'amethyst', 'obsidian'] as const;
export type GearPalette = typeof GEAR_PALETTES[number];

/** Kenmi cloth-layer colours used by cloth and leather worn layers. */
export const GEAR_CLOTH_COLOURS = ['Black', 'Blue', 'Brown', 'Green', 'Orange', 'Pink', 'Purple', 'Red', 'White'] as const;
export type GearClothColour = typeof GEAR_CLOTH_COLOURS[number];

export const GEAR_STAT_DISPLAYS = ['points', 'percent', 'perSecond', 'rank'] as const;
export type GearStatDisplay = typeof GEAR_STAT_DISPLAYS[number];

export const GEAR_STAT_LINES = ['primary', 'equip'] as const;
export type GearStatLine = typeof GEAR_STAT_LINES[number];

/** Equipment only authors additive layers; budgets reject the others. */
export const GEAR_MODIFIER_LAYERS = ['flat', 'pctAdd'] as const;
export type GearModifierLayer = typeof GEAR_MODIFIER_LAYERS[number];

interface GearDefinitionBase<T extends GearTable> {
  readonly id: GearDefinitionId;
  readonly kind: 'gear';
  readonly schemaVersion: 1;
  readonly retired?: boolean;
  readonly replacement?: GearDefinitionId;
  readonly table: T;
}

export interface GearRarityDefinition {
  readonly id: GearRarityId;
  readonly name: string;
  /** Tooltip name colour, `#rrggbb`. */
  readonly color: string;
  /** Number of effects (prefix, suffix, lineage or legendary stats). Item level, not rarity, sets their size. */
  readonly effects: number;
  /** Legendary weapons (main-hand and two-hand bases) carry this many effects instead. */
  readonly weaponEffects?: number;
  /** Sell-value multiplier. */
  readonly priceMultiplier: number;
}

export interface GearItemLevelBand {
  readonly tier: number;
  readonly minimum: number;
  readonly maximum: number;
}

export interface GearItemLevelRange {
  readonly minimum: number;
  readonly maximum: number;
}

/** How one display unit of a stat becomes a simulation modifier. */
export interface GearStatModifierDefinition {
  readonly target: StatTarget;
  readonly layer: GearModifierLayer;
  /** Signed modifier units per display unit: 1 per attribute point, 100 basis
   * points per percent, 100 centi per Health point or per regenerated point per
   * second; negative for reductions (swing interval, vigour costs). */
  readonly unitsPerDisplay: number;
}

export interface GearStatDefinition {
  readonly id: string;
  readonly label: string;
  /** White tooltip line (primary) or green `Equip:` line. */
  readonly line: GearStatLine;
  readonly display: GearStatDisplay;
  /** Display units per item level (see gearStatDisplayValue). Thousandths precision; 0 for ranks. */
  readonly perLevel: number;
  /** Exactly one of `modifier` or `skillNode`. */
  readonly modifier?: GearStatModifierDefinition;
  /** Gear-boostable skill node granted one rank (rare or better only). */
  readonly skillNode?: string;
}

export interface GearPoorWords {
  readonly metal: readonly string[];
  readonly cloth: readonly string[];
  readonly leather: readonly string[];
  readonly gem: readonly string[];
  readonly wood: readonly string[];
}

/** Sell value in bronze: bronzePerLevel × itemLevel^levelExponent × rarity multiplier × max(minimumWeight, base weight). */
export interface GearSellValueDefinition {
  readonly bronzePerLevel: number;
  readonly levelExponent: number;
  readonly minimumWeight: number;
}

export interface GearRulesContentDefinition extends GearDefinitionBase<'rules'> {
  readonly maxItemLevel: number;
  /** Required level follows item level, capped here. */
  readonly requiredLevelCap: number;
  readonly legendaryItemLevels: GearItemLevelRange;
  readonly rarities: readonly GearRarityDefinition[];
  readonly itemLevelBands: readonly GearItemLevelBand[];
  readonly stats: readonly GearStatDefinition[];
  readonly poorWords: GearPoorWords;
  readonly sellValue: GearSellValueDefinition;
}

export interface GearMaterialContentDefinition extends GearDefinitionBase<'material'> {
  readonly name: string;
  readonly line: GearMaterialLine;
  /** Selects the item-level band. */
  readonly tier: number;
  readonly palette: GearPalette;
  readonly cloth?: GearClothColour;
  readonly note?: string;
}

export interface GearAffixContentDefinition extends GearDefinitionBase<'prefix' | 'suffix'> {
  readonly name: string;
  readonly stat: string;
  /** Lowest rarity that may roll this affix. */
  readonly from: GearRarityId;
  /** Base groups this affix suits; empty means any. */
  readonly suits: readonly string[];
}

export interface GearLineageVisual {
  readonly palette: GearPalette;
  readonly trim: GearPalette;
  readonly detail: GearPalette;
  /** Worn head design used by lineage greathelms. */
  readonly head: string;
}

export interface GearLineageContentDefinition extends GearDefinitionBase<'lineage'> {
  readonly name: string;
  readonly theme: string;
  readonly effects: readonly string[];
  readonly visual: GearLineageVisual;
}

export interface GearLegendaryVisual {
  readonly palette: GearPalette;
  readonly accent?: GearPalette;
  readonly detail?: GearPalette;
  readonly staffHead?: GearPalette;
  /** Premium icon row override. */
  readonly iconRow?: number;
  readonly bone?: boolean;
  /** Glow colour, `#rrggbb`. */
  readonly aura: string;
}

export interface GearLegendaryContentDefinition extends GearDefinitionBase<'legendary'> {
  readonly name: string;
  /** Base key, for example `warhammer`. */
  readonly base: string;
  /** Material key, for example `blackiron`. */
  readonly material: string;
  readonly itemLevel: number;
  readonly effects: readonly string[];
  readonly signature: string;
  readonly flavour: string;
  readonly visual?: GearLegendaryVisual;
}

export interface GearBaseContentDefinition extends GearDefinitionBase<'base'> {
  readonly name: string;
  readonly slot: GearSlot;
  /** Affix `suits` groups match this. */
  readonly group: string;
  readonly lines: readonly GearMaterialLine[];
  readonly armourClass?: GearArmourClass;
  /** Relative weight for sell value (and later armour and damage). */
  readonly weight: number;
}

export type GearContentDefinition =
  | GearRulesContentDefinition
  | GearMaterialContentDefinition
  | GearAffixContentDefinition
  | GearLineageContentDefinition
  | GearLegendaryContentDefinition
  | GearBaseContentDefinition;

export const GEAR_RULES_ID = 'gear:rules' as const;
const KEY_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/u;
/** Stat ids mirror modifier targets (`attackPower`), so they may be camelCase. */
const STAT_ID_PATTERN = /^[a-z][A-Za-z0-9_]{0,63}$/u;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/u;

/** `gear:<table>_<key>` → key; null for the rules row or a malformed id. */
export function gearDefinitionKey(id: string, table: Exclude<GearTable, 'rules'>): string | null {
  const prefix = `gear:${table}_`;
  if (!id.startsWith(prefix)) return null;
  const key = id.slice(prefix.length);
  return KEY_PATTERN.test(key) ? key : null;
}

export function gearDefinitionId(table: Exclude<GearTable, 'rules'>, key: string): GearDefinitionId {
  return `gear:${table}_${key}`;
}

function fail(path: string, message: string, code: 'invalid_type' | 'invalid_id' = 'invalid_type'): never {
  throw new ContentParseError(code, path, message);
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(path, 'expected an object');
  return value as Record<string, unknown>;
}

function onlyFields(source: Record<string, unknown>, path: string, fields: readonly string[]): void {
  for (const key of Object.keys(source)) if (!fields.includes(key)) fail(`${path}.${key}`, 'unknown field');
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value !== value.trim()) fail(path, 'expected non-empty trimmed text');
  return value;
}

function key(value: unknown, path: string): string {
  if (typeof value !== 'string' || !KEY_PATTERN.test(value)) fail(path, 'expected a lower_snake_case key');
  return value;
}

function statId(value: unknown, path: string): string {
  if (typeof value !== 'string' || !STAT_ID_PATTERN.test(value)) fail(path, 'expected a stat id');
  return value;
}

function integer(value: unknown, path: string, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    fail(path, `expected an integer from ${minimum} to ${maximum}`);
  }
  return value as number;
}

function positive(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) fail(path, 'expected a positive number');
  return value;
}

function oneOf<T extends string>(values: readonly T[], value: unknown, path: string): T {
  if (typeof value !== 'string' || !(values as readonly string[]).includes(value)) fail(path, `expected one of ${values.join(', ')}`);
  return value as T;
}

function color(value: unknown, path: string): string {
  if (typeof value !== 'string' || !COLOR_PATTERN.test(value)) fail(path, 'expected a #rrggbb colour');
  return value;
}

function uniqueList<T>(value: unknown, path: string, read: (entry: unknown, path: string) => T, allowEmpty = false): readonly T[] {
  if (!Array.isArray(value)) fail(path, 'expected an array');
  if (!allowEmpty && value.length === 0) fail(path, 'expected at least one entry');
  const entries = value.map((entry, index) => read(entry, `${path}[${index}]`));
  const seen = new Set<T>();
  entries.forEach((entry, index) => {
    if (seen.has(entry)) fail(`${path}[${index}]`, `duplicate entry ${String(entry)}`);
    seen.add(entry);
  });
  return Object.freeze(entries);
}

/** Thousandths are the finest per-level step so effect sizes stay integer. */
export function gearPerLevelMilli(perLevel: number): number {
  return Math.round(perLevel * 1000);
}

function perLevel(value: unknown, path: string, rank: boolean): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1000) fail(path, 'expected a number from 0 to 1000');
  if (Math.abs(value * 1000 - gearPerLevelMilli(value)) > 1e-6) fail(path, 'expected at most three decimal places');
  if (rank ? value !== 0 : value === 0) fail(path, rank ? 'rank stats have no per-level size' : 'expected a positive per-level size');
  return value;
}

function parseStat(value: unknown, path: string): GearStatDefinition {
  const source = object(value, path);
  onlyFields(source, path, ['id', 'label', 'line', 'display', 'perLevel', 'modifier', 'skillNode']);
  const display = oneOf(GEAR_STAT_DISPLAYS, source.display, `${path}.display`);
  const rank = display === 'rank';
  if ((source.modifier === undefined) === (source.skillNode === undefined)) fail(path, 'expected exactly one of modifier or skillNode');
  if (rank !== (source.skillNode !== undefined)) fail(`${path}.display`, 'rank display is used exactly by skill-node stats');
  let modifier: GearStatModifierDefinition | undefined;
  if (source.modifier !== undefined) {
    const raw = object(source.modifier, `${path}.modifier`);
    onlyFields(raw, `${path}.modifier`, ['target', 'layer', 'unitsPerDisplay']);
    const unitsPerDisplay = integer(raw.unitsPerDisplay, `${path}.modifier.unitsPerDisplay`, -1_000_000, 1_000_000);
    if (unitsPerDisplay === 0) fail(`${path}.modifier.unitsPerDisplay`, 'expected a non-zero scale');
    if (display === 'perSecond' && unitsPerDisplay % 10 !== 0) {
      fail(`${path}.modifier.unitsPerDisplay`, 'per-second stats round to tenths; the scale must be a multiple of 10');
    }
    modifier = Object.freeze({
      target: oneOf(STAT_TARGETS, raw.target, `${path}.modifier.target`),
      layer: oneOf(GEAR_MODIFIER_LAYERS, raw.layer, `${path}.modifier.layer`),
      unitsPerDisplay,
    });
  }
  return Object.freeze({
    id: statId(source.id, `${path}.id`),
    label: text(source.label, `${path}.label`),
    line: oneOf(GEAR_STAT_LINES, source.line, `${path}.line`),
    display,
    perLevel: perLevel(source.perLevel, `${path}.perLevel`, rank),
    ...(modifier === undefined ? {} : { modifier }),
    ...(source.skillNode === undefined ? {} : { skillNode: key(source.skillNode, `${path}.skillNode`) }),
  });
}

function parseRarity(value: unknown, path: string): GearRarityDefinition {
  const source = object(value, path);
  onlyFields(source, path, ['id', 'name', 'color', 'effects', 'weaponEffects', 'priceMultiplier']);
  const id = oneOf(GEAR_RARITY_IDS, source.id, `${path}.id`);
  if (source.weaponEffects !== undefined && id !== 'legendary') fail(`${path}.weaponEffects`, 'only legendary weapons carry extra effects');
  return Object.freeze({
    id,
    name: text(source.name, `${path}.name`),
    color: color(source.color, `${path}.color`),
    effects: integer(source.effects, `${path}.effects`, 0, 8),
    ...(source.weaponEffects === undefined ? {} : { weaponEffects: integer(source.weaponEffects, `${path}.weaponEffects`, 0, 8) }),
    priceMultiplier: positive(source.priceMultiplier, `${path}.priceMultiplier`),
  });
}

function parseLevelRange(value: unknown, path: string, maxItemLevel: number): GearItemLevelRange {
  const source = object(value, path);
  onlyFields(source, path, ['minimum', 'maximum']);
  const minimum = integer(source.minimum, `${path}.minimum`, 1, maxItemLevel);
  const maximum = integer(source.maximum, `${path}.maximum`, 1, maxItemLevel);
  if (minimum > maximum) fail(path, 'minimum exceeds maximum');
  return Object.freeze({ minimum, maximum });
}

function parseRules(source: Record<string, unknown>, base: GearDefinitionBase<'rules'>): GearRulesContentDefinition {
  onlyFields(source, '$', ['id', 'kind', 'schemaVersion', 'retired', 'replacement', 'table', 'maxItemLevel', 'requiredLevelCap',
    'legendaryItemLevels', 'rarities', 'itemLevelBands', 'stats', 'poorWords', 'sellValue']);
  if (base.id !== GEAR_RULES_ID) fail('$.id', `the rules row must be ${GEAR_RULES_ID}`, 'invalid_id');
  const maxItemLevel = integer(source.maxItemLevel, '$.maxItemLevel', 1, 1000);
  const rarities = Array.isArray(source.rarities)
    ? source.rarities.map((entry, index) => parseRarity(entry, `$.rarities[${index}]`))
    : fail('$.rarities', 'expected an array');
  // Exactly the closed ladder, in order: this also rejects duplicate rarities.
  const rarityIds = rarities.map(({ id }) => id);
  if (rarityIds.length !== GEAR_RARITY_IDS.length || rarityIds.some((id, index) => id !== GEAR_RARITY_IDS[index])) {
    fail('$.rarities', `expected each rarity once in ladder order: ${GEAR_RARITY_IDS.join(', ')}`);
  }
  const bands = Array.isArray(source.itemLevelBands)
    ? source.itemLevelBands.map((entry, index) => {
      const path = `$.itemLevelBands[${index}]`;
      const band = object(entry, path);
      onlyFields(band, path, ['tier', 'minimum', 'maximum']);
      return Object.freeze({ tier: integer(band.tier, `${path}.tier`, 1, 100), ...parseLevelRange({ minimum: band.minimum, maximum: band.maximum }, path, maxItemLevel) });
    })
    : fail('$.itemLevelBands', 'expected an array');
  if (bands.length === 0) fail('$.itemLevelBands', 'expected at least one band');
  bands.forEach((band, index) => {
    const previous = bands[index - 1];
    if (previous === undefined) return;
    if (band.tier <= previous.tier) fail(`$.itemLevelBands[${index}].tier`, 'tiers must be unique and ascending');
    if (band.minimum < previous.minimum || band.maximum < previous.maximum) {
      fail(`$.itemLevelBands[${index}]`, 'higher tiers may not have lower item levels');
    }
  });
  const stats = Array.isArray(source.stats) ? source.stats.map((entry, index) => parseStat(entry, `$.stats[${index}]`)) : fail('$.stats', 'expected an array');
  const statIds = new Set<string>();
  stats.forEach((stat, index) => {
    if (statIds.has(stat.id)) fail(`$.stats[${index}].id`, `duplicate stat ${stat.id}`);
    statIds.add(stat.id);
  });
  const poorSource = object(source.poorWords, '$.poorWords');
  onlyFields(poorSource, '$.poorWords', GEAR_MATERIAL_LINES);
  const poorWords = Object.freeze(Object.fromEntries(GEAR_MATERIAL_LINES.map((line) => [
    line, uniqueList(poorSource[line], `$.poorWords.${line}`, text),
  ]))) as unknown as GearPoorWords;
  const sell = object(source.sellValue, '$.sellValue');
  onlyFields(sell, '$.sellValue', ['bronzePerLevel', 'levelExponent', 'minimumWeight']);
  return Object.freeze({
    ...base,
    maxItemLevel,
    requiredLevelCap: integer(source.requiredLevelCap, '$.requiredLevelCap', 1, maxItemLevel),
    legendaryItemLevels: parseLevelRange(source.legendaryItemLevels, '$.legendaryItemLevels', maxItemLevel),
    rarities: Object.freeze(rarities),
    itemLevelBands: Object.freeze(bands),
    stats: Object.freeze(stats),
    poorWords,
    sellValue: Object.freeze({
      bronzePerLevel: positive(sell.bronzePerLevel, '$.sellValue.bronzePerLevel'),
      levelExponent: positive(sell.levelExponent, '$.sellValue.levelExponent'),
      minimumWeight: positive(sell.minimumWeight, '$.sellValue.minimumWeight'),
    }),
  });
}

const COMMON_FIELDS = ['id', 'kind', 'schemaVersion', 'retired', 'replacement', 'table'] as const;

function parseTableRow(source: Record<string, unknown>, base: GearDefinitionBase<Exclude<GearTable, 'rules'>>): GearContentDefinition {
  switch (base.table) {
    case 'material':
      onlyFields(source, '$', [...COMMON_FIELDS, 'name', 'line', 'tier', 'palette', 'cloth', 'note']);
      return Object.freeze({
        ...base as GearDefinitionBase<'material'>,
        name: text(source.name, '$.name'),
        line: oneOf(GEAR_MATERIAL_LINES, source.line, '$.line'),
        tier: integer(source.tier, '$.tier', 1, 100),
        palette: oneOf(GEAR_PALETTES, source.palette, '$.palette'),
        ...(source.cloth === undefined ? {} : { cloth: oneOf(GEAR_CLOTH_COLOURS, source.cloth, '$.cloth') }),
        ...(source.note === undefined ? {} : { note: text(source.note, '$.note') }),
      });
    case 'prefix':
    case 'suffix':
      onlyFields(source, '$', [...COMMON_FIELDS, 'name', 'stat', 'from', 'suits']);
      return Object.freeze({
        ...base as GearDefinitionBase<'prefix' | 'suffix'>,
        name: text(source.name, '$.name'),
        stat: statId(source.stat, '$.stat'),
        from: oneOf(GEAR_RARITY_IDS, source.from, '$.from'),
        suits: uniqueList(source.suits, '$.suits', text, true),
      });
    case 'lineage': {
      onlyFields(source, '$', [...COMMON_FIELDS, 'name', 'theme', 'effects', 'visual']);
      const visual = object(source.visual, '$.visual');
      onlyFields(visual, '$.visual', ['palette', 'trim', 'detail', 'head']);
      return Object.freeze({
        ...base as GearDefinitionBase<'lineage'>,
        name: text(source.name, '$.name'),
        theme: text(source.theme, '$.theme'),
        effects: uniqueList(source.effects, '$.effects', statId),
        visual: Object.freeze({
          palette: oneOf(GEAR_PALETTES, visual.palette, '$.visual.palette'),
          trim: oneOf(GEAR_PALETTES, visual.trim, '$.visual.trim'),
          detail: oneOf(GEAR_PALETTES, visual.detail, '$.visual.detail'),
          head: key(visual.head, '$.visual.head'),
        }),
      });
    }
    case 'legendary': {
      onlyFields(source, '$', [...COMMON_FIELDS, 'name', 'base', 'material', 'itemLevel', 'effects', 'signature', 'flavour', 'visual']);
      let visual: GearLegendaryVisual | undefined;
      if (source.visual !== undefined) {
        const raw = object(source.visual, '$.visual');
        onlyFields(raw, '$.visual', ['palette', 'accent', 'detail', 'staffHead', 'iconRow', 'bone', 'aura']);
        if (raw.bone !== undefined && raw.bone !== true) fail('$.visual.bone', 'expected true or omission');
        visual = Object.freeze({
          palette: oneOf(GEAR_PALETTES, raw.palette, '$.visual.palette'),
          ...(raw.accent === undefined ? {} : { accent: oneOf(GEAR_PALETTES, raw.accent, '$.visual.accent') }),
          ...(raw.detail === undefined ? {} : { detail: oneOf(GEAR_PALETTES, raw.detail, '$.visual.detail') }),
          ...(raw.staffHead === undefined ? {} : { staffHead: oneOf(GEAR_PALETTES, raw.staffHead, '$.visual.staffHead') }),
          ...(raw.iconRow === undefined ? {} : { iconRow: integer(raw.iconRow, '$.visual.iconRow', 0, 10_000) }),
          ...(raw.bone === undefined ? {} : { bone: true }),
          aura: color(raw.aura, '$.visual.aura'),
        });
      }
      return Object.freeze({
        ...base as GearDefinitionBase<'legendary'>,
        name: text(source.name, '$.name'),
        base: key(source.base, '$.base'),
        material: key(source.material, '$.material'),
        itemLevel: integer(source.itemLevel, '$.itemLevel', 1, 1000),
        effects: uniqueList(source.effects, '$.effects', statId),
        signature: text(source.signature, '$.signature'),
        flavour: text(source.flavour, '$.flavour'),
        ...(visual === undefined ? {} : { visual }),
      });
    }
    case 'base':
      onlyFields(source, '$', [...COMMON_FIELDS, 'name', 'slot', 'group', 'lines', 'armourClass', 'weight']);
      return Object.freeze({
        ...base as GearDefinitionBase<'base'>,
        name: text(source.name, '$.name'),
        slot: oneOf(GEAR_SLOTS, source.slot, '$.slot'),
        group: text(source.group, '$.group'),
        lines: uniqueList(source.lines, '$.lines', (entry, path) => oneOf(GEAR_MATERIAL_LINES, entry, path)),
        ...(source.armourClass === undefined ? {} : { armourClass: oneOf(GEAR_ARMOUR_CLASSES, source.armourClass, '$.armourClass') }),
        weight: positive(source.weight, '$.weight'),
      });
  }
}

export function parseGearDefinition(value: string | unknown): GearContentDefinition {
  let raw: unknown = value;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw) as unknown; }
    catch { throw new ContentParseError('invalid_json', '$', 'invalid gear JSON'); }
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) throw new ContentParseError('invalid_type', '$', 'expected gear object');
  const source = raw as Record<string, unknown>;
  if (source.kind !== 'gear') throw new ContentParseError('kind_mismatch', '$.kind', 'expected gear');
  if (source.schemaVersion !== 1) throw new ContentParseError('unsupported_schema_version', '$.schemaVersion', 'expected schema 1');
  const table = oneOf(GEAR_TABLES, source.table, '$.table');
  if (typeof source.id !== 'string' || !/^gear:[a-z0-9]+(?:_[a-z0-9]+)*$/u.test(source.id)) fail('$.id', 'expected gear identifier', 'invalid_id');
  if (table !== 'rules' && gearDefinitionKey(source.id, table) === null) fail('$.id', `expected gear:${table}_<key>`, 'invalid_id');
  if (source.retired !== undefined && typeof source.retired !== 'boolean') fail('$.retired', 'expected boolean');
  if (source.replacement !== undefined && (typeof source.replacement !== 'string'
    || !/^gear:[a-z0-9]+(?:_[a-z0-9]+)*$/u.test(source.replacement))) fail('$.replacement', 'expected gear identifier', 'invalid_id');
  const base = {
    id: source.id as GearDefinitionId,
    kind: 'gear' as const,
    schemaVersion: 1 as const,
    ...(source.retired === undefined ? {} : { retired: source.retired }),
    ...(source.replacement === undefined ? {} : { replacement: source.replacement as GearDefinitionId }),
    table,
  };
  return table === 'rules'
    ? parseRules(source, base as GearDefinitionBase<'rules'>)
    : parseTableRow(source, base as GearDefinitionBase<Exclude<GearTable, 'rules'>>);
}

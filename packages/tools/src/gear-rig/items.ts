import {
  LEGENDARIES, LINEAGES, POOR_WORDS, PREFIXES, STATS, SUFFIXES, TIER_LEVEL,
  affixValue, armourValue, baseType, material, rarity, sellValue, weaponDamage,
  type BaseType, type Legendary, type Lineage, type Material, type RarityId, type StatDef,
} from './catalogue.js';
import { CAPE, HEAD_DESIGNS, paint } from './designs.js';
import type { Garment, Head, Held, Loadout } from './doll.js';
import { BONE, type IconLibrary } from './icons.js';
import { MATERIALS, type MaterialName } from './materials.js';
import { Raster } from './raster.js';

export interface ItemSpec {
  readonly base: string;
  readonly material: string;
  readonly rarity: RarityId;
  readonly prefix?: string;
  readonly suffix?: string;
  readonly lineage?: string;
  readonly legendary?: string;
  /** Override the ornateness-ranked icon choice. */
  readonly iconRow?: number;
}

export interface TooltipLine {
  readonly text: string;
  readonly right?: string;
  readonly color: string;
}

export interface Item {
  readonly spec: ItemSpec;
  readonly name: string;
  readonly rarity: RarityId;
  readonly base: BaseType;
  readonly material: Material;
  readonly icon: Raster;
  readonly lines: readonly TooltipLine[];
  readonly sellBronze: number;
  readonly doll: Loadout;
}

export const TOOLTIP_COLORS = {
  white: '#f4f1e8',
  muted: '#a9a3b8',
  equip: '#63c74d',
  flavour: '#fee761',
  unmet: '#f5555d',
} as const;

const SLOT_LABEL: Record<BaseType['slot'], string> = {
  head: 'Head', body: 'Chest', legs: 'Legs', hands: 'Hands', feet: 'Feet', back: 'Back',
  main_hand: 'Main Hand', off_hand: 'Off Hand', two_hand: 'Two-Hand', tool: 'Tool', ammo: 'Ammunition',
};

function typeLabel(base: BaseType): string {
  if (base.slot === 'tool' || base.slot === 'ammo') return base.name;
  if (base.armourClass && ['head', 'body', 'legs', 'hands', 'feet'].includes(base.slot)) {
    return { cloth: 'Cloth', leather: 'Leather', plate: 'Plate' }[base.armourClass];
  }
  return base.group.replace(/s$/, '').replace('Staff', 'Staff').replace('Crossbow', 'Crossbow');
}

function equipText(stat: StatDef, value: number): string {
  switch (stat.unit) {
    case 'rank': return `Equip: +1 rank to ${stat.label}.`;
    case 'perSecond': return `Equip: Restores ${value.toFixed(1)} ${stat.label}.`;
    default: break;
  }
  const phrasing: Record<string, string> = {
    armorPct: `Equip: Reduces damage taken by ${value}%.`,
    swingSpeed: `Equip: Increases swing speed by ${value}%.`,
    toolVigourCost: `Equip: Tools cost ${value}% less vigour.`,
    sprintVigourCost: `Equip: Sprinting costs ${value}% less vigour.`,
  };
  return phrasing[stat.id] ?? `Equip: Increases ${stat.label} by ${value}%.`;
}

/** Rank a base's candidate icon rows by ornateness and pick the one for a rarity. */
function pickIconRow(library: IconLibrary, base: BaseType, rarityId: RarityId, seed: number): number {
  const rows = [...base.icon.rows].sort((a, b) => library.ornateness(base.icon.sheet, a) - library.ornateness(base.icon.sheet, b));
  if (rows.length === 0) return -1;
  const band: Record<RarityId, [number, number]> = {
    poor: [0, 0.15], common: [0, 0.3], uncommon: [0.2, 0.5], rare: [0.45, 0.75], epic: [0.7, 1], legendary: [0.85, 1],
  };
  const [from, to] = band[rarityId];
  const start = Math.floor(from * (rows.length - 1));
  const end = Math.max(start, Math.ceil(to * (rows.length - 1)));
  return rows[start + (seed % (end - start + 1))]!;
}

function hash(text: string): number {
  let value = 2166136261;
  for (const character of text) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return value >>> 0;
}

/** Paint a worn head design face-on as a 16×16 inventory icon (crowns have no premium icon). */
function designIcon(design: string, ramps: { primary: MaterialName; accent: MaterialName; detail: MaterialName }): Raster {
  const found = HEAD_DESIGNS.find((entry) => entry.name === design)!;
  const composed = new Raster(24, 24);
  for (const part of found.parts.down) {
    composed.draw(paint(part.grid, { primary: MATERIALS[ramps.primary], accent: MATERIALS[ramps.accent], detail: MATERIALS[ramps.detail] }), 6 + part.dx, 8 + part.dy);
  }
  const bounds = composed.bounds()!;
  const icon = new Raster(16, 16);
  icon.draw(composed.crop(bounds.x, bounds.y, bounds.width, bounds.height), Math.floor((16 - bounds.width) / 2), Math.floor((16 - bounds.height) / 2));
  return icon.recolor(new Map([['#0e071b', '#000000']]));
}

/** Capes have no premium icon: paint the back view, framed in the 16×16 cell. */
function capeIcon(primary: MaterialName, trim: MaterialName): Raster {
  const image = paint(CAPE.up.grid, { primary: MATERIALS[primary], accent: MATERIALS[trim], detail: MATERIALS[trim] });
  const icon = new Raster(16, 16);
  // Stretch the 8-row cape to a 13-row icon by repeating its body rows.
  const rows = [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 7];
  rows.forEach((source, y) => icon.draw(image.crop(0, source, image.width, 1), Math.floor((16 - image.width) / 2), 1 + y));
  return icon.recolor(new Map([['#0e071b', '#000000']]));
}

export function buildItem(spec: ItemSpec, library: IconLibrary): Item {
  const legendary: Legendary | undefined = spec.legendary ? LEGENDARIES.find((entry) => entry.id === spec.legendary) : undefined;
  const lineage: Lineage | undefined = spec.lineage ? LINEAGES.find((entry) => entry.id === spec.lineage) : undefined;
  const base = baseType(legendary?.base ?? spec.base);
  const mat = material(legendary?.material ?? spec.material);
  const rarityId: RarityId = legendary ? 'legendary' : spec.rarity;
  const rar = rarity(rarityId);
  const tier = legendary?.tier ?? mat.tier;
  const prefix = PREFIXES.find((entry) => entry.id === spec.prefix);
  const suffix = SUFFIXES.find((entry) => entry.id === spec.suffix);

  // Name --------------------------------------------------------------------
  let name: string;
  if (legendary) name = legendary.name;
  else if (lineage) name = `${lineage.name} ${base.name}`;
  else if (rarityId === 'poor') {
    const words = POOR_WORDS[mat.line];
    name = `${words[hash(base.id + mat.id) % words.length]} ${mat.name} ${base.name}`;
  } else if (rarityId === 'rare' && prefix && suffix) name = `${prefix.name} ${base.name} ${suffix.name}`;
  else name = [prefix?.name, mat.name, base.name, suffix?.name].filter(Boolean).join(' ');

  // Visual palette ------------------------------------------------------------
  // Lineages recolour metal; cloth and leather keep their dye and take the lineage colour as trim.
  const palette: MaterialName = legendary?.finish.palette ?? (lineage && mat.line === 'metal' ? lineage.palette : mat.palette);
  const accent: MaterialName = legendary?.finish.accent ?? (lineage && mat.line !== 'metal' ? lineage.palette : lineage?.accent) ?? (rarityId === 'rare' || rarityId === 'epic' ? (palette === 'gold' ? 'silver' : 'gold') : palette);
  const detail: MaterialName = legendary?.finish.detail ?? lineage?.detail ?? 'ruby';

  // Icon --------------------------------------------------------------------------
  let icon: Raster;
  const headFamily = base.visual.kind === 'head'
    ? (rarityId === 'legendary' ? base.visual.families.epic : base.visual.families[rarityId]) ?? (lineage && base.id === 'greathelm' ? lineage.head : base.visual.fallback)
    : undefined;
  if (base.icon.rows.length === 0 && headFamily) {
    icon = designIcon(headFamily, { primary: palette, accent, detail });
  } else if (base.visual.kind === 'cape') {
    icon = capeIcon(palette, rarityId === 'common' || rarityId === 'poor' ? palette : accent);
  } else {
    const row = spec.iconRow ?? legendary?.finish.row ?? pickIconRow(library, base, rarityId, hash(name));
    icon = library.icon({
      sheet: base.icon.sheet,
      row,
      material: palette,
      ...(base.icon.staff ? { staffHead: legendary?.finish.staffHead ?? palette } : {}),
      ...(legendary?.finish.bone ? { finish: BONE } : {}),
    });
  }

  // Doll ---------------------------------------------------------------------------
  const doll: { -readonly [K in keyof Loadout]: Loadout[K] } = {};
  const visual = base.visual;
  if (visual.kind === 'head' && headFamily) {
    doll.head = headFamily.startsWith('kenmi_')
      ? { kind: 'kenmi', sheet: headFamily === 'kenmi_plate' ? 'plate' : 'heavy', material: palette } satisfies Head
      : { kind: 'design', design: headFamily, material: palette, accent, detail };
  } else if (visual.kind === 'garment') {
    const garment = (visual.family === 'plate'
      ? { family: 'plate', material: palette }
      : { family: visual.family, colour: mat.cloth ?? 'Brown' }) as Garment;
    if (base.slot === 'body') doll.body = garment;
    else doll.legs = garment;
    const order: RarityId[] = ['poor', 'common', 'uncommon', 'rare', 'epic', 'legendary'];
    if (visual.pauldronsFrom && order.indexOf(rarityId) >= order.indexOf(visual.pauldronsFrom)) {
      doll.pauldrons = rarityId === 'common' || rarityId === 'uncommon' ? palette : accent;
    }
  } else if (visual.kind === 'gauntlets') {
    doll.gauntlets = palette;
  } else if (visual.kind === 'feet') {
    doll.feet = { kind: visual.style, material: palette };
  } else if (visual.kind === 'cape') {
    doll.cape = { material: palette, trim: rarityId === 'common' || rarityId === 'poor' ? palette : accent };
  } else if (visual.kind === 'held') {
    const carry = ['Swords', 'Daggers'].includes(base.group) ? 'hilt' as const : 'head' as const;
    const held: Held = legendary ? { kind: visual.held, icon, carry, aura: legendary.finish.aura } : { kind: visual.held, icon, carry };
    if (visual.held === 'shield') doll.offHand = held;
    else doll.mainHand = held;
  }

  // Tooltip ------------------------------------------------------------------------
  const lines: TooltipLine[] = [];
  if (rarityId === 'legendary') lines.push({ text: 'Unique', color: TOOLTIP_COLORS.white });
  lines.push({ text: SLOT_LABEL[base.slot], right: typeLabel(base), color: TOOLTIP_COLORS.white });
  lines.push({ text: `Tier ${tier} ${mat.name}`, color: TOOLTIP_COLORS.muted });
  const isWeapon = ['main_hand', 'two_hand'].includes(base.slot) && base.group !== 'Shields';
  if (isWeapon && base.group !== 'Staffs') {
    lines.push({ text: `${weaponDamage(base, tier, rarityId)} Damage`, right: base.slot === 'two_hand' ? 'Slow' : 'Normal', color: TOOLTIP_COLORS.white });
  } else if (base.group === 'Staffs') {
    lines.push({ text: `${Math.round(weaponDamage(base, tier, rarityId) * 0.6)} Damage`, right: 'Normal', color: TOOLTIP_COLORS.white });
  } else if (base.slot === 'tool') {
    lines.push({ text: `Tool Power ${tier}`, color: TOOLTIP_COLORS.white });
  } else if (base.slot !== 'ammo') {
    lines.push({ text: `${armourValue(base, tier, rarityId)} Armor`, color: TOOLTIP_COLORS.white });
  }

  const primary: [StatDef, number][] = [];
  const equips: string[] = [];
  const add = (statId: string, power: number, fixed?: number): void => {
    const stat = STATS[statId]!;
    const value = fixed ?? affixValue(stat, tier, power);
    if (stat.kind === 'primary') primary.push([stat, value]);
    else equips.push(equipText(stat, value));
  };
  if (legendary) {
    for (const [statId, value] of legendary.stats) add(statId, rar.power, value);
  } else if (lineage) {
    for (const statId of lineage.stats) add(statId, rar.power);
    add(lineage.equip, rar.power);
  } else {
    if (prefix) add(prefix.stat, rar.power);
    if (suffix) add(suffix.stat, rar.power);
  }
  if (base.group === 'Staffs') add('manaRegen', Math.max(0.5, rar.power));
  for (const [stat, value] of primary) lines.push({ text: `+${value} ${stat.label}`, color: TOOLTIP_COLORS.white });
  for (const text of equips) lines.push({ text, color: TOOLTIP_COLORS.equip });
  if (legendary) lines.push({ text: `Equip: ${legendary.signature}`, color: TOOLTIP_COLORS.equip });

  if (!['ammo'].includes(base.slot)) {
    const durability = rarityId === 'legendary' ? 250 : 60 + 30 * tier;
    const current = rarityId === 'poor' ? Math.round(durability * 0.35) : durability;
    lines.push({ text: `Durability ${current} / ${durability}`, color: TOOLTIP_COLORS.white });
  }
  const level = TIER_LEVEL[tier] ?? 1;
  if (level > 1) lines.push({ text: `Requires Level ${level}`, color: TOOLTIP_COLORS.white });
  if (legendary) lines.push({ text: `"${legendary.flavour}"`, color: TOOLTIP_COLORS.flavour });
  else if (lineage) lines.push({ text: `"${lineage.theme[0]!.toUpperCase()}${lineage.theme.slice(1)}."`, color: TOOLTIP_COLORS.flavour });

  return {
    spec,
    name,
    rarity: rarityId,
    base,
    material: mat,
    icon,
    lines,
    sellBronze: sellValue(tier, rarityId, base.weight),
    doll,
  };
}

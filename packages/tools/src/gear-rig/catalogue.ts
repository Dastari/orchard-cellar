/**
 * Gear catalogue design data: rarities, material ladders, base item types for
 * every slot, affixes, epic lineages and legendary uniques. Names, tooltips,
 * icons, paper-doll visuals and sell prices are all derived from this table so
 * the wiki, the renderer and (later) content generation share one source.
 *
 * Stats use the simulation's modifier targets (`STAT_TARGETS`). Attributes, mana
 * and regeneration are not yet in `EQUIPMENT_STAT_BUDGETS`; affixes marked
 * `needsBudget` are proposals that require extending that table.
 */
import type { MaterialName } from './materials.js';
import type { ClothColour } from './doll.js';
import type { IconSheet } from './icons.js';

// ---------------------------------------------------------------------------
// Rarity

export type RarityId = 'poor' | 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface Rarity {
  readonly id: RarityId;
  readonly name: string;
  /** Tooltip name colour (game colours from roguelike-ui.ts; poor added). */
  readonly color: string;
  readonly affixes: string;
  /** Number of effects (prefix, suffix, lineage or unique stats). Item level, not rarity, sets their size. */
  readonly effects: number;
  /** Multiplier for sell value. */
  readonly price: number;
  /** How the item looks compared with its base family. */
  readonly look: string;
}

export const RARITIES: readonly Rarity[] = [
  { id: 'poor', name: 'Poor', color: '#9d9d9d', affixes: 'none; damaged-base name', effects: 0, price: 0.2, look: 'plainest icon of the family, dulled material' },
  { id: 'common', name: 'Common', color: '#f4f1e8', affixes: 'none', effects: 0, price: 1, look: 'plain family icon and worn layer in its material' },
  { id: 'uncommon', name: 'Uncommon', color: '#63c74d', affixes: 'one effect: a prefix or a suffix', effects: 1, price: 2, look: 'plain family, material colour' },
  { id: 'rare', name: 'Rare', color: '#5a8ee0', affixes: 'two effects: prefix and suffix; may grant a skill rank', effects: 2, price: 4, look: 'trimmed icon; gilt trim on worn pieces' },
  { id: 'epic', name: 'Epic', color: '#b56be0', affixes: 'three effects from its lineage', effects: 3, price: 10, look: 'ornate icon; lineage ornaments (plume, wings, horns, pauldrons)' },
  { id: 'legendary', name: 'Legendary', color: '#f6b83f', affixes: 'three effects + a signature effect (named unique weapons: four + signature)', effects: 3, price: 25, look: 'bespoke design, unique finish, glow and glint' },
];

export const rarity = (id: RarityId): Rarity => RARITIES.find((entry) => entry.id === id)!;

// ---------------------------------------------------------------------------
// Materials

export type MaterialLine = 'metal' | 'cloth' | 'leather' | 'gem' | 'wood';

export interface Material {
  readonly id: string;
  readonly name: string;
  readonly line: MaterialLine;
  readonly tier: number;
  /** Icon column / worn ramp. */
  readonly palette: MaterialName;
  /** Kenmi cloth file colour for cloth and leather worn layers. */
  readonly cloth?: ClothColour;
  readonly note?: string;
}

export const MATERIALS_BY_LINE: readonly Material[] = [
  { id: 'bronze', name: 'Bronze', line: 'metal', tier: 1, palette: 'bronze' },
  { id: 'iron', name: 'Iron', line: 'metal', tier: 2, palette: 'iron' },
  { id: 'steel', name: 'Steel', line: 'metal', tier: 3, palette: 'silver' },
  { id: 'blackiron', name: 'Blackiron', line: 'metal', tier: 4, palette: 'obsidian' },
  { id: 'gilded', name: 'Gilded', line: 'metal', tier: 4, palette: 'gold', note: 'ceremonial; charisma-leaning' },
  { id: 'verdant', name: 'Verdant', line: 'metal', tier: 5, palette: 'jade', note: 'living bronze from the old orchards' },
  { id: 'frostforged', name: 'Frostforged', line: 'metal', tier: 5, palette: 'frost' },
  { id: 'emberforged', name: 'Emberforged', line: 'metal', tier: 6, palette: 'ember' },
  { id: 'bloodsteel', name: 'Bloodsteel', line: 'metal', tier: 6, palette: 'ruby' },
  { id: 'starmetal', name: 'Starmetal', line: 'metal', tier: 7, palette: 'amethyst' },
  { id: 'linen', name: 'Linen', line: 'cloth', tier: 1, palette: 'silver', cloth: 'White' },
  { id: 'homespun', name: 'Homespun', line: 'cloth', tier: 1, palette: 'bronze', cloth: 'Brown' },
  { id: 'wool', name: 'Woollen', line: 'cloth', tier: 2, palette: 'jade', cloth: 'Green' },
  { id: 'dyed', name: 'Dyed', line: 'cloth', tier: 3, palette: 'frost', cloth: 'Blue' },
  { id: 'silk', name: 'Silken', line: 'cloth', tier: 4, palette: 'amethyst', cloth: 'Purple' },
  { id: 'velvet', name: 'Velvet', line: 'cloth', tier: 5, palette: 'ruby', cloth: 'Red' },
  { id: 'moonweave', name: 'Moonweave', line: 'cloth', tier: 7, palette: 'obsidian', cloth: 'Black' },
  { id: 'rawhide', name: 'Rawhide', line: 'leather', tier: 1, palette: 'bronze', cloth: 'Brown' },
  { id: 'tanned', name: 'Tanned', line: 'leather', tier: 2, palette: 'ember', cloth: 'Orange' },
  { id: 'hardened', name: 'Hardened', line: 'leather', tier: 3, palette: 'obsidian', cloth: 'Black' },
  { id: 'drakehide', name: 'Drakehide', line: 'leather', tier: 6, palette: 'ruby', cloth: 'Red' },
  { id: 'quartz', name: 'Quartz', line: 'gem', tier: 1, palette: 'silver' },
  { id: 'jade', name: 'Jade', line: 'gem', tier: 2, palette: 'jade' },
  { id: 'amber', name: 'Amber', line: 'gem', tier: 3, palette: 'ember' },
  { id: 'aquamarine', name: 'Aquamarine', line: 'gem', tier: 4, palette: 'frost' },
  { id: 'topaz', name: 'Topaz', line: 'gem', tier: 4, palette: 'gold' },
  { id: 'ruby', name: 'Ruby', line: 'gem', tier: 5, palette: 'ruby' },
  { id: 'onyx', name: 'Onyx', line: 'gem', tier: 6, palette: 'obsidian' },
  { id: 'amethyst', name: 'Amethyst', line: 'gem', tier: 7, palette: 'amethyst' },
  { id: 'ash', name: 'Ash', line: 'wood', tier: 1, palette: 'bronze' },
  { id: 'yew', name: 'Yew', line: 'wood', tier: 2, palette: 'bronze' },
  { id: 'ironwood', name: 'Ironwood', line: 'wood', tier: 3, palette: 'iron' },
];

export const material = (id: string): Material => {
  const found = MATERIALS_BY_LINE.find((entry) => entry.id === id);
  if (!found) throw new Error(`Unknown material ${id}`);
  return found;
};

/**
 * Item level (1–60) sets base armour/damage and the size of every effect.
 * Materials place items in an item-level band; the band's midpoint is the
 * default, and drops, crafting and vendors may pick any level inside it.
 * Legendaries and named uniques sit above the level cap (55–60).
 */
export const ITEM_LEVEL_BANDS: Readonly<Record<number, readonly [number, number]>> = {
  1: [1, 8], 2: [8, 15], 3: [15, 22], 4: [22, 30], 5: [30, 38], 6: [38, 45], 7: [45, 52],
};
export const MAX_ITEM_LEVEL = 60;
export const LEVEL_CAP = 50;

export const defaultItemLevel = (tier: number, rarityId: RarityId): number => {
  const [low, high] = ITEM_LEVEL_BANDS[tier] ?? [1, 8];
  const middle = Math.round((low + high) / 2);
  return Math.min(MAX_ITEM_LEVEL, rarityId === 'epic' ? high : rarityId === 'poor' ? low : middle);
};

/** Required level follows item level, capped at the level cap. */
export const requiredLevel = (itemLevel: number): number => Math.min(LEVEL_CAP, itemLevel);

// ---------------------------------------------------------------------------
// Base item types

export type Slot = 'head' | 'body' | 'legs' | 'hands' | 'feet' | 'back' | 'main_hand' | 'off_hand' | 'two_hand' | 'tool' | 'ammo';
export type ArmourClass = 'cloth' | 'leather' | 'plate';

/** How the item appears on the paper doll. */
export type WornVisual =
  | { readonly kind: 'head'; readonly families: Readonly<Partial<Record<RarityId, string>>>; readonly fallback: string }
  | { readonly kind: 'garment'; readonly family: 'plate' | 'shirt' | 'tunic' | 'flannel' | 'vestments' | 'trousers' | 'dungarees' | 'breeches'; readonly pauldronsFrom?: RarityId }
  | { readonly kind: 'gauntlets' }
  | { readonly kind: 'feet'; readonly style: 'shoes' | 'boots' | 'sabatons' }
  | { readonly kind: 'cape' }
  | { readonly kind: 'held'; readonly held: 'blade' | 'bow' | 'crossbow' | 'staff' | 'shield' }
  | { readonly kind: 'none'; readonly reason: string };

export interface BaseType {
  readonly id: string;
  readonly name: string;
  readonly slot: Slot;
  readonly group: string;
  readonly lines: readonly MaterialLine[];
  readonly armourClass?: ArmourClass;
  /** Premium icon family: sheet plus candidate rows, ranked by ornateness at render time. */
  readonly icon: { readonly sheet: IconSheet; readonly rows: readonly number[]; readonly staff?: boolean };
  readonly visual: WornVisual;
  /** Relative weight for armour value or weapon damage. */
  readonly weight: number;
  readonly note?: string;
}

const range = (from: number, to: number, step = 1): number[] => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, index) => from + index * step);
const HELM = (plain: string, rare: string, epic: string): WornVisual => ({ kind: 'head', families: { common: plain, uncommon: plain, rare, epic }, fallback: plain });
// Chest icon families repeat every 9 rows: [vest, 4 plain, 4 with pauldrons].
const CHEST_CYCLES = range(49, 130, 9);

export const BASE_TYPES: readonly BaseType[] = [
  // Head -------------------------------------------------------------------
  { id: 'cap', name: 'Cap', slot: 'head', group: 'Hats', lines: ['cloth', 'leather'], armourClass: 'cloth', icon: { sheet: 'armor', rows: [47, 30, 31] }, visual: { kind: 'none', reason: 'soft caps need worn art' }, weight: 0.5 },
  { id: 'kettle_hat', name: 'Kettle Hat', slot: 'head', group: 'Hats', lines: ['metal'], armourClass: 'plate', icon: { sheet: 'armor', rows: [46] }, visual: { kind: 'none', reason: 'brimmed hat needs worn art' }, weight: 0.8 },
  { id: 'sallet', name: 'Sallet', slot: 'head', group: 'Helms', lines: ['metal'], armourClass: 'plate', icon: { sheet: 'armor', rows: [44, 45, 48] }, visual: { kind: 'head', families: {}, fallback: 'kenmi_plate' }, weight: 1 },
  { id: 'bascinet', name: 'Bascinet', slot: 'head', group: 'Helms', lines: ['metal'], armourClass: 'plate', icon: { sheet: 'armor', rows: range(20, 29) }, visual: { kind: 'head', families: {}, fallback: 'kenmi_heavy' }, weight: 1.1 },
  { id: 'greathelm', name: 'Greathelm', slot: 'head', group: 'Helms', lines: ['metal'], armourClass: 'plate', icon: { sheet: 'armor', rows: range(0, 9) }, visual: HELM('greathelm', 'gilded_helm', 'plumed_greathelm'), weight: 1.2 },
  { id: 'warhelm', name: 'Warhelm', slot: 'head', group: 'Helms', lines: ['metal'], armourClass: 'plate', icon: { sheet: 'armor', rows: [...range(10, 19), ...range(32, 39)] }, visual: { kind: 'head', families: {}, fallback: 'horned_warhelm' }, weight: 1.2 },
  { id: 'winged_helm', name: 'Winged Helm', slot: 'head', group: 'Helms', lines: ['metal'], armourClass: 'plate', icon: { sheet: 'armor', rows: [40, 41, 42, 43] }, visual: { kind: 'head', families: {}, fallback: 'winged_helm' }, weight: 1.1 },
  { id: 'circlet', name: 'Circlet', slot: 'head', group: 'Crowns', lines: ['metal'], armourClass: 'cloth', icon: { sheet: 'armor', rows: [] }, visual: { kind: 'head', families: {}, fallback: 'royal_crown' }, weight: 0.4, note: 'icon painted from the worn crown design' },
  { id: 'crown', name: 'Crown', slot: 'head', group: 'Crowns', lines: ['metal'], armourClass: 'cloth', icon: { sheet: 'armor', rows: [] }, visual: { kind: 'head', families: {}, fallback: 'royal_crown' }, weight: 0.6, note: 'icon painted from the worn crown design' },
  // Body -------------------------------------------------------------------
  { id: 'shirt', name: 'Shirt', slot: 'body', group: 'Clothing', lines: ['cloth'], armourClass: 'cloth', icon: { sheet: 'armor', rows: [49] }, visual: { kind: 'garment', family: 'shirt' }, weight: 0.4 },
  { id: 'tunic', name: 'Tunic', slot: 'body', group: 'Clothing', lines: ['cloth'], armourClass: 'cloth', icon: { sheet: 'armor', rows: [58] }, visual: { kind: 'garment', family: 'tunic' }, weight: 0.5 },
  { id: 'flannel', name: 'Flannel', slot: 'body', group: 'Clothing', lines: ['cloth'], armourClass: 'cloth', icon: { sheet: 'armor', rows: [67] }, visual: { kind: 'garment', family: 'flannel' }, weight: 0.5 },
  { id: 'vestments', name: 'Vestments', slot: 'body', group: 'Robes', lines: ['cloth'], armourClass: 'cloth', icon: { sheet: 'armor', rows: [76, 85] }, visual: { kind: 'garment', family: 'vestments' }, weight: 0.6 },
  { id: 'jerkin', name: 'Jerkin', slot: 'body', group: 'Leathers', lines: ['leather'], armourClass: 'leather', icon: { sheet: 'armor', rows: [94, 103] }, visual: { kind: 'garment', family: 'flannel' }, weight: 0.8 },
  { id: 'brigandine', name: 'Brigandine', slot: 'body', group: 'Leathers', lines: ['leather'], armourClass: 'leather', icon: { sheet: 'armor', rows: [112, 121] }, visual: { kind: 'garment', family: 'tunic' }, weight: 0.9 },
  { id: 'breastplate', name: 'Breastplate', slot: 'body', group: 'Plate', lines: ['metal'], armourClass: 'plate', icon: { sheet: 'armor', rows: CHEST_CYCLES.flatMap((start) => range(start + 1, start + 4)) }, visual: { kind: 'garment', family: 'plate' }, weight: 1.3 },
  { id: 'cuirass', name: 'Cuirass', slot: 'body', group: 'Plate', lines: ['metal'], armourClass: 'plate', icon: { sheet: 'armor', rows: CHEST_CYCLES.flatMap((start) => range(start + 5, start + 8)) }, visual: { kind: 'garment', family: 'plate', pauldronsFrom: 'uncommon' }, weight: 1.5 },
  { id: 'hauberk', name: 'Scale Hauberk', slot: 'body', group: 'Plate', lines: ['metal'], armourClass: 'plate', icon: { sheet: 'armor', rows: range(95, 102) }, visual: { kind: 'garment', family: 'plate', pauldronsFrom: 'rare' }, weight: 1.4 },
  // Legs -------------------------------------------------------------------
  { id: 'trousers', name: 'Trousers', slot: 'legs', group: 'Clothing', lines: ['cloth'], armourClass: 'cloth', icon: { sheet: 'armor', rows: [145, 152] }, visual: { kind: 'garment', family: 'trousers' }, weight: 0.4 },
  { id: 'dungarees', name: 'Dungarees', slot: 'legs', group: 'Clothing', lines: ['cloth'], armourClass: 'cloth', icon: { sheet: 'armor', rows: [139, 140] }, visual: { kind: 'garment', family: 'dungarees' }, weight: 0.5 },
  { id: 'breeches', name: 'Breeches', slot: 'legs', group: 'Clothing', lines: ['cloth'], armourClass: 'cloth', icon: { sheet: 'armor', rows: [144, 151] }, visual: { kind: 'garment', family: 'breeches' }, weight: 0.5 },
  { id: 'leggings', name: 'Leggings', slot: 'legs', group: 'Leathers', lines: ['leather'], armourClass: 'leather', icon: { sheet: 'armor', rows: [156, 163] }, visual: { kind: 'garment', family: 'trousers' }, weight: 0.7 },
  { id: 'greaves', name: 'Greaves', slot: 'legs', group: 'Plate', lines: ['metal'], armourClass: 'plate', icon: { sheet: 'armor', rows: [145, 152, 156, 163, 167, 146, 147, 153, 154, 157, 158, 164, 165, 168, 169] }, visual: { kind: 'garment', family: 'plate' }, weight: 1.1 },
  { id: 'tassets', name: 'Tassets', slot: 'legs', group: 'Plate', lines: ['metal'], armourClass: 'plate', icon: { sheet: 'armor', rows: [141, 142, 143, 148, 149, 159, 160, 161] }, visual: { kind: 'garment', family: 'plate' }, weight: 1.2 },
  // Hands and feet ---------------------------------------------------------
  { id: 'gloves', name: 'Gloves', slot: 'hands', group: 'Gloves', lines: ['cloth', 'leather'], armourClass: 'leather', icon: { sheet: 'armor', rows: [170, 172, 174] }, visual: { kind: 'gauntlets' }, weight: 0.4 },
  { id: 'gauntlets', name: 'Gauntlets', slot: 'hands', group: 'Gloves', lines: ['metal'], armourClass: 'plate', icon: { sheet: 'armor', rows: range(170, 176) }, visual: { kind: 'gauntlets' }, weight: 0.6 },
  { id: 'shoes', name: 'Shoes', slot: 'feet', group: 'Footwear', lines: ['cloth', 'leather'], armourClass: 'cloth', icon: { sheet: 'armor', rows: [181, 182, 184] }, visual: { kind: 'feet', style: 'shoes' }, weight: 0.3 },
  { id: 'boots', name: 'Boots', slot: 'feet', group: 'Footwear', lines: ['leather', 'cloth'], armourClass: 'leather', icon: { sheet: 'armor', rows: [177, 179, 183] }, visual: { kind: 'feet', style: 'boots' }, weight: 0.5 },
  { id: 'sabatons', name: 'Sabatons', slot: 'feet', group: 'Footwear', lines: ['metal'], armourClass: 'plate', icon: { sheet: 'armor', rows: range(177, 184) }, visual: { kind: 'feet', style: 'sabatons' }, weight: 0.7 },
  // Back ------------------------------------------------------------------
  { id: 'cape', name: 'Cape', slot: 'back', group: 'Cloaks', lines: ['cloth'], armourClass: 'cloth', icon: { sheet: 'armor', rows: [] }, visual: { kind: 'cape' }, weight: 0.4, note: 'icon painted from the worn cape' },
  { id: 'cloak', name: 'Cloak', slot: 'back', group: 'Cloaks', lines: ['cloth', 'leather'], armourClass: 'cloth', icon: { sheet: 'armor', rows: [] }, visual: { kind: 'cape' }, weight: 0.5, note: 'icon painted from the worn cape' },
  { id: 'mantle', name: 'Mantle', slot: 'back', group: 'Cloaks', lines: ['cloth'], armourClass: 'cloth', icon: { sheet: 'armor', rows: [] }, visual: { kind: 'cape' }, weight: 0.6, note: 'icon painted from the worn cape' },
  // One-handed weapons -----------------------------------------------------
  { id: 'arming_sword', name: 'Arming Sword', slot: 'main_hand', group: 'Swords', lines: ['metal'], icon: { sheet: 'weapons', rows: range(0, 24) }, visual: { kind: 'held', held: 'blade' }, weight: 1 },
  { id: 'longsword', name: 'Longsword', slot: 'main_hand', group: 'Swords', lines: ['metal'], icon: { sheet: 'weapons', rows: range(25, 49) }, visual: { kind: 'held', held: 'blade' }, weight: 1.1 },
  { id: 'scimitar', name: 'Scimitar', slot: 'main_hand', group: 'Swords', lines: ['metal'], icon: { sheet: 'weapons', rows: [50, 51, 52] }, visual: { kind: 'held', held: 'blade' }, weight: 1 },
  { id: 'dagger', name: 'Dagger', slot: 'main_hand', group: 'Daggers', lines: ['metal'], icon: { sheet: 'weapons', rows: range(53, 65) }, visual: { kind: 'held', held: 'blade' }, weight: 0.7 },
  { id: 'hatchet', name: 'Hatchet', slot: 'main_hand', group: 'Axes', lines: ['metal'], icon: { sheet: 'weapons', rows: range(86, 93) }, visual: { kind: 'held', held: 'blade' }, weight: 1 },
  { id: 'mace', name: 'Mace', slot: 'main_hand', group: 'Maces', lines: ['metal'], icon: { sheet: 'weapons', rows: [125, 126, 127, 128, 129] }, visual: { kind: 'held', held: 'blade' }, weight: 1 },
  { id: 'morningstar', name: 'Morningstar', slot: 'main_hand', group: 'Maces', lines: ['metal'], icon: { sheet: 'weapons', rows: [130, 131] }, visual: { kind: 'held', held: 'blade' }, weight: 1.1 },
  // Two-handed weapons -----------------------------------------------------
  { id: 'warhammer', name: 'Warhammer', slot: 'two_hand', group: 'Maces', lines: ['metal'], icon: { sheet: 'weapons', rows: [132, 133, 134, 135] }, visual: { kind: 'held', held: 'blade' }, weight: 1.4 },
  { id: 'spear', name: 'Spear', slot: 'two_hand', group: 'Polearms', lines: ['metal'], icon: { sheet: 'weapons', rows: range(66, 82) }, visual: { kind: 'held', held: 'blade' }, weight: 1.2 },
  { id: 'trident', name: 'Trident', slot: 'two_hand', group: 'Polearms', lines: ['metal'], icon: { sheet: 'weapons', rows: [83, 84, 85] }, visual: { kind: 'held', held: 'blade' }, weight: 1.3 },
  { id: 'halberd', name: 'Halberd', slot: 'two_hand', group: 'Polearms', lines: ['metal'], icon: { sheet: 'weapons', rows: range(94, 108) }, visual: { kind: 'held', held: 'blade' }, weight: 1.4 },
  // Ranged -----------------------------------------------------------------
  { id: 'shortbow', name: 'Shortbow', slot: 'two_hand', group: 'Bows', lines: ['wood', 'metal'], icon: { sheet: 'weapons', rows: [109, 110, 111, 112] }, visual: { kind: 'held', held: 'bow' }, weight: 0.9 },
  { id: 'longbow', name: 'Longbow', slot: 'two_hand', group: 'Bows', lines: ['wood', 'metal'], icon: { sheet: 'weapons', rows: [113, 114, 115, 116] }, visual: { kind: 'held', held: 'bow' }, weight: 1.1 },
  { id: 'crossbow', name: 'Crossbow', slot: 'two_hand', group: 'Crossbows', lines: ['wood', 'metal'], icon: { sheet: 'weapons', rows: [119, 120, 121, 122] }, visual: { kind: 'held', held: 'crossbow' }, weight: 1.2 },
  { id: 'arrows', name: 'Arrows', slot: 'ammo', group: 'Ammunition', lines: ['metal'], icon: { sheet: 'weapons', rows: [117, 118] }, visual: { kind: 'none', reason: 'shown in flight' }, weight: 0.1 },
  { id: 'bolts', name: 'Bolts', slot: 'ammo', group: 'Ammunition', lines: ['metal'], icon: { sheet: 'weapons', rows: [123, 124] }, visual: { kind: 'none', reason: 'shown in flight' }, weight: 0.1 },
  // Staffs (Kenmi mace/torch silhouettes with gem heads) ------------------
  { id: 'staff', name: 'Staff', slot: 'two_hand', group: 'Staffs', lines: ['gem'], icon: { sheet: 'weapons', rows: [125], staff: true }, visual: { kind: 'held', held: 'staff' }, weight: 0.9 },
  { id: 'rod', name: 'Rod', slot: 'main_hand', group: 'Staffs', lines: ['gem'], icon: { sheet: 'weapons', rows: [126], staff: true }, visual: { kind: 'held', held: 'staff' }, weight: 0.8 },
  { id: 'sceptre', name: 'Sceptre', slot: 'main_hand', group: 'Staffs', lines: ['gem'], icon: { sheet: 'weapons', rows: [127, 131], staff: true }, visual: { kind: 'held', held: 'staff' }, weight: 0.9 },
  // Shields ----------------------------------------------------------------
  { id: 'buckler', name: 'Buckler', slot: 'off_hand', group: 'Shields', lines: ['wood', 'metal'], icon: { sheet: 'weapons', rows: [160, 136] }, visual: { kind: 'held', held: 'shield' }, weight: 0.6 },
  { id: 'roundshield', name: 'Roundshield', slot: 'off_hand', group: 'Shields', lines: ['wood', 'metal'], icon: { sheet: 'weapons', rows: [137, 138, 139, 140, 141, 158] }, visual: { kind: 'held', held: 'shield' }, weight: 0.9 },
  { id: 'kite_shield', name: 'Kite Shield', slot: 'off_hand', group: 'Shields', lines: ['wood', 'metal'], icon: { sheet: 'weapons', rows: [142, 143, 144, 145] }, visual: { kind: 'held', held: 'shield' }, weight: 1 },
  { id: 'heater', name: 'Heater', slot: 'off_hand', group: 'Shields', lines: ['metal'], icon: { sheet: 'weapons', rows: [146, 147, 148, 149, 162, 163] }, visual: { kind: 'held', held: 'shield' }, weight: 1 },
  { id: 'tower_shield', name: 'Tower Shield', slot: 'off_hand', group: 'Shields', lines: ['metal'], icon: { sheet: 'weapons', rows: [159, 161] }, visual: { kind: 'held', held: 'shield' }, weight: 1.3 },
  { id: 'bulwark', name: 'Bulwark', slot: 'off_hand', group: 'Shields', lines: ['metal'], icon: { sheet: 'weapons', rows: [154, 155, 156, 157] }, visual: { kind: 'held', held: 'shield' }, weight: 1.4 },
  { id: 'aegis', name: 'Aegis', slot: 'off_hand', group: 'Shields', lines: ['metal'], icon: { sheet: 'weapons', rows: [150, 151, 152, 153] }, visual: { kind: 'held', held: 'shield' }, weight: 1.3 },
  // Tools ------------------------------------------------------------------
  { id: 'pickaxe', name: 'Pickaxe', slot: 'tool', group: 'Tools', lines: ['metal'], icon: { sheet: 'tools', rows: range(0, 9) }, visual: { kind: 'none', reason: 'uses the tool swing sheets' }, weight: 1 },
  { id: 'woodaxe', name: 'Woodaxe', slot: 'tool', group: 'Tools', lines: ['metal'], icon: { sheet: 'tools', rows: range(10, 19) }, visual: { kind: 'none', reason: 'uses the tool swing sheets' }, weight: 1 },
  { id: 'shovel', name: 'Shovel', slot: 'tool', group: 'Tools', lines: ['metal'], icon: { sheet: 'tools', rows: range(20, 26) }, visual: { kind: 'none', reason: 'uses the tool swing sheets' }, weight: 1 },
  { id: 'hoe', name: 'Hoe', slot: 'tool', group: 'Tools', lines: ['metal'], icon: { sheet: 'tools', rows: range(27, 29) }, visual: { kind: 'none', reason: 'uses the tool swing sheets' }, weight: 1 },
  { id: 'sickle', name: 'Sickle', slot: 'tool', group: 'Tools', lines: ['metal'], icon: { sheet: 'tools', rows: [40, 41] }, visual: { kind: 'none', reason: 'uses the tool swing sheets' }, weight: 0.8 },
  { id: 'watering_can', name: 'Watering Can', slot: 'tool', group: 'Tools', lines: ['metal'], icon: { sheet: 'tools', rows: [32] }, visual: { kind: 'none', reason: 'uses the watering sheets' }, weight: 0.8 },
  { id: 'hammer', name: 'Hammer', slot: 'tool', group: 'Tools', lines: ['metal'], icon: { sheet: 'tools', rows: [35] }, visual: { kind: 'none', reason: 'build tool' }, weight: 0.8 },
];

export const baseType = (id: string): BaseType => {
  const found = BASE_TYPES.find((entry) => entry.id === id);
  if (!found) throw new Error(`Unknown base type ${id}`);
  return found;
};

// ---------------------------------------------------------------------------
// Stats and affixes

export interface StatDef {
  readonly id: string;
  /** Simulation modifier target, or a skill node for rank grants. */
  readonly target: string;
  readonly label: string;
  /** White tooltip line (primary) or green `Equip:` line (secondary). */
  readonly kind: 'primary' | 'equip';
  /** Magnitude per item level (see affixValue). */
  readonly perLevel: number;
  readonly unit: 'points' | 'percent' | 'perSecond' | 'rank';
  /** Not yet allowed by EQUIPMENT_STAT_BUDGETS. */
  readonly needsBudget?: boolean;
}

export const STATS: Readonly<Record<string, StatDef>> = {
  str: { id: 'str', target: 'str', label: 'Strength', kind: 'primary', perLevel: 1 / 8, unit: 'points', needsBudget: true },
  dex: { id: 'dex', target: 'dex', label: 'Dexterity', kind: 'primary', perLevel: 1 / 8, unit: 'points', needsBudget: true },
  con: { id: 'con', target: 'con', label: 'Constitution', kind: 'primary', perLevel: 1 / 8, unit: 'points', needsBudget: true },
  int: { id: 'int', target: 'int', label: 'Intelligence', kind: 'primary', perLevel: 1 / 8, unit: 'points', needsBudget: true },
  wis: { id: 'wis', target: 'wis', label: 'Wisdom', kind: 'primary', perLevel: 1 / 8, unit: 'points', needsBudget: true },
  cha: { id: 'cha', target: 'cha', label: 'Charisma', kind: 'primary', perLevel: 1 / 8, unit: 'points', needsBudget: true },
  attackPower: { id: 'attackPower', target: 'attackPower', label: 'melee power', kind: 'equip', perLevel: 0.3, unit: 'percent' },
  rangedPower: { id: 'rangedPower', target: 'rangedPower', label: 'ranged power', kind: 'equip', perLevel: 0.3, unit: 'percent' },
  criticalChance: { id: 'criticalChance', target: 'criticalChance', label: 'critical strike chance', kind: 'equip', perLevel: 0.1, unit: 'percent' },
  maxHealth: { id: 'maxHealth', target: 'maxHealth', label: 'maximum health', kind: 'equip', perLevel: 0.3, unit: 'percent' },
  maxVigour: { id: 'maxVigour', target: 'maxVigour', label: 'maximum vigour', kind: 'equip', perLevel: 0.4, unit: 'percent' },
  armorPct: { id: 'armorPct', target: 'armorPct', label: 'damage reduction', kind: 'equip', perLevel: 0.12, unit: 'percent' },
  swingSpeed: { id: 'swingSpeed', target: 'swingSpeed', label: 'swing speed', kind: 'equip', perLevel: 0.2, unit: 'percent' },
  toolVigourCost: { id: 'toolVigourCost', target: 'toolVigourCost', label: 'tool vigour cost reduction', kind: 'equip', perLevel: 0.3, unit: 'percent' },
  sprintVigourCost: { id: 'sprintVigourCost', target: 'sprintVigourCost', label: 'sprint vigour cost reduction', kind: 'equip', perLevel: 0.3, unit: 'percent' },
  manaRegen: { id: 'manaRegen', target: 'manaRegen', label: 'mana per second', kind: 'equip', perLevel: 0.02, unit: 'perSecond', needsBudget: true },
  healthRegen: { id: 'healthRegen', target: 'healthRegen', label: 'health per second', kind: 'equip', perLevel: 0.02, unit: 'perSecond', needsBudget: true },
  vigourRegen: { id: 'vigourRegen', target: 'vigourRegen', label: 'vigour per second', kind: 'equip', perLevel: 0.02, unit: 'perSecond', needsBudget: true },
  health: { id: 'health', target: 'maxHealth', label: 'Health', kind: 'primary', perLevel: 2, unit: 'points' },
  armor: { id: 'armor', target: 'armor', label: 'Armor', kind: 'primary', perLevel: 1, unit: 'points' },
  maxMana: { id: 'maxMana', target: 'maxMana', label: 'maximum mana', kind: 'equip', perLevel: 0.4, unit: 'percent', needsBudget: true },
  farmcraft: { id: 'farmcraft', target: 'farmcraft', label: 'Farmcraft', kind: 'equip', perLevel: 0, unit: 'rank' },
  mining_endurance: { id: 'mining_endurance', target: 'mining_endurance', label: 'Mining Endurance', kind: 'equip', perLevel: 0, unit: 'rank' },
  fishing_endurance: { id: 'fishing_endurance', target: 'fishing_endurance', label: 'Fishing Endurance', kind: 'equip', perLevel: 0, unit: 'rank' },
  woodcutting_endurance: { id: 'woodcutting_endurance', target: 'woodcutting_endurance', label: 'Woodcutting Endurance', kind: 'equip', perLevel: 0, unit: 'rank' },
  blade_training: { id: 'blade_training', target: 'blade_training', label: 'Blade Training', kind: 'equip', perLevel: 0, unit: 'rank' },
  archery_basics: { id: 'archery_basics', target: 'archery_basics', label: 'Archery Basics', kind: 'equip', perLevel: 0, unit: 'rank' },
  battle_conditioning: { id: 'battle_conditioning', target: 'battle_conditioning', label: 'Battle Conditioning', kind: 'equip', perLevel: 0, unit: 'rank' },
  measured_stride: { id: 'measured_stride', target: 'measured_stride', label: 'Measured Stride', kind: 'equip', perLevel: 0, unit: 'rank' },
};

export interface Affix {
  readonly id: string;
  readonly name: string;
  readonly stat: string;
  /** Rarity from which the affix may appear (skill ranks are rare+ by rule). */
  readonly from: RarityId;
  /** Groups this affix suits; empty = any. */
  readonly suits: readonly string[];
}

/** Prefixes grant a primary attribute or a headline power stat (white lines). */
export const PREFIXES: readonly Affix[] = [
  { id: 'mighty', name: 'Mighty', stat: 'str', from: 'uncommon', suits: [] },
  { id: 'stalwart', name: 'Stalwart', stat: 'con', from: 'uncommon', suits: [] },
  { id: 'nimble', name: 'Nimble', stat: 'dex', from: 'uncommon', suits: [] },
  { id: 'radiant', name: 'Radiant', stat: 'int', from: 'uncommon', suits: [] },
  { id: 'serene', name: 'Serene', stat: 'wis', from: 'uncommon', suits: [] },
  { id: 'gallant', name: 'Gallant', stat: 'cha', from: 'uncommon', suits: [] },
  { id: 'keen', name: 'Keen', stat: 'criticalChance', from: 'uncommon', suits: ['Swords', 'Daggers', 'Axes', 'Polearms', 'Bows'] },
  { id: 'brutal', name: 'Brutal', stat: 'attackPower', from: 'uncommon', suits: ['Swords', 'Axes', 'Maces', 'Polearms'] },
  { id: 'deadeye', name: 'Deadeye', stat: 'rangedPower', from: 'uncommon', suits: ['Bows', 'Crossbows', 'Ammunition'] },
  { id: 'warded', name: 'Warded', stat: 'armorPct', from: 'uncommon', suits: ['Shields', 'Plate', 'Helms'] },
  { id: 'tireless', name: 'Tireless', stat: 'toolVigourCost', from: 'uncommon', suits: ['Tools', 'Gloves'] },
  { id: 'hale', name: 'Hale', stat: 'health', from: 'uncommon', suits: [] },
  { id: 'ironclad', name: 'Ironclad', stat: 'armor', from: 'uncommon', suits: ['Plate', 'Helms', 'Shields', 'Footwear', 'Gloves'] },
];

/** Suffixes grant a secondary stat, regeneration or a skill rank (green Equip lines). */
export const SUFFIXES: readonly Affix[] = [
  { id: 'ages', name: 'of the Ages', stat: 'manaRegen', from: 'uncommon', suits: [] },
  { id: 'renewal', name: 'of Renewal', stat: 'healthRegen', from: 'uncommon', suits: [] },
  { id: 'endurance', name: 'of Endurance', stat: 'maxVigour', from: 'uncommon', suits: [] },
  { id: 'fortitude', name: 'of Fortitude', stat: 'maxHealth', from: 'uncommon', suits: [] },
  { id: 'arcana', name: 'of Arcana', stat: 'maxMana', from: 'uncommon', suits: [] },
  { id: 'swiftness', name: 'of Swiftness', stat: 'swingSpeed', from: 'uncommon', suits: ['Swords', 'Daggers', 'Axes', 'Maces', 'Tools'] },
  { id: 'bulwark', name: 'of the Bulwark', stat: 'armorPct', from: 'uncommon', suits: ['Shields', 'Plate', 'Helms', 'Leathers'] },
  { id: 'wanderer', name: 'of the Wanderer', stat: 'sprintVigourCost', from: 'uncommon', suits: ['Footwear', 'Leathers', 'Clothing'] },
  { id: 'orchard', name: 'of the Orchard', stat: 'farmcraft', from: 'rare', suits: [] },
  { id: 'deep', name: 'of the Deep', stat: 'mining_endurance', from: 'rare', suits: [] },
  { id: 'tides', name: 'of the Tides', stat: 'fishing_endurance', from: 'rare', suits: [] },
  { id: 'woodsman', name: 'of the Woodsman', stat: 'woodcutting_endurance', from: 'rare', suits: [] },
  { id: 'blade', name: 'of the Blade', stat: 'blade_training', from: 'rare', suits: [] },
  { id: 'hunt', name: 'of the Hunt', stat: 'archery_basics', from: 'rare', suits: [] },
  { id: 'veteran', name: 'of the Veteran', stat: 'battle_conditioning', from: 'rare', suits: [] },
  { id: 'stride', name: 'of the Long Road', stat: 'measured_stride', from: 'rare', suits: [] },
];

/** Worn-out bases for poor items. */
export const POOR_WORDS: Readonly<Record<MaterialLine, readonly string[]>> = {
  metal: ['Rusted', 'Bent', 'Pitted', 'Chipped'],
  cloth: ['Frayed', 'Moth-eaten', 'Threadbare'],
  leather: ['Cracked', 'Scuffed'],
  gem: ['Clouded', 'Flawed'],
  wood: ['Warped', 'Splintered'],
};

// ---------------------------------------------------------------------------
// Epic lineages: authored name + stat package + visual theme

export interface Lineage {
  readonly id: string;
  readonly name: string;
  readonly theme: string;
  readonly stats: readonly string[];
  readonly equip: string;
  /** Visual: primary material palette, trim accent, ornament detail. */
  readonly palette: MaterialName;
  readonly accent: MaterialName;
  readonly detail: MaterialName;
  readonly head: string;
}

export const LINEAGES: readonly Lineage[] = [
  { id: 'dawnsworn', name: 'Dawnsworn', theme: 'sunrise paladins; plumed silver and gold', stats: ['con', 'wis'], equip: 'healthRegen', palette: 'silver', accent: 'gold', detail: 'ruby', head: 'plumed_greathelm' },
  { id: 'duskwarden', name: 'Duskwarden', theme: 'night watch of the cellar roads; blackiron and horn', stats: ['str', 'con'], equip: 'armorPct', palette: 'obsidian', accent: 'bronze', detail: 'ruby', head: 'horned_warhelm' },
  { id: 'stormforged', name: 'Stormforged', theme: 'coastal knights; frost steel and white wings', stats: ['str', 'dex'], equip: 'swingSpeed', palette: 'frost', accent: 'silver', detail: 'silver', head: 'winged_helm' },
  { id: 'wildroot', name: 'Wildroot', theme: 'orchard wardens; living verdant bronze', stats: ['wis', 'con'], equip: 'farmcraft', palette: 'jade', accent: 'gold', detail: 'jade', head: 'gilded_helm' },
  { id: 'kingsguard', name: 'Kingsguard', theme: 'royal household; gilded plate with ruby crest', stats: ['cha', 'con'], equip: 'maxHealth', palette: 'gold', accent: 'silver', detail: 'ruby', head: 'plumed_greathelm' },
  { id: 'starweaver', name: 'Starweaver', theme: 'court magi; starmetal and moonweave', stats: ['int', 'wis'], equip: 'manaRegen', palette: 'amethyst', accent: 'gold', detail: 'frost', head: 'royal_crown' },
];

// ---------------------------------------------------------------------------
// Legendary uniques

export interface Legendary {
  readonly id: string;
  readonly name: string;
  readonly base: string;
  readonly material: string;
  /** Legendaries sit at the top of the ladder regardless of material. */
  readonly tier: number;
  /** Item level; legendaries and named uniques are 55–60. */
  readonly itemLevel: number;
  /** Effects sized by item level: three for legendary armour, four for named unique weapons. */
  readonly stats: readonly string[];
  readonly signature: string;
  readonly flavour: string;
  /** Icon/visual finish: icon column palette plus optional bespoke ramp and aura. */
  readonly finish: { readonly palette: MaterialName; readonly row?: number; readonly bone?: boolean; readonly accent?: MaterialName; readonly detail?: MaterialName; readonly staffHead?: MaterialName; readonly aura: string };
}

export const LEGENDARIES: readonly Legendary[] = [
  { id: 'bonecrippler', name: 'The Bonecrippler', base: 'warhammer', material: 'blackiron', tier: 6, itemLevel: 58, stats: ['str', 'con', 'criticalChance', 'health'], signature: 'Critical hits stagger the target and shatter 10% of its armour.', flavour: 'It has never needed a second swing.', finish: { palette: 'obsidian', row: 133, bone: true, aura: '#e4a672' } },
  { id: 'emberwake', name: 'Emberwake, Blade of the Last Hearth', base: 'longsword', material: 'emberforged', tier: 6, itemLevel: 60, stats: ['str', 'wis', 'attackPower', 'healthRegen'], signature: 'Swings leave a trail of embers that burn for 3 seconds.', flavour: 'Forged in the one hearth that outlasted the Long Winter.', finish: { palette: 'ember', row: 32, aura: '#ffa214' } },
  { id: 'frostwhisper', name: 'Frostwhisper', base: 'arming_sword', material: 'frostforged', tier: 6, itemLevel: 58, stats: ['dex', 'int', 'swingSpeed', 'criticalChance'], signature: 'Every third strike chills, slowing the target by 30%.', flavour: 'Cold enough to hear.', finish: { palette: 'frost', row: 26, aura: '#94fdff' } },
  { id: 'rootsinger', name: 'Rootsinger', base: 'staff', material: 'jade', tier: 6, itemLevel: 58, stats: ['wis', 'int', 'maxMana', 'farmcraft'], signature: 'Crops you tend grow one stage sooner while this staff is equipped.', flavour: 'The orchard answers when it sings.', finish: { palette: 'jade', staffHead: 'jade', aura: '#d3fc7e' } },
  { id: 'hollowmoon', name: 'Hollowmoon Sceptre', base: 'sceptre', material: 'amethyst', tier: 7, itemLevel: 60, stats: ['int', 'cha', 'maxMana', 'manaRegen'], signature: 'Spells cost no mana during the first hour of night.', flavour: 'Borrowed from a sky that never asked for it back.', finish: { palette: 'amethyst', staffHead: 'amethyst', aura: '#f389f5' } },
  { id: 'orchardkeeper', name: "Orchardkeeper's Aegis", base: 'aegis', material: 'verdant', tier: 6, itemLevel: 56, stats: ['con', 'wis', 'armorPct'], signature: 'Blocking restores 2 vigour; +1 rank to Farmcraft.', flavour: 'Carried by the first keeper of the old trees.', finish: { palette: 'jade', row: 151, aura: '#5ac54f' } },
  { id: 'kingsbulwark', name: 'Bulwark of the Hundred Winters', base: 'bulwark', material: 'gilded', tier: 6, itemLevel: 57, stats: ['con', 'cha', 'health'], signature: 'Allies near you take 5% less damage.', flavour: 'Every dent is a winter it held.', finish: { palette: 'gold', row: 156, aura: '#fee761' } },
  { id: 'starfall', name: 'Starfall', base: 'longbow', material: 'starmetal', tier: 7, itemLevel: 60, stats: ['dex', 'int', 'rangedPower', 'criticalChance'], signature: 'Fully drawn shots split into three falling stars.', flavour: 'Loose it at dusk and make a wish.', finish: { palette: 'amethyst', row: 116, aura: '#fdd2ed' } },
  { id: 'harvest_crown', name: 'Crown of the Harvest King', base: 'crown', material: 'gilded', tier: 5, itemLevel: 55, stats: ['cha', 'wis', 'maxMana'], signature: 'Merchants pay 10% more for your produce.', flavour: 'Worn once a year, at the long table.', finish: { palette: 'gold', accent: 'gold', detail: 'jade', aura: '#fee761' } },
  { id: 'dawnbreaker', name: 'Dawnbreaker', base: 'greathelm', material: 'steel', tier: 6, itemLevel: 57, stats: ['con', 'str', 'healthRegen'], signature: 'The first hit you take each dawn is ignored.', flavour: 'The sun rises. So do you.', finish: { palette: 'silver', accent: 'gold', detail: 'ember', aura: '#ffeb57' } },
  { id: 'wyrmscale', name: 'Wyrmscale Hauberk', base: 'hauberk', material: 'emberforged', tier: 7, itemLevel: 58, stats: ['con', 'str', 'armor'], signature: 'Immune to burning; +10% damage reduction.', flavour: 'The wyrm did not need it any more.', finish: { palette: 'ember', accent: 'gold', aura: '#ffa214' } },
  { id: 'cellarmaster', name: "The Cellarmaster's Cleaver", base: 'hatchet', material: 'gilded', tier: 5, itemLevel: 56, stats: ['str', 'cha', 'swingSpeed', 'woodcutting_endurance'], signature: 'Cellar goods you process age twice as fast.', flavour: 'Aged to perfection. Much like its owner.', finish: { palette: 'gold', row: 90, aura: '#feae34' } },
];

// ---------------------------------------------------------------------------
// Pricing and derived numbers

/** Sell value in bronze: 5 × itemLevel^1.6 × rarity price multiplier × base weight. */
export function sellValue(itemLevel: number, rarityId: RarityId, weight = 1): number {
  return Math.max(1, Math.round(5 * itemLevel ** 1.6 * rarity(rarityId).price * Math.max(0.5, weight)));
}

/** Effect size from item level; rarity only decides how many effects there are. */
export function affixValue(stat: StatDef, itemLevel: number): number {
  if (stat.unit === 'rank') return 1;
  if (stat.unit === 'perSecond') return Math.max(0.1, Math.round(itemLevel * stat.perLevel * 10) / 10);
  return Math.max(1, Math.round(itemLevel * stat.perLevel));
}

export function armourValue(base: BaseType, itemLevel: number, rarityId: RarityId): number {
  const classFactor = base.armourClass === 'plate' ? 3 : base.armourClass === 'leather' ? 2 : 1;
  const worn = rarityId === 'poor' ? 0.7 : 1;
  return Math.max(1, Math.round((2 + itemLevel * 0.6) * base.weight * classFactor * worn));
}

export function weaponDamage(base: BaseType, itemLevel: number, rarityId: RarityId): number {
  const worn = rarityId === 'poor' ? 0.7 : 1;
  return Math.max(1, Math.round(18 * base.weight * (1 + itemLevel / 60) * worn));
}

export function coins(bronze: number): { gold: number; silver: number; bronze: number } {
  return { gold: Math.floor(bronze / 10000), silver: Math.floor(bronze / 100) % 100, bronze: bronze % 100 };
}

import { describe, expect, it } from 'vitest';
import { gearFixtureRegistry, gearFixtureCatalogue } from './content/gear-catalogue.fixture.js';
import {
  compileGearCatalogue,
  gearStatDisplayValue,
  gearStatModifierValue,
  isGearWeaponBase,
} from './content/gear-catalogue.js';
import {
  gearModifiers,
  isGearInstanceId,
  itemGearDisplayName,
  itemGearEffects,
  itemGearEquals,
  itemGearSellValue,
  itemGearSkillContributions,
  validateItemGear,
  type ItemGear,
} from './item-gear.js';

const catalogue = gearFixtureCatalogue();
const gear = (fields: Partial<ItemGear>): ItemGear => ({
  instanceId: '4242', rollVersion: 1, rarity: 'common', material: 'iron', itemLevel: 12,
  prefix: '', suffix: '', lineage: '', legendary: '', seed: 7, ...fields,
});
const codes = (value: ItemGear, base: string) => validateItemGear(value, base, catalogue).map(({ code }) => code);
const stat = (id: string) => catalogue.stats.get(id)!;

describe('item-level effect sizes', () => {
  it('sizes attributes at +1 per 8 item levels and Health at +2 per level', () => {
    expect(gearStatDisplayValue(stat('int'), 8)).toBe(1);
    expect(gearStatDisplayValue(stat('int'), 56)).toBe(7);
    expect(gearStatModifierValue(stat('int'), 56)).toBe(7);
    expect(gearStatDisplayValue(stat('health'), 50)).toBe(100);
    // +100 Health is flat maxHealth in centi.
    expect(stat('health').modifier).toEqual({ target: 'maxHealth', layer: 'flat', unitsPerDisplay: 100 });
    expect(gearStatModifierValue(stat('health'), 50)).toBe(10_000);
  });

  it('matches the catalogue table at item levels 10, 30 and 50 in simulation units', () => {
    const at = (id: string) => [10, 30, 50].map((level) => [gearStatDisplayValue(stat(id), level), gearStatModifierValue(stat(id), level)]);
    expect(at('str')).toEqual([[1, 1], [4, 4], [6, 6]]);
    // Percentages are basis points; melee power is pctAdd.
    expect(at('attackPower')).toEqual([[3, 300], [9, 900], [15, 1500]]);
    expect(at('criticalChance')).toEqual([[1, 100], [3, 300], [5, 500]]);
    expect(at('armorPct')).toEqual([[1, 100], [4, 400], [6, 600]]);
    // Regeneration is flat centi per second, rounded to tenths.
    expect(at('manaRegen')).toEqual([[0.2, 20], [0.6, 60], [1, 100]]);
    // Reductions are negative additive percentages.
    expect(at('swingSpeed')).toEqual([[2, -200], [6, -600], [10, -1000]]);
    expect(at('toolVigourCost')).toEqual([[3, -300], [9, -900], [15, -1500]]);
    // Minimums: every effect is worth at least 1 (0.1 per second).
    expect(gearStatDisplayValue(stat('str'), 1)).toBe(1);
    expect(gearStatDisplayValue(stat('healthRegen'), 1)).toBe(0.1);
    expect(gearStatDisplayValue(stat('farmcraft'), 60)).toBe(1);
    expect(gearStatModifierValue(stat('farmcraft'), 60)).toBeNull();
  });
});

describe('ItemGear derivation', () => {
  it('derives modifiers from content and item level with stable per-copy ids', () => {
    const radiant = gear({ instanceId: '900', rarity: 'rare', material: 'blackiron', itemLevel: 26, prefix: 'radiant', suffix: 'ages' });
    expect(validateItemGear(radiant, 'bulwark', catalogue)).toEqual([]);
    expect(gearModifiers(radiant, catalogue)).toEqual([
      { id: 'gear.900.prefix.int', target: 'int', layer: 'flat', value: 3, source: 'equipment' },
      { id: 'gear.900.suffix.manaRegen', target: 'manaRegen', layer: 'flat', value: 50, source: 'equipment' },
    ]);
  });

  it('is deterministic and ignores the seed', () => {
    const copy = gear({ rarity: 'epic', material: 'steel', itemLevel: 22, lineage: 'dawnsworn' });
    const recompiled = compileGearCatalogue(gearFixtureRegistry().registry.gear.values())!;
    expect(gearModifiers(copy, catalogue)).toEqual(gearModifiers(copy, recompiled));
    expect(gearModifiers({ ...copy, seed: 123_456 }, catalogue)).toEqual(gearModifiers(copy, catalogue));
    expect(itemGearDisplayName(copy, 'greathelm', catalogue)).toBe(itemGearDisplayName(copy, 'greathelm', recompiled));
    expect(itemGearSellValue(copy, 'greathelm', catalogue)).toBe(itemGearSellValue(copy, 'greathelm', recompiled));
    expect(gearModifiers(copy, catalogue).map(({ target }) => target)).toEqual(['con', 'wis', 'healthRegen']);
  });

  it('never grants more effects than the rarity allows', () => {
    expect(itemGearEffects(gear({ rarity: 'common', prefix: 'mighty', suffix: 'ages' }), catalogue)).toEqual([]);
    expect(itemGearEffects(gear({ rarity: 'rare', prefix: 'mighty', lineage: 'dawnsworn' }), catalogue).map(({ source }) => source))
      .toEqual(['prefix']);
    expect(gearModifiers(gear({ rarity: 'uncommon', prefix: 'no_such_prefix' }), catalogue)).toEqual([]);
  });

  it('turns skill-rank effects into equipment rank contributions for rare or better copies', () => {
    const rare = gear({ instanceId: '77', rarity: 'rare', material: 'steel', itemLevel: 19, prefix: 'stalwart', suffix: 'veteran' });
    expect(itemGearSkillContributions(rare, catalogue)).toEqual([
      { sourceId: 'gear.77.suffix.battle_conditioning', nodeId: 'battle_conditioning', quality: 'rare' },
    ]);
    expect(gearModifiers(rare, catalogue).map(({ id }) => id)).toEqual(['gear.77.prefix.con']);
    expect(itemGearSkillContributions(gear({ rarity: 'uncommon', suffix: 'veteran' }), catalogue)).toEqual([]);
  });
});

describe('naming and sell value', () => {
  it.each([
    [gear({ rarity: 'poor', material: 'iron', itemLevel: 8 }), 'arming_sword', 'Chipped Iron Arming Sword', 28],
    [gear({ rarity: 'common', material: 'iron', itemLevel: 12 }), 'sallet', 'Iron Sallet', 266],
    [gear({ rarity: 'uncommon', material: 'steel', itemLevel: 19, suffix: 'fortitude' }), 'longsword', 'Steel Longsword of Fortitude', 1223],
    [gear({ rarity: 'uncommon', material: 'wool', itemLevel: 12, prefix: 'stalwart' }), 'flannel', 'Stalwart Woollen Flannel', 266],
    [gear({ rarity: 'rare', material: 'blackiron', itemLevel: 26, prefix: 'radiant', suffix: 'ages' }), 'bulwark', 'Radiant Bulwark of the Ages', 5142],
    [gear({ rarity: 'epic', material: 'steel', itemLevel: 22, lineage: 'dawnsworn' }), 'greathelm', 'Dawnsworn Greathelm', 8434],
    [gear({ rarity: 'legendary', material: 'blackiron', itemLevel: 58, legendary: 'bonecrippler' }), 'warhammer', 'The Bonecrippler', 116_017],
  ] as const)('%#: %s', (copy, base, name, sell) => {
    expect(validateItemGear(copy, base, catalogue)).toEqual([]);
    expect(itemGearDisplayName(copy, base, catalogue)).toBe(name);
    expect(itemGearSellValue(copy, base, catalogue)).toBe(sell);
  });

  it('picks the poor damage word from base and material, not from the seed or copy', () => {
    const names = [1, 2, 3].map((seed) => itemGearDisplayName(gear({ instanceId: String(seed), rarity: 'poor', seed }), 'longsword', catalogue));
    expect(new Set(names).size).toBe(1);
    expect(['Rusted', 'Bent', 'Pitted', 'Chipped']).toContain(names[0]!.split(' ')[0]);
  });
});

describe('validateItemGear', () => {
  it('enforces effect counts per rarity', () => {
    expect(codes(gear({ rarity: 'poor', material: 'iron', itemLevel: 8, suffix: 'ages' }), 'longsword')).toEqual(['effect_count']);
    expect(codes(gear({ rarity: 'common', prefix: 'mighty' }), 'longsword')).toEqual(['effect_count']);
    expect(codes(gear({ rarity: 'uncommon' }), 'longsword')).toEqual(['effect_count']);
    expect(codes(gear({ rarity: 'uncommon', prefix: 'mighty', suffix: 'ages' }), 'longsword')).toEqual(['effect_count']);
    expect(codes(gear({ rarity: 'uncommon', prefix: 'mighty' }), 'longsword')).toEqual([]);
    expect(codes(gear({ rarity: 'rare', prefix: 'mighty' }), 'longsword')).toEqual(['effect_count']);
    expect(codes(gear({ rarity: 'rare', prefix: 'mighty', suffix: 'ages' }), 'longsword')).toEqual([]);
    expect(codes(gear({ rarity: 'epic', material: 'steel', itemLevel: 20 }), 'greathelm')).toEqual(['effect_count']);
    expect(codes(gear({ rarity: 'epic', material: 'steel', itemLevel: 20, lineage: 'dawnsworn', prefix: 'mighty' }), 'greathelm'))
      .toEqual(['effect_count']);
    expect(codes(gear({ rarity: 'legendary', material: 'blackiron', itemLevel: 58 }), 'warhammer')).toEqual(['effect_count']);
  });

  it('allows skill-rank effects on rare or better only', () => {
    expect(codes(gear({ rarity: 'uncommon', suffix: 'orchard' }), 'hoe')).toEqual(['affix_rarity', 'skill_rank_rarity']);
    expect(codes(gear({ rarity: 'rare', prefix: 'tireless', suffix: 'orchard' }), 'hoe')).toEqual([]);
    expect(codes(gear({ rarity: 'epic', material: 'verdant', itemLevel: 34, lineage: 'wildroot' }), 'halberd')).toEqual([]);
  });

  it('checks affix suits, material lines and item-level bands', () => {
    expect(codes(gear({ rarity: 'uncommon', prefix: 'keen' }), 'greathelm')).toEqual(['affix_suits']);
    expect(codes(gear({ rarity: 'uncommon', prefix: 'keen' }), 'longsword')).toEqual([]);
    expect(codes(gear({ material: 'linen' }), 'longsword')).toEqual(['material_not_allowed', 'item_level_out_of_band']);
    expect(codes(gear({ material: 'steel', itemLevel: 30 }), 'longsword')).toEqual(['item_level_out_of_band']);
    expect(codes(gear({ material: 'steel', itemLevel: 15 }), 'longsword')).toEqual([]);
    expect(codes(gear({ material: 'steel', itemLevel: 61 }), 'longsword')).toEqual(['invalid_item_level']);
    expect(codes(gear({}), 'no_such_base')).toEqual(['unknown_base']);
  });

  it('pins legendaries to their base, material and the 55-60 band', () => {
    const bonecrippler = gear({ rarity: 'legendary', material: 'blackiron', itemLevel: 58, legendary: 'bonecrippler' });
    expect(codes(bonecrippler, 'warhammer')).toEqual([]);
    expect(codes({ ...bonecrippler, itemLevel: 54 }, 'warhammer')).toEqual(['item_level_out_of_band']);
    expect(codes(bonecrippler, 'longsword')).toEqual(['legendary_mismatch']);
    expect(codes({ ...bonecrippler, material: 'steel' }, 'warhammer')).toEqual(['legendary_mismatch']);
  });

  it('carries three legendary effects on armour and four on weapons', () => {
    expect(catalogue.legendaries.size).toBe(12);
    for (const legendary of catalogue.legendaries.values()) {
      const base = catalogue.bases.get(legendary.base)!;
      expect(legendary.effects, legendary.id).toHaveLength(isGearWeaponBase(base) ? 4 : 3);
      const copy = gear({ rarity: 'legendary', material: legendary.material, itemLevel: legendary.itemLevel, legendary: legendary.id.slice('gear:legendary_'.length) });
      expect(validateItemGear(copy, legendary.base, catalogue), legendary.id).toEqual([]);
      expect(itemGearEffects(copy, catalogue)).toHaveLength(legendary.effects.length);
    }
  });

  it('checks the record fields themselves', () => {
    expect(['1', '18446744073709551615'].every(isGearInstanceId)).toBe(true);
    expect(['0', '01', '-1', '1.5', '18446744073709551616', ''].some(isGearInstanceId)).toBe(false);
    expect(codes(gear({ instanceId: '0' }), 'sallet')).toEqual(['invalid_instance_id']);
    expect(codes(gear({ seed: -1 }), 'sallet')).toEqual(['invalid_seed']);
    expect(codes(gear({ seed: 2 ** 32 }), 'sallet')).toEqual(['invalid_seed']);
    expect(codes(gear({ rollVersion: 2 }), 'sallet')).toEqual(['invalid_roll_version']);
    expect(codes(gear({ rarity: 'mythic' as ItemGear['rarity'] }), 'sallet')).toEqual(['unknown_rarity']);
    expect(itemGearEquals(gear({}), gear({}))).toBe(true);
    expect(itemGearEquals(gear({}), gear({ seed: 8 }))).toBe(false);
  });
});

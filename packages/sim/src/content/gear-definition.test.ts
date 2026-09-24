import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry, bootstrapContentRows } from './bootstrap-registry.js';
import { compileGearCatalogue } from './gear-catalogue.js';
import { parseGearDefinition } from './gear-definition.js';
import { buildContentRegistry } from './registry.js';

const rows = bootstrapContentRows();
const json = (id: string): Record<string, unknown> => JSON.parse(rows.find((row) => row.id === id)!.json as string) as Record<string, unknown>;
const rules = () => json('gear:rules') as { stats: Record<string, unknown>[]; itemLevelBands: Record<string, unknown>[]; rarities: Record<string, unknown>[] } & Record<string, unknown>;

/** Rebuilds the bootstrap pack with some gear rows replaced or added. */
function packWith(...changed: Record<string, unknown>[]) {
  const replaced = new Map(changed.map((row) => [row.id as string, row]));
  const next = rows.map((row) => replaced.has(row.id) ? { ...row, json: JSON.stringify(replaced.get(row.id)) } : row);
  const added = changed.filter((row) => !rows.some(({ id }) => id === row.id))
    .map((row) => ({ id: row.id as string, kind: 'gear', json: JSON.stringify(row) }));
  return buildContentRegistry([...next, ...added]).report;
}
const errors = (report: ReturnType<typeof packWith>) => report.errors.map(({ code, definitionId, message }) => `${code} ${definitionId ?? ''}: ${message}`);

describe('gear content', () => {
  it('loads and validates the committed gear catalogue', () => {
    const registry = bootstrapContentRegistry();
    expect(registry.gear.size).toBe(145);
    const catalogue = compileGearCatalogue(registry.gear.values())!;
    expect([catalogue.materials.size, catalogue.prefixes.size, catalogue.suffixes.size, catalogue.lineages.size,
      catalogue.legendaries.size, catalogue.bases.size, catalogue.stats.size]).toEqual([32, 13, 16, 6, 12, 65, 29]);
    expect(buildContentRegistry(rows).report.errors).toEqual([]);
  });

  it('maps every stat to a real modifier target or a gear-boostable skill node', () => {
    const catalogue = compileGearCatalogue(bootstrapContentRegistry().gear.values())!;
    const skillNodes = [...bootstrapContentRegistry().skillTrees.values()].flatMap(({ nodes }) => nodes)
      .filter((node) => node.gearBoostable === true).map(({ id }) => id);
    for (const stat of catalogue.stats.values()) {
      if (stat.skillNode === undefined) expect(stat.modifier, stat.id).toBeDefined();
      else expect(skillNodes, stat.id).toContain(stat.skillNode);
    }
  });

  it('rejects unknown stats', () => {
    const stats = rules().stats.map((stat) => stat.id === 'int' ? { ...stat, modifier: { target: 'luck', layer: 'flat', unitsPerDisplay: 1 } } : stat);
    expect(() => parseGearDefinition({ ...rules(), stats })).toThrow(/modifier\.target/u);
    const override = rules().stats.map((stat) => stat.id === 'int' ? { ...stat, modifier: { target: 'int', layer: 'override', unitsPerDisplay: 1 } } : stat);
    expect(() => parseGearDefinition({ ...rules(), stats: override })).toThrow(/modifier\.layer/u);
    expect(errors(packWith({ ...json('gear:prefix_radiant'), stat: 'luck' })))
      .toEqual(['unresolved_reference gear:prefix_radiant: unknown stat luck']);
    expect(errors(packWith({ ...json('gear:lineage_dawnsworn'), effects: ['con', 'wis', 'luck'] })))
      .toEqual(['unresolved_reference gear:lineage_dawnsworn: unknown stat luck']);
    const unboostable = rules().stats.map((stat) => stat.id === 'farmcraft' ? { ...stat, skillNode: 'combat_root' } : stat);
    expect(errors(packWith({ ...rules(), stats: unboostable }))).toEqual([
      'unresolved_reference gear:rules: stat farmcraft names combat_root, which is not a gear-boostable skill node',
    ]);
  });

  it('rejects bad item-level bands', () => {
    const bands = rules().itemLevelBands;
    const withBand = (index: number, band: Record<string, unknown>) => ({ ...rules(), itemLevelBands: bands.map((entry, i) => i === index ? band : entry) });
    expect(() => parseGearDefinition(withBand(2, { tier: 3, minimum: 22, maximum: 15 }))).toThrow(/minimum exceeds maximum/u);
    expect(() => parseGearDefinition(withBand(6, { tier: 7, minimum: 45, maximum: 61 }))).toThrow(/maximum/u);
    expect(() => parseGearDefinition(withBand(2, { tier: 2, minimum: 15, maximum: 22 }))).toThrow(/unique and ascending/u);
    expect(() => parseGearDefinition(withBand(2, { tier: 3, minimum: 2, maximum: 22 }))).toThrow(/lower item levels/u);
    expect(() => parseGearDefinition({ ...rules(), legendaryItemLevels: { minimum: 60, maximum: 55 } })).toThrow(/minimum exceeds maximum/u);
    expect(errors(packWith({ ...json('gear:material_starmetal'), tier: 8 })))
      .toEqual(['unresolved_reference gear:material_starmetal: no item-level band for tier 8']);
  });

  it('rejects duplicate ids', () => {
    expect(() => parseGearDefinition({ ...rules(), stats: [...rules().stats, rules().stats[0]] })).toThrow(/duplicate stat str/u);
    expect(() => parseGearDefinition({ ...rules(), rarities: [...rules().rarities, rules().rarities[5]] })).toThrow(/ladder order/u);
    expect(() => parseGearDefinition({ ...json('gear:lineage_dawnsworn'), effects: ['con', 'con', 'wis'] })).toThrow(/duplicate entry con/u);
    const bronze = rows.find(({ id }) => id === 'gear:material_bronze')!;
    expect(buildContentRegistry([...rows, bronze]).report.errors.map(({ code, definitionId }) => [code, definitionId]))
      .toEqual([['duplicate_id', 'gear:material_bronze']]);
  });

  it('rejects legendaries with the wrong effect count or item level', () => {
    const bonecrippler = json('gear:legendary_bonecrippler');
    expect(errors(packWith({ ...bonecrippler, effects: ['str', 'con', 'health'] }))).toEqual([
      'invalid_gear_definition gear:legendary_bonecrippler: legendary weapons carry exactly 4 effects plus a signature',
    ]);
    expect(errors(packWith({ ...json('gear:legendary_dawnbreaker'), effects: ['con', 'str', 'healthRegen', 'armor'] }))).toEqual([
      'invalid_gear_definition gear:legendary_dawnbreaker: legendary armour carry exactly 3 effects plus a signature',
    ]);
    expect(errors(packWith({ ...bonecrippler, itemLevel: 50 }))).toEqual([
      'invalid_gear_definition gear:legendary_bonecrippler: legendaries are item level 55-60',
    ]);
    expect(errors(packWith({ ...bonecrippler, material: 'linen' }))).toEqual([
      'invalid_gear_definition gear:legendary_bonecrippler: Warhammer is not made from cloth',
    ]);
  });

  it('keeps skill ranks rare-or-better and lineages at the epic effect count', () => {
    expect(errors(packWith({ ...json('gear:suffix_orchard'), from: 'uncommon' })))
      .toEqual(['invalid_gear_definition gear:suffix_orchard: skill-rank affixes are rare or better']);
    expect(errors(packWith({ ...json('gear:lineage_dawnsworn'), effects: ['con', 'wis'] })))
      .toEqual(['invalid_gear_definition gear:lineage_dawnsworn: epic lineages carry exactly 3 effects']);
    const rarities = rules().rarities.map((rarity) => rarity.id === 'rare' ? { ...rarity, effects: 3 } : rarity);
    expect(errors(packWith({ ...rules(), rarities }))).toEqual(['invalid_gear_definition gear:rules: rare items carry 2 effect(s)']);
    expect(errors(packWith({ ...json('gear:prefix_keen'), suits: ['Swords', 'Wands'] })))
      .toEqual(['unresolved_reference gear:prefix_keen: no base belongs to group Wands']);
  });

  it('rejects malformed rows', () => {
    expect(() => parseGearDefinition({ ...json('gear:material_bronze'), id: 'gear:prefix_bronze' })).toThrow(/gear:material_<key>/u);
    expect(() => parseGearDefinition({ ...json('gear:material_bronze'), colour: 'red' })).toThrow(/unknown field/u);
    expect(() => parseGearDefinition({ ...json('gear:material_bronze'), palette: 'teal' })).toThrow(/palette/u);
    const precise = rules().stats.map((stat) => stat.id === 'str' ? { ...stat, perLevel: 0.1234 } : stat);
    expect(() => parseGearDefinition({ ...rules(), stats: precise })).toThrow(/three decimal places/u);
    const oddRegen = rules().stats.map((stat) => stat.id === 'manaRegen' ? { ...stat, modifier: { target: 'manaRegen', layer: 'flat', unitsPerDisplay: 105 } } : stat);
    expect(() => parseGearDefinition({ ...rules(), stats: oddRegen })).toThrow(/multiple of 10/u);
    expect(errors(packWith({ ...rules(), retired: true }))[0]).toMatch(/need one active gear:rules row/u);
  });
});

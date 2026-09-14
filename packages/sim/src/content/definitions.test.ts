import { describe, expect, it } from 'vitest';
import {
  ContentParseError,
  parseItemDefinition,
  parseObjectDefinition,
  parseProcessDefinition,
  parseRecipeDefinition,
  parseShopDefinition,
} from './definitions.js';
import { contentDefinitionsHash } from './payload-hash.js';

const item = {
  id: 'item:test_apple',
  kind: 'item',
  schemaVersion: 1,
  displayName: 'Test Apple',
  icon: { asset: 'item_test_apple' },
  quality: 'common',
  maxStack: 32,
  tags: ['item.food'],
  economy: { buy: 4, sell: 2 },
  food: { restoreCenti: 100 },
};

describe('content definition parsers', () => {
  it('restores the canonical common quality without changing parsed shape or hash', () => {
    const explicit = parseItemDefinition(item);
    const { quality, ...compact } = item;
    void quality;
    const restored = parseItemDefinition(compact);
    expect(restored).toEqual(explicit);
    expect(Object.prototype.propertyIsEnumerable.call(restored, 'quality')).toBe(true);
    expect(contentDefinitionsHash([restored])).toBe(contentDefinitionsHash([explicit]));
    expect(() => parseItemDefinition({ ...compact, quality: 'ordinary' })).toThrow();
    expect(() => parseItemDefinition({ ...compact, quality: null })).toThrow();
  });
  it('validates fixed weapon damage and rare nonstackable skill gear', () => {
    const weapon={...item,maxStack:1,tags:['item.melee_weapon'],combat:{attackKind:'melee',baseDamageCenti:1800}};
    expect(parseItemDefinition(weapon).combat).toEqual(weapon.combat);
    for(const invalid of [{...weapon,maxStack:2},{...weapon,tags:[]},
      {...weapon,combat:{attackKind:'melee',baseDamageCenti:Infinity}},
      {...weapon,combat:{attackKind:'unknown',baseDamageCenti:1800}}]) expect(()=>parseItemDefinition(invalid)).toThrow();
    const gear={...weapon,quality:'rare',equip:{slot:'hand',skillNode:'blade_training'}};
    expect(parseItemDefinition(gear).equip?.skillNode).toBe('blade_training');
    expect(()=>parseItemDefinition({...gear,quality:'common'})).toThrow();
  });
  it('round-trips each Phase-0 definition kind from JSON text', () => {
    const parsedItem = parseItemDefinition(JSON.stringify(item));
    expect(parsedItem.onUse).toEqual([]);
    expect(JSON.parse(JSON.stringify(parsedItem))).toEqual(item);
    expect(parseRecipeDefinition({
      id: 'recipe:test_pie', kind: 'recipe', schemaVersion: 1,
      recipeKind: 'shapeless',
      inputs: [{ item: 'item:test_apple', count: 2 }],
      output: { item: 'item:test_pie', count: 1 },
    })).toMatchObject({ id: 'recipe:test_pie', recipeKind: 'shapeless' });
    expect(parseProcessDefinition({
      id: 'process:test_bake', kind: 'process', schemaVersion: 1,
      stationTag: 'station.oven', input: { item: 'item:test_apple', count: 1 },
      outputs: [{ item: 'item:test_pie', count: 1 }], ticksPerUnit: 20,
    })).toMatchObject({ id: 'process:test_bake', ticksPerUnit: 20 });
    expect(parseShopDefinition({
      id: 'shop:test_stall', kind: 'shop', schemaVersion: 1,
      offers: [{ item: 'item:test_apple' }], currency: { kind: 'bronze' },
    })).toMatchObject({ id: 'shop:test_stall', currency: { kind: 'bronze' } });
    expect(parseObjectDefinition({
      id: 'object:test_stall', kind: 'object', schemaVersion: 1, displayName: 'Test Stall',
      components: { identity: { tags: ['merchant.stall'] } },
    })).toMatchObject({ id: 'object:test_stall', components: { identity: { tags: ['merchant.stall'] } } });
  });

  it('holds an explicit upgrade boundary for future schema versions', () => {
    expect(() => parseItemDefinition({ ...item, schemaVersion: 2 })).toThrowError(ContentParseError);
    try {
      parseItemDefinition({ ...item, schemaVersion: 2 });
    } catch (error) {
      expect(error).toMatchObject({ code: 'unsupported_schema_version', path: '$.schemaVersion' });
    }
  });

  it('bounds process completion experience before registry validation', () => {
    const process = {
      id: 'process:test_bake', kind: 'process', schemaVersion: 1,
      stationTag: 'station.oven', input: { item: 'item:test_apple', count: 1 },
      outputs: [{ item: 'item:test_pie', count: 1 }], ticksPerUnit: 20,
      experience: { skill: 'farming', amount: 7 },
    };
    expect(parseProcessDefinition(process).experience).toEqual({ skill: 'farming', amount: 7 });
    expect(() => parseProcessDefinition({
      ...process, experience: { skill: 'farming', amount: 0 },
    })).toThrow('experience.amount');
    expect(() => parseProcessDefinition({
      ...process, experience: { skill: 'farming', amount: 1_000_001 },
    })).toThrow('experience.amount');
  });

  it('rejects kind/id disagreements before registry construction', () => {
    expect(() => parseItemDefinition({ ...item, id: 'recipe:test_apple' }))
      .toThrowError(/expected item: slug/);
  });

  it('validates item fuel and tool capability bounds used by behaviour handlers', () => {
    expect(parseItemDefinition({
      ...item,
      fuel: { smelts: 1 },
      tool: { tier: 3, reachTiles: 1, swingTicks: 10 },
    })).toMatchObject({
      fuel: { smelts: 1 },
      tool: { tier: 3, reachTiles: 1, swingTicks: 10 },
    });
    expect(() => parseItemDefinition({ ...item, fuel: { smelts: 0 } }))
      .toThrowError(ContentParseError);
    expect(() => parseItemDefinition({
      ...item, tool: { tier: 3, reachTiles: 0, swingTicks: 10 },
    })).toThrowError(ContentParseError);
    expect(parseItemDefinition({
      ...item,
      tags: ['item.ranged_weapon'],
      ranged: { ammunition: 'item:test_arrow', projectile: 'arrow' },
    })).toMatchObject({
      ranged: { ammunition: 'item:test_arrow', projectile: 'arrow' },
    });
    expect(() => parseItemDefinition({
      ...item,
      ranged: { ammunition: 'item:test_arrow', projectile: 'fireball' },
    })).toThrowError(ContentParseError);
  });

  it('parses only the bounded commerce and equipped-capacity policy adapters', () => {
    expect(parseItemDefinition({
      ...item,
      economy: {
        ...item.economy,
        purchaseRequirement: { skillNode: 'sprinkler_engineering', minimumRank: 1 },
        purchaseGrant: 'homestead_claim',
        salePremium: 'estate_vintage',
      },
      droppable: false,
      equip: { slot: 'back', inventoryCapacity: 20 },
    })).toMatchObject({
      economy: {
        purchaseRequirement: { skillNode: 'sprinkler_engineering', minimumRank: 1 },
        purchaseGrant: 'homestead_claim',
        salePremium: 'estate_vintage',
      },
      droppable: false,
      equip: { slot: 'back', inventoryCapacity: 20 },
    });
    expect(() => parseItemDefinition({
      ...item, economy: { ...item.economy, purchaseGrant: 'arbitrary_reducer' },
    })).toThrowError(ContentParseError);
    expect(() => parseItemDefinition({
      ...item, economy: { ...item.economy, salePremium: 'arbitrary_math' },
    })).toThrowError(ContentParseError);
    expect(() => parseItemDefinition({
      ...item, equip: { slot: 'hand', inventoryCapacity: 20 },
    })).toThrowError(ContentParseError);
    expect(() => parseItemDefinition({
      ...item, equip: { slot: 'back', inventoryCapacity: 21 },
    })).toThrowError(ContentParseError);
  });

  it('parses the universal item onUse lifecycle and validates its effects', () => {
    expect(parseItemDefinition({
      ...item,
      tags: ['item.document'],
      onUse: [{
        id: 'read', prompt: 'READ', conditions: [],
        effects: [{ learnRecipes: ['recipe:test_pie', 'process:test_bake'] }],
      }],
    })).toMatchObject({
      onUse: [{
        id: 'read', verb: 'secondary', prompt: 'READ', conditions: [],
        effects: [{ learnRecipes: ['recipe:test_pie', 'process:test_bake'] }],
      }],
    });
    expect(() => parseItemDefinition({
      ...item,
      onUse: [{
        id: 'read', conditions: [], effects: [{ learnRecipes: ['item:not_a_recipe'] }],
      }],
    })).toThrowError(ContentParseError);
  });
});

import { describe, expect, it } from 'vitest';

import { ContentParseError, parseLootDefinition } from './definitions.js';
import { bootstrapContentDefinitions } from './bootstrap-registry.js';
import { validateContentDefinitions } from './validate.js';

const validLoot = {
  id: 'loot:test_table',
  kind: 'loot',
  schemaVersion: 1,
  groups: [{
    id: 'primary',
    rollTag: 'test.roll',
    conditions: [{ toolTierAtLeast: 2 }],
    entries: [{
      id: 'apple', weight: 3, priority: 1, flags: ['fruit'],
      conditions: [{ skillRank: { skill: 'foraging', minimum: 1 } }],
      target: { item: 'item:apple', min: 1, max: 2 },
    }],
  }],
} as const;

describe('loot content definitions', () => {
  it('parses weighted entries, conditions, quantities, and nested tables', () => {
    expect(parseLootDefinition(validLoot)).toEqual(validLoot);
    expect(parseLootDefinition({
      ...validLoot,
      id: 'loot:test_nested',
      groups: [{ id: 'nested', entries: [{
        id: 'nested', weight: 1, target: { loot: 'loot:test_table' },
      }] }],
    })).toMatchObject({ groups: [{ entries: [{ target: { loot: 'loot:test_table' } }] }] });
  });

  it('rejects malformed ids, zero weights, ambiguous targets, and incomplete groups', () => {
    expect(() => parseLootDefinition({ ...validLoot, id: 'item:test_table' }))
      .toThrowError(ContentParseError);
    expect(() => parseLootDefinition({
      ...validLoot, groups: [{ id: 'bad', entries: [{ id: 'bad', weight: 0, target: { item: 'item:apple', min: 1, max: 1 } }] }],
    })).toThrowError(ContentParseError);
    expect(() => parseLootDefinition({
      ...validLoot, groups: [{ id: 'bad', entries: [{
        id: 'bad', weight: 1, target: { item: 'item:apple', loot: 'loot:test_table', min: 1, max: 1 },
      }] }],
    })).toThrowError(ContentParseError);
    expect(() => parseLootDefinition({ ...validLoot, groups: [{ id: 'empty', entries: [] }] }))
      .toThrowError(ContentParseError);
  });

  it('reports stable validation errors for quantities, references, and recursive nesting', () => {
    const bootstrap = bootstrapContentDefinitions();
    const invalid = [
      { ...validLoot, id: 'loot:bad_quantity', groups: [{ id: 'bad', entries: [{
        id: 'bad', weight: 1, target: { item: 'item:apple', min: 2, max: 1 },
      }] }] },
      { ...validLoot, id: 'loot:missing_nested', groups: [{ id: 'bad', entries: [{
        id: 'bad', weight: 1, target: { loot: 'loot:not_here' },
      }] }] },
      { ...validLoot, id: 'loot:recursive', groups: [{ id: 'bad', entries: [{
        id: 'bad', weight: 1, target: { loot: 'loot:recursive' },
      }] }] },
    ].map((definition) => parseLootDefinition(definition));
    const report = validateContentDefinitions([...bootstrap, ...invalid]);
    expect(report.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'invalid_loot_weight', definitionId: 'loot:bad_quantity' }),
      expect.objectContaining({ code: 'unresolved_reference', definitionId: 'loot:missing_nested' }),
      expect.objectContaining({ code: 'invalid_loot_weight', definitionId: 'loot:recursive' }),
    ]));
  });
});

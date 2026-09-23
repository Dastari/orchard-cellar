import { describe, expect, it } from 'vitest';
import { RULE_MEDIA } from '../rule-catalogue.js';
import { bootstrapContentRows } from './bootstrap-registry.js';
import { parseContentDefinition } from './definitions.js';
import { parseTraversalAbilities, parseTraversalPolicy } from './traversal-definition.js';

const rawPolicy = () => Object.fromEntries(RULE_MEDIA.map(medium => [medium, {
  requiresAny: medium === 'land' ? [['walk']] : [], hazards: [],
}]));
describe('traversal authoring validation', () => {
  it('requires a complete bounded policy and rejects malformed declarations', () => {
    expect(Object.keys(parseTraversalPolicy(rawPolicy()))).toEqual([...RULE_MEDIA]);
    const missing = rawPolicy(); delete missing['void'];
    expect(() => parseTraversalPolicy(missing)).toThrow('$.media.void');
    expect(() => parseTraversalPolicy({ ...rawPolicy(), acid: {} })).toThrow('unknown field');
    expect(() => parseTraversalAbilities(['walk', 'walk'])).toThrow('duplicate ability');
    expect(() => parseTraversalAbilities(['tree:oak'])).toThrow('stable ability identifier');
    expect(() => parseTraversalAbilities(Array<string>(33).fill('walk'))).toThrow('at most 32');
    expect(() => parseTraversalAbilities(null)).toThrow('expected array');
    expect(() => parseTraversalPolicy({ ...rawPolicy(), lava: { requiresAny: [], hazards: [
      { id: 'burn', damageCenti: 2, intervalTicks: 0, immunityAbilities: [] },
    ] } })).toThrow('intervalTicks');
    const hazard = { id: 'burn', damageCenti: 2, intervalTicks: 4, immunityAbilities: ['lava_immune'] };
    expect(parseTraversalPolicy({ ...rawPolicy(), lava: { requiresAny: [], hazards: [hazard] } }).lava.hazards)
      .toEqual([hazard]);
    expect(() => parseTraversalPolicy({ ...rawPolicy(), lava: { requiresAny: [], hazards: [hazard, hazard] } }))
      .toThrow('duplicate hazard');
    expect(() => parseTraversalPolicy({ ...rawPolicy(), land: { requiresAny: [['walk']], hazards: [], immunity: true } }))
      .toThrow('unknown field');
  });

  it.each(['npc', 'creature', 'enemy', 'effect'] as const)('adds explicit %s abilities without changing legacy rows', kind => {
    const row = bootstrapContentRows().find(row => row.kind === kind)!;
    const raw = typeof row.json === 'string' ? JSON.parse(row.json) as Record<string, unknown> : row.json as Record<string, unknown>;
    expect(parseContentDefinition(kind, raw)).not.toHaveProperty('traversalAbilities');
    expect(parseContentDefinition(kind, { ...raw, traversalAbilities: ['walk', 'toxin_immune'] }))
      .toHaveProperty('traversalAbilities', ['walk', 'toxin_immune']);
    expect(() => parseContentDefinition(kind, { ...raw, traversalAbilities: ['walk', 'walk'] })).toThrow('duplicate ability');
  });

  it('reads boat grant substitution from authored fields and preserves missing legacy fields', () => {
    const rows = bootstrapContentRows().filter(row => row.kind === 'npc');
    const raw = rows.map(row => typeof row.json === 'string' ? JSON.parse(row.json) as Record<string, unknown> : row.json as Record<string, unknown>)
      .find(row => (row.mount as { adapter?: string } | undefined)?.adapter === 'boat')!;
    expect(parseContentDefinition('npc', raw)).toHaveProperty('mount.adapter', 'boat');
    expect(parseContentDefinition('npc', { ...raw, mount: { ...raw.mount as object,
      traversalAbilities: ['boat'], replacesAbilities: ['walk'],
    } })).toMatchObject({ mount: { traversalAbilities: ['boat'], replacesAbilities: ['walk'] } });
  });
});

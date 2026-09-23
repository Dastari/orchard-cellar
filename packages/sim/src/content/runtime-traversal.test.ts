import { describe, expect, it } from 'vitest';
import { RULE_MEDIA } from '../rule-catalogue.js';
import { bootstrapContentRows } from './bootstrap-registry.js';
import { parseContentDefinition } from './definitions.js';
import { buildContentRegistry } from './registry.js';
import { runtimeTraversalAbilities, runtimeTraversalPolicy, runtimeTraversalProjection } from './runtime-traversal.js';
import { contentDefinitionRowsHash } from './payload-hash.js';
import { definitionSlug } from './definition-id.js';
import { parseWorldRulesDefinition } from './world-rules-definition.js';

const rawPolicy = (mode = 'shadow') => ({
  id: 'world_rules:test_policy', kind: 'world_rules', schemaVersion: 1, profile: 'traversal', mode,
  playerAbilities: ['walk'], placementAbilities: ['walk'], boatPlacementAbilities: ['boat'], projectileAbilities: ['projectile'],
  media: Object.fromEntries(RULE_MEDIA.map(medium => [medium, {
    requiresAny: medium === 'land' ? [['walk'], ['projectile']] : medium === 'void' ? [] : [['boat'], ['projectile']], hazards: [],
  }])),
});
const policyRow = (mode = 'shadow') => ({ id: 'world_rules:test_policy', kind: 'world_rules', json: rawPolicy(mode) });
const legacy = { width: 2, height: 1, blocked: [true, false] };
const channels = { width: 2, height: 1, medium: [0, 1], solidBlocked: [0, 0] };

describe('runtime authored traversal', () => {
  it('parses policy, rejects invalid inputs and rebuilds a valid registry', () => {
    const row = rawPolicy();
    expect(parseContentDefinition('world_rules', row)).toEqual(row);
    expect(definitionSlug(row.id)).toBe('test_policy');
    expect(contentDefinitionRowsHash([policyRow()])).toMatch(/^[a-f0-9]{8}$/u);
    expect(parseWorldRulesDefinition(JSON.stringify(row))).toEqual(row);
    expect(buildContentRegistry([...bootstrapContentRows().filter(row => row.kind !== 'world_rules'), policyRow()]).report.valid).toBe(true);
    for (const invalid of [null, '{', { ...row, id: 'bad' }, { ...row, kind: 'effect' },
      { ...row, schemaVersion: 2 }, { ...row, mode: 'maybe' }, { ...row, profile: 'weather' },
      { ...row, retired: 3 }, { ...row, replacement: 'npc:one' }, { ...row, extra: 1 }]) {
      expect(() => parseWorldRulesDefinition(invalid)).toThrow();
    }
    expect(parseWorldRulesDefinition({ ...row, retired: true, replacement: 'world_rules:next' }))
      .toMatchObject({ retired: true, replacement: 'world_rules:next' });
  });

  it('rejects multiple semantic policy owners at publication and runtime', () => {
    const duplicate = { ...rawPolicy(), id: 'world_rules:second' };
    const built = buildContentRegistry([policyRow(), { id: duplicate.id, kind: duplicate.kind, json: duplicate }]);
    expect(built.report.errors).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'invalid_world_definition', path: 'profile' })]));
    expect(() => runtimeTraversalPolicy(built.registry)).toThrow('ambiguous_traversal_policy');
  });

  it('keeps absent policy and missing actor grants in explicit compatibility mode', () => {
    const empty = buildContentRegistry([]).registry;
    expect(runtimeTraversalProjection(empty, legacy, channels, { kind: 'player' }, 0n))
      .toMatchObject({ collision: legacy, candidate: null, compatibility: 'legacy_policy' });
    const registry = buildContentRegistry([policyRow()]).registry;
    expect(runtimeTraversalProjection(registry, legacy, channels, { kind: 'definition', definitionId: 'npc:missing' }, 0n))
      .toMatchObject({ collision: legacy, candidate: null, compatibility: 'legacy_actor' });
    expect(runtimeTraversalAbilities(registry, runtimeTraversalPolicy(registry)!, {
      kind: 'player', mount: { kind: 'boat', definitionId: 'npc:missing' },
    }, 0n)).toBeNull();
  });

  it('returns legacy movement in shadow, exposes differences and reuses immutable projections', () => {
    const registry = buildContentRegistry([policyRow()]).registry;
    const result = runtimeTraversalProjection(registry, legacy, channels, { kind: 'player' }, 0n);
    expect(result.collision).toBe(legacy);
    expect(result.candidate?.blocked).toEqual([false, true]);
    expect(result.differences).toHaveLength(2);
    expect(runtimeTraversalProjection(registry, legacy, channels, { kind: 'player' }, 1n)).toBe(result);
    const active = buildContentRegistry([policyRow('active')]).registry;
    const switched = runtimeTraversalProjection(active, legacy, channels, { kind: 'player' }, 1n);
    expect(switched.compatibility).toBe('active');
    expect(switched.collision).toBe(switched.candidate);
    expect(runtimeTraversalProjection(active, legacy, channels, { kind: 'projectile' }, 0n).collision.blocked)
      .toEqual([false, false]);
  });

  it('combines explicitly authored mount and effect grants using bigint expiry', () => {
    const rows = bootstrapContentRows().filter(row => row.kind !== 'world_rules');
    const npcRows = rows.filter(row => row.kind === 'npc').map(row => ({ row, raw: typeof row.json === 'string' ? JSON.parse(row.json) as Record<string, unknown> : row.json as Record<string, unknown> }));
    const boat = npcRows.find(({ raw }) => (raw.mount as { adapter?: string } | undefined)?.adapter === 'boat')!;
    const effect = rows.find(row => row.kind === 'effect')!;
    const effectRaw = typeof effect.json === 'string' ? JSON.parse(effect.json) as object : effect.json as object;
    const edited = rows.map(row => row.id === boat.row.id ? { ...row, json: { ...boat.raw, traversalAbilities: [], mount: {
      ...boat.raw.mount as object, traversalAbilities: ['boat'], replacesAbilities: ['walk'],
    } } } : row.id === effect.id ? { ...row, json: { ...effectRaw, traversalAbilities: ['toxin_immune'] } } : row);
    const registry = buildContentRegistry([...edited, policyRow()]).registry;
    const policy = runtimeTraversalPolicy(registry)!;
    const tick = BigInt(Number.MAX_SAFE_INTEGER) + 10n;
    const actor = { kind: 'player' as const, mount: { kind: 'boat', definitionId: boat.row.id }, effects: [
      { effectKind: effect.id.slice('effect:'.length), expiresTick: tick + 1n },
    ] };
    expect([...runtimeTraversalAbilities(registry, policy, actor, tick)!]).toEqual(['boat', 'toxin_immune']);
    expect([...runtimeTraversalAbilities(registry, policy, actor, tick + 1n)!]).toEqual(['boat']);
    expect([...runtimeTraversalAbilities(registry, policy, { kind: 'definition', definitionId: boat.row.id }, tick)!]).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { bootstrapContentRegistry } from './bootstrap-registry.js';
import { buildContentRegistry } from './registry.js';
import { parseSkillTreeDefinition } from './world-definition.js';
import { runtimeResourcePerception } from '../skill-effects.js';
import { runtimeSkillNodeDefinition, runtimeSkillPurchaseRejection, skillExperienceForLevel } from '../skill-trees.js';

const node = (id: string, extra: Record<string, unknown> = {}) => ({
  id, track: 'farming', name: id, description: id, position: [0, 0],
  connects: ['root'], maxRank: 1, pointCost: 1, implemented: true, ...extra,
});
function tree(nodes: readonly Record<string, unknown>[], extra: Record<string, unknown> = {}) {
  return {
    id: 'skill_tree:test', kind: 'skill_tree', schemaVersion: 1, track: 'farming', levelCap: 50,
    nodes: [node('root', { root: true, maxRank: 0, pointCost: 0, connects: ['sense'] }), ...nodes], ...extra,
  };
}
function registry(definition: ReturnType<typeof tree> & Readonly<Record<string, unknown>>) {
  return buildContentRegistry([{ id: definition.id, kind: 'skill_tree', json: definition }]);
}
const empty = { buriedOreRadiusTiles: 0, identifyBuriedOre: false, minimapOre: false, minimapFishing: false, minimapOreRadiusTiles: 0, minimapFishingRadiusTiles: 0 };

describe('authored passive resource perception', () => {
  it.each([
    [[]], [['unknown']], [['foot_gap_jump', 'foot_gap_jump']],
  ])('rejects malformed capability metadata %j', (capabilities) => {
    expect(() => parseSkillTreeDefinition(tree([node('sense', { capabilities })]))).toThrow();
  });

  it('requires capabilities to be implemented and non-root', () => {
    expect(() => parseSkillTreeDefinition(tree([
      node('sense', { implemented: false, capabilities: ['minimap_player_tracking'] }),
    ]))).toThrow();
    expect(() => parseSkillTreeDefinition({
      ...tree([]),
      nodes: [node('root', {
        root: true, maxRank: 0, pointCost: 0, connects: [], capabilities: ['minimap_player_tracking'],
      })],
    })).toThrow();
  });

  it.each([
    { buriedOreDetectionRadiusTiles: 0 }, { buriedOreDetectionRadiusTiles: 65 },
    { buriedOreDetectionRadiusTiles: 1.5 }, { buriedOreDetectionRadiusTiles: '15' },
    { identifyBuriedOre: 'yes' }, { minimapResources: ['tree'], minimapRadiusTiles: 60 },
    { minimapResources: ['ore', 'ore'], minimapRadiusTiles: 60 },
    { minimapResources: ['ore'] }, { minimapRadiusTiles: 60 },
    { minimapResources: [], minimapRadiusTiles: 60 },
    { minimapResources: ['ore'], minimapRadiusTiles: 0 },
    { minimapResources: ['fish_pool'], minimapRadiusTiles: 65 },
    { minimapResources: ['fish_pool'], minimapRadiusTiles: 1.5 },
    { unknownCapability: true },
  ])('rejects malformed or unbounded passive metadata %j', (passive) => {
    expect(() => parseSkillTreeDefinition(tree([node('sense', { passive })]))).toThrow();
  });

  it.each([
    [node('sense', { prerequisites: ['missing'] })],
    [node('sense', { prerequisites: ['root', 'root'] })],
    [node('sense', { prerequisites: ['sense'] })],
    [node('sense', { prerequisites: ['next'] }), node('next', { prerequisites: ['sense'] })],
    [node('sense'), node('sense')],
  ])('rejects unresolved, duplicate or cyclic prerequisite graphs %j', (...nodes) => {
    const result = registry(tree(nodes));
    expect(result.report.valid).toBe(false);
    expect(result.report.errors.some(error => error.code === 'invalid_world_definition')).toBe(true);
  });

  it('grants authored effects for arbitrary IDs and requires every ancestor despite owned adjacent descendants', () => {
    const authored = tree([
      node('sense', { prerequisites: ['root'], passive: { buriedOreDetectionRadiusTiles: 15 } }),
      node('expanded', { prerequisites: ['sense'], connects: ['identify'], passive: { buriedOreDetectionRadiusTiles: 60 } }),
      node('identify', { prerequisites: ['expanded'], passive: { identifyBuriedOre: true } }),
      node('map', { prerequisites: ['identify', 'sense'], passive: { minimapResources: ['ore'], minimapRadiusTiles: 60 } }),
      node('fish', { passive: { minimapResources: ['fish_pool'], minimapRadiusTiles: 42 } }),
    ]);
    const result = registry(authored);
    expect(result.report.errors).toEqual([]);
    expect(runtimeResourcePerception(result.registry, {})).toEqual(empty);
    expect(runtimeResourcePerception(result.registry, { sense: 1 })).toEqual({ ...empty, buriedOreRadiusTiles: 15 });
    const all = { sense: 1, expanded: 1, identify: 1, map: 1, fish: 1 };
    expect(runtimeResourcePerception(result.registry, all)).toEqual({ buriedOreRadiusTiles: 60, identifyBuriedOre: true, minimapOre: true, minimapFishing: true, minimapOreRadiusTiles: 60, minimapFishingRadiusTiles: 42 });
    expect(runtimeResourcePerception(result.registry, { ...all, sense: 0 })).toEqual({ ...empty, minimapFishing: true, minimapFishingRadiusTiles: 42 });
    expect(runtimeSkillPurchaseRejection(result.registry, 'expanded', {
      experience: skillExperienceForLevel(50), spentPoints: 0, bonusPoints: 0, ranks: { identify: 1 },
    })).toBe('skill_not_connected');
  });

  it('revokes effects after respec, retirement or disabling an implemented ancestor', () => {
    const authored = tree([
      node('sense', { passive: { buriedOreDetectionRadiusTiles: 15 } }),
      node('upgrade', { prerequisites: ['sense'], passive: { buriedOreDetectionRadiusTiles: 60 } }),
    ]);
    const ranks = { sense: 1, upgrade: 1 };
    const active = registry(authored).registry;
    expect(runtimeResourcePerception(active, ranks).buriedOreRadiusTiles).toBe(60);
    expect(runtimeResourcePerception(active, {})).toEqual(empty);
    const retired = registry({ ...authored, retired: true }).registry;
    expect(runtimeResourcePerception(retired, ranks)).toEqual(empty);
    expect(retired.skillTrees.get(authored.id)?.nodes.some(row => row.id === 'sense')).toBe(true);
    expect(retired.compiled.skillNodes).toEqual([]);
    expect(runtimeSkillNodeDefinition(retired, 'sense')).toBeNull();
    expect(runtimeSkillPurchaseRejection(retired, 'sense', {
      experience: skillExperienceForLevel(50), spentPoints: 0, bonusPoints: 50, ranks: {},
    })).toBe('skill_not_found');
    expect(ranks).toEqual({ sense: 1, upgrade: 1 });
    const disabled = { ...authored, nodes: authored.nodes.map(row => row.id === 'sense' ? { ...row, implemented: false } : row) };
    expect(runtimeResourcePerception(registry(disabled).registry, ranks)).toEqual(empty);
    for (const rank of [NaN, Infinity, -1, 0.5, 2]) expect(runtimeResourcePerception(active, { sense: rank, upgrade: 1 })).toEqual(empty);
  });

  it('rejects node IDs duplicated across trees and denies malformed cyclic ownership', () => {
    const first = tree([node('sense')]);
    const second = { ...tree([node('sense')]), id: 'skill_tree:other' };
    const built = buildContentRegistry([first, second].map(definition => ({ id: definition.id, kind: 'skill_tree', json: definition })));
    expect(built.report.errors.some(error => error.message.includes('already owned'))).toBe(true);
    const cyclic = registry(tree([
      node('sense', { prerequisites: ['upgrade'], passive: { buriedOreDetectionRadiusTiles: 15 } }),
      node('upgrade', { prerequisites: ['sense'], passive: { buriedOreDetectionRadiusTiles: 60 } }),
    ]));
    expect(cyclic.report.valid).toBe(false);
    expect(runtimeResourcePerception(cyclic.registry, { sense: 1, upgrade: 1 })).toEqual(empty);
  });

  it('authors the exact new progression without replacing Prospector or existing ranks', () => {
    const active = bootstrapContentRegistry();
    const ranks = { prospector: 1 };
    expect(runtimeResourcePerception(active, ranks)).toEqual(empty);
    expect(runtimeResourcePerception(active, { ...ranks, ore_sense: 1 }).buriedOreRadiusTiles).toBe(15);
    const expanded = { ...ranks, ore_sense: 1, deep_ore_sense: 1 };
    expect(runtimeResourcePerception(active, expanded)).toEqual({ ...empty, buriedOreRadiusTiles: 60 });
    const identified = { ...expanded, ore_identification: 1 };
    expect(runtimeResourcePerception(active, identified).identifyBuriedOre).toBe(true);
    expect(runtimeResourcePerception(active, { ...identified, ore_mapping: 1 })).toEqual({ ...empty, buriedOreRadiusTiles: 60, identifyBuriedOre: true, minimapOre: true, minimapOreRadiusTiles: 60 });
    expect(runtimeResourcePerception(active, { seasoned_angler: 1, fishing_mapping: 1 })).toEqual({ ...empty, minimapFishing: true, minimapFishingRadiusTiles: 60 });
  });
});

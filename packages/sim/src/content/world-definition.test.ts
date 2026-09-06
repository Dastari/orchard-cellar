import { describe, expect, it } from 'vitest';
import { AUTHORED_CROP_DEFINITIONS } from '../crops.js';
import { EFFECT_DEFINITIONS } from '../effects.js';
import { HOMESTEAD_UPGRADE_DEFINITIONS } from '../homestead-upgrades.js';
import { PLAYER_STATISTIC_DEFINITIONS } from '../player-statistics.js';
import { SKILL_NODE_DEFINITIONS, SKILL_TRACKS } from '../skill-trees.js';
import { MARLOW_TENT_SPACE_ID, SPACES } from '../spaces.js';
import { WILDLIFE_DEFINITIONS, WILDLIFE_SPAWN_PLANS } from '../wildlife.js';
import { SUPPORT_CAP_BALANCE_IDS } from './balance-definition.js';
import { parseContentDefinition } from './definitions.js';
import { bootstrapContentDefinitions } from './bootstrap-registry.js';
import { buildContentRegistry } from './registry.js';
import { runtimeSpaceDefinition } from './runtime.js';
import {
  compiledCropProjection,
  compiledSpaceProjection,
  parseSpaceContentDefinition,
  compiledStatisticProjection,
  compiledUpgradeProjection,
} from './world-definition.js';

describe('world content definitions', () => {
  it('exposes run entrances only when the active authored space defines them', () => {
    const definitions = bootstrapContentDefinitions();
    const tent = definitions.find((definition) => definition.kind === 'space'
      && definition.spaceId === MARLOW_TENT_SPACE_ID)!;
    const current = buildContentRegistry(definitions.map((definition) => ({
      id: definition.id, kind: definition.kind, json: definition,
    }))).registry;
    expect(current.compiled.spaces.find((space) => space.spaceId === MARLOW_TENT_SPACE_ID)?.runEntrances)
      .toBeUndefined();
    const runEntrances = [{ id: 'future-descent', kind: 'roguelike', tileX: 3, tileY: 4, reachTiles: 1.5 }];
    const authored = parseSpaceContentDefinition({ ...tent, runEntrances });
    const next = buildContentRegistry(definitions.map((definition) => ({
      id: definition.id, kind: definition.kind, json: definition.id === tent.id ? authored : definition,
    }))).registry;
    expect(next.compiled.spaces.find((space) => space.spaceId === MARLOW_TENT_SPACE_ID)?.runEntrances)
      .toEqual(runEntrances);
    const retired = compiledSpaceProjection(parseSpaceContentDefinition({ ...tent, runEntrances, retired: true }));
    expect(retired.runEntrances).toBeUndefined();
    expect(retired.spaceId).toBe(MARLOW_TENT_SPACE_ID);
    expect(retired.generator).toBe('marlow_tent');
    const withoutTent = buildContentRegistry(definitions.filter((definition) => definition.id !== tent.id)
      .map((definition) => ({ id: definition.id, kind: definition.kind, json: definition }))).registry;
    expect(runtimeSpaceDefinition(withoutTent, MARLOW_TENT_SPACE_ID)).toBeUndefined();
    expect(runtimeSpaceDefinition(withoutTent, 50_123, {
      spaceId: 50_123, instanceKind: 'roguelike', seed: 123, roomNumber: 2, roomKind: 'combat', theme: 'cave',
    })).toMatchObject({ spaceId: 50_123, generator: 'roguelike', rogueRoom: { seed: 123, roomNumber: 2 } });
    expect(() => parseSpaceContentDefinition({ ...tent, runEntrances: [runEntrances[0], runEntrances[0]] }))
      .toThrow('duplicate run entrance');
    expect(() => parseSpaceContentDefinition({ ...tent, runEntrances: [{ ...runEntrances[0], reachTiles: 100 }] }))
      .toThrow('reach must not exceed 4 tiles');
    expect(() => parseSpaceContentDefinition({ ...tent, runEntrances: [{ ...runEntrances[0], kind: 'unregistered' }] }))
      .toThrow('unknown run kind');
  });

  it('round-trips every versioned world-table definition as JSON-safe data', () => {
    const worldKinds = new Set([
      'balance_group', 'creature', 'crop', 'effect', 'skill_tree', 'space',
      'spawn', 'statistic', 'upgrade',
    ]);
    const definitions = bootstrapContentDefinitions().filter(({ kind }) => worldKinds.has(kind));
    expect(() => JSON.stringify(definitions)).not.toThrow();
    for (const definition of definitions) {
      expect(parseContentDefinition(definition.kind, JSON.stringify(definition))).toEqual(definition);
    }
    const counts = Object.fromEntries([...new Set(definitions.map(({ kind }) => kind))]
      .map((kind) => [kind, definitions.filter((definition) => definition.kind === kind).length]));
    const nonPackSpawns = definitions.filter((definition) => definition.kind === 'spawn'
      && definition.strategy !== 'packs');
    expect(nonPackSpawns.map(({ id }) => id)).toEqual(['spawn:farmer_bob_herd']);
    expect(counts).toEqual({
      balance_group: 1,
      creature: Object.keys(WILDLIFE_DEFINITIONS).length,
      crop: AUTHORED_CROP_DEFINITIONS.length,
      effect: Object.keys(EFFECT_DEFINITIONS).length,
      skill_tree: SKILL_TRACKS.length,
      space: SPACES.length,
      spawn: WILDLIFE_SPAWN_PLANS.length + nonPackSpawns.length,
      statistic: Object.keys(PLAYER_STATISTIC_DEFINITIONS).length,
      upgrade: Object.keys(HOMESTEAD_UPGRADE_DEFINITIONS).length,
    });
  });

  it('projects the compiled crop, creature, spawn, space, skill, effect, statistic, and upgrade tables without drift', () => {
    const registry = buildContentRegistry(bootstrapContentDefinitions().map((definition) => ({
      id: definition.id, kind: definition.kind, json: definition,
    }))).registry;
    expect(Object.fromEntries([...registry.crops.values()].map((definition) => {
      const projected = compiledCropProjection(definition);
      return [projected.kind, projected];
    }))).toEqual(Object.fromEntries(AUTHORED_CROP_DEFINITIONS.map((definition) => [definition.kind, definition])));
    expect(Object.fromEntries([...registry.creatures.values()].map((definition) => [definition.species, {
      habitat: definition.habitat,
      variants: definition.variants,
      speedFixed: definition.speedFixed,
      wanderRadiusTiles: definition.wanderRadiusTiles,
      locomotion: definition.locomotion,
      sleepsAtNight: definition.sleepsAtNight,
      canGraze: definition.canGraze,
      ignoresObstacles: definition.ignoresObstacles,
    }]))).toEqual(WILDLIFE_DEFINITIONS);
    expect(Object.fromEntries([...registry.spawns.values()].filter(({ strategy }) => strategy === 'packs')
      .map(({ target, packCount, packSize, minimumPackSpacing }) => {
      const species = target.slice('creature:'.length);
      return [species, { species, packCount, packSize, minimumPackSpacing }];
    }))).toEqual(Object.fromEntries(WILDLIFE_SPAWN_PLANS.map((plan) => [plan.species, plan])));
    expect(Object.fromEntries([...registry.spaces.values()].map((definition) => [definition.name, compiledSpaceProjection(definition)])))
      .toEqual(Object.fromEntries(SPACES.map((definition) => [definition.name, definition])));
    expect(Object.fromEntries([...registry.skillTrees.values()].flatMap(({ nodes }) => nodes).map((node) => [node.id, node])))
      .toEqual(Object.fromEntries(SKILL_NODE_DEFINITIONS.map((node) => [node.id, node])));
    expect(registry.compiled.effects).toEqual(EFFECT_DEFINITIONS);
    expect(Object.fromEntries([...registry.statistics.values()].map((definition) => [definition.id.slice('statistic:'.length), compiledStatisticProjection(definition)]))).toEqual(PLAYER_STATISTIC_DEFINITIONS);
    expect(Object.fromEntries([...registry.upgrades.values()].map((definition) => {
      const upgradeKind = definition.id.slice('upgrade:'.length);
      return [upgradeKind, compiledUpgradeProjection(definition)];
    }))).toEqual(HOMESTEAD_UPGRADE_DEFINITIONS);
    expect(Object.fromEntries(registry.compiled.crops.map((definition) => [definition.kind, definition])))
      .toEqual(Object.fromEntries(AUTHORED_CROP_DEFINITIONS.map((definition) => [definition.kind, definition])));
    expect(registry.compiled.creatures).toEqual(WILDLIFE_DEFINITIONS);
    expect(Object.fromEntries(registry.compiled.spawns.map((plan) => [plan.species, plan])))
      .toEqual(Object.fromEntries(WILDLIFE_SPAWN_PLANS.map((plan) => [plan.species, plan])));
    expect(Object.fromEntries(registry.compiled.spaces.map((definition) => [definition.name, definition])))
      .toEqual(Object.fromEntries(SPACES.map((definition) => [definition.name, definition])));
    expect(Object.fromEntries(registry.compiled.skillNodes.map((node) => [node.id, node])))
      .toEqual(Object.fromEntries(SKILL_NODE_DEFINITIONS.map((node) => [node.id, node])));
    expect(registry.compiled.effects).toEqual(EFFECT_DEFINITIONS);
    expect(registry.compiled.statistics).toEqual(PLAYER_STATISTIC_DEFINITIONS);
    expect(registry.compiled.upgrades).toEqual(HOMESTEAD_UPGRADE_DEFINITIONS);
  });

  it('groups, but never overwrites, the six W3 support-cap balance scalars', () => {
    const all = bootstrapContentDefinitions();
    expect(all.filter(({ kind }) => kind === 'balance')).toHaveLength(6);
    expect(all.find(({ id }) => id === 'balance_group:admin_support')).toMatchObject({
      kind: 'balance_group', entries: [...Object.values(SUPPORT_CAP_BALANCE_IDS)].sort(),
    });
  });

  it('indexes all nine world kinds and validates their cross references', () => {
    const definitions = bootstrapContentDefinitions();
    const build = buildContentRegistry(definitions.map((definition) => ({ id: definition.id, kind: definition.kind, json: definition })));
    expect(build.report.valid).toBe(true);
    expect([
      build.registry.crops.size, build.registry.creatures.size, build.registry.spawns.size,
      build.registry.spaces.size, build.registry.skillTrees.size, build.registry.effects.size,
      build.registry.statistics.size, build.registry.upgrades.size, build.registry.balanceGroups.size,
    ].every((size) => size > 0)).toBe(true);
    const spawn = build.registry.spawns.values().next().value!;
    const invalid = definitions.map((definition) => definition.id === spawn.id ? { ...spawn, space: 'space:missing' as const } : definition);
    expect(buildContentRegistry(invalid.map((definition) => ({ id: definition.id, kind: definition.kind, json: definition }))).report.errors)
      .toContainEqual(expect.objectContaining({ code: 'unresolved_reference', definitionId: spawn.id, path: 'space' }));
  });
});

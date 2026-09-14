import { describe, expect, it } from 'vitest';
import { AUTHORED_CROP_DEFINITIONS } from '../crops.js';
import skillTreesJson from '../../../assets/content/skill-trees.json' with { type: 'json' };
import creaturesJson from '../../../assets/content/creatures.json' with { type: 'json' };
import { HOMESTEAD_UPGRADE_DEFINITIONS } from '../homestead-upgrades.js';
import { PLAYER_STATISTIC_DEFINITIONS } from '../player-statistics.js';
import { SKILL_NODE_DEFINITIONS, SKILL_TRACKS } from '../skill-trees.js';
import { MARLOW_TENT_SPACE_ID, SPACES } from '../spaces.js';
import { WILDLIFE_DEFINITIONS, WILDLIFE_SPAWN_PLANS } from '../wildlife.js';
import { parseContentDefinition } from './definitions.js';
import { bootstrapContentDefinitions } from './bootstrap-registry.js';
import { buildContentRegistry } from './registry.js';
import { validateContentDefinitions } from './validate.js';
import { runtimeCreaturePresentation, runtimeSpaceDefinition } from './runtime.js';
import {
  compiledCropProjection,
  compiledSpaceProjection,
  parseCreatureDefinition,
  parseSkillTreeDefinition,
  parseSpaceContentDefinition,
  compiledStatisticProjection,
  compiledUpgradeProjection,
  type CreatureContentDefinition,
} from './world-definition.js';

describe('world content definitions', () => {
  it('requires authored combat, panic, and presentation for every creature row', () => {
    expect((creaturesJson as readonly Record<string, unknown>[]).every((definition) => (
      definition.combat !== undefined && definition.panic !== undefined && definition.presentation !== undefined
    ))).toBe(true);
    expect(creaturesJson.filter(({ hayFeeding }) => hayFeeding !== undefined).map(({ species }) => species).sort())
      .toEqual(['camel', 'cow', 'horse', 'sheep']);
    const cow = creaturesJson.find(({ id }) => id === 'creature:cow')!;
    const legacyCow = Object.fromEntries(Object.entries(cow).filter(([key]) => (
      key !== 'combat' && key !== 'panic' && key !== 'hayFeeding'
    )));
    expect(() => parseCreatureDefinition(legacyCow)).toThrow(/\.combat/u);
    expect(() => parseCreatureDefinition({ ...cow, panic: undefined })).toThrow(/\.panic/u);
    expect(() => parseCreatureDefinition({ ...cow, presentation: undefined })).toThrow(/\.presentation/u);
    expect(parseCreatureDefinition({ ...cow, id: 'creature:moon_cow', species: 'moon_cow' }))
      .toMatchObject({ id: 'creature:moon_cow', species: 'moon_cow', combat: cow.combat });
    expect(parseCreatureDefinition(creaturesJson.find(({ id }) => id === 'creature:bee')!)).toMatchObject({
      behavior: { hiveReturn: true },
    });
    expect(parseCreatureDefinition(creaturesJson.find(({ id }) => id === 'creature:chicken')!)).toMatchObject({
      behavior: { trailingPackMember: 'creature:rooster' },
    });
    expect(() => parseCreatureDefinition({ ...cow, behavior: {} })).toThrow(/\.behavior/u);
    expect(() => parseCreatureDefinition({ ...cow, behavior: { hiveReturn: false } })).toThrow(/\.behavior\.hiveReturn/u);
  });

  it('resolves compact presentation through arbitrary definition ids and fails closed for retired definitions', () => {
    const cow = parseCreatureDefinition(creaturesJson.find(({ id }) => id === 'creature:cow')!);
    const renamed = parseCreatureDefinition({
      ...cow,
      id: 'creature:renamed_grazer',
      presentation: { asset: 'moon_grazer', animation: 'frog', target: [14, 23] },
    });
    const active = buildContentRegistry([{ id: renamed.id, kind: renamed.kind, json: renamed }]).registry;
    expect(runtimeCreaturePresentation(active, 'cow')).toMatchObject({
      assetFamily: 'moon_grazer', animationProfile: 'frog',
      targetBounds: { halfWidth: 14, height: 23 },
    });
    const retired = { ...renamed, retired: true };
    const inactive = buildContentRegistry([{ id: retired.id, kind: retired.kind, json: retired }]).registry;
    expect(runtimeCreaturePresentation(inactive, 'cow')).toBeNull();
    expect(runtimeCreaturePresentation(buildContentRegistry([]).registry, 'cow')).toBeNull();
  });

  it('rejects ambiguous stable species and incoherent huntable policy', () => {
    const definitions = bootstrapContentDefinitions();
    const cow = definitions.find((definition): definition is CreatureContentDefinition => (
      definition.kind === 'creature' && definition.id === 'creature:cow'
    ))!;
    const duplicate = { ...cow, id: 'creature:moon_cow' as const };
    expect(validateContentDefinitions([...definitions, duplicate]).errors).toContainEqual(expect.objectContaining({
      definitionId: 'creature:moon_cow', path: 'species', code: 'invalid_world_definition',
    }));
    const incoherentCow = {
      ...Object.fromEntries(Object.entries(cow).filter(([key]) => key !== 'loot')),
      combat: { ...cow.combat, experience: 0 },
    } as CreatureContentDefinition;
    const incoherent = definitions.map((definition) => definition.id === 'creature:cow'
      ? incoherentCow : definition);
    expect(validateContentDefinitions(incoherent).errors).toContainEqual(expect.objectContaining({
      definitionId: 'creature:cow', path: 'loot', code: 'invalid_world_definition',
    }));
  });

  it('validates authored creature behavior references and unique hive ownership', () => {
    const definitions = bootstrapContentDefinitions();
    const bee = definitions.find((definition): definition is CreatureContentDefinition => (
      definition.kind === 'creature' && definition.id === 'creature:bee'
    ))!;
    const chicken = definitions.find((definition): definition is CreatureContentDefinition => (
      definition.kind === 'creature' && definition.id === 'creature:chicken'
    ))!;
    const duplicateHive = { ...bee, id: 'creature:moon_hive' as const, species: 'moon_hive' };
    expect(validateContentDefinitions([...definitions, duplicateHive]).errors).toContainEqual(expect.objectContaining({
      definitionId: 'creature:moon_hive', path: 'behavior.hiveReturn', code: 'invalid_world_definition',
    }));
    const dangling = definitions.map((definition) => definition.id === chicken.id ? {
      ...chicken, behavior: { trailingPackMember: 'creature:missing' as const },
    } : definition);
    expect(validateContentDefinitions(dangling).errors).toContainEqual(expect.objectContaining({
      definitionId: chicken.id, path: 'behavior.trailingPackMember', code: 'unresolved_reference',
    }));
    const selfTrailing = definitions.map((definition) => definition.id === chicken.id ? {
      ...chicken, behavior: { trailingPackMember: chicken.id },
    } : definition);
    expect(validateContentDefinitions(selfTrailing).errors).toContainEqual(expect.objectContaining({
      definitionId: chicken.id, path: 'behavior.trailingPackMember', code: 'invalid_world_definition',
    }));
  });

  it('authors every canonical skill icon explicitly while reading legacy schema-v1 rows compatibly', () => {
    const canonicalTrees = skillTreesJson as readonly {
      readonly nodes: readonly { readonly iconAsset?: unknown }[];
    }[];
    expect(canonicalTrees.flatMap(({ nodes }) => nodes).every((node) => (
      'iconAsset' in node && typeof node.iconAsset === 'string' && node.iconAsset.length > 0
    ))).toBe(true);
    const legacy = {
      id: 'skill_tree:compat', kind: 'skill_tree', schemaVersion: 1,
      track: 'combat', levelCap: 50,
      nodes: [{
        id: 'legacy_root', track: 'combat', name: 'Legacy', description: 'Legacy row',
        position: [0, 0], connects: [], maxRank: 0, pointCost: 0, root: true,
      }],
    };
    expect(parseSkillTreeDefinition(legacy).nodes[0]?.iconAsset).toBe('icon_skill_legacy_root');
    const renamed = {
      ...legacy,
      nodes: [{ ...legacy.nodes[0], id: 'renamed_root', iconAsset: 'icon_skill_legacy_root' }],
    };
    expect(parseSkillTreeDefinition(renamed).nodes[0]?.iconAsset).toBe('icon_skill_legacy_root');
  });

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
      effect: definitions.filter(({ kind }) => kind === 'effect').length,
      skill_tree: SKILL_TRACKS.length,
      space: SPACES.length,
      spawn: WILDLIFE_SPAWN_PLANS.length + nonPackSpawns.length,
      statistic: Object.keys(PLAYER_STATISTIC_DEFINITIONS).length,
      upgrade: Object.keys(HOMESTEAD_UPGRADE_DEFINITIONS).length + 8,
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
      id: definition.id,
      species: definition.species,
      habitat: definition.habitat,
      variants: definition.variants,
      speedFixed: definition.speedFixed,
      wanderRadiusTiles: definition.wanderRadiusTiles,
      locomotion: definition.locomotion,
      sleepsAtNight: definition.sleepsAtNight,
      canGraze: definition.canGraze,
      ignoresObstacles: definition.ignoresObstacles,
      combat: definition.combat,
      panic: definition.panic,
      ...(definition.behavior === undefined ? {} : { behavior: definition.behavior }),
      ...(definition.hayFeeding === undefined ? {} : { hayFeeding: definition.hayFeeding }),
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
    expect(Object.keys(registry.compiled.effects).sort()).toEqual(
      [...registry.effects.values()].filter(({ retired }) => retired !== true)
        .map(({ id }) => id.slice('effect:'.length)).sort(),
    );
    expect(Object.fromEntries([...registry.statistics.values()].map((definition) => [definition.id.slice('statistic:'.length), compiledStatisticProjection(definition)]))).toEqual(PLAYER_STATISTIC_DEFINITIONS);
    expect(Object.fromEntries([...registry.upgrades.values()].filter((definition)=>'mechanic' in definition).map((definition) => {
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
    expect(Object.keys(registry.compiled.effects).sort()).toEqual(
      [...registry.effects.values()].filter(({ retired }) => retired !== true)
        .map(({ id }) => id.slice('effect:'.length)).sort(),
    );
    expect(registry.compiled.statistics).toEqual(PLAYER_STATISTIC_DEFINITIONS);
    expect(registry.compiled.upgrades).toEqual(HOMESTEAD_UPGRADE_DEFINITIONS);
  });

  it('keeps retired effects and statistics inspectable but outside the active compiled projection', () => {
    const definitions = bootstrapContentDefinitions();
    const effect = definitions.find((definition) => definition.kind === 'effect')!;
    const statistic = definitions.find((definition) => definition.kind === 'statistic')!;
    const retiredEffect = {
      ...effect, id: 'effect:retired_projection' as const, retired: true,
      replacement: effect.id,
    };
    const retiredStatistic = {
      ...statistic, id: 'statistic:retired_projection' as const, retired: true,
      replacement: statistic.id,
    };
    const { registry, report } = buildContentRegistry([
      ...definitions, retiredEffect, retiredStatistic,
    ].map((definition) => ({ id: definition.id, kind: definition.kind, json: definition })));
    expect(report.errors).toEqual([]);
    expect(registry.effects.get(retiredEffect.id)).toEqual(retiredEffect);
    expect(registry.statistics.get(retiredStatistic.id)).toEqual(retiredStatistic);
    expect(registry.compiled.effects.retired_projection).toBeUndefined();
    expect(registry.compiled.statistics.retired_projection).toBeUndefined();
  });

  it('groups, but never overwrites, the six W3 support-cap balance scalars', () => {
    const all = bootstrapContentDefinitions();
    const balances = all.filter((definition) => definition.kind === 'balance'
      && 'supportCap' in definition && definition.supportCap !== undefined);
    expect(balances).toHaveLength(6);
    expect(all.find(({ id }) => id === 'balance_group:admin_support')).toMatchObject({
      kind: 'balance_group', entries: balances.map(({ id }) => id).sort(),
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

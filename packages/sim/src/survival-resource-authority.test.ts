import { expect, it } from 'vitest';
import { bootstrapContentRegistry } from './content/bootstrap-registry.js';
import type { ResourceContentDefinition } from './content/resource-definition.js';
import {
  generateSurvivalDecorations,
  generateSurvivalResources,
  isBreakableRockKind,
  isChoppableTreeKind,
  isFruitTreeKind,
  isGatherableResourceKind,
  isMineableOreKind,
  survivalResourceCatalog,
  survivalDecorationResource,
  SURVIVAL_WORLD_SEED,
  type SurvivalResourceRegistry,
} from './survival-world.js';

const bootstrap = bootstrapContentRegistry();

function resourceDigest(resources: ReturnType<typeof generateSurvivalResources>): string {
  let hash = 2_166_136_261;
  for (const resource of resources) {
    const row = [
      resource.id, resource.kind, resource.tileX, resource.tileY, resource.nodeClass ?? '',
      resource.richness ?? '', resource.spawnSiteId ?? '', resource.activationOrdinal ?? '',
    ].join('|');
    for (let index = 0; index < row.length; index += 1) {
      hash = Math.imul(hash ^ row.charCodeAt(index), 16_777_619) >>> 0;
    }
  }
  return hash.toString(16).padStart(8, '0');
}

function renamedResourceRegistry(): {
  readonly registry: SurvivalResourceRegistry;
  readonly renamedByRuntimeKind: ReadonlyMap<string, string>;
} {
  const renamedByRuntimeKind = new Map<string, string>();
  const resources = new Map<string, ResourceContentDefinition>();
  let ordinal = 0;
  for (const definition of bootstrap.resources.values()) {
    const renamedRuntimeKind = definition.tags.some((tag) => tag.startsWith('generator.'))
      ? `renamed_${definition.runtimeKind}` : definition.runtimeKind;
    renamedByRuntimeKind.set(definition.runtimeKind, renamedRuntimeKind);
    const renamed = {
      ...definition,
      id: `resource:renamed_${ordinal++}` as const,
      runtimeKind: renamedRuntimeKind,
    } satisfies ResourceContentDefinition;
    resources.set(renamed.id, renamed);
  }
  return { registry: { resources, spaces: bootstrap.spaces }, renamedByRuntimeKind };
}

it('keeps every stable generated id and coordinate while authored runtime kinds and definition ids change', () => {
  const original = generateSurvivalResources(SURVIVAL_WORLD_SEED, bootstrap);
  expect(original).toHaveLength(5_981);
  expect(resourceDigest(original)).toBe('879aa1ed');
  const renamed = renamedResourceRegistry();
  const regenerated = generateSurvivalResources(SURVIVAL_WORLD_SEED, renamed.registry);
  expect(regenerated).toHaveLength(original.length);
  expect(regenerated.map(({ id, tileX, tileY, nodeClass, richness, spawnSiteId, activationOrdinal }) => ({
    id, tileX, tileY, nodeClass, richness, spawnSiteId, activationOrdinal,
  }))).toEqual(original.map(({ id, tileX, tileY, nodeClass, richness, spawnSiteId, activationOrdinal }) => ({
    id, tileX, tileY, nodeClass, richness, spawnSiteId, activationOrdinal,
  })));
  expect(regenerated.map(({ kind }) => kind)).toEqual(original.map(({ kind }) => (
    renamed.renamedByRuntimeKind.get(kind) ?? kind
  )));

  const catalog = survivalResourceCatalog(renamed.registry);
  expect(catalog.treeKinds.every((kind) => isChoppableTreeKind(kind, renamed.registry))).toBe(true);
  expect(catalog.fruitTreeKinds.every((kind) => isFruitTreeKind(kind, renamed.registry))).toBe(true);
  expect(catalog.oreKinds.every((kind) => isMineableOreKind(kind, renamed.registry))).toBe(true);
  expect(catalog.rockKinds.every((kind) => isBreakableRockKind(kind, renamed.registry))).toBe(true);
  expect(catalog.gatherableKinds.every((kind) => isGatherableResourceKind(kind, renamed.registry))).toBe(true);
});

it('fails closed instead of restoring a retired procedural definition by its old kind', () => {
  const tree = [...bootstrap.resources.values()].find((definition) => (
    definition.tags.includes('generator.island.tree.0')
  ))!;
  const resources = new Map(bootstrap.resources);
  resources.set(tree.id, { ...tree, retired: true });
  const registry = { resources, spaces: bootstrap.spaces };
  expect(isChoppableTreeKind(tree.runtimeKind, registry)).toBe(false);
  expect(() => generateSurvivalResources(SURVIVAL_WORLD_SEED, registry))
    .toThrow('survival_resource_generator_catalog_invalid');
});

it('derives interactive decoration resources from authored mappings without changing identity or loot', () => {
  const decoration = generateSurvivalDecorations(SURVIVAL_WORLD_SEED, bootstrap)
    .find((candidate) => survivalDecorationResource(candidate, bootstrap) !== null);
  expect(decoration).toBeDefined();
  if (!decoration) return;

  const resource = survivalDecorationResource(decoration, bootstrap);
  expect(resource).toEqual(expect.objectContaining({
    id: 1_000_000_000 + decoration.id,
    tileX: decoration.tileX,
    tileY: decoration.tileY,
  }));
  const definition = [...bootstrap.resources.values()]
    .find((candidate) => candidate.runtimeKind === resource?.kind);
  expect(definition?.loot).toMatch(/^loot:/u);
});

it('supports renamed decoration keys and resource definitions and fails neutral for stale mappings', () => {
  const original = [...bootstrap.resources.values()].find((definition) => (
    definition.tags.includes('generator.decoration.poi_fallen_log')
  ))!;
  const renamedTag = 'generator.decoration.scattered_canvas_branch';
  const renamed = {
    ...original,
    id: 'resource:scattered_canvas_branch',
    runtimeKind: 'scattered_canvas_branch_resource',
    tags: original.tags.map((tag) => (
      tag === 'generator.decoration.poi_fallen_log' ? renamedTag : tag
    )),
  } satisfies ResourceContentDefinition;
  const resources = new Map(bootstrap.resources);
  resources.delete(original.id);
  resources.set(renamed.id, renamed);
  const registry = { resources };
  const generated = generateSurvivalDecorations(SURVIVAL_WORLD_SEED, bootstrap)
    .find((candidate) => candidate.kind === 'poi_fallen_log')!;
  const decoration = { ...generated, kind: 'scattered_canvas_branch' };

  const resource = survivalDecorationResource(decoration, registry);
  expect(resource).toEqual({
    id: 1_000_000_000 + decoration.id,
    kind: renamed.runtimeKind,
    tileX: decoration.tileX,
    tileY: decoration.tileY,
  });
  expect(renamed.loot).toBe(original.loot);
  expect(survivalDecorationResource(generated, registry)).toBeNull();

  const retiredResources = new Map(resources);
  retiredResources.set(renamed.id, { ...renamed, retired: true });
  expect(survivalDecorationResource(decoration, { resources: retiredResources })).toBeNull();

  const missingResources = new Map(resources);
  missingResources.set(renamed.id, {
    ...renamed,
    tags: renamed.tags.filter((tag) => tag !== renamedTag),
  });
  expect(survivalDecorationResource(decoration, { resources: missingResources })).toBeNull();
});

it('fails neutral when active resources ambiguously claim one decoration key', () => {
  const original = [...bootstrap.resources.values()].find((definition) => (
    definition.tags.includes('generator.decoration.poi_fallen_log')
  ))!;
  const duplicate = {
    ...original,
    id: 'resource:duplicate_fallen_branch',
    runtimeKind: 'duplicate_fallen_branch',
  } satisfies ResourceContentDefinition;
  const resources = new Map(bootstrap.resources);
  resources.set(duplicate.id, duplicate);
  const decoration = generateSurvivalDecorations(SURVIVAL_WORLD_SEED, bootstrap)
    .find((candidate) => candidate.kind === 'poi_fallen_log')!;

  expect(survivalDecorationResource(decoration, { resources })).toBeNull();
});

/** Resource-kind catalogue derived from content tags, its bootstrap
 * compatibility constants and the per-kind resource predicates. The catalogue
 * caches are module state; there is exactly one instance of them.
 *
 * Generator-free leaf (static-world S6a): this module must not import the
 * island generator (`survival-world.ts`), `procedural-terrain`, the map
 * compiler, `map-document-v3` or the sim barrel, so chunk-native clients can
 * use it without shipping the generator. `survival-world.ts` re-exports every
 * public name here, so existing imports keep working and resolve to this one
 * module instance. `packages/engine/src/generator-free-modules.test.ts` enforces the boundary. */
import { BOOTSTRAP_RESOURCE_REGISTRY } from './content/bootstrap-resources.js';
import type { ResourceContentDefinition } from './content/resource-definition.js';
import type { SpaceContentDefinition } from './content/world-definition.js';

export type SurvivalResourceRegistry = Readonly<{
  resources: ReadonlyMap<string, ResourceContentDefinition>;
  spaces?: ReadonlyMap<string, SpaceContentDefinition>;
}>;

interface SurvivalResourceCatalog {
  readonly treeKinds: readonly string[];
  readonly fruitTreeKinds: readonly string[];
  readonly oreKinds: readonly string[];
  readonly regrowingPlantKinds: readonly string[];
  readonly rockKinds: readonly string[];
  readonly gatherableKinds: readonly string[];
  readonly cactusKind: string;
  readonly looseStoneKind: string;
  readonly fishPoolKind: string;
  readonly decorationResources: ReadonlyMap<string, string>;
}

const resourceCatalogCache = new WeakMap<object, SurvivalResourceCatalog>();
const activeResourceCache = new WeakMap<object, readonly ResourceContentDefinition[]>();
const resourceByRuntimeKindCache = new WeakMap<object, ReadonlyMap<string, ResourceContentDefinition>>();

export function activeResources(registry: SurvivalResourceRegistry): readonly ResourceContentDefinition[] {
  const cached = activeResourceCache.get(registry);
  if (cached !== undefined) return cached;
  const definitions = Object.freeze(
    [...registry.resources.values()].filter((definition) => definition.retired !== true),
  );
  activeResourceCache.set(registry, definitions);
  return definitions;
}

function orderedGeneratorKinds(
  definitions: readonly ResourceContentDefinition[],
  prefix: string,
  expectedCount: number,
): readonly string[] {
  const entries = definitions.flatMap((definition) => definition.tags.flatMap((tag) => {
    if (!tag.startsWith(prefix)) return [];
    const ordinal = Number(tag.slice(prefix.length));
    return Number.isSafeInteger(ordinal) && ordinal >= 0
      ? [{ ordinal, runtimeKind: definition.runtimeKind }]
      : [];
  })).sort((left, right) => left.ordinal - right.ordinal);
  if (entries.length !== expectedCount
    || entries.some((entry, index) => entry.ordinal !== index)) {
    throw new Error(`survival_resource_generator_catalog_invalid:${prefix}`);
  }
  return Object.freeze(entries.map(({ runtimeKind }) => runtimeKind));
}

function uniqueGeneratorKind(
  definitions: readonly ResourceContentDefinition[],
  tag: string,
): string {
  const matches = definitions.filter((definition) => definition.tags.includes(tag));
  if (matches.length !== 1) throw new Error(`survival_resource_generator_catalog_invalid:${tag}`);
  return matches[0]!.runtimeKind;
}

export function survivalResourceCatalog(registry: SurvivalResourceRegistry): SurvivalResourceCatalog {
  const cached = resourceCatalogCache.get(registry);
  if (cached !== undefined) return cached;
  const definitions = activeResources(registry);
  const treeKinds = orderedGeneratorKinds(definitions, 'generator.island.tree.', 9);
  const oreKinds = orderedGeneratorKinds(definitions, 'generator.island.ore.', 8);
  const decorationResources = new Map<string, string>();
  const ambiguousDecorationResources = new Set<string>();
  for (const definition of definitions) for (const tag of definition.tags) {
    const prefix = 'generator.decoration.';
    if (!tag.startsWith(prefix)) continue;
    const decorationKind = tag.slice(prefix.length);
    if (ambiguousDecorationResources.has(decorationKind)) continue;
    if (decorationResources.has(decorationKind)) {
      decorationResources.delete(decorationKind);
      ambiguousDecorationResources.add(decorationKind);
    } else decorationResources.set(decorationKind, definition.runtimeKind);
  }
  const catalog = Object.freeze({
    treeKinds,
    fruitTreeKinds: Object.freeze(treeKinds.filter((kind) => definitions.some((definition) => (
      definition.runtimeKind === kind && definition.tags.includes('resource.fruit_tree')
    )))),
    oreKinds,
    regrowingPlantKinds: Object.freeze(definitions.filter((definition) => (
      definition.regrowth?.enabled === true && definition.statistics.depletion !== 'tree'
    )).map(({ runtimeKind }) => runtimeKind)),
    rockKinds: Object.freeze(definitions.filter((definition) => (
      definition.statistics.depletion === 'rock' && definition.respawn?.profile === 'surface_ore'
    )).map(({ runtimeKind }) => runtimeKind)),
    gatherableKinds: Object.freeze(definitions.filter((definition) => (
      definition.interaction.mode === 'gather'
    )).map(({ runtimeKind }) => runtimeKind)),
    cactusKind: uniqueGeneratorKind(definitions, 'generator.island.cactus'),
    looseStoneKind: uniqueGeneratorKind(definitions, 'generator.island.loose_stone'),
    fishPoolKind: uniqueGeneratorKind(definitions, 'generator.island.fish_pool'),
    decorationResources,
  });
  resourceCatalogCache.set(registry, catalog);
  return catalog;
}

export function resourceDefinition(
  registry: SurvivalResourceRegistry,
  runtimeKind: string,
): ResourceContentDefinition | null {
  let definitions = resourceByRuntimeKindCache.get(registry);
  if (definitions === undefined) {
    definitions = new Map(activeResources(registry).map((definition) => [definition.runtimeKind, definition]));
    resourceByRuntimeKindCache.set(registry, definitions);
  }
  return definitions.get(runtimeKind) ?? null;
}

/** Bootstrap-derived compatibility exports for engine/tools callers. Live
 * runtime generation accepts the active content registry. */
const bootstrapResourceCatalog = survivalResourceCatalog(BOOTSTRAP_RESOURCE_REGISTRY);
export const SURVIVAL_TREE_KINDS = bootstrapResourceCatalog.treeKinds;
export type SurvivalTreeKind = string;
export const SURVIVAL_REGROWING_PLANT_KINDS = bootstrapResourceCatalog.regrowingPlantKinds;
export type SurvivalRegrowingPlantKind = string;
export const SURVIVAL_FRUIT_TREE_KINDS = bootstrapResourceCatalog.fruitTreeKinds;
export type SurvivalFruitTreeKind = string;
export const SURVIVAL_ORE_KINDS = bootstrapResourceCatalog.oreKinds;
export type SurvivalOreKind = string;
export const SURVIVAL_ROCK_KINDS = bootstrapResourceCatalog.rockKinds;
export type SurvivalRockKind = string;
export const SURVIVAL_GATHERABLE_RESOURCE_KINDS = bootstrapResourceCatalog.gatherableKinds;
export type SurvivalGatherableResourceKind = string;
export type SurvivalResourceKind = string;

export function isChoppableTreeKind(
  kind: string,
  registry: SurvivalResourceRegistry = BOOTSTRAP_RESOURCE_REGISTRY,
): boolean {
  const definition = resourceDefinition(registry, kind);
  return definition?.interaction.mode === 'harvest' && definition.statistics.depletion === 'tree';
}

export function isRegrowingPlantKind(
  kind: string,
  registry: SurvivalResourceRegistry = BOOTSTRAP_RESOURCE_REGISTRY,
): boolean {
  return resourceDefinition(registry, kind)?.regrowth?.enabled === true;
}

export function isAxeHarvestableResourceKind(
  kind: string,
  registry: SurvivalResourceRegistry = BOOTSTRAP_RESOURCE_REGISTRY,
): boolean {
  return resourceDefinition(registry, kind)?.interaction.tool?.specialization === 'woodcutting';
}

export function isFruitTreeKind(
  kind: string,
  registry: SurvivalResourceRegistry = BOOTSTRAP_RESOURCE_REGISTRY,
): kind is SurvivalFruitTreeKind {
  return resourceDefinition(registry, kind)?.tags.includes('resource.fruit_tree') === true;
}

export type MineableOreKind = SurvivalOreKind;
export function isMineableOreKind(
  kind: string,
  registry: SurvivalResourceRegistry = BOOTSTRAP_RESOURCE_REGISTRY,
): kind is MineableOreKind {
  const definition = resourceDefinition(registry, kind);
  return definition?.statistics.depletion === 'ore'
    && definition.respawn?.profile === 'surface_ore';
}

export function isBreakableRockKind(
  kind: string,
  registry: SurvivalResourceRegistry = BOOTSTRAP_RESOURCE_REGISTRY,
): kind is SurvivalRockKind {
  const definition = resourceDefinition(registry, kind);
  return definition?.statistics.depletion === 'rock'
    && definition.respawn?.profile === 'surface_ore';
}

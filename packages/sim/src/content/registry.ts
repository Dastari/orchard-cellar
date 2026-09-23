import { naturalObjectProjections } from './natural-object.js';
import { contentDefinitionsHash, contentDefinitionRowIdentityHash } from './payload-hash.js';
export { contentDefinitionsHash, contentDefinitionRowIdentityHash, contentDefinitionRowsHash } from './payload-hash.js';
import { compiledProjection, type CompiledContentProjection } from './compiled-projection.js';
export type { CompiledContentProjection, CompiledItemDefinition, CompiledRecipeDefinition, CompiledEffectDefinition } from './compiled-projection.js';
import {
  ContentParseError,
  SUPPORTED_CONTENT_KINDS,
  definitionSlug,
  parseContentDefinition,
  type ContentDefinitionRow,
  type ItemContentDefinition,
  type ProcessContentDefinition,
  type RecipeContentDefinition,
  type ShopContentDefinition,
  type SupportedContentDefinition,
  type TilesetContentDefinition,
} from './definitions.js';
import type { ObjectContentDefinition } from './object-definition.js';
import type { FrameContentDefinition } from './frame-definition.js';
import type { LootContentDefinition } from './loot-definition.js';
import type { ResourceContentDefinition } from './resource-definition.js';
import type { LoadoutContentDefinition } from './loadout-definition.js';
import type { EncounterContentDefinition, EnemyContentDefinition } from './outdoor-encounter-definition.js';
import {
  type DialogueContentDefinition,
  type NpcContentDefinition,
  type QuestContentDefinition,
} from './npc-definition.js';
import type { BalanceContentDefinition } from './balance-definition.js';
import {
  type BalanceGroupContentDefinition,
  type CreatureContentDefinition,
  type CropContentDefinition,
  type EffectContentDefinition,
  type SkillTreeContentDefinition,
  type SpaceContentDefinition,
  type SpawnContentDefinition,
  type StatisticContentDefinition,
  type UpgradeContentDefinition,
} from './world-definition.js';
import {
  validateContentDefinitions,
  type ContentValidationIssue,
  type ContentValidationReport,
} from './validate.js';

class ImmutableMap<K, V> implements ReadonlyMap<K, V> {
  readonly #source: Map<K, V>;

  constructor(entries: Iterable<readonly [K, V]>) {
    this.#source = new Map(entries);
    Object.freeze(this);
  }

  get size(): number { return this.#source.size; }
  get(key: K): V | undefined { return this.#source.get(key); }
  has(key: K): boolean { return this.#source.has(key); }
  entries(): MapIterator<[K, V]> { return this.#source.entries(); }
  keys(): MapIterator<K> { return this.#source.keys(); }
  values(): MapIterator<V> { return this.#source.values(); }
  [Symbol.iterator](): MapIterator<[K, V]> { return this.#source[Symbol.iterator](); }
  forEach(callbackfn: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: unknown): void {
    for (const [key, value] of this.#source) callbackfn.call(thisArg, value, key, this);
  }
}

export interface ContentRegistry {
  readonly definitions: ReadonlyMap<string, SupportedContentDefinition>;
  readonly items: ReadonlyMap<string, ItemContentDefinition>;
  readonly recipes: ReadonlyMap<string, RecipeContentDefinition>;
  readonly processes: ReadonlyMap<string, ProcessContentDefinition>;
  readonly shops: ReadonlyMap<string, ShopContentDefinition>;
  readonly tilesets: ReadonlyMap<string, TilesetContentDefinition>;
  readonly objects: ReadonlyMap<string, ObjectContentDefinition>;
  readonly frames: ReadonlyMap<string, FrameContentDefinition>;
  readonly loots: ReadonlyMap<string, LootContentDefinition>;
  readonly npcs: ReadonlyMap<string, NpcContentDefinition>;
  readonly dialogues: ReadonlyMap<string, DialogueContentDefinition>;
  readonly quests: ReadonlyMap<string, QuestContentDefinition>;
  readonly balances: ReadonlyMap<string, BalanceContentDefinition>;
  readonly crops: ReadonlyMap<string, CropContentDefinition>;
  readonly creatures: ReadonlyMap<string, CreatureContentDefinition>;
  readonly spawns: ReadonlyMap<string, SpawnContentDefinition>;
  readonly spaces: ReadonlyMap<string, SpaceContentDefinition>;
  readonly skillTrees: ReadonlyMap<string, SkillTreeContentDefinition>;
  readonly effects: ReadonlyMap<string, EffectContentDefinition>;
  readonly statistics: ReadonlyMap<string, StatisticContentDefinition>;
  readonly upgrades: ReadonlyMap<string, UpgradeContentDefinition>;
  readonly balanceGroups: ReadonlyMap<string, BalanceGroupContentDefinition>;
  readonly resources: ReadonlyMap<string, ResourceContentDefinition>;
  readonly loadouts: ReadonlyMap<string, LoadoutContentDefinition>;
  readonly enemies: ReadonlyMap<string, EnemyContentDefinition>;
  readonly encounters: ReadonlyMap<string, EncounterContentDefinition>;
  readonly contentHash: string;
  /** Temporary Phase-0 parity view. Runtime consumers can migrate one table at
   * a time without maintaining a second authored source. */
  readonly compiled: CompiledContentProjection;
}

export interface BuildContentRegistryResult {
  readonly registry: ContentRegistry;
  readonly report: ContentValidationReport;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  if (!Object.isFrozen(value)) Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}


function invalidBuildReport(
  parsed: readonly SupportedContentDefinition[],
  parsingErrors: readonly ContentValidationIssue[],
  allowLegacyStageA:boolean,
): ContentValidationReport {
  const validation = validateContentDefinitions(parsed,{allowLegacyStageA});
  const errors = [...parsingErrors, ...validation.errors];
  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors),
    warnings: validation.warnings,
  });
}

export function buildContentRegistry(rows: readonly ContentDefinitionRow[]): BuildContentRegistryResult {
  const allowLegacyStageA=contentDefinitionRowIdentityHash(rows)==='0c7aa788';
  const parsed: SupportedContentDefinition[] = [];
  const parsingErrors: ContentValidationIssue[] = [];
  for (const row of rows) {
    if (!(SUPPORTED_CONTENT_KINDS as readonly string[]).includes(row.kind)) {
      parsingErrors.push({
        severity: 'error',
        code: 'unsupported_definition_kind',
        definitionId: row.id,
        message: `unsupported definition kind ${row.kind}`,
      });
      continue;
    }
    try {
      const definition = deepFreeze(parseContentDefinition(row.kind, row.json));
      const expectedSlug = definitionSlug(definition.id);
      if (definition.id !== row.id || (row.slug !== undefined && row.slug !== expectedSlug)) {
        parsingErrors.push({
          severity: 'error',
          code: 'kind_slug_mismatch',
          definitionId: row.id,
          message: `row identity does not match payload ${definition.id}`,
        });
      }
      parsed.push(definition);
    } catch (error) {
      parsingErrors.push({
        severity: 'error',
        code: error instanceof ContentParseError ? 'parse_error' : 'unsupported_definition_kind',
        definitionId: row.id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const sorted = [...parsed].sort((left, right) => left.id.localeCompare(right.id));
  const items = sorted.filter((definition): definition is ItemContentDefinition => definition.kind === 'item');
  const recipes = sorted.filter((definition): definition is RecipeContentDefinition => definition.kind === 'recipe');
  const processes = sorted.filter((definition): definition is ProcessContentDefinition => definition.kind === 'process');
  const shops = sorted.filter((definition): definition is ShopContentDefinition => definition.kind === 'shop');
  const tilesets = sorted.filter((definition): definition is TilesetContentDefinition => definition.kind === 'tileset');
  const objects = sorted.filter((definition): definition is ObjectContentDefinition => definition.kind === 'object');
  const frames = sorted.filter((definition): definition is FrameContentDefinition => definition.kind === 'frame');
  const loots = sorted.filter((definition): definition is LootContentDefinition => definition.kind === 'loot');
  const npcs = sorted.filter((definition): definition is NpcContentDefinition => definition.kind === 'npc');
  const dialogues = sorted.filter((definition): definition is DialogueContentDefinition => definition.kind === 'dialogue');
  const quests = sorted.filter((definition): definition is QuestContentDefinition => definition.kind === 'quest');
  const balances = sorted.filter((definition): definition is BalanceContentDefinition => definition.kind === 'balance');
  const crops = sorted.filter((definition): definition is CropContentDefinition => definition.kind === 'crop');
  const creatures = sorted.filter((definition): definition is CreatureContentDefinition => definition.kind === 'creature');
  const spawns = sorted.filter((definition): definition is SpawnContentDefinition => definition.kind === 'spawn');
  const spaces = sorted.filter((definition): definition is SpaceContentDefinition => definition.kind === 'space');
  const skillTrees = sorted.filter((definition): definition is SkillTreeContentDefinition => definition.kind === 'skill_tree');
  const effects = sorted.filter((definition): definition is EffectContentDefinition => definition.kind === 'effect');
  const statistics = sorted.filter((definition): definition is StatisticContentDefinition => definition.kind === 'statistic');
  const upgrades = sorted.filter((definition): definition is UpgradeContentDefinition => definition.kind === 'upgrade');
  const balanceGroups = sorted.filter((definition): definition is BalanceGroupContentDefinition => definition.kind === 'balance_group');
  const resources = sorted.filter((definition): definition is ResourceContentDefinition => definition.kind === 'resource');
  const loadouts = sorted.filter((definition): definition is LoadoutContentDefinition => definition.kind === 'loadout');
  const enemies = sorted.filter((definition): definition is EnemyContentDefinition => definition.kind === 'enemy');
  const encounters = sorted.filter((definition): definition is EncounterContentDefinition => definition.kind === 'encounter');
  const registry: ContentRegistry = Object.freeze({
    definitions: new ImmutableMap(sorted.map((definition) => [definition.id, definition] as const)),
    items: new ImmutableMap(items.map((definition) => [definition.id, definition] as const)),
    recipes: new ImmutableMap(recipes.map((definition) => [definition.id, definition] as const)),
    processes: new ImmutableMap(processes.map((definition) => [definition.id, definition] as const)),
    shops: new ImmutableMap(shops.map((definition) => [definition.id, definition] as const)),
    tilesets: new ImmutableMap(tilesets.map((definition) => [definition.id, definition] as const)),
    objects: new ImmutableMap(naturalObjectProjections(resources, crops, objects).map((definition) => [definition.id, deepFreeze(definition)] as const)),
    frames: new ImmutableMap(frames.map((definition) => [definition.id, definition] as const)),
    loots: new ImmutableMap(loots.map((definition) => [definition.id, definition] as const)),
    npcs: new ImmutableMap(npcs.map((definition) => [definition.id, definition] as const)),
    dialogues: new ImmutableMap(dialogues.map((definition) => [definition.id, definition] as const)),
    quests: new ImmutableMap(quests.map((definition) => [definition.id, definition] as const)),
    balances: new ImmutableMap(balances.map((definition) => [definition.id, definition] as const)),
    crops: new ImmutableMap(crops.map((definition) => [definition.id, definition] as const)),
    creatures: new ImmutableMap(creatures.map((definition) => [definition.id, definition] as const)),
    spawns: new ImmutableMap(spawns.map((definition) => [definition.id, definition] as const)),
    spaces: new ImmutableMap(spaces.map((definition) => [definition.id, definition] as const)),
    skillTrees: new ImmutableMap(skillTrees.map((definition) => [definition.id, definition] as const)),
    effects: new ImmutableMap(effects.map((definition) => [definition.id, definition] as const)),
    statistics: new ImmutableMap(statistics.map((definition) => [definition.id, definition] as const)),
    upgrades: new ImmutableMap(upgrades.map((definition) => [definition.id, definition] as const)),
    balanceGroups: new ImmutableMap(balanceGroups.map((definition) => [definition.id, definition] as const)),
    resources: new ImmutableMap(resources.map((definition) => [definition.id, definition] as const)),
    loadouts: new ImmutableMap(loadouts.map((definition) => [definition.id, definition] as const)),
    enemies: new ImmutableMap(enemies.map((definition) => [definition.id, definition] as const)),
    encounters: new ImmutableMap(encounters.map((definition) => [definition.id, definition] as const)),
    contentHash: contentDefinitionsHash(sorted),
    compiled: compiledProjection(items, recipes, processes, shops, crops, creatures, spawns, spaces,
      skillTrees, effects, statistics, upgrades),
  });
  return Object.freeze({ registry, report: invalidBuildReport(sorted, parsingErrors,allowLegacyStageA) });
}

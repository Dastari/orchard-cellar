import {
  SUPPORTED_CONTENT_KINDS,
  bootstrapContentDefinitions,
  buildContentRegistry,
  contentDefinitionsHash,
  definitionSlug,
  parseContentDefinition,
  type ContentValidationReport,
  type SupportedContentDefinition,
  type SupportedContentKind,
} from '@orchard/sim';
import type {
  ContentRevisionRecord,
  ItemsContentHeadSnapshot,
  ItemsPublishAdapter,
  PublishContentChangeSetRequest,
} from '../items/contracts.js';
import { applyDefinitionChangeSet, diffContentDefinitions } from '../items/diff.js';
import type { WorldPlaytestAdapter, WorldPlaytestRequest } from '../../admin/world-playtest-api.js';

export type { WorldPlaytestAdapter, WorldPlaytestRequest } from '../../admin/world-playtest-api.js';

export const WORLD_TABLE_KINDS = Object.freeze([
  'crop', 'creature', 'spawn', 'space', 'skill_tree', 'effect', 'statistic', 'upgrade',
  'balance_group', 'resource',
] as const);
export type WorldTableKind = typeof WORLD_TABLE_KINDS[number];
export type WorldAuthoringAccess = 'anonymous' | 'read_only' | 'write';

export interface WorldTableBrowserEntry {
  readonly id: string;
  readonly kind: SupportedContentKind;
  readonly label: string;
  readonly retired: boolean;
  readonly referencedBy: number;
}

export interface WorldPackManifest {
  readonly schemaVersion: 1;
  readonly engineVersion: number;
  readonly contentHash: string;
  readonly definitionCount: number;
  readonly kindCounts: Readonly<Record<string, number>>;
}

export interface WorldPackManifestDiff {
  readonly matches: boolean;
  readonly expectedHash: string;
  readonly actualHash: string;
  readonly definitionCountDelta: number;
  readonly changedKinds: readonly string[];
}

export interface PackImportBatch {
  readonly index: number;
  readonly total: number;
  readonly definitions: readonly SupportedContentDefinition[];
}

export interface WorldAuthoringOptions {
  readonly access: WorldAuthoringAccess;
  readonly head?: ItemsContentHeadSnapshot;
  readonly history?: readonly ContentRevisionRecord[];
  readonly createPublishAdapter?: () => ItemsPublishAdapter;
  readonly createPlaytestAdapter?: () => WorldPlaytestAdapter;
}

export interface WorldAuthoringSnapshot {
  readonly definitions: readonly SupportedContentDefinition[];
  readonly validation: ContentValidationReport;
  readonly diffs: ReturnType<typeof diffContentDefinitions>;
  readonly baseRevision: bigint;
  readonly headRevision: bigint;
  readonly contentHash: string;
  readonly dirty: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly canPublish: boolean;
  readonly conflict: boolean;
  readonly engineGate: 'compatible' | 'requires_update';
  readonly playtestAvailable: boolean;
}

const ENGINE_VERSION = 1;
const MUTATION_ID = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,95}$/u;
const WORLD_KIND_SET = new Set<string>(WORLD_TABLE_KINDS);

function rows(definitions: readonly SupportedContentDefinition[]) {
  return definitions.map((definition) => ({ id: definition.id, kind: definition.kind, json: definition }));
}

function canonical(definitions: readonly SupportedContentDefinition[]) {
  const built = buildContentRegistry(rows(definitions));
  return Object.freeze({
    definitions: Object.freeze([...built.registry.definitions.values()]),
    validation: built.report,
    contentHash: built.registry.contentHash,
  });
}

function defaultHead(): ItemsContentHeadSnapshot {
  const state = canonical(bootstrapContentDefinitions());
  return Object.freeze({ packId: 'live', revision: 0n, engineVersion: ENGINE_VERSION,
    contentHash: state.contentHash, definitions: state.definitions });
}

function parseDefinition(value: unknown): SupportedContentDefinition {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('content_definition_object_required');
  const kind = (value as { readonly kind?: unknown }).kind;
  if (typeof kind !== 'string' || !(SUPPORTED_CONTENT_KINDS as readonly string[]).includes(kind)) {
    throw new Error('unsupported_content_definition_kind');
  }
  return parseContentDefinition(kind, value);
}

function label(definition: SupportedContentDefinition): string {
  if ('displayName' in definition && typeof definition.displayName === 'string') return definition.displayName;
  if ('name' in definition && typeof definition.name === 'string') return definition.name;
  if ('title' in definition && typeof definition.title === 'string') return definition.title;
  return definitionSlug(definition.id) ?? definition.id;
}

function references(value: unknown): readonly string[] {
  if (typeof value === 'string' && /^[a-z_]+:[a-z0-9_]+$/u.test(value)) return [value];
  if (Array.isArray(value)) return value.flatMap(references);
  if (typeof value !== 'object' || value === null) return [];
  return Object.values(value as Record<string, unknown>).flatMap(references);
}

export function parseWorldPack(value: string): readonly SupportedContentDefinition[] {
  const decoded: unknown = JSON.parse(value);
  const source = Array.isArray(decoded) ? decoded
    : typeof decoded === 'object' && decoded !== null && Array.isArray((decoded as { definitions?: unknown }).definitions)
      ? (decoded as { definitions: readonly unknown[] }).definitions : null;
  if (source === null || source.length > 5_000) throw new Error('invalid_or_oversized_content_pack');
  const definitions = source.map(parseDefinition);
  const state = canonical(definitions);
  if (!state.validation.valid) throw new Error(`content_pack_invalid:${state.validation.errors[0]?.code ?? 'unknown'}`);
  return state.definitions;
}

export function planBoundedPackImport(value: string, batchSize = 50): readonly PackImportBatch[] {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 100) throw new Error('content_import_batch_size_out_of_range');
  const definitions = parseWorldPack(value);
  const total = Math.ceil(definitions.length / batchSize);
  return Object.freeze(Array.from({ length: total }, (_, index) => Object.freeze({
    index, total, definitions: Object.freeze(definitions.slice(index * batchSize, (index + 1) * batchSize)),
  })));
}

export function worldPackManifest(definitions: readonly SupportedContentDefinition[], engineVersion = ENGINE_VERSION): WorldPackManifest {
  const state = canonical(definitions);
  const kindCounts = Object.fromEntries((SUPPORTED_CONTENT_KINDS as readonly string[]).map((kind) => [
    kind, state.definitions.filter((definition) => definition.kind === kind).length,
  ]).filter(([, count]) => count !== 0));
  return Object.freeze({ schemaVersion: 1, engineVersion, contentHash: state.contentHash,
    definitionCount: state.definitions.length, kindCounts: Object.freeze(kindCounts) });
}

export function diffWorldPackManifest(
  definitions: readonly SupportedContentDefinition[],
  expected: Omit<WorldPackManifest, 'schemaVersion'> & { readonly schemaVersion: number },
): WorldPackManifestDiff {
  const actual = worldPackManifest(definitions, expected.engineVersion);
  const changedKinds = [...new Set([...Object.keys(expected.kindCounts), ...Object.keys(actual.kindCounts)])]
    .sort((left, right) => left.localeCompare(right))
    .filter((kind) => (expected.kindCounts[kind] ?? 0) !== (actual.kindCounts[kind] ?? 0));
  return Object.freeze({ matches: actual.contentHash === expected.contentHash
      && actual.definitionCount === expected.definitionCount && changedKinds.length === 0,
    expectedHash: expected.contentHash, actualHash: actual.contentHash,
    definitionCountDelta: actual.definitionCount - expected.definitionCount,
    changedKinds: Object.freeze(changedKinds) });
}

export function serializeWorldPack(definitions: readonly SupportedContentDefinition[], engineVersion = ENGINE_VERSION): string {
  const state = canonical(definitions);
  return `${JSON.stringify({ manifest: worldPackManifest(state.definitions, engineVersion), definitions: state.definitions }, null, 2)}\n`;
}

export class WorldAuthoringModel {
  readonly #access: WorldAuthoringAccess;
  readonly #publisher: ItemsPublishAdapter | null;
  readonly #playtester: WorldPlaytestAdapter | null;
  #head: ItemsContentHeadSnapshot;
  #base: readonly SupportedContentDefinition[];
  #present: readonly SupportedContentDefinition[];
  #baseRevision: bigint;
  #history: readonly ContentRevisionRecord[];
  readonly #undo: Array<readonly SupportedContentDefinition[]> = [];
  readonly #redo: Array<readonly SupportedContentDefinition[]> = [];

  constructor(options: WorldAuthoringOptions) {
    this.#access = options.access;
    this.#head = options.head ?? defaultHead();
    this.#base = canonical(this.#head.definitions).definitions;
    this.#present = this.#base;
    this.#baseRevision = this.#head.revision;
    this.#history = Object.freeze([...(options.history ?? [])]);
    this.#publisher = options.access === 'write' && options.createPublishAdapter !== undefined ? options.createPublishAdapter() : null;
    this.#playtester = options.access === 'write' && options.createPlaytestAdapter !== undefined ? options.createPlaytestAdapter() : null;
  }

  #editable(): void { if (this.#access === 'read_only') throw new Error('world_tables_read_only'); }
  #commit(next: readonly SupportedContentDefinition[]): WorldAuthoringSnapshot {
    this.#editable();
    const state = canonical(next);
    if (state.contentHash === contentDefinitionsHash(this.#present)) return this.snapshot();
    this.#undo.push(this.#present); this.#redo.splice(0); this.#present = state.definitions;
    return this.snapshot();
  }

  snapshot(): WorldAuthoringSnapshot {
    const state = canonical(this.#present);
    const diffs = diffContentDefinitions(this.#base, state.definitions);
    const conflict = this.#baseRevision !== this.#head.revision;
    const compatible = this.#head.engineVersion === ENGINE_VERSION;
    return Object.freeze({ definitions: state.definitions, validation: state.validation, diffs,
      baseRevision: this.#baseRevision, headRevision: this.#head.revision, contentHash: state.contentHash,
      dirty: diffs.length > 0, canUndo: this.#undo.length > 0, canRedo: this.#redo.length > 0,
      canPublish: this.#access === 'write' && this.#publisher !== null && compatible && !conflict
        && state.validation.valid && diffs.length > 0,
      conflict, engineGate: compatible ? 'compatible' : 'requires_update',
      playtestAvailable: this.#playtester !== null });
  }

  browser(kind?: WorldTableKind, query = '', includeRetired = false): readonly WorldTableBrowserEntry[] {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
    return this.snapshot().definitions.filter((definition) => WORLD_KIND_SET.has(definition.kind))
      .filter((definition) => kind === undefined || definition.kind === kind)
      .filter((definition) => includeRetired || definition.retired !== true)
      .filter((definition) => terms.every((term) => `${definition.id} ${label(definition)} ${JSON.stringify(definition)}`.toLocaleLowerCase().includes(term)))
      .map((definition) => ({ id: definition.id, kind: definition.kind, label: label(definition),
        retired: definition.retired === true,
        referencedBy: this.#present.filter((candidate) => candidate.id !== definition.id && references(candidate).includes(definition.id)).length }));
  }

  definition(id: string): SupportedContentDefinition | null { return this.#present.find((definition) => definition.id === id) ?? null; }
  upsert(value: unknown): WorldAuthoringSnapshot {
    const definition = parseDefinition(value);
    if (!WORLD_KIND_SET.has(definition.kind)) throw new Error('world_table_kind_required');
    const next = new Map(this.#present.map((entry) => [entry.id, entry])); next.set(definition.id, definition);
    return this.#commit([...next.values()]);
  }
  delete(id: string): WorldAuthoringSnapshot { return this.#commit(this.#present.filter((definition) => definition.id !== id)); }
  replaceWithPack(value: string): WorldAuthoringSnapshot { return this.#commit(parseWorldPack(value)); }
  undo(): WorldAuthoringSnapshot { this.#editable(); const value = this.#undo.pop(); if (value !== undefined) { this.#redo.push(this.#present); this.#present = value; } return this.snapshot(); }
  redo(): WorldAuthoringSnapshot { this.#editable(); const value = this.#redo.pop(); if (value !== undefined) { this.#undo.push(this.#present); this.#present = value; } return this.snapshot(); }
  history(): readonly ContentRevisionRecord[] { return this.#history; }
  receiveHistory(value: readonly ContentRevisionRecord[]): void { this.#history = Object.freeze([...value].sort((a, b) => a.revision > b.revision ? -1 : 1)); }
  receiveHead(head: ItemsContentHeadSnapshot): WorldAuthoringSnapshot {
    this.#head = head;
    if (!this.snapshot().dirty || canonical(head.definitions).contentHash === contentDefinitionsHash(this.#present)) {
      this.#base = canonical(head.definitions).definitions; this.#present = this.#base;
      this.#baseRevision = head.revision; this.#undo.splice(0); this.#redo.splice(0);
    }
    return this.snapshot();
  }
  rebase(): WorldAuthoringSnapshot {
    this.#editable();
    const local = diffContentDefinitions(this.#base, this.#present);
    const remote = new Set(diffContentDefinitions(this.#base, this.#head.definitions).map(({ id }) => id));
    const overlap = local.filter(({ id }) => remote.has(id)).map(({ id }) => id);
    if (overlap.length > 0) throw new Error(`content_rebase_conflict:${overlap.join(',')}`);
    this.#present = applyDefinitionChangeSet(this.#head.definitions, {
      upserts: local.flatMap(({ after }) => after === undefined ? [] : [after]),
      deletes: local.filter(({ kind }) => kind === 'delete').map(({ id }) => id),
    });
    this.#base = canonical(this.#head.definitions).definitions; this.#baseRevision = this.#head.revision;
    return this.snapshot();
  }
  buildPublishRequest(clientMutationId: string, note: string): PublishContentChangeSetRequest {
    if (!MUTATION_ID.test(clientMutationId) || note.trim().length > 500) throw new Error('invalid_content_publish_metadata');
    const state = this.snapshot();
    if (!state.canPublish) throw new Error(state.conflict ? 'content_revision_conflict' : 'content_publish_unavailable');
    return Object.freeze({ packId: 'live', expectedRevision: this.#baseRevision, clientMutationId,
      upserts: JSON.stringify(state.diffs.flatMap(({ after }) => after === undefined ? [] : [{ id: after.id, kind: after.kind, json: JSON.stringify(after) }])),
      deletes: JSON.stringify(state.diffs.filter(({ kind }) => kind === 'delete').map(({ id }) => id)), note: note.trim() });
  }
  async publish(clientMutationId: string, note: string): Promise<PublishContentChangeSetRequest> {
    if (this.#publisher === null) throw new Error('content_publish_unavailable');
    const request = this.buildPublishRequest(clientMutationId, note); await this.#publisher.publishContentChangeSet(request); return request;
  }
  async playtest(request: WorldPlaytestRequest): Promise<void> {
    if (this.#playtester === null) throw new Error('world_playtest_live_admin_required');
    const definition = this.definition(request.definitionId);
    if (definition === null || (request.kind === 'spawn' && definition.kind !== 'creature' && definition.kind !== 'spawn')
      || (request.kind === 'apply_effect' && definition.kind !== 'effect')
      || (request.kind === 'grant_upgrade' && definition.kind !== 'upgrade')) throw new Error('world_playtest_definition_mismatch');
    await this.#playtester.run(request);
  }
}

export function createWorldAuthoringModel(options: WorldAuthoringOptions): WorldAuthoringModel {
  return new WorldAuthoringModel(options);
}

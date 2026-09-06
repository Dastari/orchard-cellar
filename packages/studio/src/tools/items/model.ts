import {
  bootstrapContentDefinitions,
  buildContentRegistry,
  contentDefinitionRowsHash,
  contentDefinitionsHash,
  definitionSlug,
  parseContentDefinition,
  type ContentValidationReport,
  type ItemContentDefinition,
  type SupportedContentDefinition,
} from '@orchard/sim';
import type {
  AssetPickerOption,
  ContentRevisionPreview,
  ContentRevisionRecord,
  DefinitionReferenceOption,
  ItemsAssetPickerAdapter,
  ItemsContentHeadSnapshot,
  ItemsDraftConflict,
  ItemsDraftPersistenceAdapter,
  ItemsPublishAdapter,
  ItemsPublishAdapterFactory,
  ItemsToolAccess,
  ItemsToolContentKind,
  ItemsToolSnapshot,
  PublishContentChangeSetRequest,
  RestoreContentRevisionRequest,
} from './contracts.js';
import { ITEMS_TOOL_CONTENT_KINDS } from './contracts.js';
import { applyDefinitionChangeSet, diffContentDefinitions } from './diff.js';

export const ITEMS_TOOL_ENGINE_VERSION = 1 as const;
export const ITEMS_TOOL_DRAFT_KEY = 'orchard.studio.items.draft.v1';
const MUTATION_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,95}$/u;
const MAX_NOTE_CHARACTERS = 500;

interface ItemsDraftDocument {
  readonly formatVersion: 1;
  readonly baseRevision: string;
  readonly baseContentHash: string;
  readonly upserts: readonly SupportedContentDefinition[];
  readonly deletes: readonly string[];
}

interface ParsedChangeSet {
  readonly upserts: readonly SupportedContentDefinition[];
  readonly deletes: readonly string[];
}

export interface CreateItemsToolOptions {
  readonly access: ItemsToolAccess;
  readonly head?: ItemsContentHeadSnapshot;
  readonly history?: readonly ContentRevisionRecord[];
  readonly persistence?: ItemsDraftPersistenceAdapter;
  readonly assetPicker?: ItemsAssetPickerAdapter;
  readonly createPublishAdapter?: ItemsPublishAdapterFactory;
}

function rows(definitions: readonly SupportedContentDefinition[]) {
  return definitions.map((definition) => ({
    id: definition.id,
    kind: definition.kind,
    slug: definitionSlug(definition.id) ?? undefined,
    json: definition,
  }));
}

function canonicalDefinitions(definitions: readonly SupportedContentDefinition[]): {
  readonly definitions: readonly SupportedContentDefinition[];
  readonly validation: ContentValidationReport;
  readonly contentHash: string;
} {
  const built = buildContentRegistry(rows(definitions));
  return {
    definitions: Object.freeze([...built.registry.definitions.values()]),
    validation: built.report,
    contentHash: built.registry.contentHash,
  };
}

export function createItemsContentHeadSnapshot(
  definitions: readonly SupportedContentDefinition[] = bootstrapContentDefinitions(),
  revision = 0n,
  engineVersion: number = ITEMS_TOOL_ENGINE_VERSION,
): ItemsContentHeadSnapshot {
  const canonical = canonicalDefinitions(definitions);
  if (!canonical.validation.valid) {
    throw new Error(`invalid_items_content_head:${canonical.validation.errors[0]?.code ?? 'unknown'}`);
  }
  return Object.freeze({
    packId: 'live', revision, contentHash: canonical.contentHash, engineVersion,
    definitions: canonical.definitions,
  });
}

export function verifyItemsContentHeadSnapshot(head: ItemsContentHeadSnapshot): ItemsContentHeadSnapshot {
  if (head.packId !== 'live') throw new Error('items_content_pack_mismatch');
  const sourceRows = head.sourceRows ?? rows(head.definitions);
  const built = buildContentRegistry(sourceRows);
  if (!built.report.valid) {
    throw new Error(`invalid_items_content_head:${built.report.errors[0]?.code ?? 'unknown'}`);
  }
  if (contentDefinitionRowsHash(sourceRows) !== head.contentHash) throw new Error('items_content_head_hash_mismatch');
  return Object.freeze({ ...head, definitions: Object.freeze([...built.registry.definitions.values()]) });
}

function editableKind(kind: string): kind is ItemsToolContentKind {
  return (ITEMS_TOOL_CONTENT_KINDS as readonly string[]).includes(kind);
}

function parseEditableDefinition(value: unknown): SupportedContentDefinition {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('invalid_items_definition');
  }
  const kind = (value as { readonly kind?: unknown }).kind;
  if (typeof kind !== 'string' || !editableKind(kind)) throw new Error('unsupported_items_definition_kind');
  return parseContentDefinition(kind, value);
}

function definitionLabel(definition: SupportedContentDefinition): string {
  if ('displayName' in definition && typeof definition.displayName === 'string') return definition.displayName;
  return definitionSlug(definition.id) ?? definition.id;
}

function referenceExists(value: unknown, id: string): boolean {
  if (value === id) return true;
  if (Array.isArray(value)) return value.some((child) => referenceExists(child, id));
  if (typeof value !== 'object' || value === null) return false;
  return Object.values(value as Record<string, unknown>).some((child) => referenceExists(child, id));
}

function parseChangeSet(json: string): ParsedChangeSet {
  let value: unknown;
  try {
    value = JSON.parse(json) as unknown;
  } catch {
    throw new Error('invalid_content_revision_change_set');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('invalid_content_revision_change_set');
  }
  const source = value as { readonly upserts?: unknown; readonly deletes?: unknown };
  if (!Array.isArray(source.upserts) || !Array.isArray(source.deletes)
    || !source.deletes.every((id) => typeof id === 'string')) {
    throw new Error('invalid_content_revision_change_set');
  }
  const upserts = source.upserts.map((upsert) => {
    if (typeof upsert !== 'object' || upsert === null || Array.isArray(upsert)) {
      throw new Error('invalid_content_revision_change_set');
    }
    const entry = upsert as { readonly kind?: unknown; readonly json?: unknown };
    if (typeof entry.kind !== 'string' || typeof entry.json !== 'string') {
      throw new Error('invalid_content_revision_change_set');
    }
    return parseContentDefinition(entry.kind, entry.json);
  });
  return {
    upserts: Object.freeze(upserts.sort((left, right) => left.id.localeCompare(right.id))),
    deletes: Object.freeze([...source.deletes].sort((left, right) => left.localeCompare(right))),
  };
}

function serializeDraft(
  baseRevision: bigint,
  baseContentHash: string,
  upserts: ReadonlyMap<string, SupportedContentDefinition>,
  deletes: ReadonlySet<string>,
): string {
  const document: ItemsDraftDocument = {
    formatVersion: 1,
    baseRevision: baseRevision.toString(),
    baseContentHash,
    upserts: [...upserts.values()].sort((left, right) => left.id.localeCompare(right.id)),
    deletes: [...deletes].sort((left, right) => left.localeCompare(right)),
  };
  return JSON.stringify(document);
}

function parseDraft(value: string): ItemsDraftDocument {
  let decoded: unknown;
  try {
    decoded = JSON.parse(value) as unknown;
  } catch {
    throw new Error('invalid_items_draft');
  }
  if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) {
    throw new Error('invalid_items_draft');
  }
  const source = decoded as Partial<ItemsDraftDocument>;
  if (source.formatVersion !== 1 || typeof source.baseRevision !== 'string'
    || !/^\d+$/u.test(source.baseRevision) || typeof source.baseContentHash !== 'string'
    || !Array.isArray(source.upserts) || !Array.isArray(source.deletes)
    || !source.deletes.every((id) => typeof id === 'string')) {
    throw new Error('invalid_items_draft');
  }
  return {
    formatVersion: 1,
    baseRevision: source.baseRevision,
    baseContentHash: source.baseContentHash,
    upserts: source.upserts.map(parseEditableDefinition),
    deletes: [...source.deletes],
  };
}

function assertPublishEnvelope(clientMutationId: string, note: string): void {
  if (!MUTATION_ID_PATTERN.test(clientMutationId)) throw new Error('invalid_content_mutation_id');
  if (note.trim().length > MAX_NOTE_CHARACTERS) throw new Error('invalid_content_note');
}

export class ItemsToolModel {
  readonly #access: ItemsToolAccess;
  readonly #adapter: ItemsPublishAdapter | null;
  readonly #persistence: ItemsDraftPersistenceAdapter | null;
  readonly #assetPicker: ItemsAssetPickerAdapter | null;
  #history: readonly ContentRevisionRecord[];
  #remoteHead: ItemsContentHeadSnapshot;
  #baseDefinitions: readonly SupportedContentDefinition[];
  #baseRevision: bigint;
  #baseContentHash: string;
  #baseKnown = true;
  readonly #upserts = new Map<string, SupportedContentDefinition>();
  readonly #deletes = new Set<string>();

  constructor(options: CreateItemsToolOptions) {
    this.#access = options.access;
    this.#remoteHead = verifyItemsContentHeadSnapshot(options.head ?? createItemsContentHeadSnapshot());
    this.#baseDefinitions = this.#remoteHead.definitions;
    this.#baseRevision = this.#remoteHead.revision;
    this.#baseContentHash = this.#remoteHead.contentHash;
    this.#history = Object.freeze([...(options.history ?? [])]
      .sort((left, right) => left.revision === right.revision ? 0 : left.revision > right.revision ? -1 : 1));
    this.#persistence = options.persistence ?? null;
    this.#assetPicker = options.assetPicker ?? null;
    this.#adapter = options.access === 'write' && options.createPublishAdapter !== undefined
      ? options.createPublishAdapter()
      : null;
  }

  #assertEditable(): void {
    if (this.#access === 'read_only') throw new Error('items_tool_read_only');
  }

  #draftDefinitions(): readonly SupportedContentDefinition[] {
    return applyDefinitionChangeSet(this.#baseDefinitions, {
      upserts: [...this.#upserts.values()], deletes: [...this.#deletes],
    });
  }

  #localIds(): readonly string[] {
    return [...new Set([...this.#upserts.keys(), ...this.#deletes])].sort((left, right) => left.localeCompare(right));
  }

  #normalizeDraftAgainstBase(): void {
    const base = new Map<string, SupportedContentDefinition>(
      this.#baseDefinitions.map((definition) => [definition.id, definition]),
    );
    for (const [id, definition] of this.#upserts) {
      if (base.has(id) && contentDefinitionsHash([base.get(id)!]) === contentDefinitionsHash([definition])) {
        this.#upserts.delete(id);
      }
    }
    for (const id of this.#deletes) if (!base.has(id)) this.#deletes.delete(id);
  }

  snapshot(): ItemsToolSnapshot {
    const canonical = canonicalDefinitions(this.#draftDefinitions());
    const diffs = diffContentDefinitions(this.#baseDefinitions, canonical.definitions);
    const conflict = this.conflict();
    const compatible = this.#remoteHead.engineVersion === ITEMS_TOOL_ENGINE_VERSION;
    return Object.freeze({
      access: this.#access,
      baseRevision: this.#baseRevision,
      headRevision: this.#remoteHead.revision,
      engineGate: compatible ? 'compatible' : 'requires_update',
      dirty: diffs.length > 0,
      canPublish: this.#access === 'write' && this.#adapter !== null && compatible
        && canonical.validation.valid && conflict === null && diffs.length > 0,
      definitions: canonical.definitions,
      diffs,
      validation: canonical.validation,
      conflict,
    });
  }

  definitions(kind?: ItemsToolContentKind, query = ''): readonly SupportedContentDefinition[] {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
    return this.snapshot().definitions.filter((definition) => editableKind(definition.kind))
      .filter((definition) => kind === undefined || definition.kind === kind)
      .filter((definition) => {
        const haystack = `${definition.id} ${definitionLabel(definition)} ${JSON.stringify(definition)}`.toLocaleLowerCase();
        return terms.every((term) => haystack.includes(term));
      });
  }

  referenceOptions(kind?: ItemsToolContentKind): readonly DefinitionReferenceOption[] {
    return this.definitions(kind).map((definition) => ({
      id: definition.id,
      kind: definition.kind,
      label: definitionLabel(definition),
      retired: definition.retired === true,
    }));
  }

  referencesTo(id: string): readonly DefinitionReferenceOption[] {
    return this.definitions().filter((definition) => definition.id !== id && referenceExists(definition, id))
      .map((definition) => ({
        id: definition.id, kind: definition.kind, label: definitionLabel(definition), retired: definition.retired === true,
      }));
  }

  assetOptions(query = ''): readonly AssetPickerOption[] {
    return this.#assetPicker?.options(query) ?? [];
  }

  upsertDefinitions(values: readonly unknown[]): ItemsToolSnapshot {
    this.#assertEditable();
    const parsed = values.map(parseEditableDefinition);
    for (const definition of parsed) {
      this.#upserts.set(definition.id, definition);
      this.#deletes.delete(definition.id);
    }
    this.#normalizeDraftAgainstBase();
    return this.snapshot();
  }

  upsertDefinition(value: unknown): ItemsToolSnapshot {
    return this.upsertDefinitions([value]);
  }

  deleteDefinition(id: string): ItemsToolSnapshot {
    this.#assertEditable();
    const existsInBase = this.#baseDefinitions.some((definition) => definition.id === id);
    const existsInDraft = this.#upserts.has(id);
    if (!existsInBase && !existsInDraft) throw new Error(`items_definition_not_found:${id}`);
    this.#upserts.delete(id);
    if (existsInBase) this.#deletes.add(id);
    else this.#deletes.delete(id);
    return this.snapshot();
  }

  retireDefinition(id: string, replacement: string): ItemsToolSnapshot {
    this.#assertEditable();
    const definition = this.snapshot().definitions.find((entry) => entry.id === id);
    const target = this.snapshot().definitions.find((entry) => entry.id === replacement);
    if (definition === undefined || !editableKind(definition.kind)) throw new Error(`items_definition_not_found:${id}`);
    if (target === undefined || target.kind !== definition.kind || id === replacement) {
      throw new Error('invalid_retirement_replacement');
    }
    return this.upsertDefinition({ ...definition, retired: true, replacement });
  }

  setItemPrice(id: string, buy: number | null, sell: number): ItemsToolSnapshot {
    this.#assertEditable();
    const definition = this.snapshot().definitions.find((entry) => entry.id === id);
    if (definition?.kind !== 'item') throw new Error(`items_definition_not_found:${id}`);
    return this.upsertDefinition({ ...definition, economy: { buy, sell } } satisfies ItemContentDefinition);
  }

  persistDraft(): void {
    if (this.#persistence === null) return;
    if (this.#localIds().length === 0) this.#persistence.remove(ITEMS_TOOL_DRAFT_KEY);
    else this.#persistence.save(ITEMS_TOOL_DRAFT_KEY, serializeDraft(
      this.#baseRevision, this.#baseContentHash, this.#upserts, this.#deletes,
    ));
  }

  restorePersistedDraft(): ItemsToolSnapshot {
    this.#assertEditable();
    const encoded = this.#persistence?.load(ITEMS_TOOL_DRAFT_KEY);
    if (encoded === null || encoded === undefined) return this.snapshot();
    const draft = parseDraft(encoded);
    this.#upserts.clear();
    this.#deletes.clear();
    for (const definition of draft.upserts) this.#upserts.set(definition.id, definition);
    for (const id of draft.deletes) {
      if (this.#upserts.has(id)) throw new Error('invalid_items_draft');
      this.#deletes.add(id);
    }
    this.#baseKnown = draft.baseRevision === this.#baseRevision.toString()
      && draft.baseContentHash === this.#baseContentHash;
    this.#baseRevision = BigInt(draft.baseRevision);
    this.#baseContentHash = draft.baseContentHash;
    return this.snapshot();
  }

  clearDraft(): ItemsToolSnapshot {
    this.#assertEditable();
    this.#upserts.clear();
    this.#deletes.clear();
    this.#baseDefinitions = this.#remoteHead.definitions;
    this.#baseRevision = this.#remoteHead.revision;
    this.#baseContentHash = this.#remoteHead.contentHash;
    this.#baseKnown = true;
    this.#persistence?.remove(ITEMS_TOOL_DRAFT_KEY);
    return this.snapshot();
  }

  receiveHead(head: ItemsContentHeadSnapshot): ItemsToolSnapshot {
    const next = verifyItemsContentHeadSnapshot(head);
    const localContentHash = this.#localIds().length === 0
      ? null : canonicalDefinitions(this.#draftDefinitions()).contentHash;
    this.#remoteHead = next;
    if (this.#localIds().length === 0 || localContentHash === contentDefinitionsHash(next.definitions)) {
      this.#upserts.clear();
      this.#deletes.clear();
      this.#baseDefinitions = next.definitions;
      this.#baseRevision = next.revision;
      this.#baseContentHash = next.contentHash;
      this.#baseKnown = true;
      this.#persistence?.remove(ITEMS_TOOL_DRAFT_KEY);
    }
    return this.snapshot();
  }

  receiveHistory(history: readonly ContentRevisionRecord[]): readonly ContentRevisionRecord[] {
    this.#history = Object.freeze([...history]
      .sort((left, right) => left.revision === right.revision ? 0 : left.revision > right.revision ? -1 : 1));
    return this.#history;
  }

  conflict(): ItemsDraftConflict | null {
    if (this.#remoteHead.revision === this.#baseRevision) return null;
    const localIds = this.#localIds();
    const remoteIds = this.#baseKnown
      ? diffContentDefinitions(this.#baseDefinitions, this.#remoteHead.definitions).map(({ id }) => id)
      : localIds;
    const remote = new Set(remoteIds);
    const overlappingIds = localIds.filter((id) => remote.has(id));
    return Object.freeze({
      code: 'content_revision_conflict',
      baseRevision: this.#baseRevision,
      headRevision: this.#remoteHead.revision,
      localIds,
      remoteIds,
      overlappingIds,
      canAutoRebase: overlappingIds.length === 0,
    });
  }

  rebase(strategy: 'safe' | 'prefer_local' | 'prefer_remote' = 'safe'): ItemsToolSnapshot {
    this.#assertEditable();
    const conflict = this.conflict();
    if (conflict === null) return this.snapshot();
    if (!conflict.canAutoRebase && strategy === 'safe') {
      throw new Error(`content_rebase_conflict:${conflict.overlappingIds.join(',')}`);
    }
    if (strategy === 'prefer_remote') {
      for (const id of conflict.overlappingIds) {
        this.#upserts.delete(id);
        this.#deletes.delete(id);
      }
    }
    this.#baseDefinitions = this.#remoteHead.definitions;
    this.#baseRevision = this.#remoteHead.revision;
    this.#baseContentHash = this.#remoteHead.contentHash;
    this.#baseKnown = true;
    this.#normalizeDraftAgainstBase();
    return this.snapshot();
  }

  buildPublishRequest(clientMutationId: string, note: string): PublishContentChangeSetRequest {
    assertPublishEnvelope(clientMutationId, note);
    const state = this.snapshot();
    if (state.engineGate !== 'compatible') throw new Error('content_engine_update_required');
    if (state.conflict !== null) throw new Error('content_revision_conflict');
    if (!state.dirty) throw new Error('content_change_set_empty');
    if (!state.validation.valid) throw new Error(`content_validation_failed:${state.validation.errors[0]?.code ?? 'unknown'}`);
    const upserts = [...this.#upserts.values()].sort((left, right) => left.id.localeCompare(right.id)).map((definition) => ({
      id: definition.id, kind: definition.kind, json: JSON.stringify(definition),
    }));
    return Object.freeze({
      packId: 'live', expectedRevision: this.#baseRevision, clientMutationId,
      upserts: JSON.stringify(upserts),
      deletes: JSON.stringify([...this.#deletes].sort((left, right) => left.localeCompare(right))),
      note: note.trim(),
    });
  }

  async publish(clientMutationId: string, note: string): Promise<PublishContentChangeSetRequest> {
    if (this.#access !== 'write' || this.#adapter === null) throw new Error('items_publish_unavailable');
    const request = this.buildPublishRequest(clientMutationId, note);
    await this.#adapter.publishContentChangeSet(request);
    return request;
  }

  history(): readonly ContentRevisionRecord[] {
    return this.#history;
  }

  previewRevision(revision: bigint, mode: ContentRevisionPreview['mode']): ContentRevisionPreview {
    const entry = this.#history.find((candidate) => candidate.revision === revision);
    if (entry === undefined) throw new Error(`content_revision_not_found:${revision}`);
    const forward = parseChangeSet(entry.changeSetJson);
    const inverse = parseChangeSet(entry.inverseChangeSetJson);
    if (mode === 'restore_inverse') {
      const restored = applyDefinitionChangeSet(this.#remoteHead.definitions, inverse);
      return Object.freeze({ revision, mode, diffs: diffContentDefinitions(this.#remoteHead.definitions, restored) });
    }
    const touched = new Set([...forward.upserts.map(({ id }) => id), ...forward.deletes]);
    const before = inverse.upserts.filter(({ id }) => touched.has(id));
    const after = forward.upserts.filter(({ id }) => touched.has(id));
    return Object.freeze({ revision, mode, diffs: diffContentDefinitions(before, after) });
  }

  async restoreRevision(
    revision: bigint,
    clientMutationId: string,
    note: string,
  ): Promise<RestoreContentRevisionRequest> {
    if (this.#access !== 'write' || this.#adapter === null) throw new Error('items_restore_unavailable');
    if (this.snapshot().dirty) throw new Error('content_draft_not_empty');
    if (this.#remoteHead.engineVersion !== ITEMS_TOOL_ENGINE_VERSION) throw new Error('content_engine_update_required');
    if (!this.#history.some((entry) => entry.revision === revision)) throw new Error(`content_revision_not_found:${revision}`);
    assertPublishEnvelope(clientMutationId, note);
    const request = Object.freeze({
      revision,
      expectedRevision: this.#remoteHead.revision,
      clientMutationId,
      note: note.trim(),
    });
    await this.#adapter.restoreContentRevision(request);
    return request;
  }
}

export function createItemsTool(options: CreateItemsToolOptions): ItemsToolModel {
  return new ItemsToolModel(options);
}

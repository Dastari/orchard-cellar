import {
  buildContentRegistry,
  contentDefinitionsHash,
  contentDefinitionRowsHash,
  definitionSlug,
  MAX_CONTENT_DEFINITION_BYTES,
  serializeContentDefinitionForTransport,
  type ContentDefinitionRow,
  type ContentRegistry,
  type SupportedContentDefinition,
} from '@orchard/sim';
export { CONTENT_ENGINE_VERSION } from './version.js';

export const LIVE_CONTENT_PACK_ID = 'live';
export const MAX_CONTENT_UPSERTS_PER_PUBLISH = 2_000;
export const MAX_CONTENT_DELETES_PER_PUBLISH = 2_000;
export const MAX_CONTENT_NOTE_CHARACTERS = 500;
export const CONTENT_MUTATION_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,95}$/u;

export interface StoredContentDefinition extends ContentDefinitionRow {
  readonly slug: string;
  readonly revision: bigint;
  readonly hash: string;
  readonly json: string;
}

export interface ContentChangeSetInput {
  readonly packId: string;
  readonly expectedRevision: bigint;
  readonly clientMutationId: string;
  readonly upserts: string;
  readonly deletes: string;
  readonly note: string;
}

export interface ContentUpsertInput {
  readonly id: string;
  readonly kind: string;
  readonly json: string;
}

export interface CanonicalContentChangeSet {
  readonly upserts: readonly ContentUpsertInput[];
  readonly deletes: readonly string[];
}

export interface ContentPublicationPlan {
  readonly definitions: readonly StoredContentDefinition[];
  readonly upserts: readonly StoredContentDefinition[];
  readonly deletes: readonly string[];
  readonly registry: ContentRegistry;
  readonly contentHash: string;
  readonly definitionCount: number;
  readonly changeSetJson: string;
  readonly inverseChangeSetJson: string;
  readonly requestHash: string;
}

export class ContentAuthorityError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = 'ContentAuthorityError';
    this.code = code;
  }
}

export interface PriorContentMutation {
  readonly requestHash: string;
}

export function contentMutationDisposition(
  prior: readonly PriorContentMutation[],
  requestHash: string,
): 'new' | 'replay' {
  if (prior.some((revision) => revision.requestHash === requestHash)) return 'replay';
  if (prior.length > 0) fail('content_mutation_id_reused');
  return 'new';
}

export function assertContentRevision(current: bigint, expected: bigint): void {
  if (current !== expected) fail('content_revision_conflict');
  if (current === 0xffff_ffff_ffff_ffffn) fail('content_revision_exhausted');
}

function fail(code: string): never {
  throw new ContentAuthorityError(code);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const source = value as Record<string, unknown>;
  return `{${Object.keys(source).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJson(source[key])}`
  )).join(',')}}`;
}

/** Platform-neutral FNV-1a. This is an idempotency fingerprint, while the sim
 * owns the canonical registry hash used by both clients and authority. */
export function contentRequestHash(value: unknown): string {
  const canonical = canonicalJson(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function parseJsonArray(value: string, code: string): readonly unknown[] {
  let decoded: unknown;
  try {
    decoded = JSON.parse(value) as unknown;
  } catch {
    return fail(code);
  }
  if (!Array.isArray(decoded)) return fail(code);
  return decoded;
}

function parseUpserts(value: string): readonly ContentUpsertInput[] {
  const entries = parseJsonArray(value, 'invalid_content_upserts');
  if (entries.length > MAX_CONTENT_UPSERTS_PER_PUBLISH) return fail('content_upsert_limit');
  return entries.map((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return fail('invalid_content_upserts');
    }
    const source = entry as Record<string, unknown>;
    if (typeof source.id !== 'string' || typeof source.kind !== 'string' || typeof source.json !== 'string') {
      return fail('invalid_content_upserts');
    }
    if (new TextEncoder().encode(source.json).byteLength > MAX_CONTENT_DEFINITION_BYTES) {
      return fail('content_definition_too_large');
    }
    return { id: source.id, kind: source.kind, json: source.json };
  });
}

function parseDeletes(value: string): readonly string[] {
  const entries = parseJsonArray(value, 'invalid_content_deletes');
  if (entries.length > MAX_CONTENT_DELETES_PER_PUBLISH) return fail('content_delete_limit');
  return entries.map((entry) => typeof entry === 'string' && entry.length > 0
    ? entry
    : fail('invalid_content_deletes'));
}

function assertEnvelope(input: ContentChangeSetInput): void {
  if (input.packId !== LIVE_CONTENT_PACK_ID) fail('content_pack_not_found');
  if (!CONTENT_MUTATION_ID_PATTERN.test(input.clientMutationId)) fail('invalid_content_mutation_id');
  if (input.note.trim().length > MAX_CONTENT_NOTE_CHARACTERS) fail('invalid_content_note');
}

export function normalizedContentRequest(input: ContentChangeSetInput): {
  readonly changeSet: CanonicalContentChangeSet;
  readonly changeSetJson: string;
  readonly requestHash: string;
} {
  assertEnvelope(input);
  const upserts = [...parseUpserts(input.upserts)].sort((left, right) => left.id.localeCompare(right.id));
  const deletes = [...parseDeletes(input.deletes)].sort((left, right) => left.localeCompare(right));
  if (upserts.length === 0 && deletes.length === 0) fail('content_change_set_empty');
  const ids = new Set<string>();
  for (const upsert of upserts) {
    if (ids.has(upsert.id)) fail('duplicate_content_change');
    ids.add(upsert.id);
  }
  for (const id of deletes) {
    if (ids.has(id)) fail('duplicate_content_change');
    ids.add(id);
  }
  const changeSet = { upserts, deletes } as const;
  const changeSetJson = canonicalJson(changeSet);
  return {
    changeSet,
    changeSetJson,
    requestHash: contentRequestHash({
      operation: 'publish',
      packId: input.packId,
      expectedRevision: input.expectedRevision.toString(),
      clientMutationId: input.clientMutationId,
      note: input.note.trim(),
      changeSet,
    }),
  };
}

function definitionHash(definition: SupportedContentDefinition): string {
  return contentDefinitionsHash([definition]);
}

/** Builds and validates the complete resulting registry before exposing any
 * mutations to a reducer. A thrown reducer error therefore leaves every table
 * untouched under SpaceTimeDB transaction semantics. */
export function planContentPublication(
  current: readonly StoredContentDefinition[],
  nextRevision: bigint,
  input: ContentChangeSetInput,
): ContentPublicationPlan {
  const normalized = normalizedContentRequest(input);
  const working = new Map(current.map((row) => [row.id, row]));
  const previous = new Map(current.map((row) => [row.id, row]));
  for (const upsert of normalized.changeSet.upserts) {
    working.set(upsert.id, {
      ...upsert,
      slug: definitionSlug(upsert.id) ?? '',
      revision: nextRevision,
      hash: '',
    });
  }
  for (const id of normalized.changeSet.deletes) working.delete(id);

  const built = buildContentRegistry([...working.values()]);
  if (!built.report.valid) fail(`content_validation_failed:${built.report.errors[0]?.code ?? 'unknown'}`);

  const canonicalById = new Map<string, SupportedContentDefinition>(
    [...built.registry.definitions.values()].map((definition) => [definition.id, definition] as const),
  );
  const changedIds = new Set(normalized.changeSet.upserts.map(({ id }) => id));
  const definitions = [...working.values()].map((row): StoredContentDefinition => {
    // Parser upgrades are semantic projections, not an implicit rewrite of
    // every durable definition during an unrelated content publication.
    if (!changedIds.has(row.id)) return row;
    const definition = canonicalById.get(row.id);
    if (definition === undefined) fail('content_definition_identity_mismatch');
    const json = serializeContentDefinitionForTransport(definition);
    return {
      id: definition.id,
      kind: definition.kind,
      slug: definitionSlug(definition.id) ?? fail('content_definition_identity_mismatch'),
      revision: row.revision,
      hash: definitionHash(definition),
      json,
    };
  }).sort((left, right) => left.id.localeCompare(right.id));
  const definitionsById = new Map(definitions.map((row) => [row.id, row]));
  const upserts = normalized.changeSet.upserts.map(({ id }) => definitionsById.get(id)
    ?? fail('content_definition_identity_mismatch'));

  const inverseUpserts: ContentUpsertInput[] = [];
  const inverseDeletes: string[] = [];
  for (const { id } of normalized.changeSet.upserts) {
    const old = previous.get(id);
    if (old === undefined) inverseDeletes.push(id);
    else inverseUpserts.push({ id: old.id, kind: old.kind, json: old.json });
  }
  for (const id of normalized.changeSet.deletes) {
    const old = previous.get(id);
    if (old !== undefined) inverseUpserts.push({ id: old.id, kind: old.kind, json: old.json });
  }
  const inverseChangeSetJson = canonicalJson({
    upserts: inverseUpserts.sort((left, right) => left.id.localeCompare(right.id)),
    deletes: inverseDeletes.sort((left, right) => left.localeCompare(right)),
  });
  return Object.freeze({
    definitions: Object.freeze(definitions),
    upserts: Object.freeze(upserts),
    deletes: Object.freeze([...normalized.changeSet.deletes]),
    registry: built.registry,
    contentHash: contentDefinitionRowsHash(definitions),
    definitionCount: definitions.length,
    changeSetJson: normalized.changeSetJson,
    inverseChangeSetJson,
    requestHash: normalized.requestHash,
  });
}

export function restoreContentRequestHash(args: {
  readonly revision: bigint;
  readonly expectedRevision: bigint;
  readonly clientMutationId: string;
  readonly note: string;
}): string {
  if (!CONTENT_MUTATION_ID_PATTERN.test(args.clientMutationId)) fail('invalid_content_mutation_id');
  if (args.note.trim().length > MAX_CONTENT_NOTE_CHARACTERS) fail('invalid_content_note');
  return contentRequestHash({
    operation: 'restore',
    revision: args.revision.toString(),
    expectedRevision: args.expectedRevision.toString(),
    clientMutationId: args.clientMutationId,
    note: args.note.trim(),
  });
}

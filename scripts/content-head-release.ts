import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  buildContentRegistry,
  contentDefinitionsHash,
  contentDefinitionRowsHash,
} from '../packages/sim/src/content/registry.js';
import { bootstrapContentDefinitions } from '../packages/sim/src/content/bootstrap-registry.js';
import { DbConnection, tables } from '@orchard/world-bindings';
import { CONTENT_ENGINE_VERSION } from '../packages/world/src/content/version.js';
import { parseStoredRejoinCredentials } from './world-rejoin-credentials.js';
import { assertCookingRegistryCompatibility } from './cooking-content-continuity.js';

export const CONTENT_HEAD_CAPTURE_FORMAT = 'orchard.content-head-capture.v1';
export const CONTENT_HEAD_CANDIDATE_FORMAT = 'orchard.content-head-candidate.v1';
const LIVE_PACK = 'live';
const TIMEOUT_MS = 40_000;
const LABEL = /^[A-Za-z0-9._-]+$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

export interface ReleaseDefinition {
  readonly id: string;
  readonly kind: string;
  readonly revision: string;
  readonly hash: string;
  readonly json: string;
}

export interface ContentHeadCapture {
  readonly format: typeof CONTENT_HEAD_CAPTURE_FORMAT;
  readonly database: string;
  readonly capturedAt: string;
  readonly head: {
    readonly packId: 'live';
    readonly revision: string;
    readonly contentHash: string;
    readonly engineVersion: number;
    readonly definitionCount: number;
    readonly clientMutationId: string;
  };
  readonly definitions: readonly ReleaseDefinition[];
}

export interface ContentHeadCandidate {
  readonly format: typeof CONTENT_HEAD_CANDIDATE_FORMAT;
  readonly database: string;
  readonly capturedAt: string;
  readonly captureSha256: string;
  readonly reviewer: string;
  readonly changeRequest: string;
  readonly reviewedAt: string;
  readonly baseline: {
    readonly kind: 'pristine-bootstrap-head' | 'prior-approved-candidate';
    readonly contentHash: string;
    readonly definitionCount: number;
    readonly candidateSha256?: string;
  };
  readonly baselineDefinitions: readonly ReleaseDefinition[];
  readonly expectedHead: ContentHeadCapture['head'];
  readonly expectedDefinitions: readonly ReleaseDefinition[];
  readonly targetBootstrap: {
    readonly contentHash: string;
    readonly definitionCount: number;
    readonly engineVersion: number;
  };
  readonly resultingHead: {
    readonly revision: string;
    readonly contentHash: string;
    readonly definitionCount: number;
    readonly engineVersion: number;
  };
  readonly clientMutationId: string;
  readonly note: string;
  readonly upserts: readonly { readonly id: string; readonly kind: string; readonly json: string }[];
  readonly deletes: readonly [];
  readonly preservedCustomIds: readonly string[];
  readonly retainedRemovedBootstrapIds: readonly string[];
  /** The complete approved target is the three-way base for the next release. */
  readonly targetDefinitions: readonly ReleaseDefinition[];
}

function fail(code: string): never { throw new Error(code); }

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort().map((key) => (
    [key, canonicalValue((value as Record<string, unknown>)[key])]
  )));
}

export function canonicalArtifactBytes(value: unknown): Buffer {
  return Buffer.from(`${JSON.stringify(canonicalValue(value), null, 2)}\n`);
}

export function artifactSha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function record(value: unknown, code: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value as Record<string, unknown>;
}

function textValue(value: unknown, code: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(code);
  return value;
}

function integer(value: unknown, code: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) fail(code);
  return value as number;
}

function parseDefinition(value: unknown): ReleaseDefinition {
  const source = record(value, 'content_release_definition_invalid');
  const definition = {
    id: textValue(source['id'], 'content_release_definition_invalid'),
    kind: textValue(source['kind'], 'content_release_definition_invalid'),
    revision: textValue(source['revision'], 'content_release_definition_invalid'),
    hash: textValue(source['hash'], 'content_release_definition_invalid'),
    json: textValue(source['json'], 'content_release_definition_invalid'),
  };
  if (!/^\d+$/u.test(definition.revision)) fail('content_release_definition_invalid');
  return definition;
}

function parseHead(value: unknown): ContentHeadCapture['head'] {
  const source = record(value, 'content_release_head_invalid');
  const packId = textValue(source['packId'], 'content_release_head_invalid');
  const revision = textValue(source['revision'], 'content_release_head_invalid');
  if (packId !== LIVE_PACK || !/^\d+$/u.test(revision)) fail('content_release_head_invalid');
  return {
    packId,
    revision,
    contentHash: textValue(source['contentHash'], 'content_release_head_invalid'),
    engineVersion: integer(source['engineVersion'], 'content_release_head_invalid'),
    definitionCount: integer(source['definitionCount'], 'content_release_head_invalid'),
    clientMutationId: textValue(source['clientMutationId'], 'content_release_head_invalid'),
  };
}

function sortedUniqueDefinitions(values: unknown): readonly ReleaseDefinition[] {
  if (!Array.isArray(values)) fail('content_release_definitions_invalid');
  const definitions = values.map(parseDefinition).sort((left, right) => left.id.localeCompare(right.id));
  if (definitions.some((definition, index) => index > 0 && definitions[index - 1]?.id === definition.id)) {
    fail('content_release_duplicate_definition');
  }
  return definitions;
}

function validateRegistry(definitions: readonly ReleaseDefinition[], expectedHash: string): void {
  const built = buildContentRegistry(definitions.map(({ id, kind, json }) => ({ id, kind, json })));
  if (!built.report.valid) fail(`content_release_registry_invalid:${built.report.errors[0]?.code ?? 'unknown'}`);
  if (contentDefinitionRowsHash(definitions) !== expectedHash) fail('content_release_registry_hash_mismatch');
  for (const row of definitions) {
    const parsed = built.registry.definitions.get(row.id);
    if (parsed === undefined || parsed.kind !== row.kind
      || contentDefinitionRowsHash([row]) !== row.hash) {
      fail(`content_release_definition_fingerprint_mismatch:${row.id}`);
    }
  }
}

export function parseContentHeadCapture(value: unknown): ContentHeadCapture {
  const source = record(value, 'content_release_capture_invalid');
  if (source['format'] !== CONTENT_HEAD_CAPTURE_FORMAT) fail('content_release_capture_format');
  const definitions = sortedUniqueDefinitions(source['definitions']);
  const capture: ContentHeadCapture = {
    format: CONTENT_HEAD_CAPTURE_FORMAT,
    database: textValue(source['database'], 'content_release_capture_invalid'),
    capturedAt: textValue(source['capturedAt'], 'content_release_capture_invalid'),
    head: parseHead(source['head']),
    definitions,
  };
  if (capture.head.definitionCount !== definitions.length) fail('content_release_capture_count_mismatch');
  validateRegistry(definitions, capture.head.contentHash);
  return capture;
}

function bootstrapDefinitions(): readonly ReleaseDefinition[] {
  return bootstrapContentDefinitions().map((definition) => ({
    id: definition.id,
    kind: definition.kind,
    revision: '0',
    hash: contentDefinitionsHash([definition]),
    json: JSON.stringify(definition),
  })).sort((left, right) => left.id.localeCompare(right.id));
}

function definitionsHash(definitions: readonly ReleaseDefinition[]): string {
  const built = buildContentRegistry(definitions.map(({ id, kind, json }) => ({ id, kind, json })));
  if (!built.report.valid) fail(`content_release_registry_invalid:${built.report.errors[0]?.code ?? 'unknown'}`);
  return contentDefinitionRowsHash(definitions);
}

function sameDefinition(left: ReleaseDefinition | undefined, right: ReleaseDefinition | undefined): boolean {
  return left !== undefined && right !== undefined
    && left.id === right.id && left.kind === right.kind && left.hash === right.hash && left.json === right.json;
}

function targetWithRevision(definition: ReleaseDefinition, revision: string): ReleaseDefinition {
  return { ...definition, revision };
}

export function prepareContentHeadCandidate(args: {
  readonly capture: ContentHeadCapture;
  readonly captureSha256: string;
  readonly reviewer: string;
  readonly changeRequest: string;
  readonly reviewedAt: string;
  readonly priorCandidate?: ContentHeadCandidate;
  readonly priorCandidateSha256?: string;
}): ContentHeadCandidate {
  if (!SHA256.test(args.captureSha256) || !LABEL.test(args.reviewer)
    || args.changeRequest.trim().length < 3 || args.changeRequest.trim().length > 160
    || !Number.isFinite(Date.parse(args.reviewedAt))) fail('content_release_review_invalid');
  const live = new Map(args.capture.definitions.map((definition) => [definition.id, definition]));
  const target = bootstrapDefinitions();
  const targetById = new Map(target.map((definition) => [definition.id, definition]));
  let base: readonly ReleaseDefinition[];
  let baseline: ContentHeadCandidate['baseline'];
  if (args.priorCandidate === undefined) {
    if (args.capture.head.revision !== '1'
      || args.capture.head.clientMutationId !== 'bootstrap-content-v1'
      || args.capture.definitions.some(({ revision }) => revision !== '1')) {
      fail('content_release_prior_approved_candidate_required');
    }
    base = args.capture.definitions;
    baseline = {
      kind: 'pristine-bootstrap-head',
      contentHash: args.capture.head.contentHash,
      definitionCount: base.length,
    };
  } else {
    if (args.priorCandidateSha256 === undefined || !SHA256.test(args.priorCandidateSha256)) {
      fail('content_release_prior_candidate_digest_required');
    }
    if (args.priorCandidate.database !== args.capture.database) fail('content_release_database_mismatch');
    base = args.priorCandidate.targetDefinitions;
    baseline = {
      kind: 'prior-approved-candidate',
      contentHash: args.priorCandidate.targetBootstrap.contentHash,
      definitionCount: base.length,
      candidateSha256: args.priorCandidateSha256,
    };
  }
  const baseById = new Map(base.map((definition) => [definition.id, definition]));
  const conflicts: string[] = [];
  const upserts: { id: string; kind: string; json: string }[] = [];
  for (const desired of target) {
    const current = live.get(desired.id);
    const prior = baseById.get(desired.id);
    if (sameDefinition(current, desired)) continue;
    if (prior === undefined) {
      if (current === undefined) upserts.push({ id: desired.id, kind: desired.kind, json: desired.json });
      else conflicts.push(desired.id);
      continue;
    }
    if (current !== undefined && sameDefinition(current, prior)) {
      upserts.push({ id: desired.id, kind: desired.kind, json: desired.json });
    } else {
      // Missing or independently changed target-owned definitions are both
      // treated as author edits. A release never silently recreates them.
      conflicts.push(desired.id);
    }
  }
  if (conflicts.length > 0) fail(`content_release_custom_conflict:${conflicts.sort().join(',')}`);

  const preservedCustomIds = [...live.keys()].filter((id) => !baseById.has(id) && !targetById.has(id)).sort();
  const retainedRemovedBootstrapIds = [...baseById.keys()].filter((id) => !targetById.has(id) && live.has(id)).sort();
  if (args.capture.head.engineVersion > CONTENT_ENGINE_VERSION) fail('content_release_engine_downgrade_forbidden');
  if (upserts.length === 0 && args.capture.head.engineVersion !== CONTENT_ENGINE_VERSION) {
    const forced = target.find((definition) => sameDefinition(live.get(definition.id), definition));
    if (forced === undefined) fail('content_release_engine_advance_requires_safe_upsert');
    upserts.push({ id: forced.id, kind: forced.kind, json: forced.json });
  }
  const nextRevision = (BigInt(args.capture.head.revision) + (upserts.length === 0 ? 0n : 1n)).toString();
  const result = new Map(args.capture.definitions.map((definition) => [definition.id, definition]));
  for (const desired of target) {
    if (upserts.some(({ id }) => id === desired.id)) result.set(desired.id, targetWithRevision(desired, nextRevision));
  }
  const resultDefinitions = [...result.values()].sort((left, right) => left.id.localeCompare(right.id));
  const resultingRegistry = buildContentRegistry(resultDefinitions);
  if (!resultingRegistry.report.valid) fail('content_release_registry_invalid');
  assertCookingRegistryCompatibility(resultingRegistry.registry);
  const resultHash = definitionsHash(resultDefinitions);
  const targetHash = definitionsHash(target);
  const mutationSuffix = `${args.capture.head.revision}.${targetHash}`;
  return {
    format: CONTENT_HEAD_CANDIDATE_FORMAT,
    database: args.capture.database,
    capturedAt: args.capture.capturedAt,
    captureSha256: args.captureSha256,
    reviewer: args.reviewer,
    changeRequest: args.changeRequest.trim(),
    reviewedAt: args.reviewedAt,
    baseline,
    baselineDefinitions: base,
    expectedHead: args.capture.head,
    expectedDefinitions: args.capture.definitions,
    targetBootstrap: {
      contentHash: targetHash, definitionCount: target.length, engineVersion: CONTENT_ENGINE_VERSION,
    },
    resultingHead: {
      revision: nextRevision,
      contentHash: resultHash,
      definitionCount: resultDefinitions.length,
      engineVersion: CONTENT_ENGINE_VERSION,
    },
    clientMutationId: `release.content.${mutationSuffix}`,
    note: `Reviewed bootstrap compatibility adoption: ${args.changeRequest.trim()}`,
    upserts: upserts.sort((left, right) => left.id.localeCompare(right.id)),
    deletes: [],
    preservedCustomIds,
    retainedRemovedBootstrapIds,
    targetDefinitions: target,
  };
}

export function parseContentHeadCandidate(value: unknown): ContentHeadCandidate {
  const source = record(value, 'content_release_candidate_invalid');
  if (source['format'] !== CONTENT_HEAD_CANDIDATE_FORMAT) fail('content_release_candidate_format');
  const capture = parseContentHeadCapture({
    format: CONTENT_HEAD_CAPTURE_FORMAT,
    database: source['database'],
    capturedAt: source['capturedAt'],
    head: source['expectedHead'],
    definitions: source['expectedDefinitions'],
  });
  const baselineSource = record(source['baseline'], 'content_release_candidate_invalid');
  const baselineKind = baselineSource['kind'];
  if (baselineKind !== 'pristine-bootstrap-head' && baselineKind !== 'prior-approved-candidate') {
    fail('content_release_candidate_invalid');
  }
  const targetSource = record(source['targetBootstrap'], 'content_release_candidate_invalid');
  const resultingSource = record(source['resultingHead'], 'content_release_candidate_invalid');
  const upsertsSource = source['upserts'];
  if (!Array.isArray(upsertsSource) || !Array.isArray(source['deletes']) || source['deletes'].length !== 0) {
    fail('content_release_deletes_forbidden');
  }
  const upserts = upsertsSource.map((value) => {
    const entry = record(value, 'content_release_candidate_invalid');
    return { id: textValue(entry['id'], 'content_release_candidate_invalid'),
      kind: textValue(entry['kind'], 'content_release_candidate_invalid'),
      json: textValue(entry['json'], 'content_release_candidate_invalid') };
  }).sort((left, right) => left.id.localeCompare(right.id));
  const strings = (value: unknown): readonly string[] => {
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')) fail('content_release_candidate_invalid');
    return [...value as string[]].sort();
  };
  const targetDefinitions = sortedUniqueDefinitions(source['targetDefinitions']);
  const baselineDefinitions = sortedUniqueDefinitions(source['baselineDefinitions']);
  const candidate: ContentHeadCandidate = {
    format: CONTENT_HEAD_CANDIDATE_FORMAT,
    database: capture.database,
    capturedAt: capture.capturedAt,
    captureSha256: textValue(source['captureSha256'], 'content_release_candidate_invalid'),
    reviewer: textValue(source['reviewer'], 'content_release_candidate_invalid'),
    changeRequest: textValue(source['changeRequest'], 'content_release_candidate_invalid'),
    reviewedAt: textValue(source['reviewedAt'], 'content_release_candidate_invalid'),
    baseline: {
      kind: baselineKind,
      contentHash: textValue(baselineSource['contentHash'], 'content_release_candidate_invalid'),
      definitionCount: integer(baselineSource['definitionCount'], 'content_release_candidate_invalid'),
      ...(baselineSource['candidateSha256'] === undefined ? {} : {
        candidateSha256: textValue(baselineSource['candidateSha256'], 'content_release_candidate_invalid'),
      }),
    },
    baselineDefinitions,
    expectedHead: capture.head,
    expectedDefinitions: capture.definitions,
    targetBootstrap: {
      contentHash: textValue(targetSource['contentHash'], 'content_release_candidate_invalid'),
      definitionCount: integer(targetSource['definitionCount'], 'content_release_candidate_invalid'),
      engineVersion: integer(targetSource['engineVersion'], 'content_release_candidate_invalid'),
    },
    resultingHead: {
      revision: textValue(resultingSource['revision'], 'content_release_candidate_invalid'),
      contentHash: textValue(resultingSource['contentHash'], 'content_release_candidate_invalid'),
      definitionCount: integer(resultingSource['definitionCount'], 'content_release_candidate_invalid'),
      engineVersion: integer(resultingSource['engineVersion'], 'content_release_candidate_invalid'),
    },
    clientMutationId: textValue(source['clientMutationId'], 'content_release_candidate_invalid'),
    note: textValue(source['note'], 'content_release_candidate_invalid'),
    upserts,
    deletes: [],
    preservedCustomIds: strings(source['preservedCustomIds']),
    retainedRemovedBootstrapIds: strings(source['retainedRemovedBootstrapIds']),
    targetDefinitions,
  };
  if (!SHA256.test(candidate.captureSha256) || !LABEL.test(candidate.reviewer)
    || !/^\d+$/u.test(candidate.resultingHead.revision)
    || new Set(upserts.map(({ id }) => id)).size !== upserts.length) fail('content_release_candidate_invalid');
  verifyCandidateStructure(candidate);
  return candidate;
}

function verifyCandidateStructure(candidate: ContentHeadCandidate): void {
  const target = candidate.targetDefinitions;
  if (candidate.baseline.definitionCount !== candidate.baselineDefinitions.length
    || candidate.baseline.contentHash !== definitionsHash(candidate.baselineDefinitions)) {
    fail('content_release_baseline_mismatch');
  }
  validateRegistry(candidate.baselineDefinitions, candidate.baseline.contentHash);
  if (candidate.targetBootstrap.definitionCount !== target.length
    || candidate.targetBootstrap.contentHash !== definitionsHash(target)) fail('content_release_target_mismatch');
  validateRegistry(target, candidate.targetBootstrap.contentHash);
  const currentById = new Map(candidate.expectedDefinitions.map((definition) => [definition.id, definition]));
  const baseById = new Map(candidate.baselineDefinitions.map((definition) => [definition.id, definition]));
  const expectedUpsertIds: string[] = [];
  for (const desired of target) {
    const current = currentById.get(desired.id);
    const base = baseById.get(desired.id);
    if (sameDefinition(current, desired)) continue;
    if ((base === undefined && current === undefined) || sameDefinition(current, base)) {
      expectedUpsertIds.push(desired.id);
      continue;
    }
    fail(`content_release_custom_conflict:${desired.id}`);
  }
  if (expectedUpsertIds.length === 0
    && candidate.expectedHead.engineVersion !== candidate.targetBootstrap.engineVersion) {
    const forced = target.find((definition) => sameDefinition(currentById.get(definition.id), definition));
    if (forced === undefined) fail('content_release_engine_advance_requires_safe_upsert');
    expectedUpsertIds.push(forced.id);
  }
  if (JSON.stringify(candidate.upserts.map(({ id }) => id)) !== JSON.stringify(expectedUpsertIds)) {
    fail('content_release_upsert_set_mismatch');
  }
  const result = new Map(candidate.expectedDefinitions.map((definition) => [definition.id, definition]));
  for (const upsert of candidate.upserts) {
    const desired = target.find(({ id }) => id === upsert.id);
    if (desired === undefined || desired.kind !== upsert.kind || desired.json !== upsert.json) {
      fail('content_release_upsert_not_bootstrap');
    }
    result.set(upsert.id, targetWithRevision(desired, candidate.resultingHead.revision));
  }
  const definitions = [...result.values()].sort((left, right) => left.id.localeCompare(right.id));
  if (candidate.resultingHead.definitionCount !== definitions.length
    || candidate.resultingHead.contentHash !== definitionsHash(definitions)) {
    fail('content_release_result_mismatch');
  }
  if (candidate.resultingHead.engineVersion !== candidate.targetBootstrap.engineVersion) {
    fail('content_release_engine_version_mismatch');
  }
  const baselineIds = new Set(candidate.baselineDefinitions.map(({ id }) => id));
  const targetIds = new Set(candidate.targetDefinitions.map(({ id }) => id));
  const actualCustom = candidate.expectedDefinitions.filter(({ id }) => !baselineIds.has(id) && !targetIds.has(id))
    .map(({ id }) => id).sort();
  if (JSON.stringify(actualCustom) !== JSON.stringify(candidate.preservedCustomIds)) {
    fail('content_release_preservation_manifest_mismatch');
  }
  const actualRetained = candidate.expectedDefinitions.filter(({ id }) => baselineIds.has(id) && !targetIds.has(id))
    .map(({ id }) => id).sort();
  if (JSON.stringify(actualRetained) !== JSON.stringify(candidate.retainedRemovedBootstrapIds)) {
    fail('content_release_retained_manifest_mismatch');
  }
}

export function verifyCandidateAgainstBootstrap(candidate: ContentHeadCandidate): void {
  verifyCandidateStructure(candidate);
  const target = bootstrapDefinitions();
  if (candidate.targetBootstrap.engineVersion !== CONTENT_ENGINE_VERSION
    || candidate.targetBootstrap.definitionCount !== target.length
    || candidate.targetBootstrap.contentHash !== definitionsHash(target)
    || JSON.stringify(candidate.targetDefinitions) !== JSON.stringify(target)) {
    fail('content_release_local_bootstrap_changed');
  }
  const merged = new Map(candidate.expectedDefinitions.map((row) => [row.id, row]));
  for (const row of candidate.upserts) merged.set(row.id, {
    ...row, revision: candidate.resultingHead.revision,
    hash: contentDefinitionRowsHash([row]),
  });
  const resultingRegistry = buildContentRegistry([...merged.values()]);
  if (!resultingRegistry.report.valid) fail('content_release_registry_invalid');
  assertCookingRegistryCompatibility(resultingRegistry.registry);
}

async function readCanonicalArtifact(path: string, maximumBytes: number): Promise<{
  value: unknown; bytes: Buffer; digest: string; mode: number; uid: number;
}> {
  if (!isAbsolute(path)) fail('content_release_artifact_path_must_be_absolute');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maximumBytes) fail('content_release_artifact_invalid');
    const bytes = await handle.readFile();
    const value = JSON.parse(bytes.toString('utf8')) as unknown;
    if (!bytes.equals(canonicalArtifactBytes(value))) fail('content_release_artifact_not_canonical');
    return { value, bytes, digest: artifactSha256(bytes), mode: stat.mode & 0o777, uid: stat.uid };
  } finally { await handle.close(); }
}

async function writeExclusive(path: string, value: unknown, mode: number): Promise<void> {
  if (!isAbsolute(path)) fail('content_release_artifact_path_must_be_absolute');
  const handle = await open(path, 'wx', mode);
  try {
    await handle.writeFile(canonicalArtifactBytes(value));
    await handle.sync();
    await handle.chmod(mode);
  } finally { await handle.close(); }
}

async function readCredential(label: string): Promise<string> {
  if (!LABEL.test(label)) fail('content_release_owner_label_invalid');
  const path = process.env['WORLD_REJOIN_TOKENS_FILE'];
  if (path === undefined || !isAbsolute(path)) fail('WORLD_REJOIN_TOKENS_FILE_required');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || (stat.mode & 0o777) !== 0o600) fail('content_release_token_file_permissions');
    const credentials = parseStoredRejoinCredentials(JSON.parse(await handle.readFile('utf8')) as unknown);
    const credential = credentials.find((entry) => entry.label === label);
    if (credential?.token === undefined) fail('content_release_owner_token_missing_refresh_first');
    return credential.token;
  } finally { await handle.close(); }
}

function timeout<T>(label: string, promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}_timeout`)), TIMEOUT_MS);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error: unknown) => {
      clearTimeout(timer); reject(error);
    });
  });
}

async function connect(token: string): Promise<DbConnection> {
  const host = process.env['SPACETIMEDB_HOST'] ?? 'http://127.0.0.1:3000';
  const database = process.env['SPACETIMEDB_DATABASE'] ?? 'orchard-cellar-world';
  return timeout('content_release_connect', new Promise((resolve, reject) => {
    DbConnection.builder().withUri(host).withDatabaseName(database).withToken(token)
      .onConnect((connection) => resolve(connection))
      .onConnectError((_context, error) => reject(error)).build();
  }));
}

async function subscribe(connection: DbConnection): Promise<void> {
  await timeout('content_release_subscription', new Promise<void>((resolve, reject) => {
    connection.subscriptionBuilder().onApplied(() => resolve())
      .onError((context) => reject(new Error(String(context.event))))
      .subscribe([tables.contentHead.where((row) => row.packId.eq(LIVE_PACK)), tables.contentDefinition]);
  }));
}

function captureFromConnection(connection: DbConnection, database: string): ContentHeadCapture {
  const head = connection.db.contentHead.packId.find(LIVE_PACK);
  if (head === null) fail('content_release_live_head_missing');
  return parseContentHeadCapture({
    format: CONTENT_HEAD_CAPTURE_FORMAT,
    database,
    capturedAt: new Date().toISOString(),
    head: {
      packId: LIVE_PACK,
      revision: head.revision.toString(),
      contentHash: head.contentHash,
      engineVersion: head.engineVersion,
      definitionCount: head.definitionCount,
      clientMutationId: head.clientMutationId,
    },
    definitions: [...connection.db.contentDefinition.iter()].map((row) => ({
      id: row.id, kind: row.kind, revision: row.revision.toString(), hash: row.hash, json: row.json,
    })),
  });
}

function assertCapturedState(actual: ContentHeadCapture, candidate: ContentHeadCandidate): void {
  if (actual.database !== candidate.database
    || JSON.stringify(actual.head) !== JSON.stringify(candidate.expectedHead)
    || JSON.stringify(actual.definitions) !== JSON.stringify(candidate.expectedDefinitions)) {
    fail('content_release_live_head_changed');
  }
}

async function candidateFile(
  path: string,
  expectedDigest: string,
  requireCurrentBootstrap = true,
): Promise<ContentHeadCandidate> {
  if (!SHA256.test(expectedDigest)) fail('content_release_candidate_digest_invalid');
  const artifact = await readCanonicalArtifact(path, 16 * 1024 * 1024);
  const currentUid = process.getuid?.();
  if (artifact.mode !== 0o400 || (currentUid !== undefined && artifact.uid !== currentUid)) {
    fail('content_release_candidate_must_be_owner_immutable');
  }
  if (artifact.digest !== expectedDigest) fail('content_release_candidate_digest_mismatch');
  const candidate = parseContentHeadCandidate(artifact.value);
  if (requireCurrentBootstrap) verifyCandidateAgainstBootstrap(candidate);
  return candidate;
}

async function remoteState(candidate: ContentHeadCandidate, ownerLabel: string): Promise<{ connection: DbConnection; capture: ContentHeadCapture }> {
  if (candidate.reviewer === ownerLabel) fail('content_release_independent_reviewer_required');
  const token = await readCredential(ownerLabel);
  const connection = await connect(token);
  await subscribe(connection);
  return { connection, capture: captureFromConnection(connection,
    process.env['SPACETIMEDB_DATABASE'] ?? 'orchard-cellar-world') };
}

async function waitForResultHead(connection: DbConnection, candidate: ContentHeadCandidate): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const deadline = Date.now() + TIMEOUT_MS;
    const poll = (): void => {
      const head = connection.db.contentHead.packId.find(LIVE_PACK);
      if (head?.revision.toString() === candidate.resultingHead.revision
        && head.contentHash === candidate.resultingHead.contentHash
        && head.definitionCount === candidate.resultingHead.definitionCount
        && head.engineVersion === candidate.resultingHead.engineVersion) {
        resolve();
        return;
      }
      if (Date.now() >= deadline) {
        reject(new Error('content_release_head_observation_timeout'));
        return;
      }
      setTimeout(poll, 10);
    };
    poll();
  });
}

async function main(): Promise<void> {
  const [mode, first, second, third] = process.argv.slice(2);
  if (mode === 'capture' && first !== undefined && second === undefined) {
    const label = process.env['CONTENT_HEAD_CAPTURE_LABEL'];
    if (label === undefined) fail('CONTENT_HEAD_CAPTURE_LABEL_required');
    const token = await readCredential(label);
    const connection = await connect(token);
    try {
      await subscribe(connection);
      const database = process.env['SPACETIMEDB_DATABASE'] ?? 'orchard-cellar-world';
      const capture = captureFromConnection(connection, database);
      await writeExclusive(first, capture, 0o600);
      process.stdout.write(`${artifactSha256(canonicalArtifactBytes(capture))}\n`);
    } finally { connection.disconnect(); }
    return;
  }
  if (mode === 'prepare' && first !== undefined && second !== undefined && third === undefined) {
    const reviewer = process.env['CONTENT_HEAD_REVIEWER'];
    const changeRequest = process.env['CONTENT_HEAD_CHANGE_REQUEST'];
    if (reviewer === undefined || changeRequest === undefined) fail('content_release_review_environment_required');
    const captureArtifact = await readCanonicalArtifact(first, 16 * 1024 * 1024);
    const currentUid = process.getuid?.();
    if (captureArtifact.mode !== 0o600 || (currentUid !== undefined && captureArtifact.uid !== currentUid)) {
      fail('content_release_capture_must_be_owner_private');
    }
    const capture = parseContentHeadCapture(captureArtifact.value);
    const priorPath = process.env['CONTENT_HEAD_BASE_CANDIDATE'];
    const priorDigest = process.env['CONTENT_HEAD_BASE_CANDIDATE_SHA256'];
    let priorCandidate: ContentHeadCandidate | undefined;
    if (priorPath !== undefined) priorCandidate = await candidateFile(priorPath, priorDigest ?? '', false);
    const candidate = prepareContentHeadCandidate({
      capture, captureSha256: captureArtifact.digest, reviewer, changeRequest,
      reviewedAt: new Date().toISOString(), priorCandidate, priorCandidateSha256: priorDigest,
    });
    await writeExclusive(second, candidate, 0o400);
    process.stdout.write(`${artifactSha256(canonicalArtifactBytes(candidate))}\n`);
    return;
  }
  if (['verify', 'assert-current', 'apply'].includes(mode ?? '')
    && first !== undefined && second !== undefined && third !== undefined) {
    const candidate = await candidateFile(first, second);
    if (candidate.database !== (process.env['SPACETIMEDB_DATABASE'] ?? 'orchard-cellar-world')) {
      fail('content_release_database_mismatch');
    }
    if (!LABEL.test(third)) fail('content_release_owner_label_invalid');
    if (mode === 'verify') {
      if (candidate.reviewer === third) fail('content_release_independent_reviewer_required');
      process.stdout.write(`${JSON.stringify({ ok: true, mode, digest: second,
        expectedRevision: candidate.expectedHead.revision, targetHash: candidate.targetBootstrap.contentHash,
        resultHash: candidate.resultingHead.contentHash, upserts: candidate.upserts.length,
        preserved: candidate.preservedCustomIds.length + candidate.retainedRemovedBootstrapIds.length })}\n`);
      return;
    }
    const state = await remoteState(candidate, third);
    try {
      assertCapturedState(state.capture, candidate);
      if (mode === 'apply' && candidate.upserts.length > 0) {
        const expectedConfirmation = `publish:${second}:${candidate.database}`;
        if (process.env['CONTENT_HEAD_RELEASE_CONFIRM'] !== expectedConfirmation) {
          fail(`content_release_confirmation_required:${expectedConfirmation}`);
        }
        await timeout('content_release_publish', state.connection.reducers.publishContentChangeSet({
          packId: LIVE_PACK,
          expectedRevision: BigInt(candidate.expectedHead.revision),
          clientMutationId: candidate.clientMutationId,
          upserts: JSON.stringify(candidate.upserts),
          deletes: '[]',
          note: candidate.note,
        }));
        await waitForResultHead(state.connection, candidate);
        const after = captureFromConnection(state.connection, candidate.database);
        if (after.head.revision !== candidate.resultingHead.revision
          || after.head.contentHash !== candidate.resultingHead.contentHash
          || after.head.definitionCount !== candidate.resultingHead.definitionCount
          || after.head.engineVersion !== candidate.resultingHead.engineVersion) {
          fail('content_release_post_publish_head_mismatch');
        }
      }
      process.stdout.write(`${JSON.stringify({ ok: true, mode, revision: candidate.resultingHead.revision,
        contentHash: candidate.resultingHead.contentHash, upserts: candidate.upserts.length })}\n`);
    } finally { state.connection.disconnect(); }
    return;
  }
  fail('usage: content-head-release <capture OUT|prepare CAPTURE OUT|verify|assert-current|apply CANDIDATE SHA256 OWNER_LABEL>');
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) await main();

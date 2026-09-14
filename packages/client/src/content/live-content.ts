import {
  bootstrapContentRows,
  buildContentRegistry,
  contentDefinitionRowsHash,
  type ContentDefinitionRow,
  type ContentRegistry,
} from '@orchard/sim';

export const CLIENT_CONTENT_ENGINE_VERSION = 1 as const;
export const LIVE_CONTENT_PACK_ID = 'live' as const;

export interface LiveContentHead {
  readonly packId: string;
  readonly revision: bigint;
  readonly contentHash: string;
  readonly engineVersion: number;
  readonly definitionCount: number;
}

export interface LiveContentRow extends ContentDefinitionRow {
  readonly revision?: bigint;
  readonly hash?: string;
}

export interface ContentDraftOverlay {
  readonly upserts: readonly ContentDefinitionRow[];
  readonly deletes: readonly string[];
}

export type LiveContentSource = 'bootstrap' | 'cache' | 'live' | 'draft';
export type LiveContentStatus = 'waiting' | 'ready' | 'engine_update_required' | 'invalid';

export interface LiveContentState {
  readonly source: LiveContentSource;
  readonly status: LiveContentStatus;
  readonly head: LiveContentHead | null;
  readonly registry: ContentRegistry;
  readonly issues: readonly string[];
}

interface StoredContentCache {
  readonly schemaVersion: 1;
  readonly head: Omit<LiveContentHead, 'revision'> & { readonly revision: string };
  readonly rows: readonly ContentDefinitionRow[];
}

export interface ContentStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function bootstrapState(): LiveContentState {
  const result = buildContentRegistry(bootstrapContentRows());
  if (!result.report.valid) throw new Error('bootstrap_content_registry_invalid');
  return Object.freeze({
    source: 'bootstrap', status: 'waiting', head: null,
    registry: result.registry, issues: Object.freeze([]),
  });
}

function issueCodes(rows: readonly ContentDefinitionRow[]): {
  readonly registry: ContentRegistry;
  readonly issues: readonly string[];
} {
  const result = buildContentRegistry(rows);
  return {
    registry: result.registry,
    issues: Object.freeze(result.report.errors.map(({ code, definitionId }) =>
      definitionId === undefined ? code : `${code}:${definitionId}`)),
  };
}

function verifiedState(
  source: Extract<LiveContentSource, 'cache' | 'live'>,
  head: LiveContentHead,
  rows: readonly ContentDefinitionRow[],
  fallback: LiveContentState,
): LiveContentState {
  if (head.packId !== LIVE_CONTENT_PACK_ID) {
    return Object.freeze({ ...fallback, source, status: 'invalid', head, issues: Object.freeze(['content_pack_not_live']) });
  }
  if (head.engineVersion !== CLIENT_CONTENT_ENGINE_VERSION) {
    return Object.freeze({
      ...fallback, source, status: 'engine_update_required', head,
      issues: Object.freeze([`content_engine_version:${head.engineVersion}`]),
    });
  }
  const built = issueCodes(rows);
  const issues = [...built.issues];
  if (rows.length !== head.definitionCount) issues.push('content_definition_count_mismatch');
  // The authority head fingerprints persisted payloads. Parsing may add
  // compatibility defaults (for example an absent item onUse becomes []),
  // which changes the runtime projection without changing the stored pack.
  // Verify the original representation and independently keep every semantic
  // validation above; neither a parser upgrade nor a draft can replace it.
  try {
    if (contentDefinitionRowsHash(rows) !== head.contentHash) issues.push('content_hash_mismatch');
  } catch {
    issues.push('content_payload_hash_invalid');
  }
  if (issues.length > 0) {
    return Object.freeze({ ...fallback, source, status: 'invalid', head, issues: Object.freeze(issues) });
  }
  return Object.freeze({ source, status: 'ready', head, registry: built.registry, issues: Object.freeze([]) });
}

function cacheHead(head: LiveContentHead): StoredContentCache['head'] {
  return { ...head, revision: head.revision.toString() };
}

function parseCache(source: string): { readonly head: LiveContentHead; readonly rows: readonly ContentDefinitionRow[] } {
  const parsed = JSON.parse(source) as Partial<StoredContentCache>;
  if (parsed.schemaVersion !== 1 || parsed.head === undefined || !Array.isArray(parsed.rows)) {
    throw new Error('content_cache_schema_invalid');
  }
  const head = parsed.head;
  if (head.packId !== LIVE_CONTENT_PACK_ID
    || typeof head.revision !== 'string'
    || typeof head.contentHash !== 'string'
    || typeof head.engineVersion !== 'number'
    || typeof head.definitionCount !== 'number') throw new Error('content_cache_head_invalid');
  return {
    head: { ...head, revision: BigInt(head.revision) },
    rows: parsed.rows,
  };
}

/** Owns the last fully verified content revision. Partial subscription updates,
 * corrupt caches, and incompatible engine revisions never replace that snapshot. */
export class LiveContentRegistry {
  readonly #storage: ContentStorage | null;
  readonly #storageKey: string;
  #state: LiveContentState = bootstrapState();
  #liveRows: readonly ContentDefinitionRow[] = bootstrapContentRows();

  constructor(scope: string, storage: ContentStorage | null = typeof localStorage === 'undefined' ? null : localStorage) {
    this.#storage = storage;
    this.#storageKey = `orchard:content:${scope}:v1`;
    this.#restoreCache();
  }

  get state(): LiveContentState { return this.#state; }
  get liveRows(): readonly ContentDefinitionRow[] { return this.#liveRows; }

  update(head: LiveContentHead | null, rows: readonly LiveContentRow[]): LiveContentState {
    if (head === null) {
      this.#state = Object.freeze({ ...this.#state, status: 'invalid', issues: Object.freeze(['content_head_missing']) });
      return this.#state;
    }
    const normalized = Object.freeze(rows.map(({ id, kind, slug, json }) => ({ id, kind, slug, json })));
    const next = verifiedState('live', head, normalized, this.#state);
    this.#state = next;
    if (next.status === 'ready') {
      this.#liveRows = normalized;
      this.#persist(head, normalized);
    }
    return next;
  }

  withDraft(overlay: ContentDraftOverlay | null): LiveContentState {
    if (overlay === null) return this.#state;
    const rows = new Map(this.#liveRows.map((row) => [row.id, row] as const));
    for (const id of overlay.deletes) rows.delete(id);
    for (const row of overlay.upserts) rows.set(row.id, row);
    const built = issueCodes([...rows.values()]);
    return Object.freeze({
      source: 'draft',
      status: built.issues.length === 0 ? 'ready' : 'invalid',
      head: this.#state.head,
      registry: built.issues.length === 0 ? built.registry : this.#state.registry,
      issues: built.issues,
    });
  }

  #restoreCache(): void {
    if (this.#storage === null) return;
    try {
      const source = this.#storage.getItem(this.#storageKey);
      if (source === null) return;
      const cached = parseCache(source);
      const next = verifiedState('cache', cached.head, cached.rows, this.#state);
      if (next.status !== 'ready') throw new Error(next.issues.join(','));
      this.#state = next;
      this.#liveRows = cached.rows;
    } catch {
      try { this.#storage.removeItem(this.#storageKey); } catch { /* unavailable storage is non-fatal */ }
    }
  }

  #persist(head: LiveContentHead, rows: readonly ContentDefinitionRow[]): void {
    if (this.#storage === null) return;
    try {
      const value: StoredContentCache = { schemaVersion: 1, head: cacheHead(head), rows };
      this.#storage.setItem(this.#storageKey, JSON.stringify(value));
    } catch { /* an in-memory verified revision remains usable */ }
  }
}

import {
  bootstrapContentRows,
  buildContentRegistry,
  contentDefinitionRowsHash,
  type ContentDefinitionRow,
  type ContentRegistry,
} from '@orchard/sim';

export interface ContentHeadSnapshot {
  readonly packId: string;
  readonly revision: bigint;
  readonly contentHash: string;
}

export interface CachedContentRegistry {
  readonly key: string;
  readonly revision: bigint;
  readonly contentHash: string;
  readonly registry: ContentRegistry;
}

let moduleContentRegistryCache: CachedContentRegistry | null = null;

/** The authority cache is keyed by both monotonic revision and durable payload hash.
 * A row provider reads from the same transaction as head, only on a cache miss.
 * Atomic content publication changes the head and explicitly invalidates this
 * cache; unchanged heads have already passed payload validation and hashing.
 * Tests may pass null to exercise the compiled bootstrap fallback. */
export function contentRegistryForRows(
  head: ContentHeadSnapshot | null,
  rows: readonly ContentDefinitionRow[] | (() => readonly ContentDefinitionRow[]),
): CachedContentRegistry {
  const durableKey = head === null ? null : `${head.packId}:${head.revision}:${head.contentHash}`;
  if (durableKey !== null && moduleContentRegistryCache?.key === durableKey) {
    return moduleContentRegistryCache;
  }
  if (head === null && moduleContentRegistryCache?.key.startsWith('bootstrap:0:') === true) {
    return moduleContentRegistryCache;
  }
  const source = head === null ? bootstrapContentRows()
    : typeof rows === 'function' ? rows() : rows;
  const built = buildContentRegistry(source);
  if (!built.report.valid) {
    throw new Error(`content_registry_invalid:${built.report.errors[0]?.code ?? 'unknown'}`);
  }
  if (head !== null && contentDefinitionRowsHash(source) !== head.contentHash) {
    throw new Error('content_registry_hash_mismatch');
  }
  const revision = head?.revision ?? 0n;
  const contentHash = head?.contentHash ?? built.registry.contentHash;
  const key = durableKey ?? `bootstrap:${revision}:${contentHash}`;
  moduleContentRegistryCache = Object.freeze({ key, revision, contentHash, registry: built.registry });
  return moduleContentRegistryCache;
}

export function invalidateContentRegistryCache(): void {
  moduleContentRegistryCache = null;
}

import { contentDefinitionRowsHash } from '@orchard/sim';
import type { StoredContentDefinition } from './contracts.js';

export interface ContentIntegrityHead {
  readonly revision: bigint;
  readonly contentHash: string;
  readonly definitionCount: number;
}

/** Verify historical bytes without applying the current gameplay schema. */
export function assertContentIntegrity(head: ContentIntegrityHead, rows: readonly StoredContentDefinition[]): void {
  if (rows.length !== head.definitionCount || new Set(rows.map(row => row.id)).size !== rows.length) {
    throw new Error('content_registry_count_mismatch');
  }
  for (const row of rows) {
    let payload: unknown;
    try { payload = JSON.parse(row.json); } catch { throw new Error('content_registry_payload_invalid'); }
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)
      || !('id' in payload) || payload.id !== row.id || !('kind' in payload) || payload.kind !== row.kind) {
      throw new Error('content_registry_identity_mismatch');
    }
    if (row.revision < 1n || row.revision > head.revision || contentDefinitionRowsHash([row]) !== row.hash) {
      throw new Error('content_registry_row_hash_mismatch');
    }
  }
  if (contentDefinitionRowsHash(rows) !== head.contentHash) throw new Error('content_registry_hash_mismatch');
}

/** Existing editors can repair incompatible content without initializing a
 * gameplay session. Authentication, membership and grants are checked by the
 * supplied authority guard; corruption and unrelated failures never qualify. */
export function contentRecoveryConnection(args: {
  readonly validateRuntime: () => unknown;
  readonly requireEditor: () => void;
  readonly verifyIntegrity: () => void;
}): boolean {
  try { args.validateRuntime(); return false; }
  catch (error) {
    if (!(error instanceof Error) || !error.message.startsWith('content_registry_invalid:')) throw error;
    args.requireEditor();
    args.verifyIntegrity();
    return true;
  }
}

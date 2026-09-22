import {
  mapDocumentV3Hash,
  type MapDocumentV3,
} from '@orchard/sim';

/** A short quiet period coalesces terrain strokes and rapid object operations
 * without turning pointer movement into a stream of authority writes. */
export const EDITOR_LIVE_SYNC_DEBOUNCE_MS = 250;

/** Authority revisions are transport metadata, not authored map semantics.
 * Comparing a checked-out draft with an acknowledged head must therefore pin
 * the revision before hashing; otherwise two or more local commands can never
 * match the single revision assigned by the publish transaction. */
const semanticHashes = new WeakMap<MapDocumentV3, string>();
export function editorMapSemanticHash(document: MapDocumentV3): string {
  let hash = semanticHashes.get(document);
  if (hash === undefined) {
    hash = mapDocumentV3Hash({...document, revision: 0});
    semanticHashes.set(document, hash);
  }
  return hash;
}

export interface EditorLivePublishSnapshot {
  readonly baseRevision: number;
  readonly semanticHash: string;
}

export function parseEditorLiveBaseRevision(source: string | null): number | null {
  if (source === null || source.trim() === '') return null;
  const revision = Number(source);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : null;
}

export type EditorLiveRevisionResolution =
  | { readonly kind: 'published_current' }
  | { readonly kind: 'published_with_newer_local_changes' }
  | { readonly kind: 'conflict' };

/** Classify an incoming live head while one editor snapshot is in flight.
 * Acknowledging the submitted hash must not replace newer local edits made
 * while the reducer transaction was travelling to the server. */
export function resolveEditorLiveRevision(
  publishing: EditorLivePublishSnapshot,
  remoteRevision: number,
  remoteSemanticHash: string,
  localSemanticHash: string,
): EditorLiveRevisionResolution {
  if (remoteRevision !== publishing.baseRevision + 1
    || remoteSemanticHash !== publishing.semanticHash) return { kind: 'conflict' };
  return localSemanticHash === remoteSemanticHash
    ? { kind: 'published_current' }
    : { kind: 'published_with_newer_local_changes' };
}

import { describe, expect, it } from 'vitest';
import {
  editorMapSemanticHash,
  parseEditorLiveBaseRevision,
  resolveEditorLiveRevision,
} from './live-sync.js';
import { createLiveIslandMapDocument, normalizeMapDocumentV3 } from '@orchard/sim';

describe('editor live sync', () => {
  const publishing = { baseRevision: 7, semanticHash: 'submitted' } as const;

  it('acknowledges the submitted snapshot when it is still the current draft', () => {
    expect(resolveEditorLiveRevision(publishing, 8, 'submitted', 'submitted')).toEqual({
      kind: 'published_current',
    });
  });

  it('hashes authored semantics independently of the authority revision', () => {
    const document = createLiveIslandMapDocument();
    expect(editorMapSemanticHash(document)).toBe(editorMapSemanticHash(
      normalizeMapDocumentV3({ ...document, revision: 91 }),
    ));
  });

  it('keeps and queues edits made while the submitted snapshot was in flight', () => {
    expect(resolveEditorLiveRevision(publishing, 8, 'submitted', 'newer-local')).toEqual({
      kind: 'published_with_newer_local_changes',
    });
  });

  it('treats a different revision or semantic head as a concurrent conflict', () => {
    expect(resolveEditorLiveRevision(publishing, 9, 'submitted', 'submitted')).toEqual({
      kind: 'conflict',
    });
    expect(resolveEditorLiveRevision(publishing, 8, 'other', 'submitted')).toEqual({
      kind: 'conflict',
    });
  });

  it('restores only explicit non-negative server base revisions', () => {
    expect(parseEditorLiveBaseRevision(null)).toBeNull();
    expect(parseEditorLiveBaseRevision('')).toBeNull();
    expect(parseEditorLiveBaseRevision('-1')).toBeNull();
    expect(parseEditorLiveBaseRevision('1.5')).toBeNull();
    expect(parseEditorLiveBaseRevision('0')).toBe(0);
    expect(parseEditorLiveBaseRevision('42')).toBe(42);
  });
});

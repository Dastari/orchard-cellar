import {
  applyMapDocumentDelta, mapDocumentSemanticHash, parseMapDocumentDelta,
  type MapDocumentV3,
} from '@orchard/sim';

export const LIVE_MAP_MAX_DOCUMENT_CHARACTERS = 4_000_000;

interface LiveMapPublicationHead {
  readonly revision: number;
  readonly clientMutationId: string;
  readonly document: MapDocumentV3;
}

/** Pure preparation inside the reducer transaction. No writes occur until all
 * checks pass. null acknowledges an identical already-committed delta retry. */
export function prepareLiveMapPublication(
  payload: string,
  expectedRevision: number,
  clientMutationId: string,
  head: () => LiveMapPublicationHead | null,
  validate: (documentJson: string) => MapDocumentV3,
): MapDocumentV3 | null {
  if (payload.length < 2 || payload.length > LIVE_MAP_MAX_DOCUMENT_CHARACTERS) {
    throw new Error('invalid_live_map_size');
  }
  let value: unknown;
  try { value = JSON.parse(payload); } catch { throw new Error('invalid_live_map_document'); }
  if (typeof value !== 'object' || value === null || !('mapDeltaVersion' in value)) {
    return validate(payload); // Legacy exports/imports retain snapshot semantics.
  }
  const delta = parseMapDocumentDelta(value);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,95}$/u.test(clientMutationId)) {
    throw new Error('invalid_live_map_mutation_id');
  }
  const current = head();
  if (current === null) throw new Error('live_map_delta_base_unavailable');
  if (current.clientMutationId === clientMutationId) {
    if (mapDocumentSemanticHash(current.document) === delta.targetHash) return null;
    throw new Error('live_map_mutation_id_reused');
  }
  if (current.revision !== expectedRevision) throw new Error('live_map_revision_conflict');
  const documentJson = applyMapDocumentDelta(current.document, delta);
  if (documentJson.length > LIVE_MAP_MAX_DOCUMENT_CHARACTERS) throw new Error('invalid_live_map_size');
  const document = validate(documentJson);
  if (mapDocumentSemanticHash(document) !== delta.targetHash) throw new Error('live_map_delta_target_mismatch');
  return document;
}

import {
  parseMapDocumentV3,
  serializeMapDocumentV3,
  type MapDocumentV3,
} from '@orchard/sim';

/** Mirrors the authoritative live-map ingestion ceiling. Export deliberately
 * cannot raise this bound: an exported draft should remain small enough to be
 * inspected and handed to the normal validation/publish pipeline. */
export const MAP_DOCUMENT_EXPORT_MAX_CHARACTERS = 4_000_000;
export const MAP_DOCUMENT_EXPORT_MAX_BYTES = 16_000_000;
export const MAP_DOCUMENT_EXPORT_MAX_PREFABS = 2_048;
export const MAP_DOCUMENT_EXPORT_MAX_OBJECTS = 50_000;
export const MAP_DOCUMENT_EXPORT_MAX_OVERRIDES = 250_000;
export const MAP_DOCUMENT_EXPORT_MAX_ANCHORS = 4_096;

const MAP_DOCUMENT_EXPORT_MEDIA_TYPE = 'application/json';
const MAP_DOCUMENT_EXPORT_STEM_CODE_POINTS = 80;
const WINDOWS_RESERVED_FILENAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu;
const PORTABLE_MAP_ID = /^[a-z0-9][a-z0-9-]{0,63}$/u;

export type MapDocumentExportErrorCode =
  | 'invalid_limit'
  | 'content_limit_exceeded'
  | 'serialization_failed'
  | 'document_invalid'
  | 'size_limit_exceeded'
  | 'blob_failed';

export interface MapDocumentExportError {
  readonly code: MapDocumentExportErrorCode;
  readonly message: string;
}

export interface MapDocumentExportPayload {
  readonly filename: string;
  readonly mediaType: typeof MAP_DOCUMENT_EXPORT_MEDIA_TYPE;
  readonly json: string;
  readonly blob: Blob;
  readonly characterLength: number;
  readonly byteLength: number;
}

export type MapDocumentExportResult =
  | { readonly ok: true; readonly payload: MapDocumentExportPayload }
  | { readonly ok: false; readonly error: MapDocumentExportError };

export interface MapDocumentExportOptions {
  readonly filenameHint?: string;
  /** Tests and constrained callers may lower, but never raise, hard limits. */
  readonly maximumCharacters?: number;
  readonly maximumBytes?: number;
}

function failure(code: MapDocumentExportErrorCode, message: string): MapDocumentExportResult {
  return { ok: false, error: { code, message } };
}

function effectiveLimit(candidate: number | undefined, ceiling: number): number | null {
  if (candidate === undefined) return ceiling;
  if (!Number.isSafeInteger(candidate) || candidate <= 0) return null;
  return Math.min(candidate, ceiling);
}

function sanitizedStem(candidate: string): string {
  const withoutExtension = candidate.replace(/(?:\.map)?\.json$/iu, '');
  const normalized = withoutExtension
    .normalize('NFKD')
    .replace(/\p{Mark}+/gu, '')
    .toLowerCase()
    .replace(/['’]+/gu, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^-|-$/gu, '');
  const bounded = [...normalized].slice(0, MAP_DOCUMENT_EXPORT_STEM_CODE_POINTS).join('')
    .replace(/-$/u, '');
  return WINDOWS_RESERVED_FILENAME.test(bounded) ? `map-${bounded}` : bounded;
}

/** Produces a portable leaf filename only: path separators, traversal,
 * controls, repeated extensions, and platform-reserved device names cannot
 * survive. Unicode letters and numbers remain readable. */
export function sanitizeMapDocumentExportFilename(
  candidate: string,
  fallback = 'orchard-map',
): string {
  const stem = sanitizedStem(candidate) || sanitizedStem(fallback) || 'orchard-map';
  return `${stem}.map.json`;
}

function contentLimitError(document: MapDocumentV3): MapDocumentExportResult | null {
  if (!PORTABLE_MAP_ID.test(document.id)) {
    return failure('document_invalid', 'Map export has an invalid portable map id.');
  }
  if (document.prefabs.length > MAP_DOCUMENT_EXPORT_MAX_PREFABS) {
    return failure('content_limit_exceeded', `Map export exceeds ${MAP_DOCUMENT_EXPORT_MAX_PREFABS} prefabs.`);
  }
  if (document.objects.length + document.landmarks.length > MAP_DOCUMENT_EXPORT_MAX_OBJECTS) {
    return failure('content_limit_exceeded', `Map export exceeds ${MAP_DOCUMENT_EXPORT_MAX_OBJECTS} objects and landmarks.`);
  }
  if (Object.keys(document.cells).length > MAP_DOCUMENT_EXPORT_MAX_OVERRIDES) {
    return failure('content_limit_exceeded', `Map export exceeds ${MAP_DOCUMENT_EXPORT_MAX_OVERRIDES} cell overrides.`);
  }
  if (document.anchors.length > MAP_DOCUMENT_EXPORT_MAX_ANCHORS) {
    return failure('content_limit_exceeded', `Map export exceeds ${MAP_DOCUMENT_EXPORT_MAX_ANCHORS} gameplay anchors.`);
  }
  return null;
}

/** Builds a download-ready payload without touching document/window or
 * triggering Canvas work. It is total over hostile runtime input: callers get
 * a bounded error value instead of an exception escaping an input handler. */
export function createMapDocumentExport(
  document: MapDocumentV3,
  options: MapDocumentExportOptions = {},
): MapDocumentExportResult {
  const maximumCharacters = effectiveLimit(
    options.maximumCharacters,
    MAP_DOCUMENT_EXPORT_MAX_CHARACTERS,
  );
  const maximumBytes = effectiveLimit(options.maximumBytes, MAP_DOCUMENT_EXPORT_MAX_BYTES);
  if (maximumCharacters === null || maximumBytes === null) {
    return failure('invalid_limit', 'Map export limits must be positive safe integers.');
  }

  let contentFailure: MapDocumentExportResult | null;
  try {
    contentFailure = contentLimitError(document);
  } catch {
    return failure('document_invalid', 'Map export document structure is invalid.');
  }
  if (contentFailure !== null) return contentFailure;

  let json: string;
  try {
    json = serializeMapDocumentV3(document);
  } catch {
    return failure('serialization_failed', 'Map export could not be serialized.');
  }
  if (json.length > maximumCharacters) {
    return failure(
      'size_limit_exceeded',
      `Map export is ${json.length} characters; the limit is ${maximumCharacters}.`,
    );
  }

  let parsed: MapDocumentV3;
  try {
    parsed = parseMapDocumentV3(json);
  } catch {
    return failure('document_invalid', 'Map export failed schema and reference validation.');
  }
  if (serializeMapDocumentV3(parsed) !== json) {
    return failure('document_invalid', 'Map export is not in deterministic canonical form.');
  }

  let blob: Blob;
  try {
    blob = new Blob([json], { type: MAP_DOCUMENT_EXPORT_MEDIA_TYPE });
  } catch {
    return failure('blob_failed', 'Map export could not create a JSON blob.');
  }
  if (blob.size > maximumBytes) {
    return failure(
      'size_limit_exceeded',
      `Map export is ${blob.size} bytes; the limit is ${maximumBytes}.`,
    );
  }

  const filenameHint = options.filenameHint
    ?? `${parsed.title || parsed.id}-r${parsed.revision}`;
  return {
    ok: true,
    payload: {
      filename: sanitizeMapDocumentExportFilename(filenameHint, parsed.id),
      mediaType: MAP_DOCUMENT_EXPORT_MEDIA_TYPE,
      json,
      blob,
      characterLength: json.length,
      byteLength: blob.size,
    },
  };
}

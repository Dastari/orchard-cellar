/** Dependency-free parser primitives shared by leaf definition readers. */
export const CONTENT_SCHEMA_VERSION = 1 as const;

export type ContentParseErrorCode =
  | 'invalid_json'
  | 'invalid_type'
  | 'invalid_id'
  | 'kind_mismatch'
  | 'unsupported_schema_version';

export class ContentParseError extends Error {
  readonly code: ContentParseErrorCode;
  readonly path: string;

  constructor(code: ContentParseErrorCode, path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'ContentParseError';
    this.code = code;
    this.path = path;
  }
}

/** The most slots a stored container may have for now: a placeable's `container.slotCount` and the hearth stash's
 * `stashCapacity`. Storage slot indices are still one byte until the container migration (wiki Roadmap/Uncapped
 * Storage, step 4), so content above this is refused. It is a technical ceiling, not a design cap. */
export const MAX_CONTAINER_CAPACITY = 256;

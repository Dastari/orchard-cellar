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

/** The most slots one container may have: a placeable's `container.slotCount`, the hearth stash's `stashCapacity` and
 * an equipped bag's `inventoryCapacity` (wiki Roadmap/Uncapped Storage, step 5). It is one shared technical and abuse
 * ceiling that bounds the work per reducer, not a design cap, and it equals the sparse cell layer's
 * `CONTAINER_CELL_CAPACITY_LIMIT`, so it can be raised without a schema change. Content above it is refused. */
export const MAX_CONTAINER_CAPACITY = 65_535;

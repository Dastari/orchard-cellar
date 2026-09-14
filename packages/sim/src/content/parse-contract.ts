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

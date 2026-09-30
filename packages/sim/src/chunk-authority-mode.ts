/**
 * The server's chunkAuthority switch as stored (static world S2a): the `chunkAuthority` key of the
 * public `space_admin_flag` row of space 0 (`flagsJson`). Absent or invalid values mean `on` (S3-final).
 *
 * Shared by the world module (`chunkAuthorityMode(ctx)`) and the client (BUG-053: the chunk
 * runtime follows the server switch), so both read the row exactly the same way. Generator-free leaf.
 */

export const CHUNK_AUTHORITY_MODES = ['off', 'shadow', 'on'] as const;
export type ChunkAuthorityMode = (typeof CHUNK_AUTHORITY_MODES)[number];

/** The space whose admin flag row carries the world-wide switch (topside). */
export const CHUNK_AUTHORITY_SPACE_ID = 0;
export const CHUNK_AUTHORITY_FLAG_KEY = 'chunkAuthority';
/** Static world S3-final: the published chunks are the only source, so a world with no flags (a fresh
 * database) serves them; `off` is an explicit maintenance freeze. */
export const CHUNK_AUTHORITY_DEFAULT_MODE: ChunkAuthorityMode = 'on';

type FlagObject = Readonly<Record<string, unknown>>;

export function parseChunkAuthorityMode(value: unknown): ChunkAuthorityMode | null {
  return typeof value === 'string' && (CHUNK_AUTHORITY_MODES as readonly string[]).includes(value)
    ? value as ChunkAuthorityMode
    : null;
}

/** Parses a stored flagsJson the same way the server's space flag reader does:
 * malformed or non-object JSON counts as no flags. */
export function parseSpaceFlagsJson(flagsJson: string | null | undefined): Record<string, unknown> {
  if (flagsJson === null || flagsJson === undefined) return {};
  try {
    const parsed: unknown = JSON.parse(flagsJson);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export function chunkAuthorityModeFromFlags(flags: FlagObject): ChunkAuthorityMode {
  return parseChunkAuthorityMode(flags[CHUNK_AUTHORITY_FLAG_KEY]) ?? CHUNK_AUTHORITY_DEFAULT_MODE;
}

/** The mode a space-0 row's flagsJson selects; the default (`on`) for no row, bad JSON or a bad value. */
export function chunkAuthorityModeFromFlagsJson(flagsJson: string | null | undefined): ChunkAuthorityMode {
  return chunkAuthorityModeFromFlags(parseSpaceFlagsJson(flagsJson));
}

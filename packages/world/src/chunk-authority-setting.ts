/**
 * Static-world S2a: the owner-only chunkAuthority switch.
 *
 * The mode lives in the public `space_admin_flag` row for space 0 under the
 * `chunkAuthority` key of `flagsJson`, so no stored schema changes and every
 * client can read it (the table is public). Absent or invalid values mean
 * `off`. Only the world owner may change it (reducer `setChunkAuthority`);
 * the admin space-flag repair surface can neither patch nor undo it.
 *
 * Nothing reads the mode for behaviour yet. S2b's collision dispatcher will
 * call `chunkAuthorityMode(ctx)`.
 */

import { parseAdminReason, serializeAdminAuditPayload } from './admin/contracts.js';

export const CHUNK_AUTHORITY_MODES = ['off', 'shadow', 'on'] as const;
export type ChunkAuthorityMode = (typeof CHUNK_AUTHORITY_MODES)[number];

/** The space whose admin flag row carries the world-wide switch (topside). */
export const CHUNK_AUTHORITY_SPACE_ID = 0;
export const CHUNK_AUTHORITY_FLAG_KEY = 'chunkAuthority';
export const CHUNK_AUTHORITY_DEFAULT_MODE: ChunkAuthorityMode = 'off';

/** Space flag keys only the world owner may change. Admin flag patches reject
 * them, and every admin flag write (including undo) keeps their current
 * stored value. */
export const OWNER_ONLY_SPACE_FLAG_KEYS: ReadonlySet<string> = new Set([CHUNK_AUTHORITY_FLAG_KEY]);

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

export function chunkAuthorityModeFromFlagsJson(flagsJson: string | null | undefined): ChunkAuthorityMode {
  return chunkAuthorityModeFromFlags(parseSpaceFlagsJson(flagsJson));
}

/** Structural slice of the reducer context: one primary-key lookup. */
export interface ChunkAuthorityReadContext {
  readonly db: {
    readonly space_admin_flag: {
      readonly spaceId: {
        find(spaceId: number): { readonly flagsJson: string } | null;
      };
    };
  };
}

/** Current world chunkAuthority mode; `off` when unset or invalid. Pure and
 * cheap (one indexed row read plus a small JSON parse). */
export function chunkAuthorityMode(ctx: ChunkAuthorityReadContext): ChunkAuthorityMode {
  return chunkAuthorityModeFromFlagsJson(ctx.db.space_admin_flag.spaceId.find(CHUNK_AUTHORITY_SPACE_ID)?.flagsJson);
}

export interface ChunkAuthorityFlagsPlan {
  readonly previous: ChunkAuthorityMode;
  readonly mode: ChunkAuthorityMode;
  readonly flagsJson: string;
}

/** Plans the space-0 flag row write for a mode switch. Returns null when the
 * effective mode already matches (idempotent: no write, no audit). Every
 * other flag is preserved exactly. */
export function planChunkAuthorityFlags(
  currentFlagsJson: string | null | undefined,
  mode: ChunkAuthorityMode,
): ChunkAuthorityFlagsPlan | null {
  const flags = parseSpaceFlagsJson(currentFlagsJson);
  const previous = chunkAuthorityModeFromFlags(flags);
  if (previous === mode) return null;
  return { previous, mode, flagsJson: JSON.stringify({ ...flags, [CHUNK_AUTHORITY_FLAG_KEY]: mode }) };
}

/** Removes owner-only keys, e.g. from an admin undo snapshot, so a recorded
 * inverse never claims to restore an owner switch. */
export function withoutOwnerOnlySpaceFlags<T extends FlagObject>(flags: T): T {
  return Object.fromEntries(Object.entries(flags).filter(([key]) => !OWNER_ONLY_SPACE_FLAG_KEYS.has(key))) as T;
}

/** Admin flag writes replace the whole flags object. This keeps the CURRENT
 * owner-only values from `current` whatever `next` carries, so neither an
 * admin patch nor an undo can move the owner's chunkAuthority switch. */
export function preserveOwnerOnlySpaceFlags<T extends FlagObject>(next: T, current: FlagObject): T {
  const result: Record<string, unknown> = withoutOwnerOnlySpaceFlags(next);
  for (const key of OWNER_ONLY_SPACE_FLAG_KEYS) {
    if (Object.prototype.hasOwnProperty.call(current, key)) result[key] = current[key];
  }
  return result as T;
}

/** The admin world view (validation, repair previews, world version) of one
 * space's flags. Owner-only keys are hidden from it, and a row that holds only
 * owner-only keys (for example one first created by setChunkAuthority) reads
 * as no row, so the authored defaults show exactly as they did before. */
export function adminVisibleSpaceFlags<T extends FlagObject>(stored: T | undefined, defaults: T): T {
  if (stored === undefined || stored === null || typeof stored !== 'object' || Array.isArray(stored)) return defaults;
  const visible = withoutOwnerOnlySpaceFlags(stored);
  return Object.keys(visible).length === 0 && Object.keys(stored).length > 0 ? defaults : visible;
}

/** Admin world view input: each stored flag row parsed with the same tolerant
 * reader gameplay uses, so a stored `null`, array or malformed value reads as
 * no flags instead of reaching the admin view as a non-object. */
export function adminSpaceFlagsBySpace(
  rows: Iterable<{ readonly spaceId: number; readonly flagsJson: string }>,
): Map<string, Record<string, unknown>> {
  const result = new Map<string, Record<string, unknown>>();
  for (const row of rows) result.set(String(row.spaceId), parseSpaceFlagsJson(row.flagsJson));
  return result;
}

/** Audit target for owner chunkAuthority switches: the space 0 flag row that
 * holds it, the same key Studio uses for that space's flag history. */
export const CHUNK_AUTHORITY_AUDIT_TARGET_KEY = `space:${CHUNK_AUTHORITY_SPACE_ID}`;
const CHUNK_AUTHORITY_AUDIT_REASON = parseAdminReason('Owner switched static-world chunk authority');

/** A standard v1 audit payload (parsed by the audit page and Studio) whose
 * single change is `/chunkAuthority`: previous -> next. No inverse is
 * offered; rollback is another owner switch. */
export function chunkAuthorityAuditPayload(plan: ChunkAuthorityFlagsPlan, occurredAtMicros: bigint): string {
  if (!CHUNK_AUTHORITY_AUDIT_REASON.ok) throw new Error('chunk_authority_audit_reason_invalid');
  return serializeAdminAuditPayload({
    schemaVersion: 1,
    clientMutationId: `chunk-authority-${occurredAtMicros.toString()}`,
    target: { kind: 'space', spaceId: String(CHUNK_AUTHORITY_SPACE_ID) },
    reason: CHUNK_AUTHORITY_AUDIT_REASON.value,
    changes: [{
      path: `/${CHUNK_AUTHORITY_FLAG_KEY}`,
      before: { present: true, value: plan.previous },
      after: { present: true, value: plan.mode },
    }],
    inverse: null,
  });
}

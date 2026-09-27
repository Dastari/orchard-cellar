/**
 * Static-world S2a: the chunkAuthority switch (owner or admin).
 *
 * The mode lives in the public `space_admin_flag` row for space 0 under the
 * `chunkAuthority` key of `flagsJson`, so no stored schema changes and every
 * client can read it (the table is public). Absent or invalid values mean
 * `off`. Only the dedicated reducer `setChunkAuthority` changes it, and it
 * admits the world owner or an admin (owner decision 2026-09-27, so the dev
 * account can run activation). The generic admin space-flag repair surface can
 * neither patch nor undo it, so a flags restore never flips it silently.
 *
 * Nothing reads the mode for behaviour yet. S2b's collision dispatcher will
 * call `chunkAuthorityMode(ctx)`.
 */

import { parseAdminReason, serializeAdminAuditPayload } from './admin/contracts.js';

import {
  CHUNK_AUTHORITY_DEFAULT_MODE, CHUNK_AUTHORITY_FLAG_KEY, CHUNK_AUTHORITY_MODES, CHUNK_AUTHORITY_SPACE_ID,
  chunkAuthorityModeFromFlags, chunkAuthorityModeFromFlagsJson, parseChunkAuthorityMode, parseSpaceFlagsJson,
  type ChunkAuthorityMode,
} from '@orchard/sim/chunk-authority-mode';

// The stored switch and its parse are shared with the client (BUG-053): `@orchard/sim/chunk-authority-mode`.
export {
  CHUNK_AUTHORITY_DEFAULT_MODE, CHUNK_AUTHORITY_FLAG_KEY, CHUNK_AUTHORITY_MODES, CHUNK_AUTHORITY_SPACE_ID,
  chunkAuthorityModeFromFlags, chunkAuthorityModeFromFlagsJson, parseChunkAuthorityMode, parseSpaceFlagsJson,
  type ChunkAuthorityMode,
};

/** Space flag keys only their dedicated switch reducer may change (named
 * "owner-only" from when that reducer was owner-only; it now admits owner or
 * admin). Generic admin flag patches reject them, and every generic admin flag
 * write (including undo) keeps their current stored value. */
export const OWNER_ONLY_SPACE_FLAG_KEYS: ReadonlySet<string> = new Set([CHUNK_AUTHORITY_FLAG_KEY]);

type FlagObject = Readonly<Record<string, unknown>>;

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

/** Removes owner-only (switch-only) keys, e.g. from an admin undo snapshot, so
 * a recorded inverse never claims to restore the chunkAuthority switch. */
export function withoutOwnerOnlySpaceFlags<T extends FlagObject>(flags: T): T {
  return Object.fromEntries(Object.entries(flags).filter(([key]) => !OWNER_ONLY_SPACE_FLAG_KEYS.has(key))) as T;
}

/** Admin flag writes replace the whole flags object. This keeps the CURRENT
 * owner-only (switch-only) values from `current` whatever `next` carries, so
 * neither a generic admin patch nor an undo can move the chunkAuthority switch;
 * only setChunkAuthority can. */
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

/** Audit target for chunkAuthority switches: the space 0 flag row that
 * holds it, the same key Studio uses for that space's flag history. */
export const CHUNK_AUTHORITY_AUDIT_TARGET_KEY = `space:${CHUNK_AUTHORITY_SPACE_ID}`;
const CHUNK_AUTHORITY_AUDIT_REASON = parseAdminReason('Static-world chunk authority switched');

/** A standard v1 audit payload (parsed by the audit page and Studio) whose
 * single change is `/chunkAuthority`: previous -> next. No inverse is
 * offered; rollback is another setChunkAuthority call. */
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

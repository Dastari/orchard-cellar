import { CHUNK_AUTHORITY_SPACE_ID, chunkAuthorityModeFromFlagsJson } from '@orchard/sim/chunk-authority-mode';
import type { DbConnection } from '@orchard/world-bindings';
import type { ChunkAuthoritySource, ChunkAuthorityWatch } from './chunk-runtime-controller.js';

/**
 * BUG-053: connects the chunk runtime's authority seam to the server's chunkAuthority switch, the
 * `chunkAuthority` key of the public `space_admin_flag` row of space 0, parsed exactly as the server
 * parses it (`@orchard/sim/chunk-authority-mode`).
 *
 * - `source`: undefined ("unknown") until this connection's subscription has applied; then the
 *   row's mode, and `off` when there is no row (the server's default), so server `off` rolls the
 *   client back.
 * - `watch`: subscribes to that one row and calls back when the subscription applies and on every
 *   insert, update and delete of it.
 *
 * Only a `shadow` or `on` build creates the chunk runtime, so an `off` build (production today)
 * never subscribes.
 */
export const CHUNK_AUTHORITY_QUERY = `SELECT * FROM space_admin_flag WHERE space_id = ${CHUNK_AUTHORITY_SPACE_ID}`;

export interface ChunkAuthorityFeed {
  readonly source: ChunkAuthoritySource;
  readonly watch: ChunkAuthorityWatch;
}

export function spaceAdminFlagChunkAuthority(): ChunkAuthorityFeed {
  const applied = new WeakSet<DbConnection>();
  const source: ChunkAuthoritySource = connection => applied.has(connection)
    ? chunkAuthorityModeFromFlagsJson(connection.db.spaceAdminFlag.spaceId.find(CHUNK_AUTHORITY_SPACE_ID)?.flagsJson)
    : undefined;
  const watch: ChunkAuthorityWatch = (connection, onChange) => {
    let active = true;
    const changed = (_context: unknown, row: { readonly spaceId: number }): void => {
      if (active && row.spaceId === CHUNK_AUTHORITY_SPACE_ID) onChange();
    };
    const updated = (context: unknown, _old: { readonly spaceId: number }, row: { readonly spaceId: number }): void => changed(context, row);
    const table = connection.db.spaceAdminFlag;
    table.onInsert(changed); table.onUpdate(updated); table.onDelete(changed);
    const subscription = connection.subscriptionBuilder()
      .onApplied(() => { applied.add(connection); if (active) onChange(); })
      // A failed subscription leaves the authority unknown: an `on` build keeps diagnostics-only shadow.
      .onError(() => {})
      .subscribe([CHUNK_AUTHORITY_QUERY]);
    return () => {
      if (!active) return;
      active = false;
      table.removeOnInsert(changed); table.removeOnUpdate(updated); table.removeOnDelete(changed);
      if (!subscription.isEnded()) subscription.unsubscribe();
    };
  };
  return { source, watch };
}

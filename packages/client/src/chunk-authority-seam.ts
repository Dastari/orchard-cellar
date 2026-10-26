import { CHUNK_AUTHORITY_SPACE_ID, chunkAuthorityModeFromFlagsJson } from '@orchard/sim/chunk-authority-mode';
import type { DbConnection, SubscriptionHandle } from '@orchard/world-bindings';
import type { ChunkAuthoritySource, ChunkAuthorityWatch } from './chunk-runtime-controller.js';

/**
 * BUG-053: connects the chunk runtime's authority seam to the server's chunkAuthority switch, the
 * `chunkAuthority` key of the public `space_admin_flag` row of space 0, parsed exactly as the server
 * parses it (`@orchard/sim/chunk-authority-mode`).
 *
 * - `source`: undefined ("unknown") until this connection's subscription has applied; then the
 *   row's mode, or the server default `on` when there is no row. An explicit `off` freezes terrain.
 * - `watch`: subscribes to that one row and calls back when the subscription applies and on every
 *   insert, update and delete of it.
 * - `retry`: renews a failed watch on the existing world-updating retry cadence. Pending and
 *   healthy subscriptions remain intact; a failed watch is unknown until its replacement applies.
 *
 * Only a `shadow` or `on` build creates the chunk runtime; an `off` build never subscribes.
 */
export const CHUNK_AUTHORITY_QUERY = `SELECT * FROM space_admin_flag WHERE space_id = ${CHUNK_AUTHORITY_SPACE_ID}`;

export interface ChunkAuthorityFeed {
  readonly source: ChunkAuthoritySource;
  readonly watch: ChunkAuthorityWatch;
  readonly retry: (connection: DbConnection) => void;
}

export function spaceAdminFlagChunkAuthority(): ChunkAuthorityFeed {
  const applied = new WeakSet<DbConnection>();
  const retries = new WeakMap<DbConnection, () => void>();
  const source: ChunkAuthoritySource = connection => applied.has(connection)
    ? chunkAuthorityModeFromFlagsJson(connection.db.spaceAdminFlag.spaceId.find(CHUNK_AUTHORITY_SPACE_ID)?.flagsJson)
    : undefined;
  const watch: ChunkAuthorityWatch = (connection, onChange) => {
    let active = true;
    let failed = false;
    let attempt = 0;
    let subscription: SubscriptionHandle | undefined;
    applied.delete(connection);
    const changed = (_context: unknown, row: { readonly spaceId: number }): void => {
      if (active && !failed && row.spaceId === CHUNK_AUTHORITY_SPACE_ID) onChange();
    };
    const updated = (context: unknown, _old: { readonly spaceId: number }, row: { readonly spaceId: number }): void => changed(context, row);
    const table = connection.db.spaceAdminFlag;
    table.onInsert(changed); table.onUpdate(updated); table.onDelete(changed);
    const subscribe = () => {
      const generation = ++attempt;
      failed = false;
      subscription = connection.subscriptionBuilder()
        .onApplied(() => {
          if (!active || failed || generation !== attempt) return;
          applied.add(connection); onChange();
        })
        .onError(() => {
          if (!active || failed || generation !== attempt) return;
          failed = true;
          // Do not trust cached flags after losing their subscription, including a previously
          // applied watch. Its replacement must apply before terrain can become authoritative.
          applied.delete(connection); onChange();
        })
        .subscribe([CHUNK_AUTHORITY_QUERY]);
    };
    const retry = () => {
      if (!active || !failed) return;
      attempt++;
      if (subscription !== undefined && !subscription.isEnded()) subscription.unsubscribe();
      subscribe();
    };
    retries.set(connection, retry);
    subscribe();
    return () => {
      if (!active) return;
      active = false;
      table.removeOnInsert(changed); table.removeOnUpdate(updated); table.removeOnDelete(changed);
      if (retries.get(connection) === retry) { retries.delete(connection); applied.delete(connection); }
      if (subscription !== undefined && !subscription.isEnded()) subscription.unsubscribe();
    };
  };
  return { source, watch, retry: connection => retries.get(connection)?.() };
}

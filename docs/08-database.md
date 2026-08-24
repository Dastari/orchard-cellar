# 08 — Database & Persistence

Binding storage design for Orchard & Cellar. Read [02-architecture.md](02-architecture.md)
first. All code below lives in `packages/server/src/db/` unless noted otherwise.

> **Paused by the M5.5 backend gate (2026-08-24).** Do not implement this SQLite
> schema until the SpaceTimeDB overworld slice in
> [19-overworld-spacetimedb-spike.md](19-overworld-spacetimedb-spike.md) is accepted
> or rejected. Local single-player save migration remains required whichever backend
> wins. This document is retained as the rollback design during the reversible spike.

## Why SQLite

Single-node, self-hosted, one Node process — SQLite is the correct database, not a
compromise. Zero ops (no daemon, no connection pool, no credentials), the whole game is
one file on disk, and better-sqlite3's **synchronous** API is a feature on a game server:
DB calls complete in microseconds without promise scheduling jitter in the tick loop.
WAL mode gives concurrent readers with our single writer. If the game ever outgrows one
node (see the sharding note in [02-architecture.md](02-architecture.md)), Drizzle's
schema is the measured migration path to Postgres — swap the driver and dialect, rerun
migrations, keep every query. Do not pre-build for that day.

## Schema (Drizzle ORM, `packages/server/src/db/schema.ts`)

Conventions — binding:

- All timestamps are **integer Unix epoch milliseconds** (`{ mode: 'number' }`), never
  ISO strings, never SQLite datetimes.
- All primary keys are text ULIDs generated in app code (sortable, no autoincrement
  coordination, survive a Postgres move untouched).
- JSON blobs are stored as `text` and parsed at the edges; the DB never introspects them
  except via the extracted columns below.

```ts
import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

// ── Auth (tables only; flows are specified in 09-auth.md) ────────────────────
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),                       // ULID
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),     // Argon2id (09-auth.md)
  displayName: text('display_name').notNull(),
  friendCode: text('friend_code').notNull(),         // e.g. "PLUM-4F7K-92QX", generated at signup
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
}, (t) => [
  uniqueIndex('users_email_idx').on(t.email),
  uniqueIndex('users_friend_code_idx').on(t.friendCode),
]);

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),                       // opaque session token, hashed per 09-auth.md
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
  expiresAt: integer('expires_at', { mode: 'number' }).notNull(),
}, (t) => [index('sessions_user_idx').on(t.userId)]);

// ── Farms ────────────────────────────────────────────────────────────────────
export const farms = sqliteTable('farms', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  farmName: text('farm_name').notNull(),
  farmState: text('farm_state').notNull(),           // serialized FarmState JSON (see discipline below)
  stateVersion: integer('state_version').notNull(),  // sim schema version of farm_state
  // Extracted queryable columns — DENORMALIZED FROM farm_state, written on every
  // snapshot. Never treat these as authoritative; farm_state is truth.
  vintageCount: integer('vintage_count').notNull().default(0),
  successionCount: integer('succession_count').notNull().default(0),
  lineageCount: integer('lineage_count').notNull().default(0),
  lastPlayedAt: integer('last_played_at', { mode: 'number' }).notNull(),
  lastSimulatedAt: integer('last_simulated_at', { mode: 'number' }).notNull(), // offline-progress anchor
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
}, (t) => [
  uniqueIndex('farms_user_idx').on(t.userId),        // exactly one farm per user
]);

export const farmSnapshots = sqliteTable('farm_snapshots', {
  id: text('id').primaryKey(),
  farmId: text('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  farmState: text('farm_state').notNull(),
  stateVersion: integer('state_version').notNull(),
  kind: text('kind', { enum: ['rolling', 'daily', 'prestige'] }).notNull(),
  prestigeLayer: text('prestige_layer', { enum: ['vintage', 'succession', 'lineage'] }), // kind='prestige' only
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
}, (t) => [index('snapshots_farm_kind_idx').on(t.farmId, t.kind, t.createdAt)]);

// ── Social (protocol/UX in 07-multiplayer.md; this is the storage) ───────────
export const friendships = sqliteTable('friendships', {
  id: text('id').primaryKey(),
  requesterId: text('requester_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  addresseeId: text('addressee_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: text('status', { enum: ['pending', 'accepted'] }).notNull(),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
  respondedAt: integer('responded_at', { mode: 'number' }),
}, (t) => [
  uniqueIndex('friendships_pair_idx').on(t.requesterId, t.addresseeId), // one row per directed pair
  index('friendships_addressee_idx').on(t.addresseeId, t.status),
]);

export const visits = sqliteTable('visits', {              // append-only log
  id: text('id').primaryKey(),
  visitorId: text('visitor_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  farmId: text('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  startedAt: integer('started_at', { mode: 'number' }).notNull(),
  endedAt: integer('ended_at', { mode: 'number' }),        // null while visit in progress
}, (t) => [index('visits_farm_idx').on(t.farmId, t.startedAt)]);

export const guestbookEntries = sqliteTable('guestbook_entries', {
  id: text('id').primaryKey(),
  farmId: text('farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  authorId: text('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  message: text('message').notNull(),                      // 200-char cap enforced in server code
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
}, (t) => [index('guestbook_farm_idx').on(t.farmId, t.createdAt)]);

export const gifts = sqliteTable('gifts', {
  id: text('id').primaryKey(),
  senderId: text('sender_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  recipientFarmId: text('recipient_farm_id').notNull().references(() => farms.id, { onDelete: 'cascade' }),
  itemId: text('item_id').notNull(),                       // sim item id (e.g. 'bottle_pinot_aged')
  quantity: text('quantity').notNull(),                    // decimal string — quantities may be bigint
  claimedAt: integer('claimed_at', { mode: 'number' }),    // null = unclaimed
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
}, (t) => [index('gifts_recipient_idx').on(t.recipientFarmId, t.claimedAt)]);

// ── Settings ─────────────────────────────────────────────────────────────────
export const settings = sqliteTable('settings', {
  userId: text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  musicVolume: integer('music_volume').notNull().default(80),   // 0–100
  sfxVolume: integer('sfx_volume').notNull().default(100),      // 0–100
  keybinds: text('keybinds').notNull().default('{}'),           // JSON: action → key code map
  updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
});
```

### Migrations (drizzle-kit)

- Schema changes go through `drizzle-kit generate` → SQL files in
  `packages/server/drizzle/`; applied at server boot via Drizzle's `migrate()`. Never
  hand-edit generated SQL after commit; add a new migration instead.
- DB migrations (table shape) and **sim state migrations** (JSON shape, below) are
  separate systems with separate version counters. A drizzle migration must never parse
  or rewrite `farm_state` — that is exclusively `migrateState`'s job.

## Snapshot & persistence strategy

Authoritative `FarmState` lives in the FarmRoom in memory. The DB sees it at these
moments, all handled by `packages/server/src/persist.ts`:

| Trigger | Writes | Snapshot `kind` |
|---|---|---|
| Every 30 s of active play (write-behind, only if state changed) | `farms` row (blob + extracted columns) | — (no snapshot row) |
| Room unload (60 s idle, or shutdown) | `farms` row + snapshot | `rolling` |
| First unload of each UTC day | `farms` row + snapshot | `daily` |
| Prestige event (Vintage / Succession / Lineage) — flushed **before** the reset is applied, then again after | `farms` row + pre-reset snapshot | `prestige` |

Retention, enforced after each snapshot insert:

- `rolling`: keep the newest **10** per farm.
- `daily`: keep **7 days**.
- `prestige`: a prestige snapshot is **never pruned until the next snapshot of the same
  `prestigeLayer` exists** for that farm; then keep only the newest per layer. This
  guarantees every reset is reversible by support until the next one.

The `farms` write (blob + extracted counters + `lastPlayedAt` + `lastSimulatedAt`) and
any snapshot insert happen inside **one** better-sqlite3 transaction. `lastSimulatedAt`
is set to the sim time the serialized state represents, at the moment of serialization —
not "now".

**Crash recovery**: on boot the server does nothing special — the `farms` row is at most
30 s stale, which is the accepted loss window. If a `farms` blob fails to parse or fails
`migrateState`, log loudly and fall back to the newest snapshot that loads (rolling →
daily → prestige, newest first). Never silently reset a farm.

**Graceful shutdown**: SIGINT/SIGTERM → stop accepting connections, flush every loaded
FarmRoom (same path as unload), close the DB, exit. This must complete in < 5 s.

## Offline progress

On farm load: read `lastSimulatedAt`, compute `elapsed = now − lastSimulatedAt`, call
`applyOffline(state, elapsedSeconds)` from `packages/sim` (closed-form, capped — the
formulas and cap live in [06-progression-economy.md](06-progression-economy.md)), then
set `lastSimulatedAt = now` and hand the state to the FarmRoom. Offline gains are
computed exactly once per load, server-side only; the client merely displays the summary
event. Never replay ticks; never trust a client-supplied elapsed time.

## Save-state JSON discipline (`packages/sim/src/state.ts`)

- Serialized FarmState always begins `{ "v": <number>, ... }` where `v` is the sim
  schema version, mirrored into `farms.state_version` / `farm_snapshots.state_version`.
- **Bigints serialize as decimal strings** with a `"@bi:"` prefix (e.g. `"@bi:12345"`);
  `serializeState` / `deserializeState` in `state.ts` are the only functions that touch
  `JSON.stringify`/`parse` for FarmState. No other code serializes sim state.
- Migrations are a chain in `state.ts`:

```ts
// packages/sim/src/state.ts
export const CURRENT_STATE_VERSION = 1;
const migrations: Record<number, (s: unknown) => unknown> = {
  // 1: (s) => ...  // migrates v1 → v2; added when v2 ships
};
export function migrateState(v: number, state: unknown): FarmState {
  for (let i = v; i < CURRENT_STATE_VERSION; i++) state = migrations[i](state);
  return validateState(state); // structural validation; throws on failure
}
```

- Every bump of `CURRENT_STATE_VERSION` requires a **golden-file test**: a fixture
  serialized state at each old version lives in `packages/sim/test/golden/`, and Vitest
  asserts each migrates cleanly to current and passes `validateState`. Old golden files
  are never edited, only added to.

## Ops: PRAGMAs, single-writer, backups

Applied once at connection open (`packages/server/src/db/index.ts`):

```ts
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');   // safe with WAL; fsync per checkpoint, not per commit
db.pragma('busy_timeout = 5000');
db.pragma('foreign_keys = ON');
```

- **Single-writer discipline**: exactly one better-sqlite3 connection, on the main
  thread, sync calls only. At our scale (writes are a handful of small transactions per
  30 s per loaded farm) this never blocks the tick loop measurably. No worker-thread DB
  access, ever.
- **Backups**: recommended: [Litestream](https://litestream.io) replicating
  `orchard.db` to any S3-compatible bucket — it tails the WAL, zero code changes.
  Minimum acceptable: nightly cron of
  `sqlite3 orchard.db ".backup 'backup-$(date +%F).db'"` (the online backup API — never
  `cp` a live WAL-mode DB) with 14-day retention. Ship with the cron script in
  `packages/tools`; document Litestream in the deploy notes.

## What NOT to do

- **No second datastore.** No Redis, no message queue, no JSON-file saves alongside the
  DB (reaffirming the non-goals in [02-architecture.md](02-architecture.md)).
- **No ORM beyond Drizzle**, and no raw SQL strings scattered through gameplay code —
  raw SQL is allowed only inside `db/` (e.g. retention pruning).
- **Do not write hot game state to the DB per-tick.** The DB is a snapshot store; the
  FarmRoom is the source of truth while loaded. Anything that makes the tick loop touch
  the DB is a bug.
- **Do not query inside `farm_state` JSON** (no `json_extract` in application queries).
  If a field needs querying, promote it to an extracted column on `farms`.
- **Do not add caching layers.** better-sqlite3 reads from the OS page cache in
  microseconds; a cache would only add invalidation bugs.

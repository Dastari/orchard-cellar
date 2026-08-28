# 19 — Persistent Overworld & SpaceTimeDB Architecture Gate

> **Product-direction amendment (2026-08-26):** The backend result remains adopted,
> but [40](40-sanctuary-overworld-and-zoned-world.md) supersedes this spike's literal
> contiguous-farm target. SpaceTimeDB now hosts a sanctuary overworld plus logical
> Homestead, resource, danger, town, event, and interior spaces in one database.

Status: **passed and adopted**, authorized and verified on 2026-08-24. SpaceTimeDB 2.8
is now the binding backend in docs 01, 02, 07, 08, and 09. This did not change the
Canvas engine, art/audio pipeline, economy, or prestige design.

## 1. Expanded product target

Orchard & Cellar is now intended to become a private, friends-only cozy MMO:

- One persistent authority contains the overworld and logical destination spaces.
- The gate originally proposed literal authored farm plots; doc 40 now places compact
  symbolic Homestead POIs that portal to full-scale owner destination spaces.
- Multiple players can farm together. Every mutation remains server-authoritative and
  permission-checked; cooperative access never implies unrestricted spending or
  destruction on another player's estate.
- The initial target is a small trusted group, but the world model must not assume that
  only one farm can be loaded or that only one player can affect a location.

## 2. Candidate architecture

SpaceTimeDB 2.8 is the candidate authoritative server and durable relational store.
The browser connects through generated TypeScript bindings. The candidate module owns
world entities and validates reducers; the client retains 60 Hz rendering, local
movement prediction, interpolation, audio, and in-canvas UI.

The spike uses an authoritative **20 Hz** movement step. This is a networking rate,
not a balance change: existing fixed-point movement is scaled so the same real-time
speed is preserved. Economy rules remain event/timestamp-driven rather than scanning
every offline farm on every movement step.

Candidate public replicated tables:

| Table | Purpose | Subscription key |
|---|---|---|
| `world_chunk` | authored chunk metadata | `chunk_x`, `chunk_y` |
| `player_public` | display name, appearance, online state | identity |
| `player_position` | authoritative position/input/sequence | chunk + identity |
| `farm_public` | farm boundary, owner, name, access mode | chunk + farm id |
| `world_tree` | shared tree position and visible state | chunk + tree id |
| `world_event` | transient interaction feedback | event subscription |

Private tables contain inventories, progression, farm permissions, invite membership,
and migration metadata. Clients never subscribe directly to private tables. A later
production design must expose caller-filtered views and test that one identity cannot
observe or mutate another identity's private rows.

## 3. Authority and interest management

- Clients send latest input direction plus a monotonically increasing input sequence;
  they never send authoritative positions.
- A scheduled reducer advances connected players at 20 Hz, applies collision and world
  bounds, updates chunk coordinates, and publishes the last processed input sequence.
- The owning client predicts locally from shared fixed-point movement, rebases on each
  new authoritative row, and replays the still-unacknowledged tick history. Movement
  transitions and three-step refreshes carry monotonic client ticks; the authority
  atomically settles confirmed intervals under a server-time rate cap, including taps
  wholly between 20 Hz samples. Remote clients do
  not predict other players: they interpolate ten-row buffers at a fixed 1.5-authority-
  tick render delay and collision-clamped extrapolation stops after two ticks.
- Held input refreshes every 3 client ticks. A reducer failure gets one immediate
  retry, while authority ignores non-idle input older than two seconds without ending
  the separate 30-second presence lease.
- A client derives its chunk radius from the viewport after zoom settles. On a boundary
  crossing it subscribes to the new region before dropping the old one. Generated table
  callbacks maintain persistent keyed stores rather than rebuilding SDK arrays per frame.
- Interactions use the sender identity and authoritative position. Target id, reach,
  ownership/permission, cooldown, and current entity state are validated atomically.

## 4. Persistence and offline work

World rows are durable through SpaceTimeDB's commit log. The spike must restart the
local host without an in-memory flag and show that player/tree state survives. Module
republishing must preserve compatible data.

Do not run all farms continuously. Store the timestamp represented by each farm's
economy state and apply the existing deterministic offline calculation exactly once
when the farm becomes active or an interaction requires fresh state. Later scheduled
events may wake specific entities, but a global per-tick economy scan is forbidden.

The browser's existing schema-versioned local save remains available during the spike.
Production adoption requires a tested one-time local import and explicit module schema
migration policy before local saving can be removed.

## 5. Authentication during the gate

Local development uses a SpaceTimeDB host-issued identity token stored under a
host/database-specific browser key. This is intentionally disposable and is not an
account system. Never treat a lost development token as recoverable.

If the backend is adopted, production authentication must use OIDC and an explicit
friends/invite allowlist. Provider choice is deferred until after the technical gate;
the gate must not introduce secrets or require a hosted account.

## 6. Repository and development constraints

- Add the candidate module as `packages/world`; generated client bindings live under
  `packages/client/src/net/generated` and are reproducible from the module schema.
- `npm run dev` must start assets, Vite, the durable local SpaceTimeDB host, module
  publish/watch, and any required static helper without manual terminal choreography.
- `npm run check` must build/typecheck the module and client boundary. Generated code
  is excluded from coverage and lint only where machine output makes that necessary.
- SpaceTimeDB and its CLI are the only new runtime/tooling dependency authorized by
  this gate. Do not add React, an alternate database, Redis, Docker, or a second game
  server.
- The visual agent owns asset/reference changes. The backend slice must use existing
  placeholders and must not edit visual source files.
- The client package keeps strict TypeScript but disables
  `exactOptionalPropertyTypes` and declaration emit. SpaceTimeDB 2.8.2's generated
  bindings do not satisfy those two switches; `packages/sim` and `packages/world`
  retain them where applicable.

## 7. Ten acceptance checks

1. ✅ Two fresh browser contexts connect to the same durable local database and receive
   distinct identities.
2. ✅ Both avatars appear in the same overworld and move smoothly at the documented speed.
3. ✅ A client crossing a chunk boundary retains nearby entities with no empty-frame gap.
4. ✅ The server rejects an attempted position spoof; reducers accept input, not position.
5. ✅ Both clients can tend one shared tree and observe one atomic resulting state.
6. ✅ Simultaneous tends cannot duplicate rewards or violate the tree cooldown/state.
7. ✅ Disconnect/reconnect restores identity and authoritative position.
8. ✅ A full SpaceTimeDB host restart preserves player and tree state.
9. ✅ Another identity cannot subscribe to private inventory/progression or mutate it.
10. ✅ The existing fixed-point movement or another shared deterministic `packages/sim`
    rule is imported by the TypeScript module and remains covered by a replay test.

## 8. Adoption rule

All ten checks passing promotes SpaceTimeDB to the binding backend. Append a decision,
rewrite docs 01/02/07/08/09 and M6/M7, remove the unused Fastify skeleton, and retain
the spike as the first overworld implementation.

Any failed check must be diagnosed. If the failure is fundamental to authorization,
determinism, persistence, client smoothing, or local operability, append a rejection
decision and resume the original Fastify/SQLite plan. Do not maintain both backends.

## 9. Verification record

- `npm run dev` booted the durable host, module build/binding/publish watcher, Vite,
  and asset watcher from one command.
- Presence uses a 10-second client heartbeat and 30-second authority lease, so an
  ungraceful client exit cannot leave a permanent online ghost; the movement schedule
  performs no world-clock/position writes after all leases expire.
- Shared-browser Alice and Bob held distinct durable identities, appeared together,
  moved under authority, crossed out of and back into Alice's 3×3 cache, and reconnected
  with their saved tokens. The final visual pass showed exactly two online players;
  offline durable position rows were correctly hidden.
- A simultaneous Alice/Bob tend returned one success and one
  `tree_recently_tended`; both caches observed one increment. `npm run world:smoke`
  repeats the identity, reducer-surface, atomic-tend, private-subscription, movement
  acknowledgement, and reconnect proofs.
- A raw subscription to `private_inventory` was rejected. Generated reducers expose
  only `heartbeat`, `setDisplayName`, `setInput`, and `tendTree`. A raw call to the
  nonexistent `set_position` reducer was rejected; the smoke client also attached
  hostile extra x/y fields to an idle input and asserted the authoritative position
  stayed exact, proving there is no position-spoof path.
- The smoke client walked from chunk 0 to chunk 2, stopped and awaited acknowledgement,
  disconnected, subscribed to its identity-filtered self row from outside the origin
  region, restored the exact stationary position, then sent and observed a fresh
  post-reconnect movement sequence.
- Before restart the tree was `{care:2,tendCount:2}` and one moved player was at
  fixed-point x=2096 with sequence 2. After the full host stop/start and commit-log
  replay, those exact rows remained; the smoke suite then passed again.
- `world-rules.test.ts` proves 20 authority steps equal 60 shared sim steps and covers
  chunk boundaries, protocol directions, interaction reach, and cooldown.

The result is a pass. The original Fastify health-check skeleton was removed so there
is one authority and one datastore.

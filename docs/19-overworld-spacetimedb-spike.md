# 19 — Persistent Overworld & SpaceTimeDB Architecture Gate

Status: **binding M5.5 spike**, authorized by the owner on 2026-08-24. This document
temporarily supersedes the backend portions of docs 01, 02, 07, 08, and 09. It does
not change the Canvas engine, art/audio pipeline, economy, or prestige design.

## 1. Expanded product target

Orchard & Cellar is now intended to become a private, friends-only cozy MMO:

- One persistent overworld contains roads, shared spaces, and player-owned estates.
- Farms occupy authored plots in that world; walking through a gate crosses ownership
  and authority boundaries without a disconnected loading-room model.
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
- The owning client predicts locally and reconciles to its authoritative row. Remote
  clients interpolate between received rows; they do not predict other players.
- A client subscribes to its current chunk and the eight neighboring chunks. On a
  boundary crossing it subscribes to the new 3×3 region before dropping the old one.
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

## 7. Ten acceptance checks

1. Two fresh browser contexts connect to the same durable local database and receive
   distinct identities.
2. Both avatars appear in the same overworld and move smoothly at the documented speed.
3. A client crossing a chunk boundary retains nearby entities with no empty-frame gap.
4. The server rejects an attempted position spoof; reducers accept input, not position.
5. Both clients can tend one shared tree and observe one atomic resulting state.
6. Simultaneous tends cannot duplicate rewards or violate the tree cooldown/state.
7. Disconnect/reconnect restores identity and authoritative position.
8. A full SpaceTimeDB host restart preserves player and tree state.
9. Another identity cannot subscribe to private inventory/progression or mutate it.
10. The existing fixed-point movement or another shared deterministic `packages/sim`
    rule is imported by the TypeScript module and remains covered by a replay test.

## 8. Adoption rule

All ten checks passing promotes SpaceTimeDB to the binding backend. Append a decision,
rewrite docs 01/02/07/08/09 and M6/M7, remove the unused Fastify skeleton, and retain
the spike as the first overworld implementation.

Any failed check must be diagnosed. If the failure is fundamental to authorization,
determinism, persistence, client smoothing, or local operability, append a rejection
decision and resume the original Fastify/SQLite plan. Do not maintain both backends.

# 02 — Technical Architecture

Binding architecture for Orchard & Cellar. Read [01-engine-decision.md](01-engine-decision.md) first.

> **M5.5 architecture gate (2026-08-24):** the isolated `FarmRoom` and custom WebSocket
> sections below are paused, not yet implemented. The expanded target is a persistent
> friends-only overworld with walkable farm boundaries and real cooperative play.
> Implement the reversible SpaceTimeDB slice in
> [19-overworld-spacetimedb-spike.md](19-overworld-spacetimedb-spike.md) before M6.
> Client rendering, the pure deterministic `packages/sim` rules, fixed-point movement,
> and authored assets remain binding regardless of the backend result.

## Repository layout (npm workspaces monorepo)

```
orchard-cellar/
├── package.json              # workspaces: packages/*
├── tsconfig.base.json        # strict: true, shared compiler options
├── docs/                     # this documentation suite
├── references/               # original HTML game + redesign PDF (read-only)
├── packages/
│   ├── sim/                  # ★ shared deterministic simulation (no DOM, no Node APIs)
│   │   └── src/
│   │       ├── state.ts      # FarmState, PlayerState types + (de)serialization
│   │       ├── tick.ts       # advanceTick(state, actions, rng) — THE sim entry point
│   │       ├── economy.ts    # production, costs, pomace, must, bottles
│   │       ├── trees.ts      # tree growth stages, tending, harvest
│   │       ├── cellar.ts     # pressing, fermenting, aging
│   │       ├── skills.ts     # skill tree, knowledge gates
│   │       ├── prestige.ts   # vintage / succession / lineage
│   │       ├── cultivars.ts  # rule-changing cultivar effects
│   │       ├── movement.ts   # avatar movement + collision (shared for prediction)
│   │       ├── balance.ts    # ALL tuning constants in one file (see 06-progression-economy.md)
│   │       └── rng.ts        # seeded PRNG (xoshiro128**); Math.random is banned in sim
│   ├── client/
│   │   └── src/
│   │       ├── main.ts       # boot, scene stack (Title → Login → Game)
│   │       ├── loop.ts       # fixed 60 Hz update, interpolated render
│   │       ├── render/       # tilemap layers, sprites, camera, lighting tint
│   │       ├── input/        # keyboard/gamepad/touch → Action objects
│   │       ├── net/          # WebSocket client, prediction + reconciliation
│   │       ├── audio/        # mixer, music sequencer, sfx synth
│   │       ├── ui/           # in-canvas UI: HUD, menus, dialogs, bitmap font
│   │       └── scenes/       # title, login, farm, cellar-interior, visiting
│   ├── server/
│   │   └── src/
│   │       ├── index.ts      # Fastify boot
│   │       ├── auth/         # register/login/logout/session (09-auth.md)
│   │       ├── ws/           # connection handling, message router
│   │       ├── rooms.ts      # one FarmRoom per loaded farm; owner + visitors
│   │       ├── persist.ts    # snapshot scheduling, offline progress on load
│   │       └── db/           # Drizzle schema + migrations (08-database.md)
│   ├── assets/               # text-authored art + audio sources (11-asset-pipeline.md)
│   │   ├── palette.json      # THE palette — single source of truth
│   │   ├── sprites/          # *.sprite.json pixel grids
│   │   ├── tiles/            # *.tile.json
│   │   ├── maps/             # *.map.json (farm layout, town, cellar interior)
│   │   ├── music/            # *.song.json tracker files
│   │   └── sfx/              # *.sfx.json synth params
│   └── tools/
│       └── src/
│           ├── build-atlas.ts    # sprites/tiles → PNG atlases + metadata
│           ├── validate-assets.ts# palette/size/style lint (CI gate)
│           ├── render-review.ts  # asset → review PNG (8× + neighbors + filmstrip) for agents to Read
│           ├── import-image.ts   # optional: quantize an external image into a draft sprite grid
│           └── preview.ts        # dev server page to eyeball any asset
```

## The golden rule: deterministic shared simulation

`packages/sim` is a pure, deterministic state machine:

```ts
advanceTick(state: FarmState, actions: Action[], tick: number): FarmState
```

- Runs at **60 Hz** on the server (authoritative) and on the client (prediction).
- No `Date.now()`, no `Math.random()` (seeded RNG stored in state), no I/O, no floats
  where determinism matters — use integers for currency (see below).
- Every player intent is an `Action` (`{type:'move',dir}`, `{type:'tend',targetTile}`,
  `{type:'buy',building}` …). The client sends actions; the server applies them; both
  sides converge. This one property makes multiplayer, replay, offline progress, and
  testing all tractable.

### Numbers

Incremental-game quantities overflow doubles' integer range eventually. Rule:
- Currencies/counters: `number` is fine up to 2^53; the redesigned economy caps well
  below that (see 06). If a value can exceed 1e15, store as `bigint` in sim state.
- Positions: integer sub-pixels (fixed point, 16 units per pixel) for determinism.

### Time

- 1 sim tick = 1/60 s. An in-game **day = 15 real minutes**, a **season = 7 in-game
  days**, 4 seasons per in-game **year** (one Vintage cycle ≈ one year — see 03).
- Offline progress: computed on farm load by the server as a closed-form/coarse
  simulation (`applyOffline(state, elapsedSeconds)`), never by replaying ticks.

## Client architecture

- **Scene stack**: `TitleScene → LoginScene → FarmScene` (+ modal scenes: cellar
  interior, skill tree, map). Each scene: `update(dt)`, `render(ctx, alpha)`, input focus.
- **Rendering**: three cached offscreen layers (ground, below-avatar detail,
  above-avatar canopy) redrawn only on tile change; dynamic sprites Y-sorted between
  detail and canopy. Camera scales by integer factor (2×/3×/4×) to fit window;
  `imageSmoothingEnabled=false`; virtual resolution 480×270 base.
- **Prediction**: client applies own movement actions immediately; server sends
  authoritative snapshots at 10 Hz + event deltas; client reconciles (rewind–replay
  own unacked actions). Economy actions (buy/tend) are optimistic with rollback on
  server rejection.

## Server architecture

- **FarmRoom** per loaded farm: holds `FarmState`, applies queued actions at 60 Hz
  (batched; sleeps when no connections and state is quiescent — persisted + unloaded
  after 60 s idle).
- Owner connection + up to **4 visitor** connections per room (see 07-multiplayer.md).
- Snapshots persisted to SQLite every 30 s of activity and on unload.
- Single Node process at launch. Scale path (not built now): rooms are already
  share-nothing, so sharding farms across processes by `farm_id` is mechanical.

## Message protocol (WebSocket, JSON at first — binary later only if measured need)

```
Client → Server: {t:'act', tick, actions: Action[]}
                 {t:'visit', farmId} / {t:'goHome'}
                 {t:'chat', text}                       // visiting only, 200 char cap
Server → Client: {t:'welcome', farmState, youAre, tick}
                 {t:'snap', tick, dyn}                  // 10 Hz dynamic state (positions, timers)
                 {t:'ev', events:[...]}                 // discrete: harvests, purchases, toasts
                 {t:'reject', actionId, reason}
                 {t:'presence', players:[...]}
```

Protocol types live in `packages/sim/src/protocol.ts` — imported by both sides; no
hand-maintained duplicates.

## Build & dev workflow

- `npm run dev` — concurrently: Vite (client), tsx watch (server), asset watcher
  (rebuild atlases on `assets/` change, hot-reload into client).
- `npm run build` — assets → atlases, client → static bundle, server → dist. Server
  serves the client bundle (single deployable).
- `npm test` — Vitest. Sim package target: >80% line coverage; economy/prestige
  formulas require golden-number tests pinned to 06-progression-economy.md tables.
- CI gates (add from milestone 1): typecheck, tests, `validate-assets`.

## Non-goals (do not build)

- No SSR/React/DOM UI framework. No Docker orchestration. No Redis. No message queue.
- No horizontal scaling work before it is needed.
- No mod support, no mobile-native wrappers at launch (touch input yes, app store no).

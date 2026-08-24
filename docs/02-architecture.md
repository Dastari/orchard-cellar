# 02 — Technical Architecture

Binding architecture for Orchard & Cellar. Read [01-engine-decision.md](01-engine-decision.md) first.

> **Backend adopted (2026-08-24):** the persistent friends-only overworld runs on a
> SpaceTimeDB 2.8 TypeScript module. The M5.5 proof passed all checks in
> [19-overworld-spacetimedb-spike.md](19-overworld-spacetimedb-spike.md). The former
> `FarmRoom`, custom WebSocket, Fastify, and SQLite design is retired.

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
│   │       ├── overworld-main.ts # sole game client boot + unified world render
│   │       ├── loop.ts       # fixed 60 Hz update, interpolated render
│   │       ├── render/       # unified Canvas 2D compositor, chunks, lightmap, particles
│   │       ├── input/        # keyboard/gamepad/touch → Action objects
│   │       ├── net/          # WebSocket client, prediction + reconciliation
│   │       ├── audio/        # mixer, music sequencer, sfx synth
│   │       ├── ui/           # in-canvas UI: HUD, menus, dialogs, bitmap font
│   │       └── account-main.ts # account/profile entry; no retired farm scene stack
│   ├── world/
│   │   └── src/
│   │       ├── index.ts      # SpaceTimeDB schema, reducers, lifecycle, schedules
│   │       └── world-rules.ts# pure authority helpers covered by replay tests
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

`packages/sim` is a pure, deterministic rules library:

```ts
advanceTick(state: FarmState, actions: Action[], tick: number): FarmState
```

- Movement runs at **60 Hz** in the predicting client. It confirms input in
  three-step intervals; the SpaceTimeDB authority runs at 20 Hz and atomically drains
  credited intervals through the same shared movement function.
- No `Date.now()`, no `Math.random()` (seeded RNG stored in state), no I/O, no floats
  where determinism matters — use integers for currency (see below).
- Player intent reaches identity-authorized reducers. Movement sends the latest
  direction plus a monotonic sequence; it never sends position. Interactions send a
  target id and the authority validates reach, role, cooldown, ownership, and state in
  the same transaction.

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

- **One Vite application entry**: `/` serves `index.html`; `src/main.ts` selects the
  account or shared-overworld module from authenticated session state. The former solo
  farm scene stack is retired until farms return as instances using the same renderer.
- **Rendering**: `UnifiedRenderer` owns the DPR-sized display canvas, integer-scaled
  nearest-neighbour world pass, and its single smooth final blit. Ground is cached in
  16×16-tile LRU chunks; world sprites are deterministically foot-Y sorted; a
  pooled weather layer is interleaved by ground-impact depth; a tile-resolution pixel
  lightmap composes before world-rendered nameplates. Screen HUD is drawn last at a
  separate whole-pixel UI scale.
- **Zoom**: world zoom is continuous in 0.25 steps from the display/world-derived
  minimum to 8, eased between inputs. Source zoom 2 is labelled `1×`; UI scale remains
  independent. All visible-world culling is derived from the current renderer layout.
- **Prediction**: the client applies movement immediately at 60 Hz and keeps a bounded
  tick/input history. Each new own-position row becomes an authoritative base, then
  unacknowledged steps replay through shared fixed-point movement. Only presentation
  offsets may smooth genuine corrections, for at most 100 ms. The authority settles
  confirmed client-tick intervals under server-time rate caps so short taps cannot disappear
  between 20 Hz ticks. Remote avatars use ten-row snapshot buffers on a softly synced
  timeline 1.5 authority ticks behind. Interaction cosmetics may predict immediately,
  but durable state waits for transactional reducer results.
- **Interest management**: derive the subscription radius from the viewport after zoom
  settles. Subscribe to the new region and wait for `onApplied` before unsubscribing the
  old handle so boundary crossings have no empty frame.

## World authority

- `packages/world` declares normalized public/private tables, lifecycle reducers,
  gameplay reducers, and private schedule tables.
- A private 50 ms schedule advances connected players at 20 Hz from confirmed input
  batches. It performs no world
  writes with no live/leased presence. Durable position rows survive disconnect;
  heartbeat-leased connection rows control public online state and expire crash ghosts.
- Public spatial rows carry indexed chunk coordinates. The client receives atomic
  table-cache changes through generated bindings rather than a hand-authored protocol.
- Farm economy is timestamp/lazy driven. Entering or mutating a farm advances its
  deterministic offline state once; absent farms are never scanned at movement rate.
- SpaceTimeDB reducer transactions are the mutation boundary and commit log is the
  durable source of truth. See [08-database.md](08-database.md).

## Generated client protocol

The schema generates `packages/client/src/net/generated`. Reducer parameters and row
types are therefore single-source, build-checked protocol definitions. Hand-authored
client networking wraps generated bindings for token persistence, event-maintained
keyed stores, global/private subscriptions, hysteretic spatial handover, prediction,
replay reconciliation, timed remote interpolation, development latency injection,
and UI-facing errors/metrics.

## Build & dev workflow

- `npm run dev` — builds assets, then concurrently starts the durable local
  SpaceTimeDB host, module build/generate/publish watcher, Vite, and asset watcher.
- `npm run build` — assets → atlases, sim/tools → JS, world → SpaceTimeDB bundle,
  client → static bundle containing the overworld, account, and preview entry pages.
- `npm run world:smoke` — against a running local world, proves distinct identities,
  reducer surface, atomic contention, private-state rejection, and reconnect.
- `npm test` — Vitest. Sim package target: >80% line coverage; economy/prestige
  formulas require golden-number tests pinned to 06-progression-economy.md tables.
- CI gates (add from milestone 1): typecheck, tests, `validate-assets`.

## Non-goals (do not build)

- No SSR/React/DOM UI framework. No Docker orchestration. No Redis. No message queue.
- No horizontal scaling work before it is needed.
- No mod support, no mobile-native wrappers at launch (touch input yes, app store no).

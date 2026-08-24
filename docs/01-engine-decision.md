# 01 — Engine Decision: Rust/Bevy vs HTML5 Canvas

**Decision: TypeScript + HTML5 Canvas 2D, custom lightweight engine. Not Bevy.**

**Backend evaluation amendment (2026-08-24):** the rendering/engine decision remains
binding. The owner has expanded multiplayer into a friends-only persistent overworld
where players can walk between farms and cooperate. Fastify + `ws` + SQLite is paused
before M6 while the reversible SpaceTimeDB 2.8 spike in
[19-overworld-spacetimedb-spike.md](19-overworld-spacetimedb-spike.md) is evaluated.
Until that gate is resolved, do not build either production backend or delete the
existing server skeleton.

This is a binding decision. Every other document in this suite assumes it. Do not
re-litigate it mid-build; if a hard blocker appears, stop and raise it with the user.

## The requirements that decide it

| Requirement | Bevy (Rust → WASM) | TS + Canvas 2D |
|---|---|---|
| 2D pixel-art tile game, ~64×64 tile maps, dozens of entities | Massive overkill; ECS shines at 10k+ entities | Comfortably within Canvas 2D budget at 60 fps |
| Ships on the web (login/logout, visiting friends via URL) | WASM bundle 10–30 MB, audio/asset quirks in browsers, threading disabled without COOP/COEP headers | Native platform; instant load, no toolchain friction |
| Multiplayer with an authoritative server | Server must be a second Rust program or a different stack; sharing sim logic with WASM client is possible but painful | **One language everywhere**: shared `sim/` package runs identically on client (prediction) and server (authority) |
| Built primarily by LLM agents (Opus 5 / Codex / Grok) | Slow compile loop (30 s – 5 min) poisons agent iteration; Bevy API breaks every 3 months, so training data is chronically stale; borrow checker fights ECS query patterns | Agents are strongest in TS; sub-second reload; enormous stable corpus |
| Persistent accounts, database, sessions | Needs a web backend anyway — you end up building the TS/HTTP stack *in addition to* Bevy | The backend and the game share code and tooling |
| Pixel-perfect rendering | Requires configuring wgpu samplers, camera scaling | `ctx.imageSmoothingEnabled = false` + integer scaling; done |

The performance argument for Bevy is void here: Stardew Valley itself runs on C#/XNA
drawing sprites one at a time. Our worst frame is a few hundred `drawImage` calls on
pre-rendered tile layers — Canvas 2D handles an order of magnitude more.

## Why not a middle option

- **Phaser / Pixi / Excalibur**: considered and rejected. They bring their own scene-graph
  opinions, version churn, and docs the agents must fight. Our needs (tilemap blitter,
  sprite batches, input, camera, audio) are ~2,000 lines of engine code we fully control
  and can unit-test. A custom micro-engine is *more* agent-friendly than a framework
  because everything is in-repo and greppable.
- **Godot**: good engine, wrong workflow — editor-centric scene files are hostile to
  text-only agents, and web export has the same WASM weight problems as Bevy.
- **WebGL renderer**: not needed at this scale. The renderer is isolated behind a small
  interface (`Renderer` in `client/render/`), so a WebGL2 batch renderer can be swapped
  in later without touching game logic if profiling ever demands it. It won't.

## What "custom lightweight engine" means

No general-purpose engine. A small set of purpose-built modules (specified in
[02-architecture.md](02-architecture.md)):

- Fixed-timestep game loop (60 Hz sim, render interpolation)
- Layered tilemap renderer with dirty-region caching (ground/detail layers pre-rendered
  to offscreen canvases, redrawn only when tiles change)
- Sprite/animation system driven by JSON atlas metadata
- AABB collision + grid walkability, top-down 8-direction movement
- Web Audio mixer (see [12-audio-design.md](12-audio-design.md))
- Deterministic simulation core shared with the server (see [07-multiplayer.md](07-multiplayer.md))

## Stack summary (binding)

| Layer | Choice |
|---|---|
| Language | TypeScript everywhere (strict mode) |
| Client | HTML5 Canvas 2D, Vite dev/build, no UI framework — in-canvas UI (see 13-ui-ux.md) |
| Server | Node 22+, Fastify (HTTP/auth) + `ws` (realtime), authoritative simulation |
| Shared | `packages/sim` — pure, deterministic game logic, zero DOM/Node imports |
| Database | SQLite via better-sqlite3, WAL mode, Drizzle ORM (see 08-database.md) |
| Auth | Email + password, Argon2id, server-side cookie sessions (see 09-auth.md) |
| Assets | Text-authored pixel grids compiled to PNG atlases by build script (see 11-asset-pipeline.md) |
| Audio | ZzFX-style synthesized SFX + in-repo tracker music via Web Audio (see 12-audio-design.md) |
| Monorepo | npm workspaces: `packages/{client,server,sim,assets,tools}` |
| Tests | Vitest; sim logic is pure functions and must be heavily unit-tested |

The Server/Database/Auth rows above describe the original isolated-farm plan. During
M5.5 only, the candidate stack is a TypeScript SpaceTimeDB module, generated TypeScript
client bindings, durable SpaceTimeDB tables, and development identities. A passing
M5.5 gate replaces those rows in a follow-up decision and doc rewrite; a failing gate
restores them unchanged.

## Consequences accepted

- No native desktop build at launch. If ever wanted: wrap in Electron/Tauri — the web
  build runs unchanged.
- Single-threaded sim. Fine: one farm's simulation is trivial; the server runs one sim
  instance per *loaded* farm and unloads idle ones.
- Canvas 2D text/UI is hand-rolled. Accepted deliberately — a bitmap-font UI keeps the
  pixel aesthetic consistent (no DOM widgets breaking the look).

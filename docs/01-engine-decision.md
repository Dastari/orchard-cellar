# 01 — Engine Decision: Rust/Bevy vs HTML5 Canvas

**Decision: TypeScript custom lightweight engine. Canvas 2D is the default and reference renderer; doc 59 authorizes an experimental WebGL2 world backend.**

**Backend amendment (2026-08-24):** the rendering/engine decision remains binding.
The owner expanded multiplayer into a friends-only persistent overworld where players
walk between farms and cooperate. The M5.5 gate in
[19-overworld-spacetimedb-spike.md](19-overworld-spacetimedb-spike.md) passed all ten
checks, so SpaceTimeDB 2.8 replaces Fastify + `ws` + SQLite as the binding authority
and store. Do not reintroduce the discarded server stack.

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
- **Experimental WebGL2 world renderer**: authorized by the 2026-09-06
  `client/rendering` row in `DECISIONS.md` and [doc 59 P8](59-client-render-performance-recovery-plan.md).
  It uses the shared `WorldPassBackend` seam in `packages/engine`, behind
  the persisted Developer → Render toggle “Experimental: WebGL renderer”, off by default.
  Doc59 A-19 keeps it out of Video until the experimental-enable gates pass.
  Canvas 2D remains the reference, default and automatic fallback on any failure;
  the HUD stays on Canvas. This supersedes the earlier no-WebGL anti-goal.
  Adoption as the default is outside doc 59. No engine or dependency change is authorized.

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
| Client | Canvas 2D default/reference and HUD; experimental WebGL2 world backend authorized by doc 59, off by default. Vite dev/build, no UI framework (see 13-ui-ux.md) |
| Server | SpaceTimeDB 2.8 TypeScript module, identity-authorized reducers, scheduled authority |
| Shared | `packages/sim` — pure, deterministic game logic, zero DOM/Node imports |
| Database | SpaceTimeDB normalized durable tables and commit log (see 08-database.md) |
| Auth | OIDC identity + explicit friends allowlist; local tokens only in development (see 09-auth.md) |
| Assets | Text-authored pixel grids compiled to PNG atlases by build script (see 11-asset-pipeline.md) |
| Audio | ZzFX-style synthesized SFX + in-repo tracker music via Web Audio (see 12-audio-design.md) |
| Monorepo | npm workspaces: `packages/{client,world,sim,assets,tools}` |
| Tests | Vitest; sim logic is pure functions and must be heavily unit-tested |

## Consequences accepted

- No native desktop build at launch. If ever wanted: wrap in Electron/Tauri — the web
  build runs unchanged.
- The 20 Hz network authority and 60 Hz client prediction use the same fixed-point sim
  rules. Farm economy advances lazily/from timestamps, never in a global 60 Hz scan.
- Canvas 2D text/UI is hand-rolled. Accepted deliberately — a bitmap-font UI keeps the
  pixel aesthetic consistent (no DOM widgets breaking the look).

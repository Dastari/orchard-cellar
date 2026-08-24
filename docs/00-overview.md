# Orchard & Cellar — Design & Technical Documentation

> You inherit a neglected orchard and a cellar full of empty racks. Walk the rows,
> bring the estate back to life, bottle a vintage worth your family's name — then
> hand it on, generation after generation.

A cozy, Stardew-Valley-style pixel-art farm game, adapted from the incremental web
game *Orchard & Cellar* (in `references/`), implementing its redesign document's
recommendations, rebuilt as an avatar-controlled, friends-only persistent overworld
where players can walk between farms and play together. Built end-to-end by AI agents
following this doc suite.

**Headline decisions** (rationale in the docs):
- **TypeScript + HTML5 Canvas 2D**, custom micro-engine — *not* Rust/Bevy (01)
- One deterministic simulation package shared by client & server (02)
- SpaceTimeDB 2.8 is under a binding M5.5 architecture gate for realtime authority,
  durable world state, and subscriptions; Fastify/SQLite is the rollback plan (19)
- Friends-only contiguous overworld with cooperative farming and permissioned estates (07, 19)
- All art & audio authored as text (pixel-grid JSON, tracker JSON) and compiled —
  enforceable style consistency for agent-made assets (10–12)
- Prestige is diegetic: **Vintage = build, Succession = power, Lineage = rules** (05, 06)

## Doc map & reading order

| Doc | What it binds | Read when |
|---|---|---|
| [01-engine-decision.md](01-engine-decision.md) | Engine/stack choice (Bevy vs Canvas) | Always, first |
| [02-architecture.md](02-architecture.md) | Repo layout, sim determinism, protocol, build | Always, second |
| [03-gameplay-core.md](03-gameplay-core.md) | Vision, pillars, time, map, verbs, seasons | Any gameplay work |
| [04-orchard-design.md](04-orchard-design.md) | Trees, species, Care, Vigour tending | Grove features |
| [05-cellar-design.md](05-cellar-design.md) | Press yard, Pomace, cellar, ceremonies | Press/cellar/prestige |
| [06-progression-economy.md](06-progression-economy.md) | **All numbers** — costs, formulas, gates, pacing | Any balance work (with the `balance-tuning` skill) |
| [07-multiplayer.md](07-multiplayer.md) | Visiting, whitelist, protocol, safety | Milestone M7 |
| [08-database.md](08-database.md) | Schema, snapshots, save versioning | Milestone M6+ |
| [09-auth.md](09-auth.md) | Accounts, sessions, security | Milestone M6 |
| [10-art-style-guide.md](10-art-style-guide.md) | The style bible: palette, rules, checklists | Any art (with the `pixel-art` skill) |
| [11-asset-pipeline.md](11-asset-pipeline.md) | Text→PNG asset formats & tools | Any art / M2 |
| [12-audio-design.md](12-audio-design.md) | Tracker music, synth SFX, mixing | Any audio (with the `game-music` skill) |
| [13-ui-ux.md](13-ui-ux.md) | Title, login, HUD, menus, ceremonies, a11y | Any UI |
| [14-roadmap.md](14-roadmap.md) | Milestones M0–M9 + asset inventory | Always — claim work here |
| [15-agent-workflow.md](15-agent-workflow.md) | Working agreement, DoD, DECISIONS.md | Always, third |
| [16-reference-original.md](16-reference-original.md) | Extraction of the source incremental | Design questions ("why is it like this?") |
| [17-reference-redesign.md](17-reference-redesign.md) | The redesign PDF (end build target) | Design questions |
| [19-overworld-spacetimedb-spike.md](19-overworld-spacetimedb-spike.md) | Persistent overworld target and backend adoption gate | M5.5 and all server/network work |

Minimal startup ritual for an implementing agent: **00 → 01 → 02 → 15 → your
milestone in 14 → the docs that milestone lists.** Docs are binding; deviations go
through DECISIONS.md (15 §2). Project skills installed in `.claude/skills/`:
`pixel-art`, `game-music`, `balance-tuning`.

## Source material

- `references/orchard_and_cellar.html` — the original incremental (view-source capture)
- `references/orchard_and_cellar_unminified.js` — recovered readable JS (3,038 lines)
- `references/Orchard_and_Cellar_Progression_Redesign_Recommendations.pdf` — the
  redesign target (9 pages)

Docs 16/17 summarize both faithfully; implementers should rarely need the raw files.

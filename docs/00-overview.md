# Orchard & Cellar — Design & Technical Documentation

> You inherit a neglected orchard and a cellar full of empty racks. Walk the rows,
> bring the estate back to life, bottle a vintage worth your family's name — then
> hand it on, generation after generation.

A cozy, Stardew-Valley-style pixel-art farm game, adapted from the incremental web
game *Orchard & Cellar*, implementing its redesign document's recommendations,
rebuilt as an avatar-controlled, friends-only persistent overworld where players can
walk between farms and play together. The source captures are summarized in docs 16
and 17; raw captures and licensed packs stay in the ignored local `references/`
directory and are never published. Built end-to-end by AI agents following this doc
suite.

**Headline decisions** (rationale in the docs):
- **TypeScript + HTML5 Canvas 2D**, custom micro-engine — *not* Rust/Bevy (01)
- One deterministic simulation package shared by client & world authority (02)
- SpaceTimeDB 2.8 is the binding realtime authority and durable store after passing
  the M5.5 architecture gate; generated subscriptions stream the shared world (19)
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
| [18-visual-style-addendum.md](18-visual-style-addendum.md) | Island estate, curve rules, sway rule, music arcs, pack licensing | Any art/map/audio work (with 10 and 12) |
| [17-reference-redesign.md](17-reference-redesign.md) | The redesign PDF (end build target) | Design questions |
| [19-overworld-spacetimedb-spike.md](19-overworld-spacetimedb-spike.md) | Persistent overworld target and backend adoption gate | M5.5 and all server/network work |
| [20-survival-world.md](20-survival-world.md) | Generated island, biomes, resources, collision, inventory/hotbar | M5.7 and survival-world work |
| [21-unified-renderer.md](21-unified-renderer.md) | Compositing, chunk cache, lighting, particles, UI pass | Any renderer work |
| [22-netcode.md](22-netcode.md) | Prediction, interpolation, action channel, input robustness | Any client/server netcode work |
| [23-ui-system.md](23-ui-system.md) | Widgets, windows, generic containers, UI skin | Any UI work (with 13) |
| [24-self-hosted-oidc.md](24-self-hosted-oidc.md) | Keycloak deployment, OIDC rollout record | Auth/infra work (with 09) |
| [29-wildlife.md](29-wildlife.md) | Habitat packs, animal lifecycle, hives, animation contract | Wildlife/NPC work |
| [25-stats-and-vitals.md](25-stats-and-vitals.md) | Attributes, health/mana/vigour, modifier pipeline, effects, creature statlines | Any stats/vitals/combat-adjacent work |
| [26-underground-mines.md](26-underground-mines.md) | Spaces/instancing model, cave generation, portals/zoning, darkness & torches | Mines, interiors, any multi-space work |
| [27-lighting-design.md](27-lighting-design.md) | Sub-tile quantized light, flood occlusion + shadows, height contract, lightning/sun shafts | Any lighting/atmosphere work (supersedes 21 §5) |
| [28-crafting.md](28-crafting.md) | Material chains, stations (workbench/furnace/anvil/campfire), recipe list, placeables | Any crafting/item/placement work |
| [30-infinite-terrain.md](30-infinite-terrain.md) | Semi-infinite chunked worldgen, biomes, lazy materialization, wildlife spawning, curation layer | Any worldgen/biome/wildlife work (supersedes 20 island gen) |
| [32-combat.md](32-combat.md) | Damage model, hostile roster/AI, danger zones, drops; resolves 22 §9 rate deferral | Any combat work (with 25/26/27) |
| [34-backend-scalability.md](34-backend-scalability.md) | Scalability audit + staged hardening: index discipline, subscription budget, chunk-scoped tick | Any world-module/netcode/perf work; gates 30 phase 2 |
| [31-npc-dialogue-and-commerce.md](31-npc-dialogue-and-commerce.md) | Authority-backed NPC dialogue, coin purse, merchants, buy/sell transactions | NPC conversations, shops, item pricing |
| [33-player-statistics.md](33-player-statistics.md) | Private lifetime counters, milestone history, and mandatory feature registration contract | Any authority-owned gameplay feature |
| [35-homesteads-and-farming.md](35-homesteads-and-farming.md) | Instanced player farms: crops/gold loop, build mode (B), guest access roles | Farming, building, estate/access work (realizes 07) |
| [36-character-progression.md](36-character-progression.md) | Character screen/customization, XP tracks, incremental skill trees, quest system | Progression, customization, quest, QoL-gating work |

Minimal startup ritual for an implementing agent: **00 → 01 → 02 → 15 → your
milestone in 14 → the docs that milestone lists.** Docs are binding; deviations go
through DECISIONS.md (15 §2). Project skills installed in `.claude/skills/`:
`pixel-art`, `game-music`, `balance-tuning`.

## Source material

- The original incremental capture and redesign PDF are local-only material in the
  ignored `references/` directory; they are not part of the published repository.

Docs 16/17 summarize both faithfully; implementers should rarely need the raw files.

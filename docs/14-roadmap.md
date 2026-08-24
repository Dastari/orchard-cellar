# 14 — Roadmap: Milestones for Implementing Agents

Work proceeds in order; each milestone is independently demonstrable and ends with
its Definition of Done ([15-agent-workflow.md](15-agent-workflow.md) §5). Claim a
milestone by ticking "⏳ in progress (agent, date)" here; tick ☑ when done and add
hand-off notes. Single-player ships value before any server work: the shared
deterministic sim ([02-architecture.md](02-architecture.md)) is what makes moving
authority to the server later a mechanical change, not a rewrite.

## M0 — Skeleton `☑ complete (codex, 2026-08-24)`
Monorepo (npm workspaces per 02), strict tsconfig, Vitest, ESLint (incl. sim bans on
`Math.random`/`Date.now`), Vite client shell showing a colored canvas at 480×270
with integer scaling, empty Fastify server, CI (typecheck+test+assets:validate).
**Done when:** `npm run dev` opens a scaled canvas; CI green.

**Verification:** Shared-browser snapshot confirmed a 480×270 intrinsic canvas at 4×
integer scale with smoothing disabled and no console errors. `npm run check`, production
build, server health route, and the client/server/asset-watcher dev trio all pass.

## M1 — Engine core `☑ complete (codex, 2026-08-24)`
Fixed-timestep loop, input mapping (keyboard/gamepad/touch stubs), camera, tilemap
renderer with cached layers, sprite/animation system reading atlas metadata, AABB
collision + walkability, Y-sorting, bitmap font renderer, scene stack.
**Done when:** placeholder avatar walks a placeholder map at 60 fps with collision;
determinism test (seed+actions replay → identical state) passes.

**Verification:** Shared-browser play exercised walking, interpolation, camera follow,
and farmhouse collision on the live 480×270 canvas; a clean snapshot had no console
errors. Deterministic replay passes, with sim at 100% line coverage and focused engine
tests covering loop timing, camera, atlas animation, Y-sort, scene stack, and map layers.

## M2 — Art foundation `☑ complete (codex, 2026-08-24)`
`palette.json` generated from [10-art-style-guide.md](10-art-style-guide.md) §2,
sprite/tile JSON formats, atlas builder + validator + preview tool
([11-asset-pipeline.md](11-asset-pipeline.md)), seasonal remap tables, and the
**anchor set**: grass/path/soil autotiles, avatar base (4-dir walk + tend), farmhouse,
mature Orchard Apple tree (all stages), basket press, oak barrel, UI 9-slice +
both fonts + resource icons. These anchor assets set the bar every later asset is
compared against — spend real iteration here, screenshots reviewed in preview tool.
**Done when:** avatar walks on real tiles past the farmhouse and a fruiting tree,
validated and screenshotted.

**Verification:** Shared-browser play confirmed the customized avatar walking and
returning to a static idle frame on a solid field with sparse terrain tufts, past the
authored farmhouse and fruiting tree. The animated preview and generated review PNGs
were visually inspected across all 22 anchors (including all 32 avatar frames and 47
autotile variants). A fresh hidden-tab load synchronously rendered all 129,600 canvas
pixels; runtime skin/hair/shirt/pants recolors were present. Asset validation, tests,
typecheck, lint, production builds, and the milestone reviewer all pass.

## M3 — Farm alive `☑ complete (codex, 2026-08-24)`
Estate exterior map (64×64 per [03-gameplay-core.md](03-gameplay-core.md) §3),
cellar interior, day/night lighting tint + season recolor swap, day/season clock +
HUD dial, audio foundation (mixer, `theme_spring`, ambience layer, footsteps/UI sfx
per [12-audio-design.md](12-audio-design.md)), local save/load (localStorage now,
schema-versioned FarmState from day one).
**Done when:** a full in-game day passes with dawn/dusk tint, music, and the state
survives reload.

**Verification:** Shared-browser play exercised the estate and cellar, a complete
day plus seasonal warps, dawn/dusk/night lighting, contextual ambience, footsteps,
music unlock, and exact save/reload restoration. Final snapshots confirmed sparse
grass on a solid ground field, a static idle avatar, no debug collision lines, and
visible scenery at every blocked interior tile. The exact runtime audio preview
triggered all 2 songs and 9 SFX without errors (0.211 observed peak). `npm run check`
(24 tests, 100% sim line coverage), asset validation, production builds, save
corruption tests, and milestone review all pass.

## M4 — The chain `✅ complete (codex, 2026-08-24)`
The sim economy end-to-end per [04](04-orchard-design.md)/[05](05-cellar-design.md)/[06](06-progression-economy.md):
planting, growth stages, Care, harvest buffers, Vigour tend with charge curve +
Autumn chain, hopper/hauling, presses (pomace!), casks, bottles, workbench upgrades,
milestones, seasons' mechanical effects, offline progress (local), golden-number
tests for every 06 table.
**Done when:** a tester can exercise first tend through first bottle in a ≤30-minute
accelerated browser verification using dev time-warp, the unwarped pacing harness
lands inside 06 §10's 45–70 minute first-bottle window, and sim coverage ≥80%.

**Verification:** Shared-browser play used facing-cone spatial targets and held-E
release to tend, grew and harvested the starter tree, repaired and fed the press,
observed the visible 100-Must `BACKED` state, hauled jugs, bought an 80-Must
Demijohn, racked the remainder, and aged two bottles with Grove/Press/Cellar
Knowledge awards. Reload restored the exact cellar state. The deterministic pacing
harness lands at 18.00 min first press / 45.83 min first bottle. `npm run check`
passes 68 tests with 99.14% sim line and 89.53% branch coverage; asset validation,
production build, offline/save corruption cases, and the second milestone review
all pass (`READY`).

## M5 — Progression & prestige `☐`
Estate Book UI (skill tree pannable + Knowledge gates, almanac, records,
achievements), Terroir/Knowledge earning, Vintage ceremony flow + label wall,
Succession (heir creation + portraits), Lineage (map reshuffle + baseline bonus),
Cultivars with their rule-change implementations, achievements roster.
**Done when:** a scripted accelerated run (dev time-warp command) completes
Vintage → Succession → Lineage with all carries/resets exactly per 05 §3/§4 tables
(golden test).

## M6 — Server, accounts & persistence `☐`
Auth per [09-auth.md](09-auth.md), DB per [08-database.md](08-database.md),
FarmRooms, protocol, client prediction/reconciliation, server-side offline gains,
snapshots, TitleScene + LoginScene ([13-ui-ux.md](13-ui-ux.md)), deploy story
(single node serving client bundle). Local-save users migrate via one-time import.
**Done when:** two browsers, two accounts, each playing their own farm through a
server restart with no lost progress.

## M7 — Multiplayer `☐`
[07-multiplayer.md](07-multiplayer.md) steps M5a–M5d: spectate → friends/visiting →
whitelist verbs (helping hand, guestbook, gifts, tasting) → postcards, festivals
together, host tools.
**Done when:** the 07 §3 whitelist table is fully enforced by server tests, and a
visit + gift + guestbook round-trip works between two accounts.

## M8 — Texture & delight `☐`
Festivals (4, with mini-games), daily micro-events, the dog, forageables + bees,
traveling merchant, estate-hand NPCs with visible work loops, full soundtrack
(all songs from 12 §2 table), remaining SFX, title-screen final art + wordmark,
emotes, decor prizes.
**Done when:** the 12 soundtrack table and the asset appendix below are fully ✅.

## M9 — Polish & launch `☐`
Pacing playtests against 06 §10 (tune `balance.ts` only, `balance:` commits),
accessibility pass (13 §9), onboarding letters/prompts, performance (60 fps on a
mid laptop, <150 MB heap), save-migration soak, security checklist from 09 §8,
backup cron, versioned deploy.
**Done when:** a fresh player reaches first press in ≤25 min unaided; all CI gates
green; deployed.

---

## Appendix — Asset inventory (tick as they land)

**Tiles/terrain:** grass (+3 variants), path, tilled soil, brush, stones, water +
shore autotile, fence, cellar floor/walls, farmhouse interior floor — each ×4
seasons via remap. `☐`
**Trees:** 10 species × 4 growth stages + fruit overlays + bare-winter variants
(silhouette-change species only). `☐`
**Characters:** avatar base + marker layers (hair ×6 styles), heir variants, 3
estate hands, merchant, previous-owner NPC, dog (idle/walk/chase/pet). `☐`
**Buildings/props:** farmhouse (+2 upgrade looks), cellar entrance, presses ×5,
casks ×5, bottling table, tasting table, label wall, hoppers, crates, jugs, compost
bays, beehives, merchant cart, gate, festival decor (bunting/lanterns), well, pond
edges. `☐`
**UI:** 9-slice panels, fonts ×2, resource icons ×8, tool/verb icons, season dial,
Vigour bar, emote icons ×6, wordmark ~200×48, title parallax layers ×4, book
(Estate Book) spreads, ceremony frames, portrait frames. `☐`
**Audio:** 8 songs + 2 stings (12 §2), ~25 SFX + 4 ambience beds (12 §3–4). `☐`
**Maps:** estate exterior, cellar (3 levels), farmhouse interior, festival layouts ×4. `☐`

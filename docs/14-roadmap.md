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

## M5 — Progression & prestige `⏳ in progress (codex, 2026-08-24)`
Estate Book UI (skill tree pannable + Knowledge gates, almanac, records,
achievements), Terroir/Knowledge earning, Vintage ceremony flow + label wall,
Succession (heir creation + portraits), Lineage (map reshuffle + baseline bonus),
Cultivars with their rule-change implementations, achievements roster.
**Done when:** a scripted accelerated run (dev time-warp command) completes
Vintage → Succession → Lineage with all carries/resets exactly per 05 §3/§4 tables
(golden test).

## M5.5 — Persistent overworld backend gate `✅ complete (2026-08-24)`

This owner-directed architecture gate runs before M6 despite its fractional label.
Build the reversible SpaceTimeDB 2.8 vertical slice specified in
[19-overworld-spacetimedb-spike.md](19-overworld-spacetimedb-spike.md): two browser
clients share one chunked overworld, cross a chunk boundary without state loss, move
under server authority with client smoothing, and interact with one shared tree.
Restart persistence and private-state isolation must be demonstrated. Production auth
was intentionally deferred until the candidate passed; the obsolete skeleton was then
removed as required by doc 19's one-backend adoption rule.

**Done when:** all ten acceptance checks in doc 19 pass and the result is recorded in
`DECISIONS.md`. A pass rewrites M6/M7 around SpaceTimeDB; a fail removes the spike and
resumes the original M6 unchanged.

**Verification:** Two shared-browser identities rendered together, crossed chunk
subscription boundaries, contended for one tree atomically, reconnected, and hid
offline durable avatars correctly. A private-table subscription was rejected and the
public reducer surface contains no position setter. `npm run world:smoke` repeats the
security/atomicity/reconnect checks. A full host stop/start replayed the commit log and
preserved exact player/tree rows. The module imports shared fixed-point movement and
its replay test proves 20 Hz authority matches 60 Hz sim movement. The final browser
snapshot showed `WORLD ONLINE PLAYERS 2` after the one-command dev boot.

## M5.6 — Playable MMO farm sample `✅ complete (codex, 2026-08-24)`

Owner-directed narrow M7a slice, pulled forward while the Cute Fantasy pack is being
split into production tilesets by a separate visual agent. The shared world exposes
up to 25 persistent adjacent parcel slots. Owners plant and harvest; any nearby
friend may water; growth derives from the authoritative world clock and every action
is one atomic `use_farm_tile` transaction. This sample intentionally has one crop,
infinite seed stock, and no role editor—the full farm economy and permission matrix
remain M6/M7 work.

**Done when:** two live identities walk between named farms; an owner plants, a friend
waters, a premature or non-owner harvest is rejected, and the owner harvests after
the visible crop reaches maturity. State and activity counters replicate to both
clients and persist in SpaceTimeDB.

**Verification:** Shared-browser play rendered three adjacent named farms and live
players in one canvas. Bob planted/watered a crop; Alice crossed the roads and watered
Bob's dry crop; Alice received `owner_only_harvest` at maturity; Bob harvested his
own crop. Both clients observed deletion and durable counters showed Alice watering
and Bob planting, watering, and harvesting. The generated protocol exposes no
position setter; crop reach, 25-parcel layout, clock stages, and bounds are covered by
deterministic tests.

## M5.7 — Generated survival island `✅ complete (codex, 2026-08-24)`

**Nested-elevation world revision — ✅ complete (codex, 2026-08-26).** The live
legacy island now has deterministic level-1/2/3 stacked contours, one paired semantic
slope per connected contour, elevation-aware collision and painter depth, and a
controlled world-version/resource reconciliation. The semi-infinite doc-30 migration
remains a later milestone.

**Nested-elevation verification:** the default-seed golden contains 1,770 exact
level-1 tiles, 918 level-2 tiles, 191 level-3 summit tiles, eleven two-lane slopes,
and 22 semantic transitions. Golden movement fixtures climb and descend the highest
level while an unconnected edge fails closed; renderer fixtures prove every generated
crossing selects its four ramp frames. `npm run check` passed 107 files / 660 tests,
all typechecks/lint, the SpaceTimeDB module build, coverage, and 528-asset validation.
World version 26 published to the durable local authority without deleting data;
post-migration 1 Hz telemetry sampled collision at 1.1–2.8 ms and complete ticks at
2.4–6.0 ms while the idle player position guard continued reporting zero updates.

Owner-directed M7a foundation pulled forward before deeper farming progression. Build
the deterministic 192×192 island, biome terrain, 25 safe spawn clearings, generated
resource nodes, server/client collision parity, y-sorted world rendering, private
inventory views, a nine-slot hotbar with starter tools, and transactional axe-to-wood
collection per [20-survival-world.md](20-survival-world.md).

**Done when:** two durable identities begin in distinct clearings, explore the same
coast/forest/meadow/valley/highland layout, cannot cross water/ridges or live trees,
walk correctly in front of/behind tree canopies, and each can equip the starter axe,
fell a nearby tree, receive Wood exactly once, and retain hotbar/inventory/resource
state through reconnect and host restart.

**Verification:** Shared-browser play rendered the version-3 192×192 island at a
screen-sized true 2× camera with two durable identities, distinct clearings, native
Cute Fantasy terrain/trees/avatar/UI, y-sorted canopies, and no legacy farm parcels.
The `G` overlay showed green walkable tiles, red water/ridge terrain, and amber live
tree bases on the exact camera grid. Alice walked 15 tiles down a guaranteed trail in
five seconds without reconciliation snap-back, then three authoritative Axe calls
changed one tree from health 3 to depleted and granted exactly 3 Wood. A complete
SpaceTimeDB host stop/start replayed 114,091 transactions; reconnect restored Alice's
exact position `(11340,22046)`, selected slot `0`, Wood `6`, world version `3`, and the
depleted resource at health `0`. `npm run check` passed 122 tests with 97.09% sim
statement coverage; `npm run build` produced every package and the Vite client.

## M5.8 — Stats and vitals `✅ phases 1–4 complete (2026-08-26)`

Implement [25-stats-and-vitals.md](25-stats-and-vitals.md) in its five gated phases:
pure sim foundations; authoritative player rows, Vigour spending, and HUD bars;
effects and the first potion; creature health and first skill-check call sites; then
a separately approved combat era.

Owner amendment: Phase 2 also includes per-item tool durability, renewable field
repair, and readable durability bars on every slot surface.

**Handoff:** ✅ The sim owns the six attributes, two-pass effect/equipment modifier
pipeline, derived Health/Mana/Vigour, exact lazy regeneration, deterministic checks,
durability, and creature statlines. SpaceTimeDB owns private caller views, spend and
interval gates, one-time legacy backfills, effect expiry, repair and tea reducers,
and creature health. The client owns cosmetic Vigour prediction, licensed status
icons, three responsive vital bars, F3 diagnostics, and authoritative durability
bars on every inventory surface. Phase 5 combat remains unapproved and untouched.

**Done when:** docs/25 §15 passes end to end: resolver/regen goldens, reducer
authority and isolation tests, two-client Vigour pacing, and the bottom-right vitals
cluster at UI scales 1/2/3. Combat remains a separate approval even after phases
1–4 complete.

## M5.9 — Lifetime player statistics `✅ backend complete (2026-08-26)`

Implement [33-player-statistics.md](33-player-statistics.md): a typed registry,
private per-player counters, immutable threshold-crossing history, caller-filtered
views, and same-transaction instrumentation across the shipped authority verbs. There
is intentionally no frontend yet. Combat, fishing, quests, and every later gameplay
milestone inherit the mandatory registration contract.

**Done when:** additive tables publish without deleting populated data; time is counted
once per active identity; current reducers record successful outcomes but never
rejections; statistic/milestone views are identity-isolated; and the registry and full
repository acceptance suites pass.

## M5.10 — Crafting foundations and placeables `✅ phases 1–3 complete (2026-08-26)`

Implement [28-crafting.md](28-crafting.md) phases 1–3: shift-invariant recipe
matching, the consolidated item/recipe registries, fiber and the hand tier, then
space-aware placeables and the workbench-gated recipe tier. The shared placement
authority is deliberately shaped for docs/35 build mode. Furnace, anvil, metals,
weapons, fishing, and cooking remain later approvals.

**Done when:** the authority accepts place/pickup round trips in the caller's space,
rejects unavailable stations and cross-space interaction, records crafting and
placement statistics transactionally, exposes real barrel storage, and replicates
placed lights to both clients. The recipe list must filter by station, show missing
ingredients, ghost-fill safely, and preserve server-side revalidation.

**Verification:** docs/28 §16 records the focused sim, schema, client, asset, and
deterministic two-client coverage. The repository-wide `npm run check` remains the
final release gate; phase 4 code and recipes are absent.

## M6 — Accounts, farm authority & persistence `⏳ in progress (codex, 2026-08-24)`
OIDC + owner-managed friends allowlist per [09-auth.md](09-auth.md); normalized owned
farm/public/private tables per [08-database.md](08-database.md); caller-dependent
private views; deterministic timestamp/offline farm adapter; Title/Login account UX;
one-time local-save import; self-host HTTPS and tested backup/restore.
**Done when:** two approved accounts each own and play a distinct farm through restart,
an unapproved identity is rejected, cross-account private reads/mutations fail, local
state imports once without loss, and a backup restores both farms into a fresh host.

**Handoff:** A canvas-native local account chooser now remembers named development
slots and reconnects each to its durable SpaceTimeDB identity token. The returning
Alice flow was screenshot-verified against her existing parcel. This is intentionally
not production authentication; OIDC, the friends allowlist, private farm views,
one-time import, HTTPS, and backup/restore remain.

**OIDC handoff (2026-08-25):** Digest-pinned Keycloak/PostgreSQL, private upstream TLS,
NPM edge hardening, SMTP verification/recovery, PKCE browser integration, issuer/audience
enforcement, the owner membership bootstrap, two named Keycloak administrators,
encrypted off-machine backup/restore, and the local-profile production gate are live.
The owner identity also has audited server-authoritative date/time/weather controls;
other roles receive read-only environment state. The 2026-08-26 account-theme
follow-up adds separate in-game entry actions for sign-in, registration, and recovery
plus a read-only Orchard Keycloak login/email theme. It does not change the issuer,
user identities, PKCE, or the server authorization plane. See doc 24 for sanitized
evidence and the remaining manual multi-account acceptance items before M6 as a whole
is complete.

## M7 — Overworld & co-op `☐`
[07-multiplayer.md](07-multiplayer.md) steps M7a–M7d: authored overworld/estate parcels
→ estate permission roles → guestbook/gifts/tasting/chat/blocking → co-op festivals
and host tools. Add the 25-friend load and artificial-latency harnesses.
**Done when:** players walk between two owned farms, every permission-table cell is
enforced by reducer tests, shared harvest/machine/gift races commit once, social verbs
round-trip, and 25 simulated friends stay within the M9 resource/latency budget.

## M7.1 — Instanced homesteads and farming `☐`

Implement [35-homesteads-and-farming.md](35-homesteads-and-farming.md) on the
shared SpaceTimeDB world database. Homesteads are logical `spaceId` coordinate
worlds—not separate database deployments—with generated base terrain and sparse
persistent mutation rows. Complete dynamic `homestead` definition lookup, atomic
portal transitions, make-before-break regional subscriptions, private roster/request
views, occupancy-scoped simulation, timestamp-derived crop/curing progress, and the
bounded per-space terrain/collision cache gate from docs/34 before opening deeds.

**Done when:** two accounts own distinct homesteads and can visit according to role;
restart/backup preserves both; leaving evicts client rows and generated cache entries
without deleting durable state; offline farms receive zero 20 Hz work; re-entry
reconstructs identical terrain plus mutations; and the 1,000-space cache soak remains
within its configured bound.

## M8 — Texture & delight `☐`
Festivals (4, with mini-games), daily micro-events, the dog, forageables + bees,
traveling merchant, estate-hand NPCs with visible work loops, full soundtrack
(all songs from 12 §2 table), remaining SFX, title-screen final art + wordmark,
emotes, decor prizes. Complete [27-lighting-design.md](27-lighting-design.md),
including its 29.5-day eight-phase lunar cycle: Full Moon retains the current
clear-night brightness while New Moon reaches the R12 near-black ambient.
**Done when:** the 12 soundtrack table and the asset appendix below are fully ✅.

**Wildlife foundation (2026-08-25):** The generated survival island now has a
deterministic, server-authoritative wildlife layer with habitat packs, solitary
nameless horses, water creatures, hive colonies, bounded honey production, authored
colour/animation variants, and a three-chunk activation range for several hundred
durable NPCs. Health, drops, breeding, taming, and hive harvesting remain future
gameplay work; see [29-wildlife.md](29-wildlife.md).

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

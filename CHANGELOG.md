# Changelog

## 0.26.0 — 2026-09-23

- Extend shared timing to crops, tree regrowth, fruit ripening and authorized generic lifecycle snapshots. Dry/dormant crops display paused reasons; conditional growth budgets are distinguished from finish deadlines.
- Inspect projected crop tiles and authored resource targets independently of action reach, with row-revision spatial caches and unchanged authority settlement. Preserve Soil Whisperer water details.
- Reuse stateful lifecycle deadline math without exposing private anchors or adding scheduled writes. Client 0.22.0, sim 0.24.0, UI 0.23.0.

## 0.25.0 — 2026-09-23

- Restore authored countdown/status panes for furnaces, cooking fires, presses, fermentation vessels and barrels using one read-only timing projection. Closed station completion is estimated until settlement confirms output.
- Inspect processor timers across their authored target/footprint without action-reach restrictions. Cache definition metadata, projections and formatted labels without per-object intervals or timer writes.
- Share kit timing presentation between game frames and hover while preserving the independent Studio bundle boundary. Client 0.21.0, sim 0.23.0, UI 0.22.0.

## 0.24.1 — 2026-09-23

- Fix workstation and private-job progress using calendar offsets: elapsed time now uses the authoritative simulation clock exclusively, while date/weather/moon displays retain calendar time. Client 0.20.2.
- Document the shared timing delivery plan and add large-offset, reconnect and UI clock-wiring regressions.

- Integration: sim 0.22.2 includes catalogue field schemas; 14 reviewed cliff
  golden hashes now track PR62 while every other resolver hash stays unchanged.

## 0.24.0 — 2026-09-23

- Add optional per-role traversal medium metadata (D6), with no runtime movement switch.
- Add the versioned, validated tileset rule catalogue and deterministic mask/role interpreter. Existing cliff content stays unchanged.
- Fence/hedge compatibility assets and frames are authored data; live Studio and game objects join by definition membership and `connectsTo` IDs/tags. Runtime content can replace join art without changing code.
- Keep complete formatted catalogue definitions in the Tiles JSON editor instead of clipping them at 32 KB.
- Pin pre-migration resolver outputs for raised terrain, transition/shore, blob47/farmland, waterfall lanes, cave patches and connect4 masks.

- Add server-enforced Studio domain scopes with additive grant overrides, legacy access compatibility, audited previews, stale-state protection and idempotent audit receipts.
- Check all content kinds in publishes, deletions and restores, and gate administration families. Studio mirrors private scope state in tool access.
- Bind script review records to artifact hashes and authenticated authors; require a separately scoped approver. Reviewed warm-build release gates remain required.

- Integrate object-archetype form schemas, omitting excluded optional-never keys;
  arrange the schema specimen beside data controls to avoid district overlap.

- Studio 0.14.0 replaces leaf-only definition fields with schema forms, optional components, array add/remove/reorder, enum choices and typed references. Items, Narrative and World Tables retain advanced JSON and existing validation/publish gates.
- UI 0.21.1 adds reusable schema forms, array editors, reference pickers with preview and used-by panels. Sim 0.22.1 exports type-derived schemas for all 25 content kinds with regeneration and bootstrap parity checks.
- New item/recipe actions create local drafts; references open the selected definition, using World Tables for kinds awaiting specialized selectors.

## Studio 0.13.3 — ownership marker token integration

- Preserve P0 ownership and P1 exact terrain parts under the kit gate; move all
  live-marker colours to spatial tokens and remove the temporary controller exception.

## 0.23.2 — 2026-09-22

- Correct desert, shroomland and volcanic cliff courses; restore native shroomland inverse corners and per-family cap/floor references (sim 0.21.1).
- Studio 0.13.2 repairs conflicting diagonal insets only around Smart Placement strokes; Exact Placement and existing maps remain valid. Stone cliff brushes select matching grass 1–4.
- Engine 0.20.1 renders explicitly authored desert/shroomland cap materials from the selected native family.
- Regenerate independently reviewed native examples with corrected diagonals, matching grass/desert/volcanic ground, cyan oasis water, and explicit withheld interior assemblies where source roles remain unverified.

## 0.23.1 — 2026-09-22

- Studio 0.13.1 paints newly loaded palette thumbnails while the placement-mode menu stays open, preserving its selection and drawer scroll.

## 0.23.0 — 2026-09-22

- Studio 0.13.0 restores Marlow's live camp path under Generated Base and removes the proven duplicate 47-frame path bank from Exact Placement without deleting saved IDs.
- Assets 0.18.0 imports 38 exact paving variants and repairs empty desert grass/interior wall imports with complete native source coverage. Tools 0.19.0 adds deterministic import and atlas audit tooling.
- Adds the source-linked atlas inventory and visual terrain joining guide: all 1,320 registered assets, 1,233 source files, 22 runtime biomes and 8,448 neighbour-mask cases, with explicit unimported/unverified source gaps.
- Includes the Studio 0.12.1 legacy joined-fence drag footprint repair; records the read-only live-map duplicate audit.

## 0.22.1 — Legacy fence movement

- Match older automatically joined fence and hedge selection/placement footprints to their one-cell rendered segments. Moving a legacy segment back into a joined row now commits correctly.
- Save one-cell geometry for only the edited instance, with atomic undo and small-delta publication; retain Exact pieces, gates, scaled objects, and untouched legacy prefabs.


## 0.22.0 / Studio 0.12.0 — Smart placement and stable object editing

- Use compact parchment tooltips, persistent drawer scrolling, larger tool buttons, native scrollbar art and uncropped layer eyes.
- Select object silhouettes, delete through a right-click menu, and edit labelled properties without a redundant Selection dropdown.
- Group joinable objects and terrain materials in Smart placement; expose individual pieces in Exact placement. White picket fences use one-cell geometry and local connections; reject new same-layer object overlap.
- Share typed object appearance and growth rules between Studio and the game renderer. Publish live resource growth and health edits as atomic, conflict-checked deltas applied once, preserving subsequent gameplay growth.
- Invalid map geometry remains allowed. No whole-map placement repair or new database schema is introduced.

## 0.21.3 — Clearer workbench artwork

- Published with the Update Ready dialog spacing fix through PR57; all 5,992 release tests and strict reconnect checks passed. See `docs/release-2026-09-22.md` for artifacts and observer-milestone recovery evidence.

- Rework the crafting workbench for its native 32-pixel width: quieter wood, clear plank seams, a readable mallet and a connected iron vise. Preserve the two-tile size, collision and interactions.
- Retain the original high-resolution artwork alongside the revised AI source and reproducible sprite import.

## 0.21.2 — Update dialog spacing

- Raise Refresh Now and Later inside the Update Ready dialog so both buttons clear the bottom frame; pointer targets follow their visible position.

## 0.21.1 — September 22 integrated release

- Combine Studio freeze recovery, atomic map deltas, responsive terrain and Canopy selection with NPC camera alignment, world interaction registration, the two-tile crafting workbench and picked-fruit visuals.
- Preserve all six PR histories and their highest workspace versions; release scope and verification are recorded in [the release handoff](docs/release-2026-09-22.md).
- Record the owner-approved workbench relocation with unchanged chest contents and the dedicated development account’s verified Admin publishing access.

## 0.21.0 — Picked fruit disappears from trees

- Picking apples, pears, peaches, or cherries now shows the matching fruitless tree until fruit ripens again.
- Reuse the existing native fruitless sprite, preserving tree position, scale, sway, and sapling/stump states.
- Select visuals from shared authoritative harvest state so reconnects and other players see the same fruit availability.

## 0.20.0 / Studio 0.11.0 — Responsive terrain and selection

- Keep hover outlines and palette tooltips stable through control rebuilds; size inventory reticles to each palette button and center compact layer rows.
- Show selected tree/object sprites and the resolved tile composition. Move Canopy resource trees in local drafts, with atomic placement deltas that preserve identity, harvest state, and generator reconciliation.
- Keep material painting at the existing elevation, create complete 2×2 height footprints, and continue grass-water banks with Auto surround. Limit assistance to each placement and its immediate neighbors; preserve manual geometry and make whole-map design checks opt-in and advisory.
- Avoid repeated whole-island cliff generation and whole-document work during a stroke; coalesce draft persistence after drawing and flush it on navigation.

## 0.19.0 / Studio 0.10.0 — Atomic map delta publication

- Publish only changed map entries and removals against a verified live base; deleting a tree no longer uploads the entire map or exceeds the server's payload limit.
- Apply deltas atomically on the authority with revision/hash conflict checks, full map validation, retry receipts and existing history/game subscriptions. Existing snapshot callers remain supported without a database schema change.
- Keep rejected drafts and show visible publish failures with retry/dismiss controls. Preserve edits made while a previous publication is awaiting its live receipt.

## 0.18.4 — World interactions and crafting workbench

- Empty hotbar rows no longer show missing-item question marks; real unknown items retain fallback artwork.
- Nearby E actions, including picking ripe fruit, remain visible alongside selected-item F hints.
- Route nearby interaction selection through a provider registry supporting UI-opening and action callbacks, deterministic proximity, unregistering and exclusive dismount. Existing adapters retain their authority/reach rules.
- Replace the table-derived workbench with dedicated AI pixel art, a two-tile footprint, carry/placement support and three-hit axe dismantling that returns its four planks. Validate and target both occupied tiles.
- Document current direct anvil repair, its material/currency cost, and the unshipped repair panel. Client 0.18.2; UI 0.18.1.

## 0.18.3 — NPC camera alignment

- Keep resting and sleeping animals fixed to the ground while the player moves by aligning all world layers to the same camera pixel grid.
- Preserve NPC/player movement interpolation and stabilize actor rounding at higher rendering resolutions.
- Record the measured cause, regression coverage and release handoff in [the investigation](docs/npc-camera-jitter-investigation.md).

## 0.18.2 / Studio 0.9.3 — Live map freeze recovery

- Load the player appearance/held-light, enemy, mount and wildlife artwork used by Studio's live map before rendering actors, fixing repeated missing-art exceptions that froze the canvas.
- Store map drafts with lossless compact JSON so the published town fits browser storage. Storage failures preserve the open map and previous saved draft, show an export warning once, and no longer interrupt checkout or editing.
- Preserve explicit conflict resolution and existing local drafts; no map or content publication is part of this Studio update.

## 0.18.1 — Ripe fruit when a tree is chopped

- Chopping a ripe apple, pear, peach or cherry tree again drops its fruit, the Orchard Seed Saver seed roll and Farming XP along with the wood.
- Chopping a tree whose fruit was already picked still drops wood or sticks only, until that fruit ripens again.
- Picking with E or touch is unchanged.

## 0.18.0 / Studio 0.9.2 — Integrated town and live editor

- [Player-facing notes for 21 September](docs/releases/2026-09-21.md) cover the integrated gameplay, town, artwork and Studio updates; publication evidence is linked there.

- Combine the refined town, persistent streetlights and connected scenery with Studio’s local draft editing, native joins and incremental rendering.
- Preserve both shared rendering paths and the canonical content validation and serial timing-test gates.

## Unreleased — Town release verification

- Regenerate canonical space/object property ordering and check exports early in CI;
  definition values and the approved content hash are unchanged.

- Preserve a separately reviewed Studio artifact during guarded schema migrations
  after source-manifest, installed-output, UI-kit and generated API checks.
- Document the encrypted dedicated development account and verified Content
  Editor grant for future agents.

- Run CPU-heavy town/Studio fixtures and UI timing budgets in the serial,
  non-coverage test lane, preserving all assertions and existing timing limits.
- Allow guarded same-schema world releases to preserve the independently reviewed
  installed Studio artifact with exact manifest and static validation.

## 0.17.1 — Willowharbour headwaters and finishing details

- Make streetlamps 3.5× brighter within their existing light radius and use the matching bright native lantern frame.
- Complete bridge undersides with native stone arches over animated river water.
- Connect an upper freshwater lake to the town river with a complete animated waterfall anchored on the cliff plane.
- Keep fences off shallow turf shelves and flowers out of fence cells and gateway approaches.

## 0.17.0 — Connected town scenery and inhabited rooms

- Resolve native wooden, large wooden, picket, stone, large stone and hedge boundaries from cardinal neighbours; player-built wooden fences now use all sixteen native joins.
- Close shallow bank contours with native inner/outer corners and two-cell returns; repair the farm gateway and remove decorative Willowharbour chests.
- Persist streetlamp Auto/On/Off modes through ordinary world objects and interactions; synchronize native artwork and emitted light with world time.
- Join native interior wall caps and sides, place supported windows, and redesign all ten interiors around their room functions and clear circulation.
- Record independent Astra visual acceptance and saved-map upgrade rehearsal.

## 0.16.0 — Willowharbour river town refinement

- Continue the river through the town to a sandy estuary, with four traversable bridges and preserved door/return routes. Add shallow native turf banks, cultivated flower beds, mature garden trees, white picket garden returns, connected hedge corners and a cobbled civic square.
- Add streetlights at bridges and public junctions using the shared warm authored light component.
- Separate domestic interior wings with capped and vertical wall faces; give the inn, barn, greenhouse, shop and smith distinct functional envelopes and preserve room/service access.
- Fix freshwater-to-ocean bank transitions and lock mature tree species independently of the decorative asset catalog.
- Preserve current-main integration and document independent Astra reference comparison.

## 0.16.1 / Studio 0.9.1 — Immediate local map editing

- Enlarge object and terrain palettes, use generated pixel tools on one row, native inventory reticles and framed in-game category icons. Keep footer chrome intact and place explicit Publish below Auto.
- Support right-drag panning, dragging objects from the palette and immediate artwork movement while dragging placed objects. Draft edits remain local until Publish.
- Update sparse terrain cells and affected ground chunks without blanking the map; preserve terrain picking, inherited materials and undo behavior.
- Load all tree growth/depletion artwork, retain resource definition identities and keep tree sprites visible at overview zoom.
- Split selection preview/properties and compact layer rows into independent right-hand panels.
- Add local browser fixture and regression coverage for tree rendering, terrain parity, cache retention, drag/drop and footer layout.

## 0.16.0 / Studio 0.9.0 — Live map authoring

- Require sign-in and a verified live map before opening the Studio workspace; remove offline/connect toolbar controls.
- Replace map drawer dropdowns with six tools, searchable virtual object/material icon grids, category filters, reticles, height controls and an Auto surround preference. Simplify each layer to visibility and selection.
- Put authored and live resource trees under Canopy and render resources at overview and detail.
- Preserve material, biome and collision together; constrain raise/lower to the active plane, generate local footprints, and retain interior floor and grass-family rendering.
- Share height-aware native fence/hedge joins between Studio and gameplay, with persisted editor overrides. Audit all tile assets and native art limits in [generation rules](docs/studio-generation-rules.md).
- Studio deploys independently; game/authority updates remain subject to a separate release.

## 0.15.0 / Studio 0.8.1 — Branch integration

- Integrate the reviewed Studio editor, six connected gameplay slices, Willowharbour,
  hoe/fish fixes, action baselines, catalogs and operational/design audits.
- Preserve Agent Mail startup guidance and all feature histories; refresh combined
  content and action baselines with independent Studio versioning.
- Consolidate review through one integration PR and retire stale worktrees only
  after preserving their committed work and non-reproducible local evidence.

## 0.8.5 — Unified action baseline tooling

- Begin P0 with a generated inventory of every live bootstrap item variant, current action owner, lifecycle triggers and numeric authored values. Add `actions:baseline -- --check|--write` and make drift a normal test failure.
- Add current-main geometry and bow charge goldens for the future tool/spell migration, plus ownership validation tests.
- Record the repair cursor/escrow requirements, pending gameplay PRs and remaining P0 audits in [the implementation handoff](docs/action-baseline-notes.md). This slice does not enable the new action system or repair UI.

## Publishing guidance — 2026-09-17

- Documented release-lane selection, encrypted shared-preview credential handoff,
  refresh validation, content equality and signed-in verification for future agents.

## 0.8.3 — Unreleased

- Draw fishing pools from their authored nature artwork again. A resource whose
  visual names a decoration family resolved to no atlas entry and rendered the
  placeholder "?" tile.
- Rain now waters crops. While a shower runs, every crop tile in an open-air space
  — the island and every homestead, never a residence or cellar — is topped up on
  the weather sweep, with growth settled first so no progress is lost. Tilled soil
  without a crop keeps its own decay timer.
- Climb a cellar ladder only from the tile at its foot while facing it. The prompt
  no longer reaches sideways or diagonally past nearby objects, and the reducer
  enforces the same tile and facing.
- Count a placed anvil as the crafting station its recipes require. Anvil recipes
  such as the watch reported "REQUIRES AN ANVIL WITHIN 2 TILES" even while the
  player stood against one, because a placed anvil reported no station at all.

## Unreleased — Planning

- Specify unified tool/spell actions, modifiable targeting and resource costs, exact
  G-debug limits, and a dedicated repair UI with atomic output-to-cursor collection.
  Record phased delivery and anti-duplication gates; no runtime changes.

## Unreleased — Documentation

- Audit current and planned gameplay loops against source, identify weak links and
  stale design status, and propose an estate → outing → return progression network.
  See the [gameplay loop dependency audit](docs/gameplay-loop-dependency-audit.md).
  No gameplay behavior or balance values change.

## Unreleased — Frontend asset delivery audit

- Document measured frontend payloads, live cache/compression behavior, and
  prioritized asset-loading improvements for catalog growth. Include validation
  criteria and implementation handoff; no runtime or deployment changes.

## Unreleased — Icon audit

- Audit 336 item definitions and 66 skill nodes against the new Kenmi premium
  icons. Prioritize the hammer and six shovel tiers, plus 13 other first-pass
  replacements, a cellar bottle candidate, verified
  source coordinates, and keep/defer decisions without changing runtime artwork.

## Unreleased — Reference library

- Refresh stale Cute Fantasy catalog paths after the prior library reorganization
  and classify existing generated tool-progression references as concept-only.

- Index Kenmi’s 6,982 premium icons across nine native category sheets, with
  complete vendor-number-to-sheet coordinate lookup and source licence provenance.
  Verify redundant individual/scaled exports against retained native artwork and
  preserve the original archive in a local backup outside the indexed library.

## 0.8.5 — Hoe and swimming fish fixes

- Route F with a hoe to tilling, crop uprooting, or soil restoration instead of
  an entity-only swing. Both the swing and direct-use shortcuts yield to the
  farming action; damaged tools still repair at a faced anvil.
- Draw fishing pools with the fish sprite’s `sway` animation. The earlier art
  lookup fix found the correct sheet but requested its nonexistent `base` frame,
  leaving randomly spawned pools invisible. Depleted pools remain hidden.

## 0.8.4 — Anvil repair release

- Repair tools at an anvil again. Since the facing-swing change, F swung any tool
  with an authored swing, which is every pickaxe, axe and hoe, before the anvil
  branch could run. A damaged tool faced at an anvil now repairs; an undamaged
  one, or one facing anything else, still swings.
- Increase the measured content payload budget to 525 KiB for the existing heavy-station carry definitions.

## 0.8.3

- Carry placed barrels, fermentation casks, fruit presses, furnaces and anvils
  again. The content pack authored no carry policy for them, so F did nothing and
  the authority answered "not carryable". Each is now a heavy station: it is
  carried in both hands as the same world entity, contents and all, and never
  enters the inventory. Faced heavy stations show a `[F] CARRY` hint.
- Climb the cellar ladder from the tile directly below its bottom rung. The
  ladder art is drawn from its foot, so it stood three floor rows above the
  climb tile; the exit portal and the trapdoor arrival now sit on the chamber's
  first two floor rows and existing homesteads are repaired on connect.

- Repair mining after the facing-swing change. A pick swing measured a resource's
  contact point from the feet while the point itself is authored at chest height,
  which cost an upward swing more than half its reach; and the swing key returned
  before the cellar-wall strike it cannot perform, so cellar walls could not be
  mined with F at all. Swing reach and arc are unchanged.
- Draw fishing pools from their authored nature artwork again. A resource whose
  visual names a decoration family resolved to no atlas entry and rendered the
  placeholder "?" tile.
- Rain now waters crops. While a shower runs, every crop tile in an open-air space
  — the island and every homestead, never a residence or cellar — is topped up on
  the weather sweep, with growth settled first so no progress is lost. Tilled soil
  without a crop keeps its own decay timer.
- Climb a cellar ladder only from the tile at its foot while facing it. The prompt
  no longer reaches sideways or diagonally past nearby objects, and the reducer
  enforces the same tile and facing.
- Count a placed anvil as the crafting station its recipes require. Anvil recipes
  such as the watch reported "REQUIRES AN ANVIL WITHIN 2 TILES" even while the
  player stood against one, because a placed anvil reported no station at all.

## 0.8.2 — Unreleased

- Add a hammer button above the crafting spanner to toggle the build menu without a
  keyboard. Move the weapon shortcut above it to keep touch targets separate.

- Account for the published content hash in village-order quote verification while
  still checking every price, quantity, receipt and player-state field.

- Keep first world connection, subscription hydration and initial retries in the
  normal gateway loading window. Show Reconnecting only after an entered world
  loses its connection; retain update, offline and sign-in recovery actions.

## 0.8.1 — Unreleased

- Correct horse/boat interaction reach from 32 tiles to 2, horse dismount distance
  from 18 tiles to 1.125, and horse wander radius/speed to their original units.
- Prioritize dismounting on E while mounted, including beside homestead entrances,
  and use authored mount reach consistently in client targeting and server checks.
- Resolve wildlife and enemy action targets through their active creature/enemy
  definitions so valid sword/axe targets no longer fail as missing NPC definitions.
- Interpolate NPC/mob positions between rendered frames using the same frame
  fraction as the camera and players.
- Swing axes, swords, picks and hoes in the player's facing direction without a
  selected target. Hit every contact in the authored arc; spend stamina once and
  apply durability wear per contact, completing the swing before a tool breaks.
- Use a shorter, narrower pick arc. Preserve mining tiers, ownership and loot
  rules; left-click retains explicit cellar excavation and farming operations.
- Show a single-line tool name immediately, then detailed information after a
  short hover in a bounded panel above the hotbar, including current durability.
- Publish corrected NPC/item content and generated lifecycles with the module/client update.
  No stored schema changes; existing player and horse positions are preserved.

## 0.8.0 — Unreleased

- Regenerate world client bindings for the five existing legacy-farm admin endpoints
  so the guarded release can verify exact module/client API parity.

- Mature apple, pear, peach and cherry tree harvests can drop a matching plantable
  seed (5% base chance). Orchard Seed Saver adds 10 percentage points per rank,
  reaching 35% at rank three. Plant on clear grass or tilled soil in the homestead or
  overworld; the matching sapling grows and regrows normally. Tilling is optional.
- Advance the fruit-tree harvest ordinal for fresh rolls after regrowth and
  preserve player-planted trees during generated-world reconciliation.
- Publish module, resource/item/skill content and generated lifecycle artifacts
  together. No database schema migration.

## 0.7.1 — Unreleased

- Narrow the cellar wall ladder's interaction reach to the tile column in front of it.
  The ladder no longer claims the prompt from chests, crops or furniture placed a tile
  to either side. Prompt and authority share one reach contract.

- Run exhaustive procedural-terrain and survival-world suites without coverage
  profiling as part of `npm test`; retain every test and enforce unchanged source
  coverage thresholds in the remaining suites.

- Remove repeated world-module parsing from the cooking release gate and avoid
  parsing files without protected table names; retain mutation checks and test deadlines.

- Allow authorized content editors to repair verified historical packs before gameplay initialization; preserve strict publication results and isolate recovery disconnects.

- Preserve rotated release credentials through signing-key outages while withholding unverified identity tokens.

- Repair hosted CI prerequisites, dry-run portability and portable Keccak hashing;
  retain local licensed-art checks and pin reviewed imports for public CI.

- Allow verified historical content to be read during upgrades while strictly
  validating the candidate and preserving conflict checks and live-only content.
- Explain incompatible game content instead of labeling it a reconnect failure.
- Restore Sort & Stack for both chest and backpack panes in authored chest windows.
- Add shared chest inventory search by item name or ID, preserving physical slot
  routing for filtered items. Search stays above the hotbar when resized.

## 0.7.0 — Unreleased

- Mining payout and depletion XP now goes to Farming, matching its skill branch.
  Historical XP is preserved. Integration review and validation: [PR #6](https://github.com/Dastari/orchard-cellar/pull/6).

- Efficient Strikes now improves cave-wall excavation as well as ore-node mining.
  Fresh walls take 5–6 / 4–5 / 3 hits at ranks 0 / 1 / 2. Mixed-rank contributions
  and existing partial wall progress are preserved.
- Rockhound applies the same authored bonus-fragment roll to ordinary rocks,
  basalt and completed cave walls. Mother Lode also rewards eligible rich pure
  cinder and emberglass veins without replacing their primary material payout.
- Silver Pickaxe durability is 1,500, twice Iron Pickaxe. Its other stats and full
  repair cost (one Silver Bar plus five bronze) are unchanged.
- The private cellar_dig_progress table gains an appended default-zero work
  column. Release module and content together; no production deployment is part
  of this PR. Existing Silver tools gain the new maximum on repair.

### Harvest and cellar repairs

- Estate barrel/vintage upgrades apply in the cellar and residence, with an
  accessible upgrade menu in all home spaces.
- Clarify preserving barrels versus fermentation casks; preserve existing IDs,
  inventory and recipes.
- Implement Green Thumb, Seed Saver, Bountiful Harvest, Tender Hand, Soil
  Whisperer, Barreling, Master Grower and Harvest Festival. Enable the existing
  Sprinkler Engineering and Greenhouse Charter unlocks with prerequisite checks.
- Keep visitor growth/timing displays aligned with the active estate's skills
  and upgrades. Fix preserving timing when inputs occupy a nonzero slot.
- Add deterministic probability, daily boundary, authority, input restriction,
  processor and UI regression coverage.

## 0.9.0 — Willowharbour town and interiors

- Round the western island into coves and headlands with varied beaches and northern stone shelves. Replace grid-based trees with deterministic mixed-age groves and undergrowth.
- Add native grass transitions to stone and rural dirt paths; furnish the inn garden, market, pond, craft yards, cottage gardens and farm with streetlamps, well, troughs, crops and livestock.
- Design furnished interiors for all ten buildings, including both cottages, barn and greenhouse; connect every door in both directions and add room-specific floor materials.
- Add a conflict-checked offline upgrade against a reviewed prior map export. Preserve the main island, Cinderwake and the Studio renderer guard.
- Measure the expanded content at 546,411 bytes (+1.81%) and set its subscription budget to 534 KiB.

## 0.14.0 — Connected estate progression

- Train Farming with fishing catches (5 XP) and ordinary pool depletion (+10 XP), including Farming XP for tutorial catches. Preserve existing Explorer XP and all purchased skills.
- Price the East and South residence expansions at 60,000 and 180,000 bronze respectively (240,000 combined), retaining existing rooms and all bottle values, Vintage multipliers and first-bottle quest rewards.
- Add a source-derived production pacing report and make village-order comparisons read the same housing quotes as the game.

## 0.13.0 — 2026-09-21

- Completing all 12 Delve rooms and claiming the final guardian boon now permanently reveals the Delver Memorial Planter recipe, an optional residence keepsake crafted with stone, fiber and sunflowers.
- Track full Delve victories independently of temporary boons/currency. Content-disabled rewards are repaired on reconnect; death and abandonment grant no completion reward.
- Preserve completion receipts across quest resets and restore run-entry vitals as before.
- Keep the earned planter nonbuyable in authored commerce; reject purchase prices, including zero, in reward validation.

## 0.12.0 — 2026-09-21

- Mature apple, pear, peach and cherry trees now offer renewable E/touch fruit picking every game day, with ripening countdowns and existing seed-saver rolls. Picking preserves the tree; axe felling yields forestry materials only.
- Require a living player, current inventory protocol and unlocked persistent inventory before picking; rejected attempts leave the harvest and its rewards untouched.
- Persist readiness independently of tree health with an additive defaulted schema migration; inventory overflow uses the existing reserved drops.

## 0.11.0 — Village order specialist meals

- Learn Pantry Lunch after delivering two distinct raw products and one preserved product; learn Cellar Supper after two raw, two preserved and one bottle delivery. Repeat orders retain existing bronze payments.
- Track the next permanent recipe directly in Village Orders and receive a learned-recipe notice. New meals combine preserved produce with fresh crops to restore 36/48 hunger.
- Persist bounded private progress and grant recipe knowledge atomically with delivery receipts. Existing orders begin the new milestones at zero because historical receipts do not retain product diversity.

## 0.10.0 — Preserved expedition provisions

- Eat any preserved crop to restore 12–23 Hunger during outdoor work and expeditions. Full Hunger leaves the portion untouched; successful consumption records the existing food statistic. Preserving, prices and village orders retain their current behavior.

## 0.9.0 — Pomace compost

- Handcraft four Pomace and one Fiber into Compost. Select it and use F or the primary pointer action on a growing crop to advance its growth by 25%, once per planting.
- Record one lifetime `compost_applied` statistic per successful treatment for future quest/milestone connections, with no treatment XP.
- Settle elapsed growth before treatment, cap progress at maturity, and keep failed, unauthorized or repeated applications free of inventory changes. The new crop marker defaults to false for existing plantings.

## Studio 0.8.0 — Integrated reviewed editor

- Bring the reviewed Studio canvas UI kit and tools into the repository while
  keeping the game UI and Studio build/service independent.
- Share current runtime packages and canonical UI symbols; replace the external
  source overlay with a reproducible single-repository staged build.
- Retain live-map verification, draft safety, UI-kit checks, and rollback evidence;
  archive and retire the external source, remove six merged worktrees, and preserve
  active work plus checked rollback artifacts.


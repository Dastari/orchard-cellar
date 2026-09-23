# 02 — Technical Architecture

Binding architecture for Orchard & Cellar. Read [01-engine-decision.md](01-engine-decision.md) first.

> **Backend adopted (2026-08-24):** the persistent friends-only overworld runs on a
> SpaceTimeDB 2.8 TypeScript module. The M5.5 proof passed all checks in
> [19-overworld-spacetimedb-spike.md](19-overworld-spacetimedb-spike.md). The former
> `FarmRoom`, custom WebSocket, Fastify, and SQLite design is retired.

> **Rendering amendment (2026-09-06):** doc 59 authorizes an experimental
> WebGL2 world pass behind the shared `WorldPassBackend` seam in `packages/engine`.
> The Video toggle “Experimental: WebGL renderer” persists per client and defaults
> off. Canvas 2D remains the default, golden reference, automatic failure fallback,
> and HUD renderer. The engine remains TypeScript with no new dependencies.
> This supersedes the earlier no-WebGL restriction; making WebGL2 the default is
> outside this plan. See the `client/rendering` row in `DECISIONS.md` and
> [doc 47 §15](47-rendering-lighting-performance-plan.md).

## Proposed unified action architecture

[Unified actions specification](unified-actions-spec.md),
[implementation plan](unified-actions-plan.md), and
[ADR 002](adr/002-unified-actions-and-repair-custody.md) describe the proposed
shared targeting/parameter/cost contracts for tools and spells, exact G overlays,
and transaction-safe repair output collection. This is a planning record; the
existing runtime remains in effect until the corresponding implementation PRs land.

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
│   ├── engine/               # shared canvas renderer, terrain compiler, display and editor overlays
│   ├── ui/                   # shared design system, widgets, skin, authored storage frames
│   ├── world-bindings/       # generated SpaceTimeDB client protocol shared by game and Studio
│   ├── auth/                 # shared OIDC PKCE, token verification, and session peers
│   ├── studio/               # separate Orchard Studio Vite application
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
│   │   ├── sfx/              # *.sfx.json synth params
│   │   ├── content/          # generated bootstrap definitions for the live registry (doc 55)
│   │   └── generated/        # ignored shared atlas output consumed by game and Studio
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
- Gameplay content is revisioned data. The public `content_head` and
  `content_definition` rows are parsed by the pure `@orchard/sim` `ContentRegistry`;
  the authority caches the registry by revision/hash and the game retains its last
  fully verified revision while a subscription changes. Items, starter loadouts, resources, recipes, processes,
  shops, frames, objects, NPC/dialogue/quest/loot, terrain families, spaces, spawns,
  crops, creatures, outdoor enemies/encounters, skills, effects, statistics, upgrades,
  and balance groups all use this one registry. One bootstrap-pack loader parses the
  25 generated files under `packages/assets/content` (895 definitions, pinned hash
  `6af0522c`) through the
  same validators used for live rows; compatibility views are projected from that
  registry. The files are the deterministic bootstrap/migration pack, not a second
  live source of truth.
- Runtime decisions resolve semantic capabilities from that verified revision rather
  than stable-looking slugs. This includes item `onUse`, processor topology and output
  accounting, chest capability, NPC/dialogue/quest admission, fishing loot statistics,
  skill passives, outdoor encounters/enemies, creature presentation, Hearth fixture
  presentation, time equipment and placeable overlays. Renaming an authored definition
  therefore does not require rewriting retained runtime rows; missing, retired or
  ambiguous explicit definitions fail closed before durable writes.
- Static and dynamic space rules resolve through `runtimeSpaceDefinition` against
  that current verified registry on both authority and client. Server collision,
  portals, homestead bounds, reconnect repair and admin walkability, plus client
  rendering and regional subscriptions, never fall back to a removed bootstrap
  static definition. Geometry/presentation/streaming caches include the live content
  hash so a space revision becomes authoritative without player movement or restart.
- Studio-authored item lifecycle TypeScript is a reviewed warm-build input, not live
  row code. The restricted compiler produces the server handler registry and a
  callback-free client metadata projection from one validated source bundle. Every
  release regenerates and byte-compares those artifacts before source pinning;
  callbacks can inspect immutable snapshots and emit only authority-validated effects.
  The owner approves each specific live change in chat before the agent runs the
  guarded release; backup, rollback, non-destructive publication, parity and reconnect
  checks remain mandatory.
- Processor runtime authority is registry-derived: authored object components select
  process tags, slot topology, catch-up and manual batch bounds, while authored process
  definitions select inputs, fuel, outputs and durations. The server and client resolve
  these fields from the active revision; reducer transactions retain only generic atomic
  settlement, upgrade arithmetic, attribution, and migration-safe durable timing columns.
- SpaceTimeDB reducer transactions are the mutation boundary and commit log is the
  durable source of truth. See [08-database.md](08-database.md).

## Generated client protocol

The schema generates `packages/world-bindings/src`. Reducer parameters and row
types are therefore single-source, build-checked protocol definitions. Hand-authored
client networking consumes `@orchard/world-bindings` and wraps it with token persistence, event-maintained
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

## Mining skill coverage (0.7.0)

Cave-wall and ore-node transactions use shared deterministic mining work
(3/4/6 per strike). Wall progress remains private and authoritative, with an
appended default-zero work column; legacy hits convert lazily on the first
accepted strike. Physical hit counts are retained. Mining Endurance continues
through the common loadout/spending pipeline. Ordinary rocks, basalt and completed
walls share an authored bonus loot profile, while primary Hearth material payouts
remain guaranteed. The gathering readiness check validates referenced bonus loot
and materials in addition to the primary payout. See [48, coverage amendment](48-repeatable-mining-loop.md#2026-09-15-mining-skill-coverage-amendment)
for balance, migration and transaction invariants.

### Harvest and cellar bonuses

Estate upgrade lookups normalize garden/residence/cellar IDs through the indexed
homestead lookup. `active_farm_skill_nodes` projects the current estate owner's
Farming ranks (the caller's outside estates); `active_farm_upgrades` projects
the active estate's upgrade ranks. The existing `own_homestead_upgrades` view
retains its owner-only meaning for economy and release-continuity checks. These views keep
visitor crop and processor timing aligned with authority. Harvest yield and seed
bonuses belong to the harvesting actor; growth and barrel speed belong to the
estate owner. Authored capabilities are resolved only from active implemented
nodes with valid prerequisites. Daily harvest bonuses use successful harvest
statistic timestamps and stable authority days. See
[the audit and repair specification](harvest-cellar-audit.md).

### Content release across parser versions

Release captures and digest-pinned historical candidates are verified as immutable
payload evidence: row identities, counts and fingerprints must match. Their game
semantics may predate the current parser. New target definitions and the complete
merged candidate remain subject to current-runtime validation before publication.
The historical parser is used only when loading a previous approved candidate;
normal candidate verification and the production CAS retain strict validation.
See [the compatibility contract](content-release-compatibility.md).

### Historical content recovery connections

When the durable pack is incompatible with the current runtime, only existing
authenticated content editors can connect for repair after raw integrity checks.
They acquire no gameplay session or player initialization side effects. A
connection-notice marker isolates recovery disconnect cleanup and rejects gameplay
heartbeats without changing normal expired-session cleanup. Content
publication verifies the historical baseline as bytes, then validates the complete
new registry and commits under the existing CAS/audit contract. Ordinary gameplay
continues to require a valid current registry.

## Fruit seed loop (0.8.0)

Resource definitions can reference a plantable `seedItem`. The active registry
resolves seed-to-tree identity and Orchard Seed Saver's semantic capability;
retired or ambiguous definitions grant no drops or planting. The resource
harvest authority appends one independent seed roll to mature fruit payouts,
keyed by world seed, resource ID and activation ordinal. The existing `plantSeed`
lifecycle preflights permissions, clear ground, collision and exact single-seed
consumption, then inserts a sapling into `world_resource` and removes any existing soil.
IDs reserve bit 49 with 48 bits for space and signed tile coordinates; generated
resource reconciliation preserves this namespace. See [spec](fruit-seeds-spec.md).

### Build HUD control

The hammer HUD button and B key share the client build-mode toggle. The retained
UI routes taps to that callback; the client redraws and prioritizes the hammer
over the external build catalogue and touch joystick so touch players can also
close it. Existing modal input ownership remains ahead of the hammer.



## Independently deployed Cellar Studio

The reviewed editor source is `packages/studio`; its Canvas UI kit is
`packages/ui/src/kit`. It consumes the same current assets, content, simulation,
authentication and generated bindings as the game, with separate frontend entry,
build, origin, OIDC client and service. The game retains its existing UI. Studio imports the separate `@orchard/ui/studio`
entry so editor kit registration and UI Lab never enter the game bundle. Canonical
Lucide symbols live in `packages/ui/public`; prebuild prepares the requested app's
ignored public copy. `assets:build` prepares both copies for workspace validation.

`scripts/build-reviewed-studio.sh` stages one repository and its checked lockfile,
verifies the reviewed kit, and builds Studio without rebuilding or publishing the
game or database. See [integration spec](studio-integration-spec.md),
[decision](adr/ADR-studio-single-repository.md), and
[runtime procedure](../ops/orchard-runtime/README.md).

## Village order specialist milestones (0.11.0)

`fulfillVillageOrder` shares its existing receipt/inventory/payment transaction
with an owner-only `player_village_order_progress` row and permanent recipe
knowledge. Progress stores at most three distinct raw product IDs, three distinct
preserved product IDs and a bottle completion flag. Product families derive from
live tags and fermentation outputs. Existing receipts cannot reconstruct historic
product diversity, so the new milestone row begins empty without changing prior
payments or revisions. Repeated orders still pay, but do not advance diversity.

`ownVillageOrders` now projects milestone text and learned meal IDs using indexed
owner reads. The existing client subscription renders the next milestone and
announces newly learned recipes. Pantry Lunch (two raw kinds, one preserved) and
Cellar Supper (two raw, two preserved, one bottle) use existing gated recipe
knowledge and generated hunger callbacks. No new currency or public player data
is introduced. See [spec](village-order-milestones-spec.md).

### Preserved provision interactions

The 22 preserved crop items use authored food metadata and generated item-use
callbacks through the existing restoreHunger authority capability. They leave the
reviewed-inert catalogue; no new reducer, schema or subscription is added. Module
lifecycle artifacts and the matching content definitions must be published together.
See [preserved provisions](preserved-provisions-spec.md).
## Compost crop authority (0.9.0)

The authored Compost `place` lifecycle emits `compostCrop` plus one selected-item consumption through the existing transactional `useSelected` path. The world writer validates the whole batch before updating inventory or crops. Its crop plan settles elapsed watered growth and appends one bounded 25% advance; a default-false `world_crop.composted` column prevents reapplication for that planting. The column is appended after existing fields for additive migration. Generated public bindings expose treatment status for the farm prompt. No tick sweep or separate treatment table is needed. See [ADR-002](adr/002-crop-compost.md).

Successful treatment also records exactly one authored `compost_applied` lifetime statistic in the same transaction. The preflight requires this exact unit increment alongside one treatment and one consumed item; rejected actions leave statistics unchanged. This supports future quest and milestone links without granting XP.

## Connected estate progression (0.14.0)

Residence expansion prices live in the shared `RESIDENCE_EXPANSION_COSTS_BRONZE` balance constants and flow through `hearthResidenceExpansionQuote` to both client quotes and server debits. Reports read the same quotes. Fishing authority records future catch/depletion XP on Farming, with unchanged single-use cast custody, loot and existing lifetime statistics. No schema, inventory, historical XP or purchased-room migration is needed. See [the accepted specification](connected-estate-progression-spec.md).

### Willowharbour visual authoring (0.9.0)

The tools-only archipelago composer rounds the village coastline, authors variable
beaches and raised northern shelves, and places seeded mixed-age woodland around
reserved buildings, paths and level terrain. Paving retains one semantic public
network; dirt surfaces select soil art for rural lanes, while both surfaces use
the existing 47-frame native grass fringe. This does not change the original
island or Cinderwake generator.

All ten village buildings use content-defined interior spaces and bidirectional
portals. Optional bounded `hearthInteriorFloors` regions select rustic wood,
parquet, stone or planting soil without changing authoritative collision. See
[interior contracts](willowharbour-interiors.md) and
[visual pass specification](west-town-visual-pass-spec.md).

The offline exporter optionally accepts a reviewed prior map export to replace
only unchanged Willowharbour authoring. It checks prior cells, objects, prefabs
and transitions, preserves other regions and shared prefabs, then runs the normal
conflict-aware composer. Publication remains a separate world/content release.

### Willowharbour refinement (0.16.0)

The offline village authoring now cuts a continuous river through the road network;
four exported bridge spans restore dry crossing cells, with physical rail prefabs.
Shallow native earth-edge sprites give village greens microrelief without adding a
fractional elevation model. Native cobble ground prefabs preserve a paved border;
hedge tiles resolve from run connectivity and picket frontages include side returns.
Mature forest species use a dedicated list, independent of prop catalog ordering.
Freshwater edges treat ocean neighbours as connected water at estuaries.

Village interiors continue to use content-owned floor envelopes. Their cached
renderer now draws two native wall courses, top caps and side/south cut edges in
blocked cells, including cross-chunk overhangs. Utility spaces retain open working
halls; domestic wings connect through corridors with visible voids. Collision,
service approaches and both portal directions remain authoritative. See
[refinement specification](willowharbour-refinement-spec.md).

## Connected Willowharbour scenery and lamps

`sim/connected-boundaries.ts` resolves same-family cardinal masks into native tiles.
Town authoring uses this grammar for fences and hedges; the normal buildable wooden
fence uses a sixteen-frame atlas in the same mask order. Unsupported hedge T/cross
junctions fail explicitly because the source contains no matching boundary tiles.
`sim/turf-bank.ts` validates closed shallow shelves with two-cell stepped returns.
The shared rules are available to editor work; this change adds no Studio UI.

Authored map streetlamps materialize into `world_placeable` rows with reserved stable
coordinate identities. Their JSON state stores Auto/On/Off and the resolved lit flag.
The authority settles Auto at 18:00/06:00 and cycles modes through the ordinary use
interaction; rendering and light emission consume that same state. Active-map commits
remove retired authority-owned lamps and materialize new locations. The game skips
static lamp artwork/emission to prevent duplicates; offline map previews resolve Auto
from their supplied calendar time. No new persistence table is introduced.

Willowharbour interiors retain compact authored floor masks and explicitly placed
fixtures. Optional `hearthInteriorWindows` identifies supported north-facing room
walls; native wall-face and frame crops join tops, sides and returns. The room
programmes and placement reasons are in [the interior rationale](willowharbour-rules-interiors.md).

### Fruit tree harvest presentation

The gameplay resource painter uses the replicated `fruitReadyAtTick` deadline
and authority clock to choose a standing fruitless tree until fruit ripens.
The four existing orchard fruit sprites reuse their matching, already loaded
`tree_cf_fruit_mature` artwork at its native anchor and scale. Sapling and stump
states take precedence over fruit cooldowns. See
[harvested fruit tree visuals](fruit-tree-visuals-spec.md) for compatibility,
asset selection, and verification requirements.

### Studio smart placement and stateful scenery

Map prefabs optionally declare typed presentation properties and conditional
visual rules. Instances persist only their state values; the shared engine calls
`resolveObjectAppearance` for both game and editor rendering. Catalog grouping
presents semantic fence and growth families, while Exact mode retains individual
pieces. Same-layer occupancy checks run at the authoring operation boundary;
existing invalid geometry is not rejected or repaired globally.

Functional resource property edits are optional one-shot records in the map JSON
and small delta. The world validates all changed records against current resource
values before writing, preserves row identity, and ignores unchanged records on
later publishes so normal gameplay growth is never pinned to editor state. No
public reducer signature or database table changes are required. Functional
placeable/chest actions retain their existing audited preview/confirm boundary.

The selection inspector preserves its scroll and input models across actual data
refreshes. Open popovers defer shell replacement, and stable hover dwell survives
replacement without a hide/show timer. Native UI-kit track/grip art and compact
parchment tooltips are shared controls. See [the specification](studio-smart-placement-spec.md).

## Static world chunk materialization (pre-runtime migration)

`@orchard/sim/world-chunk` defines the versioned binary envelope, SHA-256 integrity,
64×64 core plus 1-cell halo, typed channels, and stable anchored records. The
engine's `ChunkTerrainStore` reconstructs today's `TerrainArray` contract without
calling generators. `scripts/materialize-world-chunks.ts` runs the existing client
path offline and audits the actual server collision functions in a VM with a
read-only fixture context. Client and server snapshots remain distinct where the
existing implementations disagree. This is additive tooling; the live server and
client continue to use their current map-document path. See
[world chunk materialization](world-chunk-materialization.md) for the format,
validation, and streaming follow-up boundary.

The additive D6 medium extension stores one versioned material ID per cell plus
solid blockers, independent of the retained walking/boat oracle channels.
Outside/unloaded cells are void; runtime ability-based traversal remains a later
lane. See the materialization procedure for fallback categories and rule metadata.

## Content-addressed atlas delivery (2026-09-23)

The default category atlas keeps today's eager startup request count. Both category
and semantic pack PNGs are SHA-256 addressed; a release-independent worker cache
bounds immutable atlas storage to 64 MiB/512 entries. The additional
`atlas.packs.json` maps semantic asset IDs to immutable pack metadata. Pack loading
is explicitly opt-in (`?atlasPacks=1`) until chunk-visible art ownership lands.
See [the pack contract](asset-packs-spec.md), [measurements and handoff](asset-packs-handoff.md),
and [UI loader API](../packages/ui/README.md). This prerequisite does not change
collision, world content, gameplay art ownership, or the first playable frame gate.


### Authored tile rule catalogue

Tileset definitions optionally carry a versioned `ruleCatalogue` envelope.
`sim/rule-catalogue.ts` owns strict parsing and deterministic mask → ordered
role fallback → frame/variant selection. `sim/connected-objects.ts` is the first
consumer: live objects use definition ids/tags and `placement.connectsTo`;
legacy map prefabs use explicit asset membership. Studio and client pass active
registry catalogues to the same index and engine renderer. The renderer caches
by asset identity so content changes cannot reuse stale family art. Existing
content without an envelope reads the bootstrap catalogue; an explicit empty
envelope disables connections. Blob47 farmland and the four native grass fringes now resolve committed catalogue
frames through `sim/terrain-rule-catalogue.ts`. Its fixed mask lookup tables keep
per-cell work bounded. Optional family layers compose independently; `matchMask`
selects relevant neighbour bits without encoding art rules in the engine. Hoed
and authored farmland share frame selection; native fringes retain separate
transition entries and engine family/height classification. Other terrain resolvers
remain pinned by compact golden hashes. See [schema contract](rule-catalogue-spec.md).

### Schema-driven Studio forms (F1)

The compiler-generated content schema graph reflects the exported definition types
in `packages/sim/src/content`. The graph describes literals/enums, optional fields,
arrays, fixed/optional/rest tuples, recursive variants and typed references. The
Studio kit consumes this graph through `uiSchemaForm` and `UiSchemaFormState`;
`uiArrayEditor`, `uiReferencePicker` and `uiUsedBy` are reusable compositions.
Domain parsers and the existing revision-checked publish models remain authoritative.
The generator drift test and bootstrap parser/schema parity test protect the boundary.

Items, Narrative and World Tables share the form adapter. Reference navigation
selects a concrete target; kinds without a specialized selector use the generic
World Tables form. The reverse-reference index follows declared reference fields
rather than searching arbitrary prose. See [F1 design](62-f1-schema-forms.md).

## Chunk runtime shadow boundary

The shadow phase adds public `world_chunk_shadow` and `world_chunk_head` metadata and private `world_chunk_blob` bytes. Owner-only staging verifies the existing immutable codec and compares map/content revisions before atomically replacing heads. The client uses a separate bounded chunk-native store with view/ring pins, a two-request loader and hash-key IndexedDB retention. It compares diagnostics without replacing legacy terrain or movement. An owner-only procedure samples private chunk collision without a whole-world reconstruction. Static preparation is offline and publication remains separately gated. See [chunk runtime shadow](chunk-runtime-shadow.md) for interfaces, limits and activation gates.
## Studio multi-space backend

F4 shares `sim/space-registry.ts` between runtime authority and Studio, resolving
revision-bound static geometry plus persisted homestead and rogue instances.
`adminSpaceRegistry` projects only geometry and ownership from private runs after
the admin gate. `adminEntitiesInAreaPage` uses `(spaceId, chunkX, chunkY, id)`
indexes and request-bound keyset cursors; scan budgets remain bounded even in
dense chunks or when filters return no matches. Studio uses per-space viewport
subscriptions while player presence remains global. Runtime-space route references
are read-only and distinct from map documents. See [specification](studio-multi-space-spec.md)
and [decision](adr/ADR-studio-multi-space.md).

### Gameplay timing clock domains

The client `content/timing-clock.ts` separates simulation authority from calendar
time. Processor and private-job progress consume `world_clock.authorityTick`;
calendar offsets only feed seasonal policy and calendar/weather/lighting displays.
Cosmetic clocks cannot confirm production completion. See
[shared timing specification](timing-system-spec.md) for the staged frame/hover
projection work and [decision](adr/ADR-shared-timing.md).

### Shared workstation timing projection

`projectTiming` in sim derives statuses, confidence, progress and deadlines from
existing process anchors and the same `settleProcess` mathematics as authority.
It never writes inventory or claims hypothetical output. Unknown private slots
produce estimates; expired public anchors require settlement confirmation.
Authored frame `{ timing: "process" }` text panes and spatial hover share the kit
timing canvas bridge. Retained `ui.timing` uses the same bounded label cache.
Processor metadata is cached per immutable content registry, projections per
row/tick/slot snapshot, and hover buckets per entity/map/content revision. Only
the open or hovered station is projected; no per-object interval is introduced.
The game build admits the small timing bridge and contrast modules only; retained
Studio components remain outside its dependency boundary.

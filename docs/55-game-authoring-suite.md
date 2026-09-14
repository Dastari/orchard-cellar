# 55 — Game Authoring Suite: Live Content, Behaviour Graphs, and Frame Designer

Plan, **2026-09-03**. Status, **2026-09-04**: **in progress; repository implementation
and production Stage A through verified `placeable_reads` are complete; authenticated
acceptance, chest finalization, and declaration retirement remain**. The uncommitted
`/editor/items` Item & Recipe Studio draft (`packages/client/src/editor/item-studio*.ts`)
is the read-only seed of Phase 1 and is superseded by this document.

**Relationship to [56](56-orchard-studio.md):** there is one new application,
Orchard Studio. Doc 56 specifies that application (package split, shell, deployment,
administration API, operator tools) and is the plan that decommissions `/editor`.
This document specifies the content and behaviour *system* Studio's Author mode edits:
the registry tables, event bus, effect applier, frame definitions, and the game's
consumption of them. Most doc 55 lanes are sim, world, and game-client work; its
studios are Studio tools registered through doc 56 §4.2 and never separate routes.

**Owner migration invariant (2026-09-03):** downtime is unrestricted, but the existing world is never disposable. Content/entity migrations use additive tables, dual-write/backfill/verify/retire sequencing, and a tested rollback from verified backups. Traffic resumes only after existing identities reconnect with inventories, equipment, wallets, quests, homesteads, placed objects and their contents/process state, positions, and all other durable rows unchanged except intentional migrations. No release command for this plan may use `--delete-data`.

Builds on:

- [02](02-architecture.md): one Canvas client, pure deterministic `packages/sim`,
  SpaceTimeDB as the sole authority; inputs-not-values;
- [08](08-database.md): additive schema, dual-write/backfill/retire migrations,
  caller-filtered views, permanent admin audit;
- [23](23-ui-system.md) §4 and [38](38-storage-frame-system.md): generic containers,
  `moveItem`, `StorageFrameSpec` compositions;
- [28](28-crafting.md): tag-driven placeable interfaces and lazy-settled processors;
- [31](31-npc-dialogue-and-commerce.md) and [36](36-character-progression.md):
  authority-owned dialogue nodes, quest definitions with statistic objectives;
- [42](42-world-editor.md) §7: the live-publish contract (compare-and-swap head,
  idempotent mutation ids, rollback revisions, audit) that this plan generalizes from
  the map document to every kind of content;
- [53](53-spacetimedb-optimization-plan.md): scan discipline and revision-keyed
  module caches.

## 1. Goal

An owner or granted content editor opens the editor and can author both content
data and the lifecycle code attached to it. Pure data changes publish immediately;
changes to a TypeScript lifecycle callback enter the reviewed warm-build pipeline
of §3.1 and do not become live until its rebuilt module passes restore/rejoin gates.

```text
new object "oil lamp"
  -> pick its sprite and icon from the reviewed asset library
  -> give it a shaped recipe (workbench: 1 iron_bar over 1 string over 1 glass)
  -> set buy 240 / sell 60 bronze and stock it at Marlow
  -> add a "lit" boolean state; lit emits a warm steady light, radius 4
  -> add a USE interaction that toggles lit, plays the "burn" animation, and
     costs nothing; add a secondary interaction "refuel" that consumes 1 oil
  -> place it as a homestead buildable with a 1x1 blocking footprint
  -> publish; every connected client and the authority use it immediately
```

and, in the same suite, author NPCs, conversation trees, quests, loot tables,
crops, wildlife, processor stations, and the **window that opens** when a player
uses one of those stations (which panes, which slots, which slot accepts what,
which buttons trigger which interaction).

The suite must be able to **re-create everything the game does today** from data,
so the hand-written content in `packages/sim` and the per-kind branches in
`packages/world` and `packages/client` can be retired rather than maintained
alongside a second system.

## 2. Findings — what exists today

### 2.1 Content is compile-time on both sides

Every definition is a frozen TypeScript literal in `packages/sim`, imported by
both the SpaceTimeDB module (`packages/world/src/index.ts:1-389` is one ~380-symbol
import) and by 85 client files. Rows carry only opaque ids (`kind`, `recipeId`,
`dialogueId`, `shopId`, `questId`); both sides resolve them through the shared
package. Adding an item today means editing `ITEM_DEFINITIONS`
(`item-containers.ts:79`) **and** `ITEM_ECONOMY` (`commerce.ts:45`, compile-time
exhaustive), then rebuilding and republishing module and client.

The one exception is the live map: `live_map_document` (`index.ts:1232`) is a JSON
document row with compare-and-swap publish, rollback history, audit, and a
revision-keyed compiled cache on the module (`compiledLiveIslandRuntime`,
`index.ts:6523`). That pattern works and is the template for everything below.

### 2.2 Clean data already exists for most of the game

| Content | Source | Rows | DB-portable as is |
|---|---|---:|---|
| Items | `item-containers.ts:79` | 159 | yes (tags are free strings) |
| Prices / shops | `commerce.ts:45,153` | 159 / 2 | yes |
| Grid recipes, recipe books | `recipes.ts:25,206` | 37 / 3 | yes |
| Cooking, smelting | `food.ts:80`, `smelting.ts:13` | 5 / 3 | yes |
| Placeables | `crafting.ts:29` | 19 | yes, but behaviour is elsewhere |
| Crops | `packages/assets/content/crops.json` | 23 (22 standard + Bob's quest crop) | yes |
| Wildlife species | `wildlife.ts:72` | 18 | yes; drops/XP are `switch` statements |
| Dialogue trees | `dialogue.ts:329` | 3 trees / 36 nodes | yes |
| Quests | `quests.ts:102` | 4 | yes (statistic objectives are the generic workhorse) |
| Skill trees, effects, statistics | `skill-trees.ts`, `effects.ts`, `player-statistics.ts:75` | 60 / 4 / 86 | yes |
| Homestead upgrades / buildables | `homestead-upgrades.ts:21`, `homestead-build.ts:37` | 4 / derived | yes |
| Map prefabs / objects | `map-prefab.ts`, `map-document-v3.ts` | JSON | already live |
| Light emitters | `packages/engine/src/light-sources.ts:23` | 4 | yes, but client-only |
| Storage frames | `packages/ui/src/storage-frame.ts` | 1 spec (chest) | yes, but presentation-only |

### 2.3 What blocks authoring: behaviour is code, keyed by string ids

There is no scripting engine, event bus, trigger table, or shared state-machine
abstraction. "What happens when you use X" lives in ordered branch chains:

- `useHands` (`index.ts:9544-9820`): ~280 lines dispatching on `homestead_deed`,
  `boat`, carried chest, carried combat target, then the one data-driven branch
  (`item.placeable` tag + `placeableDefinition`).
- `interactPlaceable` (`index.ts:9981`): `fence_gate` and `anvil` hardcoded, then
  the tag-driven `placeableInterface()` dispatch to five settle functions.
- The client `F` key (`overworld-main.ts:6489-6620`): a ~200-line hand-ordered
  if-chain (gate, ground lantern, campfire+axe, cooking, anvil, eat, held lantern,
  chest+axe, sword, deed, boat, carry/place…). `E` is registry-driven and clean
  (`interaction-targeting.ts`, `activateInteraction` `overworld-main.ts:3309`).
- Processor slot restrictions are declared in the client screen
  (`overworld-ui.ts:1427-1457`) and rebuilt in the reducer (`index.ts:4842-4858`),
  duplicating sim predicates.
- Light: `isSwitchableLightKind()` is literally `itemKind === 'lantern'`
  (`item-containers.ts:220`); colour/radius/profile are client-only.
- Loot: wildlife drops and XP are `switch` statements (`food.ts:166,177`); resource,
  fishing, and mining yields each invented their own shape. No loot-table type exists.
- NPCs have no definition table: ids are bare constants (`npc.ts:30`, `quests.ts:96`),
  camps are tile literals plus generator functions (`survival-world.ts:146-233,
  435-600`), and rows are constructed inline in the module (`index.ts:6195-6258`).
- Every station window is hand-laid-out in `overworldUiLayout()`
  (`overworld-ui.ts:574-983`). The generic path (`ui/compositions.ts`,
  `ui/container-binding.ts`, `storage-frame.ts`) exists but only the chest and the
  UI Lab use it. A new station touches the `OverworldWindow` union, the layout
  function, the open chain (`overworld-main.ts:1918`), the prompt switch, and the
  activate switch.
- `MapPrefabBehavior.archetype` is validated against a six-entry allowlist
  (`index.ts:6480`) and stored, but nothing materializes authored behaviours into
  runtime rows.

The full inventory of per-id branches (30 sites) is the parity checklist in §11.

### 2.4 Surfaces already in place to build on

- Live-publish kernel: CAS head + append-only revision + audit + client mutation id
  (`publishLiveMapDocument` `index.ts:7846`, `restoreLiveMapRevision` `:7915`).
- Statistics bus: `recordPlayerStatistic` (`index.ts:3666`) is called from nearly
  every gameplay reducer and already drives quests generically.
- Capability tags: `PLACEABLE_INTERFACE_TAGS` (`item-containers.ts:31`) prove that a
  data flag can grant a UI + authority contract on both sides.
- Generic slot rules: `SlotRestriction { acceptedKinds, requiredTags, readOnly }`
  and `slotAcceptsItem()` (`item-containers.ts:236,410`).
- Lazy settlement: every processor derives progress from a stored start tick.
- Editor shell: routes, workbench rail, canvas UI model, session autosave, live
  connection with owner/admin gating (`editor-live-connection.ts:95`).
- Asset registry: 4,044 reviewed prefab visual entries, atlas manifests with
  animation/state metadata, and the actor library (`ui-lab-catalog.ts`).

## 3. What "remotely update reducers" really means on SpaceTimeDB 2.8.2

Verified against the installed CLI and SDK typings:

- Reducers, views, procedures, schedules, and tables are **compiled into the module**.
  There is no API to add or change a reducer at runtime.
- A module **can be republished remotely** (`spacetime publish` over HTTP, or the
  unstable `--js-path` to push a prebuilt bundle) with **automatic migration when
  the schema change is additive** (`--delete-data=never` refuses anything else).
  Clients keep their connections through a compatible republish; the M5.5 gate
  proved state survives it.
- Modules can expose **procedures** with outbound HTTP (`ProcedureCtx.http`) and an
  **HTTP router**, which is enough for content export endpoints but not for
  building WASM.

So the suite is built in three tiers:

| Tier | What changes | Who does it | Latency | Mechanism |
|---|---|---|---|---|
| **A — Content (hot)** | items, recipes, prices, stations, slot rules, states, interactions, light, loot, NPCs, dialogue, quests, crops, wildlife, UI frames, spawn rules, balance numbers | content editor in the browser | seconds, no downtime | definition rows + a fixed, generic interpreter in the module and client |
| **B — Lifecycle code (warm)** | `onUse` and later lifecycle callbacks authored against the capability-limited context | agents author; the owner approves the specific release in chat | minutes plus chat approval/downtime | restricted-AST validation → repository checks and world build → owner “Go” → `npm run world:release` |
| **C — Engine (warm)** | a new *primitive*: effect opcode, context capability, event kind, table column, renderer feature | developer, via the release pipeline | minutes, additive republish + client deploy | `npm run world:release` (§12) |

Visuals, values, recipes and graph-composable behaviour remain Tier A. The owner may
instead express item-specific intent as real Tier-B TypeScript. Tier C should remain
rare: its capability vocabulary is chosen so lifecycle code composes trusted effects
without direct database access or a new reducer for every item.

### 3.1 Studio-authored TypeScript and the trusted build boundary

An item's lifecycle callback is real TypeScript, not JavaScript stored in a content
row and evaluated inside a reducer. Studio exports an
`orchard-lifecycle-source-v1` bundle containing sorted `itemId` + `onUse` callback
bodies and client prompt metadata. Tier-B releases require the owner's verbal
approval in chat for the specific live-world change. Agents author callbacks and
run the normal restricted-AST validation, typechecks, tests, and world build, then
briefly explain what will change in production. The owner replies with “Go” or
provides advance approval for that specific release. Approval never carries over
to a later release, and agents cannot approve their own work.

The 2026-09-05 chat-approval decision supersedes the owner-confirmation record,
exact-digest environment gate, candidate spool and handoff CLI, and loopback build
service. Those mechanisms are removed. Canonical source hashes and deterministic
build provenance remain integrity evidence, not an approval mechanism. This is a
solo project: the owner's chat approval is the control; revisit if a second person
ever joins.

Repository tests verify restricted-AST validation and deterministic build provenance,
while release tests protect rollback artifacts, non-destructive publication and
state parity, with fresh backup and restoration gates for stored-data migrations.
A passing test suite is not permission to publish;
the agent must have the owner's “Go” for the described change.

Before any source is materialized, `scripts/lifecycle-code-build.ts` parses it as an
AST without importing or executing it. Version 1 forbids imports, dynamic evaluation,
ambient server/network globals, constructors, nested functions, computed/prototype
access, context mutation, and unbounded loops. A `for...of` is allowed only over a
bounded local `const` array literal, which supports recipe books while keeping reducer
work statically bounded. Calls are restricted to the typed `ItemOnUseContext`
capabilities: read immutable snapshots, accumulate effects through `player`, `item`
or `emit`, or fail with `block`. It cannot access a reducer context, table, token,
filesystem, network, clock, timer, or random global.

The deterministic output exports
`AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS: readonly AnyHandlerRegistration[]` for the
authority and code-free `AUTHORED_ITEM_LIFECYCLE_METADATA`/JSON for client prompts.
After AST checks, TypeScript checking, tests, and the checked world-module build,
the agent describes the live change and obtains the owner's chat approval before
running the appropriate guarded release. The owner's later 2026-09-05 backup
policy distinguishes routine code/UI updates from actual stored-data migrations.
Routine updates rely on owner-managed Proxmox backups and retain checked code
rollback, `--delete-data=never` publication and same-identity reconnect checks;
agent-managed application backups and a fresh backup/rehearsal are not required
for each routine update. The owner will arrange host backups; this is not a claim
that they are configured or verified. Actual stored-data migrations continue
through `npm run world:release` with a fresh verified backup, rollback artifact,
isolated restoration rehearsal and durable-state parity before and after the
change. “Go” never waives preservation: if a required check fails, stop and report
the failure. Source that fails repository checks is never loaded by the live module.

Every ordinary world release also runs `lifecycle:integrity` before its source pin or
downtime. The gate validates the canonical source bundle, recomputes its SHA-256, and
regenerates the expected server module and code-free client metadata in memory, and
requires byte-for-byte equality plus matching build provenance. This prevents a later
engine-only release from accidentally shipping stale or independently edited callbacks,
prompts, or trigger lists outside the reviewed lifecycle build path.

The repository baseline in `packages/lifecycle-authoring` contains the three recipe
books, all current food items, and Orchard Tea as explicit `onUse` registrations plus
client metadata. Recipe books use `findRecipe`/`giveRecipe` and consume themselves;
food and tea produce the same bounded effects as their retired compatibility handlers.
It is the bootstrap migration reviewed as repository code. Every subsequent Studio
replacement follows the repository-check and specific chat-approval procedure above.

## 4. Architecture

```text
                editor studios (browser, owner/admin or content_editor grant)
                                    |
                     ContentChangeSet (upserts/deletes + expected revision)
                                    v
      publishContentChangeSet ----> content_head (CAS) + content_definition rows
                 |                      + content_revision (rollback) + audit
                 |                                    |
                 |                       subscription (all clients + module cache)
                 v                                    v
   ContentRegistry (pure sim) <--- built from rows, cached by revision hash ---> ContentRegistry
     on the authority                                                            on the client
         |                                                                            |
   generic reducers raise                                               client raises the same
   lifecycle events -> handlers                                         events for prompts,
   -> Effect[] -> effect applier                                        availability, predicted
   (the only table writer)                                              cosmetics; applies nothing
         |                                                                            |
         +------ same event bus + handlers (compiled TS or data graph): sim/behaviour/* ------+
```

Four decisions hold the design together:

1. **Definitions are rows with a JSON payload, one row per definition, one head per
   pack.** Not one typed table per definition kind (twenty tables whose every field
   change needs a republish), and not one giant document (a single item edit would
   resend everything). The map document proved JSON-in-a-row plus a shared parser is
   workable; a `ContentChangeSet` publish validates the *whole resulting registry* in
   one transaction so cross-references cannot dangle.
2. **Behaviour hangs on a fixed set of lifecycle events, and every handler returns
   effects instead of writing rows.** The reducer's job shrinks to: find the target,
   build read-only snapshots, raise the event, hand the returned `Effect[]` to one
   module-side applier. What fills a handler is pluggable (§4.2): a data graph for hot
   edits, reviewed Studio-authored TypeScript compiled into the module, or engine
   TypeScript. Authored callbacks receive only the bounded effect-collector facade;
   they never receive module/database handles and are never evaluated from content
   rows. Clients consume code-free lifecycle metadata and do not execute owner code.
3. **Objects are components.** A world-object definition is a bag of typed
   components (sprite, collision, light, container, processor, states, interactions,
   placement, merchant, dialogue, wander, loot, growth). Today's interface tags become
   components; today's five settle functions become one processor component.
4. **The authority never trusts a definition the client sends.** Clients send ids and
   verbs. The module resolves the definition from its own cached registry, evaluates
   conditions against authoritative rows, and applies effects. A draft that only the
   editor has is a client-side overlay for preview; it changes nothing until published.

### 4.1 Lifecycle events

The event set is small, fixed, and shared by objects, items, NPCs, tiles, and
players. Each carries a typed payload and read-only snapshots (target, actor,
selected item, space, tick, registry). New event kinds are Tier C; new *behaviour on*
an existing event is Tier A as a graph or Tier B as authored TypeScript.

| Event | Raised by | Payload | Replaces today |
|---|---|---|---|
| `use` | `interactEntity`, `E` key | target, actor | `interactPlaceable`, `interactChest`, `interactNpc`, `usePortal`, `interactHorse` |
| `secondary` | `useSelected`, configurable item-use input (currently `F`) | optional target, actor, selected item | direct food/book/tea use, melee swing and tool whiff branches |
| `equipmentUse` | `useSelected` for one exact equipped slot | actor, equipped item and absolute slot | held/equipped stateful item switches such as the lantern |
| `worldItemUse` | `interactEntity` on an item represented in the world | target, actor, world item | ground-item stateful use such as the lantern, without an object-id special case |
| `useWith` | `useSelected` with a selected item on a target | target, actor, selected item | axe on chest/campfire/resource and anvil repair |
| `useAt` | `useSelected` with a selected item and tile/action context | tile, action id, actor, selected item | fishing cast/reel and cellar excavation |
| `aimedUse` | `useSelected` begin/cancel/fire phases | aim, charge, actor, selected item | charged bow actions |
| `place` / `pickup` | `useSelected`, hands reducers | tile, actor, item or object | `placeSelectedHandsObject`, carried chest/target logic, `useHands` deed and boat branches |
| `break` | damage reaching zero | object, actor, tool | `harvestChest`, placeable damage, salvage |
| `slotChanged` | `moveItem` and cursor reducers on a container | container, slot, before/after | processor auto-start, restriction rechecks |
| `processComplete` | lazy settlement on read | object, units settled | five `settle*` functions |
| `timer` | `entity_timer` schedule | object, timer id | soil decay, item despawn, hive production, effect expiry |
| `walkOnto` / `enterSpace` / `leaveSpace` | movement settlement, portals | actor, tile or space | portal arrival, farm-zone entry, danger zones |
| `spawn` / `despawn` | spawn rules, head advance, admin tools | object or NPC | inline row constructors, wildlife generation |
| `tick` (coarse, 1 Hz, occupied chunks only) | `stepWorld` | NPC or object in an active chunk | NPC wander and fishing cycles, campfire auto-light |
| `dialogueChoice` | `chooseDialogueOption` | npc, node, choice, actor | quest accept/turn-in branches, shop mode |
| `questState` | quest engine | quest, from, to, actor | reward grants, homestead tier unlocks |
| `statistic` | `recordPlayerStatistic` | kind, subject, delta | already the quest bus; now also drives achievements, unlocks, NPC reactions |

The production bridge now emits `walkOnto` when authoritative movement crosses a
tile boundary, emits `leaveSpace` and `enterSpace` before a portal commits its
engine-owned relocation, and emits `despawn` for explicit admin/build removals,
expired world items, and retired rogue entities. The scheduled movement pass
reuses one immutable handler registry and content snapshot for the whole batch.
These system-owned hooks currently accept presentation-only effects (`sfx` and
`animation`): any durable opcode fails the transaction closed because the
existing row adapters are still coupled to `ctx.sender` and cannot safely
impersonate the moved player. Bulk migration/reconciliation deletion is not a
semantic gameplay despawn and deliberately does not invoke authored hooks.

Resolution order for a player action is fixed and data-independent: lifecycle handlers
for the selected item, then handlers on the targeted entity, then tile handlers
(farming, digging, fishing). Within one target, handlers run in declared `priority`
order and the first whose conditions pass wins unless it declares `continue`.

### 4.2 Handler kinds

```ts
type Handler = (event: LifecycleEvent, view: ReadOnlySnapshot) => HandlerResult;
type HandlerResult = { effects: Effect[]; continue?: boolean } | { blocked: string };
```

| Kind | Where it lives | Hot | Bounded | Validated | Editor renders | Use for |
|---|---|---|---|---|---|---|
| **Compiled TS** | `packages/sim/src/behaviour/handlers/*.ts`, registered by definition id or tag | no (Tier C) | yes | by the compiler and tests | no | the migration bridge; engine-shaped mechanics (mounting, homestead founding, combat) |
| **Data graph** | `interactions` in a definition payload (§6.2) | yes | yes, by construction | fully, against the registry | yes | hot authored composition without code |
| **Authored TS** | approved generated module in `packages/lifecycle-authoring/generated` | no (Tier B) | restricted AST + effect cap | AST, types, tests, world build, specific chat approval, parity, isolated restore | source editor + diagnostics | item lifecycle intent such as recipe books, food, tea and future owner-authored callbacks |

All three kinds see the same event and snapshot types and return the same effects,
so they coexist on one bus. A definition may mix them during migration: a compiled
handler for `place` and a data graph for `use`. The parity rule (§11) is that a
compiled handler is deleted only when its data-graph replacement passes the same
golden effect-list test.

### 4.3 The effect applier boundary

The applier is the only module code that writes gameplay rows in response to
behaviour. It is a `switch` over the effect vocabulary of §6.2, each arm reusing the
existing helpers (`insertWorldPlaceable`, `recordPlayerStatistic`, `acceptQuest`,
inventory insertion, lighting columns, portal travel). It enforces caps (effects per
event, spawns per transaction, timer horizon), records statistics, and converts a
`blocked` result into a `SenderError` toast. Because deciding is pure and applying is
mechanical:

- the client runs the same handlers for prompts, availability, and predicted cosmetics
  and never applies durable effects;
- tests assert golden `Effect[]` for a fixture snapshot instead of table state;
- a handler cannot bypass reach, role, ownership, or capacity checks, because those
  are conditions evaluated before it runs and applier preconditions after it returns;
- adding a script evaluator later changes nothing in the applier.

### 4.4 How the hooks bridge the other blockers

The bus is not only the fix for the branch chains. Each remaining blocker in §2.3 has
a hook that lets its code path be replaced incrementally:

| Blocker | Bridge |
|---|---|
| Duplicated slot restrictions (client screen and reducer) | `moveItem` raises `slotChanged` with the target container's restrictions resolved once from the registry (frame or component); both the client pre-check and the reducer call `slotAcceptsItem` on that one resolved list. The screen constants and the reducer table are deleted in Phase 3. |
| Five processor settle functions | `processComplete` handlers on one `processor` component; settlement is a single pure function parameterized by the `process` definition, invoked from `use`, `slotChanged`, and `timer`. |
| Light colour and radius client-only | the `light` component is read by the client renderer and by the authority for occlusion and `setLight` effects, so the emitter registry and the `camp_campfire` special case disappear together. |
| Loot as switch statements | `rollLoot` effect against `loot` definitions; wildlife `break`, resource `useWith(tool)`, fishing reel, and mining yield all raise events whose handlers roll the same table type. |
| NPC definitions scattered | `spawn` raised at head advance and by spawn rules materializes `world_npc` rows from `npc` definitions; `tick` runs the wander or fishing cycle by AI kind; `dialogueChoice` replaces the inline quest branches. |
| Prefab behaviours stored but never materialized | the map document's `MapPrefabBehavior.archetype` resolves to an object definition id; head advance raises `spawn` for instances whose definitions have runtime components (container, processor, states) and leaves purely static prefabs as scenery. |
| Quest and statistic coupling | already an event bus; `statistic` and `questState` become first-class events so unlocks, rewards, NPC reactions, and achievement toasts are handlers rather than code in `refreshPlayerQuests`. |
| Timer columns per station kind | `timer` events from the one `entity_timer` schedule replace `smeltStartTick`-style columns as each processor migrates, and give soil decay, despawn, and hive production one bounded mechanism. |
| Client `F`-key chain | the client asks the bus for the first `secondary` handler whose conditions pass and renders its `prompt`; the chain becomes a lookup. |

## 5. Content registry

### 5.1 Tables (additive)

| Table | Visibility | Columns | Purpose |
|---|---|---|---|
| `content_head` | public | `packId` pk (`'live'`), `revision u64`, `contentHash`, `engineVersion u32`, `definitionCount`, `updatedBy`, `updatedAt`, `clientMutationId` | one atomic head per pack; clients gate on `engineVersion` |
| `content_definition` | public | `id` pk (`"<kind>:<slug>"`), `kind`, `slug`, `revision`, `hash`, `json` (≤ 64 KB), `updatedBy`, `updatedAt`; btree `by_kind` | one row per definition |
| `content_revision` | private | `revision` pk, `packId`, `parentRevision`, `changeSetJson`, `inverseChangeSetJson`, `hash`, `actor`, `timestamp`, `note` | append-only rollback/diff history, bounded window like map revisions |
| `content_editor_grant` | private | `identity` pk, `grantedBy`, `grantedAt`, `revokedAt?` | owner/admin implicit; explicit grant for others, mirrors `world_editor_grant` in doc 42 |
| `content_draft` | private | `identity` pk, `baseRevision`, `changeSetJson`, `updatedAt` | optional server-side draft so an editor can resume on another machine; browser autosave remains primary |

Definition ids are stable slugs (`item:oil_lamp`, `object:furnace`, `dialogue:marlow`).
Renames are forbidden; a definition may be `retired` (a flag in the payload) which
keeps it resolvable for existing rows but hides it from crafting, shops, spawning,
and the palette. The publish validator rejects retiring an item kind that no
replacement mapping covers while inventory or world rows still reference it.

### 5.2 Definition kinds

Every kind has a `schemaVersion`, a `parseXDefinition(json)` in sim that upgrades old
versions on read (the `MapDocumentV3` pattern), and a validator. Kinds, in the order
they are migrated:

| Kind | Payload (summary) | Replaces |
|---|---|---|
| `item` | displayName, icon (asset id + animation), quality, maxStack, tags, modifiers, **economy** {buy, sell}, **durability** {max, repairMaterial, repairCost}, **vigour** cost, **food** {restoreCenti, cookedFrom}, **fuel** {smelts}, **tool** {specialization, tier, reach, swing}, **ranged** {ammunition, projectile algorithm}, **light** (when held), **equip** {slot, avatarAction} | `ITEM_DEFINITIONS`, `ITEM_ECONOMY`, `TOOL_*_BALANCE`, `FOOD_RESTORE_CENTI`, `TOOL_SPECIALIZATION_BY_KIND`, `AVATAR_ACTIONS`, held-light branches |
| `recipe` | kind shaped/shapeless, pattern/inputs, output, station requirement (object tag), unlock hint (book) | `RECIPES`, `RECIPE_BOOK_DEFINITIONS` |
| `process` | station tag, input → output, ticks per unit, fuel policy, XP, quality hook | `SMELTING_RECIPES`, `CAMPFIRE_COOKING_RECIPES`, press/fermentation/barrel constants |
| `object` | components (§6) | `PLACEABLE_DEFINITIONS`, `PLACEABLE_INTERFACE_TAGS`, `PLACEABLE_LIGHT_EMITTERS`, `PREFAB_FOOTPRINTS`, decoration collision chains, `useHands` / `interactPlaceable` branches |
| `frame` | panes, slot bindings, restrictions, bars, buttons, tabs (§7) | `overworldUiLayout()` station windows, `CHEST_STORAGE_FRAME_SPEC` |
| `npc` | actor asset, display name, home {spaceId, tile}, ai (wander leash / fishing cycle / stationary / mount), dialogue ref, shop ref, quest giver flags, barks, health, panic profile | inline row constructors, `npc.ts` constants, `survival-world.ts` camp literals |
| `shop` | offers [{item, stock?, markup?}], currency rules | `MERCHANT_OFFERS` |
| `dialogue` | nodes, choices with conditions/effects (§8) | `DIALOGUE_DEFINITIONS` |
| `quest` | giver, prerequisites, objectives, accept items, rewards, abandon policy | `QUEST_DEFINITIONS` |
| `loot` | weighted entries with min/max, conditions (tool tier, skill rank, rare roll) | wildlife/resource/fishing/mining drop code |
| `crop` | current `CropDefinition` fields; derived seed/harvest/preserved items are generated *by the registry builder*, not stored | `CROP_DEFINITIONS` and its six derived tables |
| `creature` | species fields, variants, habitat, locomotion, loot ref, XP, hostility/archetype for rogue enemies | `WILDLIFE_DEFINITIONS`, `ENEMY_POOLS`, drop/XP switches |
| `spawn` | what/where/how many: species or object, space, biome/habitat filter, density, respawn ticks | generation constants in `survival-world.ts`, `wildlife.ts` |
| `skill_tree`, `effect`, `statistic`, `upgrade`, `space` | current shapes | their sim tables |
| `balance` | named scalar groups mirrored from docs/06 | `balance.ts` (numbers only) |

Derived content is never stored twice. The registry builder produces seed/harvest
items from crops, homestead buildables from placeable objects with recipes, and
merchant seed offers from crops, exactly as the sim does today.

### 5.3 Registry build and caching

`buildContentRegistry(rows): ContentRegistry` is pure, deterministic, and shared. It
parses every row, applies derivations, resolves references into indexed maps, and
returns a frozen registry plus a validation report. The module caches the registry
by `content_head.revision + contentHash` in a module global (the existing
`liveIslandRuntimeCache` pattern); a reducer calls `registry(ctx)` which returns the
cached instance or rebuilds once after a publish. The client does the same from its
subscription cache. Both measure build time; budget in §14.

Until Phase 6 retires them, the TypeScript constants remain the **bootstrap pack**:
`init` seeds `content_definition` from a generated `packages/assets/content/*.json`
export of the constants, and an empty head falls back to the compiled registry.

### 5.4 Publish contract

```ts
publishContentChangeSet({
  packId: 'live',
  expectedRevision: u64,
  clientMutationId: string,
  upserts: string,   // JSON array of { id, kind, json }
  deletes: string,   // JSON array of ids
  note: string,
})
```

One transaction: authorize (owner/admin or grant), CAS on `expectedRevision`,
idempotency on `clientMutationId`, apply upserts/deletes to a working copy, build the
registry, run the full validator (§13), reject on any error, write rows, advance the
head, append `content_revision` with the inverse change set, append
`world_admin_audit`. `restoreContentRevision(revision)` publishes the stored inverse
as a new head. Limits: ≤ 2,000 upserts per publish, ≤ 64 KB per definition, ≤ 8 MB
total pack; larger imports stage in batches behind a maintenance flag.

## 6. Behaviour model: components, states, interactions

### 6.1 Object definition

```jsonc
{
  "id": "object:oil_lamp", "schemaVersion": 1,
  "displayName": "Oil Lamp",
  "components": {
    "sprite":     { "asset": "prop_cf_oil_lamp", "animationByState": { "lit": "burn", "default": "off" }, "scale": 1 },
    "collision":  { "footprint": [[15]], "blocksMovement": true },          // 4x4 masks per cell, like MapPrefabCell
    "placement":  { "item": "item:oil_lamp", "layer": "object", "spaces": ["homestead", "interior"], "facing": false },
    "states":     { "lit": { "type": "bool", "default": false } },
    "light":      { "when": { "state": "lit", "equals": true }, "color": [255, 196, 120], "radiusTiles": 4, "profile": "steady", "offsetY": -6 },
    "interactions": [
      { "id": "toggle", "verb": "use", "prompt": { "lit": "PUT OUT", "default": "LIGHT" },
        "conditions": [ { "reach": "object" } ],
        "effects": [ { "toggleState": "lit" }, { "sfx": "lantern_click" }, { "statistic": "lights_toggled" } ] },
      { "id": "refuel", "verb": "secondary", "prompt": "REFUEL",
        "conditions": [ { "state": "lit", "equals": false }, { "selectedItem": { "tag": "fuel.oil" } } ],
        "effects": [ { "consumeSelected": 1 }, { "setState": { "lit": true } } ] },
      { "id": "pickup", "verb": "use_with", "with": { "tag": "tool.hand" }, "conditions": [ { "state": "lit", "equals": false } ],
        "effects": [ { "pickupAsItem": "item:oil_lamp" } ] }
    ]
  }
}
```

Components (all optional, validated as a set):

| Component | Fields | Today's equivalent |
|---|---|---|
| `sprite` | asset, animation by state, scale, variants, fence-join rule | `drawOverworldPlaceable` kind chain, `overworldPlaceableVisualScale` |
| `collision` | 4×4 cell masks, blocksMovement, occludesLight | `blocksMovement`, `survivalDecorationObstacle` |
| `placement` | source item, layer, allowed space kinds, footprint, requires role, connectsTo | `placeSelectedHandsObject`, `HOMESTEAD_BUILD_DEFINITIONS` |
| `states` | named `bool` / `enum` / `counter` with defaults | `open`, `lit` columns |
| `light` | conditional emitter(s) | `PLACEABLE_LIGHT_EMITTERS`, held-light branches |
| `container` | slot count, per-slot restriction, public/private, sort allowed | chest/placeable slots, `SlotRestriction` |
| `processor` | process tag, input/fuel/output slot roles, ticks per unit, catch-up cap, auto-start | furnace/cooking/press/fermentation/barrel settle functions |
| `interactions` | list of §6.2 | `useHands`, `interactPlaceable`, `F`-key chain |
| `damageable` | hits by tool tag, on-break loot ref, salvage from recipe | chest/placeable damage rows, `harvestChest` |
| `portal` | destination space policy, arrival offset | `space_portal` creation rules |
| `merchant` / `dialogue` / `wander` / `mount` | refs and AI parameters | `world_merchant`, `npc.ts` machines |
| `loot` | loot ref, gather verb, regrowth ticks, richness | resource gather/harvest paths |
| `growth` | stages, ticks, watering window, seasonal rule | `world_crop` + `crops.ts` closed form |
| `frame` | frame ref opened by the `openFrame` effect | window open chain |

### 6.2 Interactions

```ts
interface InteractionDefinition {
  id: string;
  verb: 'use' | 'secondary' | 'use_with' | 'place' | 'walk_onto' | 'tick' | 'break' | 'timer';
  with?: ItemMatch;                  // for use_with: selected item kind or tag
  prompt?: string | Record<string, string>;
  conditions: Condition[];           // all must hold; evaluated by the authority
  effects: Effect[];                 // applied in order inside one transaction
  cooldownTicks?: number;
  priority?: number;                 // ordering when several interactions share a verb
}
```

Condition vocabulary (v1): `reach` (object / tile / npc reach constants), `state`,
`selectedItem` (kind / tag / durability), `hasItem` (count anywhere accessible),
`role` (world or homestead role), `space` (kind or id), `questState`,
`statisticAtLeast`, `skillRank`, `timeOfDay` / `season`, `mounted`, `vitals`
(hunger/vigour thresholds), `random` (seeded from tick + ids), `slotEmpty` /
`slotHas`, `containerHasSpace`, `nearbyObject` (tag within N tiles, the workbench
proximity rule), `notCarrying`.

Effect vocabulary (v1): `setState` / `toggleState` / `incrementState`, `giveItem`,
`consumeSelected`, `consumeItem`, `damageSelected` (durability), `spawnWorldItem`,
`pickupAsItem`, `openFrame`, `closeFrame`, `startProcess` / `settleProcess`,
`sealContainer`, `spawnObject` / `despawnObject`, `spawnNpc`, `teleport` /
`usePortal`, `grantBronze` / `chargeBronze`, `grantExperience`, `applyEffect`,
`statistic`, `questAction` (accept / progress / turn_in), `say` (speech bubble),
`bark` (NPC), `sfx`, `animation` (actor action), `setCollision`, `setLight`,
`scheduleTimer` (one-shot via a generic `entity_timer` schedule), `carry` /
`placeCarried`, `mount` / `dismount`, `foundHomestead`, `rollLoot` (loot ref →
`giveItem`/`spawnWorldItem`), `fail` (named SenderError shown as a toast).

Rules: effects are bounded (no loops, no recursion beyond one `rollLoot`); every
effect maps to existing row writes; `random` uses the seeded sim RNG keyed by
authority tick and ids so the client can predict cosmetics identically; a definition
whose effects require capabilities the current `engineVersion` lacks fails
validation, so an older module never silently ignores an effect.

### 6.3 Runtime resolution

A data-graph interaction is a handler of kind "data graph" (§4.2) registered for its
`verb` event. `raiseEvent(registry, event, view): HandlerResult` is pure sim: it
collects handlers for the target from compiled registrations and definition payloads,
orders them, evaluates conditions, and returns effects. The authority reducer
`interactEntity(targetKind, entityId, verb, clientTick)` builds the snapshots from
rows, raises the event, and passes the result to the effect applier (§4.3).
`targetKind` is a validated namespace (`placeable`, `chest`, `combat_target`,
`world_item`, or `npc`), not an inferred table lookup: independently allocated
`u64` ids may collide across those tables and an unknown or mismatched namespace
fails closed. `useSelected` carries the same explicit namespace whenever it targets
an entity. Its `place` verb may use a carried object as the subject without a
selected inventory item; item placement, `secondary`, and `use_with` still require
the selected item checked by the authority. The client raises the same event for
prompts, availability, and predicted cosmetics; it never applies durable effects.

Processors keep lazy settlement: `settleProcess` derives units completed from
`processStartTick`, current definition ticks, fuel available, and output space, and
is invoked on open, on move, and on any interaction with the object. The five
`settle*` functions collapse into one.

### 6.4 Items as lifecycle owners

Every item definition is covered by the lifecycle ownership policy. **All item
interactions are lifecycle-owned; inert items have no action.** The presence of a
usable `onUse` hook—not a client-side item-kind branch—is what makes `E`/`F` offer
and dispatch the item action. An inert item has no usable hook and therefore
advertises no item action; adding an item name to a client input switch is never a
way to grant capability. A hook may be a hot data graph or approved TypeScript, but
there is one resolved `onUse` contract and never both registrations for the same
item/event/trigger. A
recipe book can therefore express the owner's intended code directly:

```ts
defineItemOnUse({
  itemId: 'item:wooden_recipe_book',
  id: 'item:wooden_recipe_book.on_use',
  prompt: 'READ',
  run(context) {
    const recipes = ['recipe:wooden_pickaxe', 'recipe:wooden_sword'];
    for (const recipe of recipes) {
      if (!context.player.findRecipe(recipe)) context.player.giveRecipe(recipe);
    }
    context.item.consume();
  },
});
```

`giveRecipe` accumulates a `learnRecipes` effect; it does not write a table. The
authority effect applier validates and commits the result atomically. Held lights,
food, recipe books, deeds and boats resolve through the same lifecycle registry;
`useHands` and the client input chain become metadata-driven ordered lookups.

The live authority also resolves tool specialization, quality gate, tier, reach,
Vigour balance, and avatar action from the active item revision. Engine algorithms
may consume those trusted parameters only after an item lifecycle emits the matching
bounded effect; tool metadata alone never grants an interaction. Consequently a
renamed or newly authored tool retains its configured mechanics without adding its
item ID to a server switch, while inert items with identical metadata remain inert.
Ranged weapons follow the same rule: the active revision supplies the ammunition
item, trusted projectile algorithm, and avatar action after `bowAction` is emitted.
The charge token pins the actual selected item, and each projectile carries that
weapon/ammunition identity through deterministic flight, impact, and recovery.

`onUse` is the item-owned lifecycle. `secondary`, `equipmentUse`, `worldItemUse`,
`useWith`, `useAt`, `aimedUse`, and `place` are engine invocation contexts, not
separate item behavior systems. `worldItemUse` lets the same item definition retain
its behavior when the item is represented by a world entity rather than an inventory
or equipment row. One callback may opt into any canonical combination and receives
the discriminated event plus normalized optional equipment slot, world item, target,
tile, action, aim, and charge inputs. Omitting triggers remains the original
secondary/F behavior.
The physical key binding is presentation/input configuration and is deliberately not
authored as authority. `context.pass()` lets a target-specific branch (for example
anvil repair) yield without claiming an unrelated use. Studio validates the same
source contract and restricted AST locally, persists revisioned drafts, and exports
deterministic source bundles; it never places executable callbacks in the normal game
client.

The current 0.4.0 source boundary contains **181 item definitions**:
**109** have exactly one authored TypeScript `onUse` callback and **72** are explicitly
classified as actionless in
`packages/lifecycle-authoring/audit/reviewed-inert-items.json`. The exhaustive catalog
ownership test (`item-lifecycle-catalog-ownership.test.ts`) rejects a missing or
duplicate item, an unreviewed actionless item, a
callback for an unknown item, capability evidence that drifts from its inert review,
or a data-graph callback left competing with a code-owned event lane. Lantern and
Torch each own one callback covering equipped and ground-world-item toggle contexts;
an inert item advertises no action.

## 7. Frame designer (station and container windows)

A `frame` definition extends `StorageFrameSpec` (docs/38) with bindings:

```jsonc
{
  "id": "frame:furnace", "title": "FURNACE", "style": "wood_parchment", "resizable": true,
  "panes": [
    { "id": "input",  "label": "ORE",  "columns": 1, "rows": 1, "bind": { "entitySlots": [0] },
      "restriction": { "acceptedFrom": { "process": "smelting", "role": "input" } } },
    { "id": "fuel",   "label": "FUEL", "columns": 1, "rows": 1, "bind": { "entitySlots": [1] },
      "restriction": { "requiredTags": ["fuel.furnace"] } },
    { "id": "progress", "kind": "bar", "bind": { "process": "progress" }, "style": "gold" },
    { "id": "output", "label": "BARS", "columns": 1, "rows": 1, "bind": { "entitySlots": [2] },
      "restriction": { "readOnly": true } },
    { "id": "backpack", "label": "INVENTORY", "columns": 5, "rows": 4, "bind": { "self": "backpack" } }
  ],
  "buttons": [ { "label": "SEAL", "interaction": "seal", "tone": "success", "visibleWhen": { "state": "sealed", "equals": false } } ],
  "hotbar": { "label": "HOT BAR" }
}
```

- Pane kinds: `slots`, `bar`, `label`, `recipe_list` (bound to a recipe filter),
  `paper_doll`, `tabs`, `text` (game-markdown), `button_row`.
- Bindings: `self:backpack`, `self:hotbar`, `self:equipment`, `self:crafting`,
  `entitySlots[...]`, `process.progress`, `state.<name>`, `merchant.offers`.
- Restrictions are the existing `SlotRestriction` plus `acceptedFrom` which derives
  the allow-list from a process (so adding a smelting recipe automatically widens the
  furnace input, as it does today).
- One renderer: `ui/storage-frame.ts` + `ui/compositions.ts` +
  `ui/container-binding.ts` become the only path; `overworldUiLayout()` station
  branches are deleted as each frame migrates (chest → barrel → furnace → cooking →
  press → fermentation → crafting → pack → shop).
- The authority reads the same frame's restrictions from the registry in `moveItem`;
  the duplicated `index.ts:4842-4858` table is removed.
- The designer is the UI Lab route with an editable spec: drag panes, set grid size,
  pick bindings and restrictions from dropdowns, live preview with fixture containers,
  and hit-target inspection through `inspectWidgetLayout()`.

**Generic frame-action slice, 2026-09-05:** rendered frame buttons now send one
bounded `frame_action` command carrying the authored `interaction` id. The client/UI
callback no longer exposes a barrel-specific `sealBarrel` verb, and the authority
accepts `seal` only after resolving the sender's open, in-reach placeable and finding
that exact action on its active authored frame. A custom `ring_bell` frame test proves
the command path is semantic rather than processor-kind-specific. Barrel sealing
still enters the existing transactional adapter. The uncalled
`process_start`/`process_collect`/`process_cancel` compatibility verbs and their
private cooking-job helpers have since been removed, so an untrusted client cannot
reach a second operation dispatcher through `useSelected`. Lazy processor/catch-up
settlement remains engine code behind authored components and lifecycle effects.
This is repository-only work: no content or module was published.

## 8. NPCs, dialogue, quests

- **NPC definitions** own everything that today is scattered: actor asset (from the
  actor library), name, home space + tile, AI (`wander {leashTiles}`, `fishing_cycle`,
  `stationary`, `mount`), dialogue ref, shop ref, barks, health, and a `spawn` rule.
  The module materializes `world_npc` + profile rows from definitions at head advance
  (create missing, update metadata, never move a living NPC without an explicit
  editor relocation, which reuses the audited `adminMoveHomestead` shape).
- **Dialogue** keeps the node/choice graph. Choices gain the §6.2 `conditions` and
  `effects` lists (the current `quest.requires/action` is a special case: `questState`
  condition + `questAction` effect) so a choice can also give an item, charge coins,
  set an NPC state, teleport, or open a frame. Node `mode: 'shop'` becomes
  `effects: [{ openFrame: 'frame:shop' }]`. The editor is a node canvas built on the
  Object Studio canvas kernel: nodes, drag edges, inline text with game-markdown
  preview, speaker portrait from the NPC definition, condition/effect chips, and a
  "play" mode that walks the tree with a chosen quest state.
- **Quests** keep the five objective kinds; `action` objectives are satisfied by any
  interaction effect `statistic`/`questAction`. The editor offers pickers for items,
  NPCs, statistics, and typed map locations. Clicking in the Map Editor to populate a
  location objective remains the intended handoff; the active map canvas does not yet
  mount it.
- Runtime rows (`active_dialogue`, `player_quest*`) are unchanged; they reference
  definition ids.

## 9. Runtime tables and reducers

### 9.1 Entity unification (staged, additive)

`world_placeable` already carries the generic shape (`kind, tile, space, facing,
open, lit, carriedBy, *StartTick`). It becomes the universal object row:

1. Add `definitionId` (defaults from `kind`), `stateJson` (small; `open`/`lit`
   remain as mirrored typed columns until Phase 6), `processStartTick`,
   `processFuelRemaining`, `processDefinitionId`.
2. Chests: dual-write `world_chest` → `world_placeable` + `world_placeable_slot`
   with `definitionId = object:chest`, backfill with a privileged reducer, switch
   client and editor, retire `world_chest*` in a later release (docs/08 procedure).
3. Combat targets, generated POI decorations, and landmark props that have
   interactions become object rows spawned from `spawn` definitions or the map
   document's prefab behaviours (`map-prefab.ts` archetype → `definitionId`), which
   finally binds the doc 42 behaviour allowlist to runtime rows.
4. `world_npc` stays the hot AI row and gains `definitionId`.
5. New private `entity_timer` schedule table for `scheduleTimer` effects (one-shot,
   bounded, indexed by entity), replacing per-kind timer columns over time.

### 9.2 Reducer surface

New generic reducers: `interactEntity`, `useSelected`, `publishContentChangeSet`,
`restoreContentRevision`, `grantContentEditor` / `revokeContentEditor`,
`adminSpawnEntity` / `adminDespawnEntity` / `adminGiveItem` (audited playtest tools),
`entityTimerFire` (scheduled, private).

Retired as their behaviour migrates: `toggleCampfire`, `toggleWorldLantern`,
`toggleHeldLantern`, `startCooking` / `collectCooking` / `cancelCooking`,
`sealBarrel`, `eatSelectedFood`, `readRecipeBook`, `repairSelectedTool`, the
`interactPlaceable` / `interactChest` pair, and the special-case branches in
`useHands`. `moveItem`, cursor reducers, `craftInventoryRecipe`, movement, combat,
farming tools, and fishing keep their reducers but read definitions from the registry.

## 10. Author tools inside Orchard Studio

All Author tools are Studio tools (doc 56 §4.2 `registerStudioTool`) sharing the
Studio shell: the Teams-style main-tool icon rail, **Content Browser** (kind filter,
search, tags, retired toggle, references-to / referenced-by), **Validation** surface
(live errors and warnings from the shared validator), **History** surface (revisions,
diff, restore), **Draft state** (autosave, base revision, conflict on newer head, exactly like the Map Editor),
**Preview** (the game client in a second tab applies the draft registry to prompts,
frames, sprites, and light so an author sees the object before publishing), and
**Publish**.

| Studio tool | Mode | Authors |
|---|---|---|
| Items | Author | item cards with component sections; recipe grid painter; price sheet; process table; recipe books; merchant stock |
| Object Studio → Behaviour tab | Build / Author | components, states, interactions (verb / condition / effect chips), light, container, processor, frame link; prefab visual stays as is |
| Frame Designer | Author | panes, bindings, restrictions, buttons, live preview at UI scales 1–3 (extends the UI Lab catalogue) |
| NPC Studio | Author | actor picker, home coordinates, AI, dialogue/shop/quest links, barks, spawn rule; eligible live NPCs now hand off to the Map Canvas for receipt-bound current/home relocation, while generic spawn-rule editing remains planned |
| Dialogue Graph | Author | node canvas with conditions/effects, play-through mode |
| Quest Editor | Author | objectives, rewards, prerequisites, giver, item/NPC/location pickers |
| World Tables | Author | creatures, loot tables, spawn rules, crops, spaces, balance groups with inline validation and doc-06 mirror hints |
| Map Editor | Build | places reviewed prefabs and definition-backed object prefabs from subscribed content; mounts repository-tested surface/cliff family, topology-compatible exact-tile, dry-farmland, eyedropper, layer-lock/solo, safe POI/Label authoring, searchable keyboard World/Live Outliners, guarded one-entry authored object/landmark reparent and layer reorder, visual/schema inspection, and an opt-in default-off latest-only 250 ms exact-base auto-CAS command; mounts exact allowlisted placement, receipt-bound move/repair/safe-despawn for eligible live chests/placeables, and receipt-bound current/home relocation for eligible live NPCs; runtime Outliner rows stay read-only, while authenticated Live-Outliner/action proof and functional spawn-rule authority remain target integrations |
| Pack | Author | export `content-pack.json`, import (batched), engine version, retired ids, diff against the git fixture |

Permissions follow doc 56 §5.2: owner and admin implicit; `content_editor` grant for
others; the anonymous Studio session is a local sandbox that never constructs a live
adapter. Phase 1 has since shipped the separate sole-canvas Studio and removed the
game client's editor documents/routes/chunks; §20 records the current acceptance
boundary.

## 11. Parity checklist — re-creating current functionality from data

Each row must be authored in the suite, verified by an authority test that the
data-driven path produces the same rows as the retired code path, and only then may
the code path be deleted.

| # | Today (code) | Authored as |
|---|---|---|
| 1 | `useHands` homestead deed founding | item `homestead_deed` use → `foundHomestead` |
| 2 | `useHands` boat spawn | item `boat` use → `spawnNpc` + consume item; mounting remains a separate interaction |
| 3 | carried chest / combat target place & pickup | object `damageable` + `carry`/`placeCarried` interactions |
| 4 | placeable placement by `item.placeable` tag | `placement` component |
| 5 | `interactPlaceable` fence gate toggle | `states.open` + use → `toggleState` + `setCollision` |
| 6 | anvil repair for 5 bronze | use_with tool → `chargeBronze` + repair effect |
| 7 | furnace / cooking / press / fermentation / barrel | one `processor` component + five `process` definitions + five frames |
| 8 | campfire toggle, lit-gated cooking | `states.lit` + `light` + interactions |
| 9 | held lantern / torch toggle and light | item `light` + use interaction; `isSwitchableLightKind` deleted |
| 10 | ground lantern / torch toggle | item `worldItemUse` + light state |
| 11 | eat food | item use → `consumeSelected` + `applyEffect(hunger)` |
| 12 | read recipe book | item use → reveal recipes effect |
| 13 | chest open / axe break / salvage | `container` + `damageable` + `frame:chest` |
| 14 | slot restrictions in client screen and reducer | frame `restriction` + `acceptedFrom` |
| 15 | `PLACEABLE_LIGHT_EMITTERS` and `camp_campfire` special case | `light` components |
| 16 | wildlife drops / XP switches | `loot` refs + `creature.experience` |
| 17 | resource, fishing, mining yield chains | `loot` definitions with tool-tier conditions |
| 18 | `furnaceFuelSmelts` wood/plank | item `fuel.smelts` |
| 19 | `miningPickaxeTierForItem` | item `tool.tier` |
| 20 | tool reach / swing sets | item `tool.reach`, `tool.swing` |
| 21 | Marlow / Bob / Fin rows, camps, ids | `npc` definitions + landmark prefabs |
| 22 | dialogue and shop mode | `dialogue` + `openFrame(frame:shop)` |
| 23 | quest gating in choices | choice `questState` + `questAction` |
| 24 | `bob_fast_strawberry` synthetic crop | a real `crop` definition tagged quest-only |
| 25 | fruit tag list in `crops.ts:276` | crop `tags` |
| 26 | `homestead_deed` sale ban | item tag `trade.unsellable` |
| 27 | decoration collision chains | prefab 4×4 masks (already authored in Object Studio) |
| 28 | interior furniture collision constants (`spaces.ts:57-81`) | interior maps with object instances |
| 29 | `F`-key ordered chain | `useSelected` + `interactEntity` resolution order |
| 30 | processor windows in `overworldUiLayout()` | frames |

Every row above maps to a §4.1 event: rows 1–4 and 13 to `place`/`pickup`/`break`,
5–12 and 29 to `use`/`secondary`/`useWith`, 7 to `slotChanged`/`processComplete`,
14 to `slotChanged`, 16–19 to `rollLoot` on `break`/`useWith`, 21 to `spawn`/`tick`,
22–23 to `dialogueChoice`/`questState`. A row is migrated first as a compiled handler
(Phase 2a) and then, where it is content rather than engine, as a data graph (2b).

Not re-created from data in v1 (remain engine): movement and collision physics,
prediction, combat math, terrain generation, rendering, lighting composition, chat,
trade, party, roguelike room generation, skill-point math. Their **numbers** move to
`balance` definitions; their **logic** stays code.

## 12. Engine release pipeline (Tier B)

`npm run world:release` runs, in order: repository/type/build/content gates; source
pinning; game and Studio production builds; traffic quiescence; a fresh checksummed
backup; an isolated restored-data transition rehearsal that captures separate
pre-drain and post-drain expectations; `spacetime publish --delete-data=never` to the
fixed production authority; binding and static-app regeneration; migration only to
verified `placeable_reads`; and `world:rejoin-smoke verify` against the restored
pre-drain expectation with the exact same saved OIDC identities before traffic
returns. A schema change that is
not additive fails the release; the developer stages a versioned replacement table per
docs/08. Old clients see `engineVersion` advance and show the existing PWA update
prompt (doc 44). The editor never triggers a module build; the SDK cannot compile
WASM from inside a procedure, and a build server is out of the docs/02 dependency
budget for now. Revisit if Tier B changes become frequent.

The version-2 rejoin gate is reducer-free, uses targeted subscriptions, stores no
tokens in its mode-`0600` snapshot, and compares canonical durable rows exactly.
Owned container rows, every owned generic-placeable slot, and damage progress come
from `worldPlaceable`, `ownPlacedPlaceableSlots`, and
`ownPlacedPlaceableDamage`, so the proof remains usable after the temporary legacy
chest schema is removed. Only connection/presence/notice/session UI surfaces, the
legacy chest mirror, `player_public.online`/`lastActiveAtMicros`, and
the `own_stats.regen_tick` authority scheduler cursor (all actual attributes,
resources, fractional remainders, and combat timing remain exact), plus
the three statistics changed by observing a reconnect (`connections_opened`,
`world_entries`, `time_played`) are excluded; every other statistic must match. This
exception is caused by the reconnect act itself and can be removed once the authority
offers a quiesced snapshot. The repository module and generated bindings include the
additive caller-private `ownPlayerSpawn`, `ownPlacedPlaceableSlots`, and
`ownPlacedPlaceableDamage` views. A stale deployment fails closed on any missing view;
operators must not weaken or bypass this check. The complete capture/verify procedure
is in `ops/BACKUP-RESTORE.md`.

Refresh-capable rejoin credentials close the release-duration gap: immediately
before each capture the checker exchanges the saved rotating refresh token for a
fresh ID token, atomically persists Keycloak's replacement refresh token at mode
`0600`, and passes only the short-lived ID token to SpaceTimeDB. Credential material
never enters either before/after continuity snapshot or command output.

The Stage-A online acceptance window also has a narrower reusable read-only harness:
`npm run world:stage-a:acceptance -- <new-private-evidence.json>`. It requires at least
two distinct refresh-capable identities in a mode-`0600` credential file, reconnects
both clients, and compares the same live map/content heads and generic-chest visibility.
Its mode-`0600` evidence contains hashes, counts, revisions, and timestamps only. It
does not claim the visual review, mutable admin/undo, content publish/use/rollback, or
two-client gameplay scenarios; those remain explicitly `not_run` until separately
performed during the Stage-A window. The exact operator contract is in
`ops/BACKUP-RESTORE.md`.

## 13. Validation contract

Run identically by the editor (continuously), `content:validate` (CLI on the pack
fixture), and `publishContentChangeSet`:

- schema version, id format, kind/slug agreement, unique ids;
- every reference resolves (items in recipes, processes, loot, frames, shops,
  quests; objects in placement and spawn; NPCs in quests and dialogue; frames in
  objects; assets in the registry with the named animation/state groups);
- no retired definition is referenced by a live one; a retired item still held in any
  inventory row must declare a replacement;
- component sets are coherent (processor needs container roles; light needs a
  state or is constant; placement needs a source item with `item.placeable`);
- interaction verbs unique per object with deterministic priority; effect opcodes
  and condition kinds exist in the head `engineVersion`; effect lists bounded;
- frames: pane bindings exist on the object, restrictions parse, minimum size fits
  the virtual viewport at UI scale 1, buttons reference interactions;
- economy: every non-retired item has a sell price; buy ≥ sell; recipe output value
  warnings when inputs exceed output (docs/06 mirror hints);
- dialogue: reachable initial node, no dangling `nextNodeId`, shop nodes reference a
  shop, at most one accept/turn_in per quest per node;
- quests: giver exists, prerequisite graph acyclic, statistics exist, location
  objectives inside the space bounds;
- loot: weights positive, kinds exist, min ≤ max;
- pack size, per-definition size, and count limits;
- deterministic hash on repeated runs.

## 14. Performance budgets

- Registry build from ~1,000 rows: ≤ 30 ms on the module, ≤ 50 ms in the browser;
  built once per head revision, never per reducer.
- `interactEntity` resolution: O(interactions on one object); no table scans beyond
  the chunk-neighbourhood reach checks already used.
- Client content subscription: whole `content_definition` table; measure the initial
  payload (target ≤ 522 KiB uncompressed) and gate on `content_head` before revealing
  the world after first load.
- Head advance cost for connected clients: one subscription batch, one registry
  rebuild, invalidation of item-icon and object-sprite caches only.
- No per-tick registry access in `stepWorld`; NPC AI reads definitions through the
  cached registry.

## 15. Tests

- **Sim**: parse/upgrade round trips per kind; registry build determinism and hash;
  derivation parity (registry-derived crop items equal the current derived tables);
  golden `Effect[]` tests for every §11 row, run once against the compiled handler
  and once against its data-graph replacement with the same fixture snapshot;
  handler ordering and `continue` semantics; effect caps; validator negative cases.
- **World**: `publishContentChangeSet` happy path, CAS conflict, idempotent replay,
  auth failure, grant/revoke; parity tests that the effect applier writes the same
  rows as each retired reducer for the §11 rows; entity migration dual-write and
  backfill; `entity_timer` bounded firing.
- **Client**: frame layout from definitions at UI scales 1–3; prompt derivation from
  the resolver; draft overlay never calls a reducer; anonymous route constructs no
  live adapter.
- **Two-client**: publish an item while a second client is connected and observe the
  new icon, recipe, and shop row without reload; toggle a data-defined light and see
  it on the other client.
- **Load**: 1,000-definition pack publish inside the transaction budget; head advance
  with 20 connected clients.

**Acceptance audit, 2026-09-03:** every test and phase Done-when in this document is
tracked in the machine-checked `scripts/docs-55-56-acceptance-manifest.json`; its
Vitest guard rejects missing evidence paths, duplicate gates, and live/OIDC gates
without explicit prerequisites. Repository tests and the isolated load/browser
proof cover the Sim, World, Client, Phase 0, and frame-layout statements. Phase 2a
legacy reducer/input retirement is repository-verified; Phase 6 legacy-table
retirement remains gated by the live chest migration, so it is not marked complete.
Browser-published item, oil-lamp,
narrative, live-pack-hash, visual frame/reconnect, and two-client gameplay flows
remain external acceptance: they require a named `orchard-studio` OIDC account with
the appropriate content-editor/owner/admin role, a distinct game OIDC account, a
compatible deployed module and generated bindings, authority to publish disposable
identifiers, and authority to restore the prior content/map revision. No test token
or live publication was inferred or fabricated during this audit.

## 16. Phases

### Phase 0 — contracts and spike (1 slice)

Export the current constants to `packages/assets/content/*.json` through a new
`content:export` tool; implement `buildContentRegistry` for `item`, `recipe`,
`process`, `shop` and prove parity with the compiled constants by test. Spike the
`content_definition` row, subscription payload, module cache, and a 500-row publish
transaction. Settle JSON-in-row versus columns from measurements.
**Done when:** the registry built from exported rows deep-equals the current sim
tables and the spike numbers are recorded here.

**Progress, 2026-09-03:** lanes 55-A1 and 55-A2 are complete. The deterministic
registry round-trips 159 items, 37 recipes, 36 processes, two shops, and the 14
available doc 50 terrain families as versioned `tileset` definitions through
`packages/assets/content/*.json`; parity tests cover the currently projected item,
economy, recipe, smelting, cooking, merchant, and terrain role/frame sources. The
tileset definitions require stable asset/terrain references and explicit unavailable
variants/transitions. The live registry now projects those definitions into the map
compiler and renderer, including published family ids used as a map default, a per-cell
family, or a final terrain override. Nine schema-v1 frame definitions now cover chest, barrel,
furnace, cooking, press, fermentation, crafting, pack, and shop windows with typed
self/entity/process/state/merchant bindings and shared slot restrictions. The
authority uses public JSON-in-row definitions behind a revision/hash-keyed module
cache; a bounded 500-upsert planning test must stay below 1,000 ms. The pre-frame
248-definition measurement contained 104,876 bytes of definition JSON and a
189,665-byte JSON row envelope (765 bytes/row average, measured 2026-09-03); the
measured pre-object-graph bootstrap had 459 definitions across 20 generated files
and a 304,155-byte JSON row envelope (663 bytes/row average; content hash prefix
`ba28da55`, measured 2026-09-03). The current repository bootstrap has 531
definitions across 21 files and pins hash prefix `8cfe4746`; its 21 object
definitions are covered by repository parity gates rather than that historical load run.

The final isolated load gate passed on 2026-09-03. `npm run
content:load:acceptance` created its own loopback-only in-memory SpaceTimeDB host,
temp data directory, and strictly named disposable database. It copied the world
module into `mktemp`, removed test-only sources, and disabled OIDC/content-editor
enforcement only in that temporary copy so anonymous measurement clients could
connect; the production module and its authentication policy were neither changed
nor published. The temporary module was published with `--delete-data=never` and
the host, database, and module copy were removed after the run.

The valid 1,000-definition change set advanced the head once (revision 1 → 2) in a
61.59 ms server transaction and 105.01 ms reducer round trip, against the 1,000 ms
transaction budget. All 20 already-connected observers received exactly one head
update and each saw the complete 1,459-definition cache in that update without a
reload or reconnect. With compression explicitly disabled, the exact WebSocket
binary-message payload was 275,527 bytes inbound plus 123 bytes outbound per client
for the initial 459-definition subscription, and 317,196 bytes inbound plus zero
outbound per observer for the 1,000-row update (6,343,920 inbound bytes across all
20 observers). These byte counts include SpacetimeDB's one-byte compression marker
and exclude WebSocket transport headers. The publisher sent 271,052 bytes and
received 317,213 bytes for the mutation/update.

Twenty-five registry builds over the resulting 1,459 rows measured 9.99 ms median
and 13.42 ms p95 in the module harness (30 ms budget). The real-browser harness at
`scripts/content-registry-browser.html`, run in headless Chrome 152 through
Playwright, measured 9.2 ms median and 10.9 ms p95 over 25 builds (50 ms budget).
The reusable harness, safety/summary tests, and browser fixture live in
`scripts/content-database-measure.ts`, `scripts/content-load-acceptance.ts`,
`scripts/content-load-acceptance.test.ts`, and
`scripts/content-registry-browser.ts`. To reproduce, run `npm run
content:load:acceptance`; for the browser result, serve the repository with Vite and
open `/scripts/content-registry-browser.html` in a real browser. This completes the
Phase 0 measurement and §15 load gates without weakening production auth.

### Phase 1 — live items, recipes, processes, prices

Tables, `publishContentChangeSet`, `restoreContentRevision`, grants, audit, client
subscription with `engineVersion` gate, module registry cache. The Item & Recipe
Studio becomes writable with draft, validation, history, preview, publish. Crafting,
cooking, smelting, merchant offers, prices, food, fuel, durability, and vigour read
from the registry on both sides.
**Done when:** a new item with a recipe and a price is published from the browser and
crafted, sold, and eaten by a second connected client without any rebuild.

**Progress, 2026-09-03:** lane 55-E now provides the model-first Item & Recipe
Studio subtree. It browses and drafts item, recipe, process, shop, and price changes
as a local overlay, runs the shared content validator after every edit, produces
deterministic diffs and revision/restore previews, gates publishing on
`engineVersion`, and models CAS conflicts with safe and explicit rebase strategies.
Anonymous and read-only construction creates no live adapter; draft persistence,
asset lookup, references, publishing, and restore are explicit injected boundaries.
The publish and restore requests structurally match the current reducers, and the
plain registration descriptor is ready for the S1 shell without importing it. The
S1 mount and concrete Studio adapter are now present. The remaining acceptance gate is
the authenticated browser/two-client publish → craft/sell/eat proof required above.

Lane 55-C is complete in the repository: additive head/definition/revision/grant/draft
tables, bootstrap seeding, compare-and-swap/idempotent publish, reversible restore,
private draft/history projections, audit rows, validation, and a revision/hash-keyed
module cache are covered by focused world tests. Lane 55-D now subscribes the game to
the live head and definitions, verifies count/hash/engine version atomically, keeps the
last verified registry through partial updates, persists only verified revisions, and
offers an isolated draft-overlay hook. The game food prompts and bottle-value preview
consume that live registry. Phase 1 runtime consumers are complete in the repository:
authority and client crafting, commerce, food, fuel/process settlement, durability,
vigour, recipe-book unlocks, item metadata, and max-stack decisions resolve one verified
registry revision, while bootstrap literals remain only migration/test fallbacks. The
client retains the last fully verified registry through partial or invalid head updates.
Authored tileset families also flow through client and authority live-map caches keyed by
both map and content hashes, so a published family can become the default, a per-cell
family, or an override without a rebuild. Unknown legacy rows remain readable and no
persisted gameplay row is rewritten. Focused runtime, map, engine, authority, and
two-client cache tests cover the seam; no production content or tileset revision was
published in this lane, so the live browser acceptance proof remains outstanding.

### Phase 2a — lifecycle event bus and compiled handlers (can start now)

Independent of the content tables, so it may run in parallel with Phases 0–1.
Add `packages/sim/src/behaviour/` (event and snapshot types, `raiseEvent`, handler
registry, effect vocabulary), the module effect applier, `interactEntity` /
`useSelected`, and `entity_timer`. Re-express every §11 row as a compiled handler
with a golden effect-list test, then delete the `useHands` branches, the
`interactPlaceable` special cases, the five `settle*` functions, the client
`F`-key chain, and the duplicated slot-restriction table. Wire the `statistic` and
`questState` events through the existing quest engine.
**Done when:** no reducer or client input handler branches on an item or object id
string; every behaviour in §11 is a registered handler with a golden test; the
retired reducers are gone from the generated bindings.

**Progress, 2026-09-03:** lane 55-A1 established the complete lifecycle event,
condition/effect, immutable snapshot, handler-result, effect-cap, and engine-version
contracts, plus parity snapshot fixtures for all 30 §11 rows. The pure 55-B0 bus is
also complete: immutable registration, selected-item → target → tile → global source
precedence, stable priority ordering, first-wins/continue semantics, atomic blocks,
and cumulative effect caps. Lane 55-B0's additive authority bridge is also complete:
generic `interactEntity`/`useSelected` reducers, indexed durable entity timers,
preflighted exhaustive effect dispatch, and state/light/timer/frame/bronze/
presentation arms fail closed while legacy reducers remain available. Lane 55-B1
has compiled placeable parity handlers for its assigned rows with explicit target
namespaces. Lane 55-B2 adds deterministic item handlers and transactional adapters
for deed and boat placement, food and orchard tea, recipe books, held lantern state,
and anvil repair. Its item bootstrap now preserves fuel capacity, mining tier, tool
reach/swing, and the deed's `trade.unsellable` tag. Boat creation deliberately keeps
the current unmounted row shape; mounting is a separate interaction. The legacy
item reducers remain as a dual path until generated-client parity is proven. Lane
55-B3 now registers row-7 processor handlers and settles furnace, cooking fire,
fruit press, fermentation cask, and barrel state through one pure,
process-definition-backed `settleProcess`. The authority projects the active
content revision at every lazy observation boundary, preserves the existing tick
and attribution columns, applies upgrade timing, and has exact slot/statistic/XP
row-write goldens for all five adapters. The five processor-specific settlement
implementations have been deleted. Lane 55-B4 now registers the row-16 wildlife
and row-17 resource handlers and resolves wildlife, tree, gatherable, mining, and
fishing payouts through versioned `loot` definitions. The deterministic interpreter
supports weighted groups, bounded quantities, tool/skill/context/rare-roll
conditions, and one nested table; its authority adapter preserves inventory-first
fallbacks, world-drop spacing and reservation, item statistics, and combat XP.
Corpus goldens cover every ore/node/rank combination across 500 seeds and fishing
quality/treasure across 1,000 seeds, with exact authority row-write tests. The old
food, fishing, mining, and health-based resource drop switches have been deleted.
Lane 55-B5 adds versioned `npc`, `dialogue`, and `quest` definitions for Marlow,
Farmer Bob, and Fisherman Fin; those kinds added ten definitions and the current
bootstrap validates 303 definitions across eleven generated files. Compiled spawn,
dialogue/shop, quest-gating, statistic, and
coarse NPC tick handlers have §11 rows 21–24 effect goldens. Authority
materialization creates missing authored rows on init/head advance while preserving
the position, health, activity, and deadlines of an existing live NPC, and Fin's
fishing cycle now enters `stepWorld` through the authored tick planner without
altering the specialized wildlife path. Cross-reference validation covers runtime
ID uniqueness, dialogue graph integrity, and cyclic quest prerequisites. Statistic
and quest-state transitions are raised through the compiled bus, the quest-action
adapter preserves canonical statistic-derived progress, and the six legacy
Marlow/Bob/Fin row/profile constructors have been deleted.

**Phase 2a retirement follow-through, 2026-09-03:** dual-path parity is complete at
repository level. The fourteen legacy behavior reducers, nine CLI/debug operator
surfaces, their generated reducer/view bindings, developer game controls, client
per-kind calls, and specialized client input branches are absent. The game and
authority now use only `interactEntity` and `useSelected`; the committed content pack
loader is the sole runtime bootstrap seed. `legacy-runtime-retirement.test.ts` and
the generic authority schema tests enforce these absences and entrypoints. This does
not retire the gated legacy chest tables: live migration/rejoin is complete through
`placeable_reads`, but the tables remain until the separately accepted finalizer reaches
`drop_ready` and declaration retirement passes its own release.

**Owner-directed item-lifecycle completion, 2026-09-05:** every current item action
now enters one item-owned `onUse` callback through metadata-selected invocation
contexts. Food, tea, recipe books, placement, seeds, farming tools, axe/pickaxe world
tools, sword, bow, fishing rod, repair, equipped portable-light use, and ground-world-item
portable-light use all reach the generic authority; the fourteen former specialized item
reducers/client methods/bindings are forbidden by one consolidated source audit.
Prompts and keyboard/pointer dispatch no longer grant capability from item-kind or
handler-name checks. Server transport is item-agnostic, handler resolution happens
before tile reach, and each emitted primitive revalidates its exact legacy reach and
complete effect batch before mutation. Hoe and watering can were normalized so each
item has one callback covering all of its triggers. The deterministic repository
bundle is revision 11 with 109 item callbacks and SHA-256
`3b9cd7a8dd00e1c92a1dc5a27164f89886b962b59fb0fe58933110453997b57f`.
The bootstrap catalog has 181 items total; the remaining 72 are reviewed inert items
with no action, not placeholder callbacks. The catalog ownership audit enforces the
exact 109/72 partition. Torch is now an authored off-hand light with the same toggle
lifecycle as Lantern while retaining its own flicker profile and three-tile radius.
The empty compiled item-handler bridge and its registration wrapper have been deleted;
the authority's base registry now starts directly from
`AUTHORED_ITEM_LIFECYCLE_REGISTRATIONS`. A structural audit proves that adding the
placeable, processor, and loot handler sets introduces no second item-code owner.
These revision-11 artifacts were published with the matching module and content
in the guarded 0.4.0 release recorded below; remaining live gameplay acceptance
is tracked separately.

**Lifecycle effect authority follow-through, 2026-09-11:** the deterministic
repository bundle is now revision 13 with 119 actionable item callbacks, 112
unchanged human-reviewed inert items, and SHA-256
`cc95551b15bb9583c24f81028c18ded7f577d93f86ec847fde13ab1f2ebd00b1`.
Food and repair callbacks use the bounded `restoreHunger` and `repairSelected`
capabilities, while food, tea, and repair counters are ordinary authored
`statistic` effects. Persistent status effects resolve arbitrary active effect
slugs from the live content registry in authority, simulation, client modifiers,
and HUD presentation; no bootstrap effect-kind whitelist grants capability.
Missing or retired definitions leave existing `player_effect` rows intact and
inert, preserving their IDs, slugs, stacks, and tick fields across rollback and
reconnect. This repository change has not published a module or content revision.

### Phase 2b — data-graph handlers, states, light

Object definitions, component parser, the data-graph handler kind, states with
`stateJson`, `light` from data, `world_placeable.definitionId`, and the Object Studio
Behaviour tab. Convert the compiled handlers for §11 rows 5–12 and 15–20 into
authored graphs and delete the compiled versions as their parity tests pass.
**Done when:** the §1 oil-lamp scenario works end to end from a browser-published
definition, and the remaining compiled handlers are only the engine-shaped ones
listed at the end of §11.

**Progress, 2026-09-03:** lane 55-F's schema, editor, authority, and presentation
integration are complete at repository level. The shared content registry accepts versioned `object` definitions with
typed identity, sprite, collision, placement, state, light, container, processor,
interaction, and frame-reference components. Validation covers component coherence,
item/object/process references, retirement, state typing, ambiguous handlers,
supported opcodes, and condition/effect/instruction caps. Valid interactions compile
to the existing immutable behaviour-handler ABI; deterministic golden tests cover
the oil lamp and representative fence-gate, campfire/ground-light, light-emitter,
and selected-tool graphs. `world_placeable` has additive trailing `definitionId`
and `stateJson` columns whose defaults preserve every legacy row. Reducers resolve
and cache object graphs by the durable head revision and engine version, preserve
legacy `open`/`lit` state during lazy definition materialization, and apply typed
state/light effects transactionally with a compatibility path for unknown persisted
rows. The client
subscription projects the same revision into a presentation cache, loads authored
sprites asynchronously, and uses authored collision/light/render data with legacy
fallback for missing or invalid content. Object Studio now mounts the Behaviour tab,
provides continuous shared validation and pure `Effect[]` preview, and connects to
the existing content subscription/publish adapter only for authenticated editors;
anonymous editing constructs no live adapter. Nine reviewed bootstrap object
definitions with interactions now preserve both directions of fence-gate and
campfire/cooking-fire light state changes, plus the
barrel/cooking/fermentation/press/furnace/chest frame-open paths.
Their corresponding compiled placeable handlers are deleted; parity goldens also
prove processor settlement stays ordered before its authored frame-open effect and
unknown future object rows remain readable and inert rather than acquiring guessed
behavior. The remaining Phase 2b acceptance gate is operational: publish the
oil-lamp definition to a running world and complete the two-client interaction,
lighting, reconnect, and rollback visual test before retiring its compiled fallback.

**Authored chest graph migration, 2026-09-05:** `object:chest` now owns its `use`
interaction as an authored data graph whose sole effect opens `frame:chest`.
Authority parity tests resolve both a generic `world_placeable` chest and a retained
legacy `world_chest` row to the same `object:chest` definition and prove that both
namespaces dispatch that graph; the compiled `placeable.chest-open` handler is absent.
This is repository-only evidence. It does not publish content, change the production
chest migration phase, drain legacy rows, or alter the existing rejoin/finalization
gates.

**Content-head release compatibility, 2026-09-05:** the guarded downtime release now
requires a digest-pinned, independently reviewed content candidate built from an
explicit complete live-head capture. Its offline three-way planner compares the live
rows with either the pristine revision-1 seed or the prior approved bootstrap target,
then overlays the exact currently validated repository bootstrap. Target-owned custom
edits fail closed; unrelated live definitions and removed historical bootstrap rows
are preserved, and deletes are structurally forbidden. The candidate records the
expected CAS head, every live row fingerprint, the complete next-bootstrap base, the
merged result hash/count, reviewer, and change request. The same normal
`publishContentChangeSet` transaction is rehearsed on the isolated restore and applied
to production after the no-delete module publish but before migration, rejoin parity,
or traffic reopening. This is repository-only tooling and offline proof; no candidate
was captured from or applied to production during implementation.

### Phase 3 — frames

Frame definitions, one generic renderer, Frame Designer, authority restrictions
from frames. Migrate chest, barrel, furnace, cooking, press, fermentation, crafting,
pack, shop; delete the station branches in `overworldUiLayout()` and the duplicated
reducer restriction table. Chest dual-write into `world_placeable`.
**Done when:** every item window in the game is a frame definition and the layout
tests pass at UI scales 1–3.

**Progress, 2026-09-03:** lane 55-G is complete at repository level. The immutable
`frame` schema and bootstrap pack contain chest, barrel, furnace, cooking, press,
fermentation, crafting, pack, and shop definitions. A shared resolver expands
`acceptedFrom` process roles and tag restrictions against the exact content revision;
the client pre-check and authority container snapshot now consume that same resolved
map, and the duplicated reducer recipe/restriction table is gone. The retained UI
projects all nine definitions through one storage-frame-based layout and renderer,
keeps stable slot nodes while live definitions change, and passes containment tests
at UI scales 1–3 for every bound slot. Existing recipe lists, filters, processor
status details, and merchant rows are pane-renderer delegates inside the authored
frame; the old outer-window geometry remains only as a continuity fallback when no
verified frame registry is available. UI Lab now mounts a Frame Designer with JSON
editing, drag reordering, grid/binding/restriction controls, fixture preview, widget
hit-target inspection, validation, revision-CAS publication, and anonymous local-only
editing. The legacy `world_chest` rows remain retained through the first Phase 6
maintenance window; converting those durable rows is staged rather than coupled to a
hot frame-definition rollout. Stage A backfills and dual-writes the unified rows, then
stops at `placeable_reads` so operational visual/two-client/reconnect checks run while
the legacy copy still exists. Only the separately guarded finalizer may drain it.

**Frame topology follow-up, 2026-09-05:** schema-v1 frames can now author their
presentation surface (`inventory`, `crafting`, `entity`, or `merchant`), entity
custody channel (`chest` or `placeable`), ordered panes, slot bindings and
restrictions, progress bars, conditional pane/button visibility, button interaction
and tone, title, hotbar, and resize policy. The game indexes layouts by frame id and
resolves an active entity through its object definition's `components.frame.ref`;
the former `CONTENT_FRAME_WINDOWS` id map and five station-specific retained slot
pools are gone. Authored entity frames use one renderer and one placeable slot pool,
while server reducers still own selection, custody, restrictions, and every write.
An arbitrary `object:lunar_apparatus` → `frame:moon_engine` test proves renamed ids,
slot 7, state filtering, and the `charge` action without kind dispatch. Presentation
metadata remains optional when parsing existing schema-v1 rows so an older durable
content revision falls back to its compiled continuity window instead of preventing
players from joining. Pack/crafting's specialized pane bodies and old no-registry
fallback geometry remain intentionally compiled; their outer chrome and layout are
already definition-driven. This repository slice was not deployed or published.

### Phase 4 — NPCs, dialogue, quests, loot

NPC/shop/dialogue/quest/loot/creature definitions; NPC materialization from head
advance; Dialogue Graph, NPC Studio, Quest Editor; loot for wildlife, resources,
fishing, mining. Marlow, Bob, and Fin authored as data.
**Done when:** a new NPC with a conversation, a shop, and a quest is created in the
browser and completed by a player without a rebuild.

**Progress, 2026-09-03:** lane 55-H's Studio implementation is complete at
repository level. NPC Studio, Dialogue Graph, and Quest Editor are separate Author
routes mounted through `registerStudioTool`, but share one exact-head draft model,
content browser/reference graph, validator, undo/redo state, revision history and
restore preview, inspector projection, and CAS publish adapter. NPC Studio provides
the reviewed actor catalogue, home/facing/AI fields, the typed selection contract for
a future Map Editor tile handoff, dialogue/shop/quest links, barks, and a resolved
profile preview. The active Map Editor does not yet mount that handoff. Dialogue Graph
provides draggable nodes and edges, inline copy, linked speaker portraits, typed
quest-state choice gating/actions, shop transitions, and deterministic play-through.
Quest Editor provides objective/reward progress preview plus item, NPC, statistic,
and typed location-picker contracts; its active route does not yet mount a Map Editor
location handoff. Anonymous and read-only construction never creates
a publication adapter. A browser-free acceptance test authors a mutually-referencing
new NPC, dialogue, shop, and quest atomically, accepts and completes its collect
objective, turns it in, verifies rewards, and opens the authored shop. The remaining
Phase 4 gate is live-only: publish through an authenticated deployed Studio, observe
the authority materialize the NPC at head advance, and complete that same flow from
a second game client without rebuild or reload, including reconnect and rollback
checks. No production narrative-content revision has been published.

### Phase 5 — world tables and pack tooling

Crops, spawn rules, spaces, skill trees, effects, statistics, upgrades, balance
groups; the World Tables and Pack Studio tools; `content:validate`; pack fixture in git
with a diff test; maintenance batch import; playtest admin tools.
**Done when:** the committed pack fixture reproduces the live head hash and CI
validates it.

**Progress, 2026-09-03:** lane 55-I is complete at repository level. Versioned,
JSON-safe parsers and registry maps now cover crops, creatures, spawn rules, static
spaces, skill trees, effects, statistics, upgrades, and balance groups. Their
bootstrap definitions project back to the existing compiled tables through the
registry with exact parity, including bigint-safe crop growth/statistic milestones;
the six W3 support-cap `balance` scalars remain byte-for-byte unchanged and are only
referenced by the new `balance_group:admin_support`. Cross-reference and structural
validation covers spawn targets/spaces, skill roots and links, modifiers, milestones,
retirement, and balance entries. The deterministic exporter now writes 531
definitions across 21 per-kind files, and a committed 531-definition manifest pins
the `8cfe4746` bootstrap hash with a mutation-diff test. Bob's fast strawberry is now
its own schema-v1 `crop:bob_fast_strawberry` definition: the quest seed resolves
through the generic authored `plantSeed` lifecycle, while its strawberry harvest,
art, 30-second growth and winter exemption preserve the existing quest contract.

World Tables and Pack Studio are mounted Author routes over one browser-free draft
model with shared content browsing, references, undo/redo, whole-pack validation,
field-level diff, history, engine gating, exact-head CAS publishing, rebase, canonical
pack import/export, and imports bounded to 100 definitions per maintenance batch.
Playtest actions are typed and definition-checked and now use an authenticated live
admin adapter on the shell's single connection. Creature/spawn, effect, and upgrade
actions perform an authority-discovered dry run, validate the caller-private receipt,
then commit only its exact base version and fingerprint. The reducers resolve the
selected definition from the live registry, preserve typed inverse audit data, and
send effect/upgrade notices only to the targeted player's active sessions. Connected
routes never substitute a mock adapter; mock playtests remain an explicit model-test
and sandbox seam. Generated TypeScript bindings and deterministic authority/transport/
canvas tests cover all three actions. The remaining Phase 5 gate is operational:
compare this fixture to a deployed live head and exercise the playtest flow against a
restored rehearsal world and then the production release. No production publish
of a pack/playtest revision occurred in this lane.

### Phase 6 — retirement and release pipeline

Delete the TypeScript content constants and remaining per-kind branches; retire
`world_chest*`; `npm run world:release`; engine version policy; optional
content-addressed asset packs from doc 42 §9 so newly referenced art ships without a
full client rebuild.
**Done when:** `packages/sim` contains no content literals other than the bootstrap
pack loader, and docs/02 is updated to describe the registry.

**Progress, 2026-09-04:** the guarded `npm run world:release` entry point now runs
the repository/content gates, generates and checks bindings, stops public game and
Studio traffic, creates a quiesced checksum-verified authority backup, captures the
isolated pre- and post-drain identity expectations, publishes with the explicit
`--delete-data=never` policy, rebuilds the client, migrates production only through
verified `placeable_reads`, verifies the same identities, and only then restores
traffic for authenticated visual/two-client acceptance. The separate
`npm run world:release:finalize` command re-quiesces traffic, takes a fresh backup,
rehearses both sides of the drain without publishing mutable repository source, checks
the live pre-drain state, drains to `drop_ready`, checks the post-drain state, and fails
closed before reopening traffic. Production/dev publish commands carry an explicit
no-delete policy instead of the CLI's broad bare `--yes` default.
The owner-directed lifecycle-code correction is also repository-founded:
`@orchard/lifecycle-authoring` defines the versioned source contract, restricted
AST compiler, deterministic authority/client artifacts, and integrity checks in the
guarded `world:release` path. Its current revision-11 source contains one
callback for each of the 109 actionable bootstrap items; the other 72 definitions are
reviewed as inert and expose no action. Generated registrations are wired into
the world registry with code-owned items suppressing duplicate data-graph
registrations. No release command was run during the initial pipeline work;
the current revision-11 artifacts were subsequently deployed through the guarded
0.4.0 release recorded below.
The generic **item input surface** is repository-complete. `interactEntity` and
`useSelected` now enter registered lifecycle callbacks for placeable/chest interaction,
pickup/place, processors, food, tea, recipe books, repair, lanterns, and campfires; the
corresponding per-kind reducer exports, game-network methods, F-key dispatch arms, and
24 stale generated binding files are absent under strict source/path tests. This is not
a claim that all downstream behavior ownership has migrated. The 2026-09-05 authority
audit found missing production raises for several registered lifecycle events, direct
processor/frame operations, exact-kind tool and loot policy, fixed NPC/quest paths,
and incomplete object components. Those are Phase-6 repository work, not presentation
polish or a reason to weaken `onUse` as the capability boundary. The three unused
legacy behavior modules for interactions, selected items, and lights have now been
removed rather than kept alive by source-reading tests. A bounded follow-up now raises
`slotChanged` after validated placeable slot writes, raises `processComplete` exactly
once after a positive durable settlement, and routes dialogue quest actions through
`dialogueChoice`; the processor completion bridge is notification-only so it cannot
recursively settle or duplicate rewards. An exact registration-versus-production-raise
matrix now also proves NPC `spawn` and `tick` production raises. Spawn effects project
through an idempotent lifecycle plan that preserves existing position, health, activity,
and deadlines; authored fishing-cycle state and speech come from the immutable tick
snapshot. Collision/pathfinding, home pinning, listener visibility, and non-authored
wildlife/merchant movement remain engine-owned. All 20 live
`item.placeable` entries now have a matching authored object graph with sprite,
collision, placement, and, where applicable, container, processor, and frame
components. Empty-definition legacy rows resolve through `object:<kind>`, while
new placements persist the explicit object id and declared state defaults. Frame
selection no longer has a compiled capability table; processor adapter selection
comes from the authored processor `processTag`, which validation requires to resolve
to exactly one adapter. Container capacity and placeable collision likewise prefer
the active object registry and fail closed for unknown definitions. Processor
settlement and its compatibility tick/owner columns remain an engine transaction:
this slice does not invent generic start/collect/cancel semantics beyond the authored
automatic slot-change lifecycle already supported.

The bounded quest/landmark ownership slice now stores quest-created surface items,
private objective resources, and watering narrative triggers in validated quest
metadata; NPC runtime kinds, initial stationary delays, and protected-pack responses
are authored NPC fields; and static interior surfaces are authored on their space.
Quest acceptance, fishing, watering, livestock protection, client-only private-resource
rendering, and quest markers resolve the active registry without Bob/Fin/Marlow quest-ID
branches. Renamed quest, NPC, resource, and surface tests prove the semantics are not
coupled to their bootstrap ids. Persistent quest/baseline/statistic/item rows and all
inventory, wallet, and reward transactions remain the canonical generic engine.

The bounded Phase-6 commerce-policy slice is also repository-complete. Item
definitions now validate optional purchase skill requirements, the sole bounded
`homestead_claim` purchase grant, the sole bounded `estate_vintage` sale-premium
adapter, explicit drop denial, and back-slot carried capacity (capped by the 20
allocated persistent slots). Live merchant purchase/deed-claim preflights, vintage
sale selection, player drop denial, player-trade claim protection, authority/client
inventory capacity, and shop sale visibility resolve those fields from one active
registry revision. Wallet arithmetic, inventory custody, durable claim writes, and
transaction rollback remain reducer-owned. Tests prove the same semantics on renamed
definitions and prove descriptive sprinkler/deed/bottle/backpack tags without the
required policy field gain no capability. The bootstrap pack contains parity fields
for the four current items; a future module cutover must publish/verify that content
revision before switching these consumers against an older durable head. This work
did not publish content, deploy a module, or mutate live gameplay rows.

The item-owned spawn boundary is now content-linked rather than suffix-linked.
An approved `onUse` callback may emit `spawnObject` for an authored object whose
`placement.item` names the concrete selected item; `item:foo` no longer has to
create `object:foo`. A renamed-item/renamed-object authority test covers that
edge. The `foundHomestead` and bounded boat-spawn adapters likewise no longer
grant or reject capability by comparing the selected item to a compiled name:
the selected item's registered lifecycle callback authorizes the effect, and the
batch must consume the concrete selected item before any mutation commits. The
authority still independently validates item custody, object definition,
placement, collision, roles, world location, mount state, and complete atomic
consumption. Processor input/output restrictions for furnace, cooking, press,
and fermentation now come solely from the merged authored frame/object
restriction map used by `moveItemStacks`; their duplicate processor-specific
post-validation functions and the compiled pressable-fruit list are removed.
Barrel sealing/batch invariants remain a bounded processor-engine rule. This is
repository evidence only and was not deployed or published.

The follow-up processor-authority slice removes the remaining canonical station
topology and timing decisions from live settlement. Handler registration is generated
from authored object `processTag` values; container capacity plus input/fuel/output
slots come from the active object component; recipes, accepted fuel, outputs and base
durations come from the active process definitions; and manual batch bounds are
authored processor fields. Authority settlement, barrel sealing/mutation checks,
fermentation sale premiums, client progress/remaining-time presentation, and
landmark slot materialization all resolve that same registry. Arbitrary renamed
station-tag and noncanonical-slot tests prove no furnace/campfire/cellar id is required.
Durable start/owner/input columns, atomic slot writes, upgrade arithmetic, minimum
transaction invariants, and processor statistic/experience attribution remain generic
engine concerns so existing rows and reconnect state stay compatible. This slice was
not deployed or published.

The game-side debug/CLI
surfaces retired by doc 56 are absent at the same boundary. The authority
bootstrap registry now parses the committed 895 definitions in 25 JSON files through
one `bootstrap-pack-loader` rather than rebuilding the pack from TypeScript tables,
and every former authored TypeScript table/bootstrap builder now either projects
from that parsed registry or has been removed. Engine algorithms such as coordinate
ordering, collision/reach evaluation, transactional processor settlement, and
progression arithmetic remain valid compiled code. Content identity and behavior
choices still embedded in those engines must move to definitions/components before
Phase 6 is complete. This retirement is independent of the separately staged chest
migration.

**Post-drop automation, 2026-09-04:** the final empty-schema publication now has a
dedicated fail-closed `world:release:retire-chests` wrapper and isolated retirement
restore helper. They do not remove the declarations themselves. A real invocation is
deliberately blocked until a generated candidate has no legacy chest storage, mapping,
session, view, reducer, or binding surface while retaining the status receipt and
generic placeable views. The wrapper takes a new leave-stopped rollback-bundled backup,
requires `drop_ready` and literal-zero data/custody counts from both its restored copy
and production before publication, pins source, uses `--delete-data=never` for both
publishes, proves the retired schema, rebuilds both clients, and compares the same
identities with the v2 generic-only rejoin contract. No live action occurred while
adding this automation; the source-removal manifest entry therefore remains open.
No publish or production mutation occurred in this pass.

**Chest-retirement progress, 2026-09-03; operationally advanced 2026-09-04:** the dependency-safe migration kernel
and isolation proof are implemented. A bounded (maximum 100 rows), resumable,
idempotent backfill assigns every legacy chest a persisted collision-safe generic
placeable id and projects the exact owner, signed position/chunk, space, carrier,
open state, authored chest identity/state, every slot (including empty rows), item
quantity, durability, lit state, and damage progress. Exact verification detects
mapping, spatial/state, slot-custody, and damage drift before either read switching
or draining. The retirement gate requires dual-write, game-client and Studio read
switches, no active legacy chest sessions, a recorded verification fingerprint,
and literal zero rows in all three legacy tables. Stage A has since backfilled and
verified the production mirrors and stopped at `placeable_reads`; it has not drained
or removed the retained legacy rows. `scripts/prove-spacetimedb-empty-table-drop.sh` reproducibly verified on
a disposable loopback server that the exact installed CLI/standalone 2.8.2 pair,
with `--delete-data=never`, automatically removes an empty table while preserving
the non-empty companion row, and refuses removal of the non-empty table with
`Cannot remove table ... table contains data`. The transitional authority
tables/reducers, bidirectional dual-write hooks, exact 18-slot chest capacity,
generic pickup/carry/place/axe-despawn parity, collision and reach de-duplication,
game/Studio unified-placeable reads, and a guarded resumable operator runner are
now implemented, and the final transitional TypeScript bindings are regenerated.
The restored-data rehearsal and first live no-delete publish have now passed in Stage
A. Authenticated Stage-A acceptance, the production finalizer, and eventual
empty-schema removal remain release gates.
The migration kernel now also pins a one-way, adjacent-only phase machine
(`legacy_reads` → `backfill` → `dual_write` → `placeable_reads` → `draining` →
`drop_ready`). Every custody-bearing drain batch is capped at 100 chests, refuses
all active legacy sessions, compares its generic placeable/slot/damage mirror
exactly, and emits a deterministic receipt. Retirement requires exact equality to
both the recorded verification and final-drain receipts; a same-prefix or stale
receipt is insufficient.

The production rollout is deliberately two publishes. The first transitional
module retains all three legacy table declarations and generated types, adds the
mapping/control tables and bounded owner-only migration reducers, enables
dual-write, and moves game and Studio reads to unified placeables. It is published
with `--delete-data=never`; traffic is quiesced before verification and draining,
and the clients are not reopened until the same saved identities can rejoin with
their mapped chest positions, ownership, carried state, open-container state,
contents, durability, lighting and damage intact. Only after the authority reports
zero legacy chest, slot, damage and active-session rows and the drop-readiness
receipts match may a second source revision remove the three empty declarations.
That second publish also uses `--delete-data=never`, relying on the separately
proved 2.8.2 empty-table behavior. Neither stage permits `--delete-data`, live-row
deletion by schema migration, or a direct legacy-to-removed publish.

The executable sequence is `npm run world:chest-migrate`. It requires a mode-0600
`WORLD_REJOIN_TOKENS_FILE` containing refresh-capable OIDC credentials, an explicit
`CHEST_MIGRATION_TARGET=rehearsal|production`,
`CHEST_MIGRATION_CONFIRM=migrate:<database>`, and separate game/Studio
acknowledgements. Production also requires
`CHEST_MIGRATION_PRODUCTION_CONFIRM=<database>`. It polls and strictly parses status
after every call, resumes from any committed phase, batches at 100, stops on active
custody or receipt drift, and only returns success at literal zero legacy
chest/slot/damage/mapping/session counts. For a restored rehearsal, the transitional
module must first be published to that isolated restored database with
`--delete-data=never`; run the identical migration to `drop_ready`, then capture the
unified new-schema identity snapshot and disconnect/rejoin-verify it. The migration's
pre-drain parity receipt proves the representation change itself; the post-migration
snapshot proves clients rejoin the unified world. This ordering prevents a rehearsal
against the old schema from falsely claiming to exercise the migration.
The pure kernel, schema/consumer contracts, runner, and exact 2.8.2 drop proof are
covered by 50 focused passing tests; the checked world build, world/client/release
typechecks, client production build, and chunk-boundary check also pass.

The guarded `scripts/world-release.sh` now drives this sequence end to end. After
building and statically validating both production browser applications, it pins a
deterministic manifest of the world/simulation module source. After quiescing traffic
and taking a checksummed backup, its restore helper publishes the
transition module to the disposable restored authority, migrates it, and only then
captures the expected new-schema rejoin snapshot. Production receives the same
no-delete publish and runner sequence, and its post-migration snapshot must equal that
restored-backup expectation before traffic resumes. Rehearsal and production JSONL
receipt logs are created separately in the backup directory with owner-only modes;
there is no pre-publish capture against the old live schema. Every isolated and live
publish/migration boundary rechecks the pinned source, the production endpoint is fixed
to `http://127.0.0.1:3000/orchard-cellar-world`, and the release backup leaves the live
authority stopped throughout the isolated rehearsal. Failure after that quiescence
but before live publication restarts the unchanged authority while keeping both
browser routes closed. Once live publication begins, a failure keeps the authority
and both browser routes stopped for explicit investigation.

**Progress, 2026-09-03:** the continuity tooling now closes the restore side of that
gate without changing a live service. The identity snapshot additionally pins the
live map head, content head, and additive space-flag rows. A checksum- and path-checked
rehearsal extracts each quiesced backup into a fresh temporary directory, starts only
an isolated loopback authority on a non-live port, publishes and migrates the restored
world, and runs the same saved-identity parity verifier before cleanup. The release
orders this complete rehearsal before its production `--delete-data=never` publish.
Executable dry-run tests prove the orchestration does
not invoke systemd, publish, or print credential contents, and static Studio/NPM
validation checks the prebuilt-only unit, CSP, rate limits, query-free logging, public
headers, and same-origin authority health. The operator guide now includes failed-
publish world quarantine/restore and independently recoverable Studio/edge rollback.

**Operational performance evidence, 2026-09-04:** post-restart measurement showed
that an active player exposed a pre-existing collision hot path rather than a backup
or durable-data failure. With 7,104 collision obstacles, collision work averaged
72.76 ms per `stepWorld` call (112.70 ms maximum) against the 50 ms tick budget;
after the player-presence lease expired, calls averaged 0.414 ms and used about 2%
of one core. The behavior-preserving fix caches generated-resource suppression sets
and decoration obstacle overlays by live-map revision/content hash, validates cache
hits through indexed heads before materializing the content registry, reuses the
tick's resource/chest/target rows and live runtime, and replaces the 600-tick bee
roster scans with primary-key probes. It also builds the 832 x 832 combined projectile
terrain lazily and once per projectile-bearing space instead of once per occupied
space per tick. It changes neither schemas nor durable world or player data. The
focused live-map/scalability/projectile suite passes all 30 tests, alongside world
typecheck, lint, checked build, and diff checks. Exact per-entity chunk scoping remains
a future, non-gating semantic optimization because the shared collision view currently
serves players, projectiles, panic wildlife, and authored NPCs.

Before Phase 6 retirement work, the live authority was quiesced and archived at
`/home/toby/backups/orchard/20260903T100301Z-pre-authoring-retirement`. The canonical
5,980,658,646-byte archive is mode `0600`, passed its recorded SHA-256
`37dccf0d6fe0f0c63d44634549013d776f2365bd5dc9c3839bb7a3ad090e015b`, and the
same supervised authority recovered on its loopback health endpoint. No module was
published and no durable row was changed during this backup gate.

## 17. Risks and open questions

- **Determinism and prediction.** The client resolves interactions for prompts and
  cosmetics only; any effect with durable consequence waits for the reducer. The
  resolver must stay float-free and RNG-seeded per docs/02.
- **Live edits under players' feet.** Deleting or narrowing an item, slot, or footprint
  while rows reference it is the main hazard; the validator's retire/replacement rule
  and the "no online player inside new collision" rule from doc 42 apply.
- **Vocabulary creep.** Each new opcode or event is a Tier B release on both sides.
  Keep the vocabulary reviewed in this document and prefer composing existing effects.
  Measure it: if more than a handful of Tier B releases in a quarter exist only to add
  opcodes for authored content, that is the trigger to design the sandboxed script
  handler kind of §4.2, still behind the effect applier and an instruction budget.
- **Handlers that outgrow the bus.** Movement, combat math, and generation stay
  engine code and never become handlers; a handler that needs per-tick work must use
  the coarse `tick` event in occupied chunks or a bounded timer, never `stepWorld`.
- **Asset delivery.** New definitions can only reference art already in the built
  atlas until doc 42 §9 lands; the editor's asset picker filters to that set.
- **Schema drift between JSON payloads and generated bindings** is avoided by design
  (payloads are opaque strings to SpaceTimeDB), but sim parsers must upgrade every old
  `schemaVersion` forever, like `MapDocumentV3`.
- **Resolved in the implemented contract:** definitions use JSON-in-row payloads,
  and `content_editor_grant` remains a separately revocable grant rather than
  overloading the `admin` membership role.

## 18. Work breakdown for parallel agents

Lanes follow the brief format in [15](15-agent-workflow.md) §8.1. Agents of any model
should be able to take a lane from its brief plus the sections cited in it.

### 18.1 Contract lanes (merge first, one agent each, short)

| Lane | Owns | Produces |
|---|---|---|
| **55-A1 behaviour contracts** | `packages/sim/src/behaviour/{events,effects,snapshot,handler}.ts` + tests | the §4.1 event union, §6.2 `Condition`/`Effect` unions with `engineVersion` tags, `ReadOnlySnapshot`, `Handler`/`HandlerResult`, and fixture snapshots for every §11 row (`packages/sim/src/behaviour/fixtures/*.json`) |
| **55-A2 content contracts** | `packages/sim/src/content/{definitions,registry,validate}.ts`, `packages/tools/src/content-export.ts`, `packages/assets/content/*.json` | §5.2 payload types, `parse<Kind>Definition` with `schemaVersion` upgrade stubs, `buildContentRegistry` returning a registry whose maps deep-equal the current constants (parity test), the exported bootstrap pack, and the §13 validator skeleton with its error-code list |
| **55-A3 world extraction** | `packages/world/src/behaviour/*.ts` (new), mechanical moves out of `index.ts` | move `useHands`, `interactPlaceable`, `interactChest`, the five `settle*` functions, `toggle*`, `startCooking`/`collectCooking`/`cancelCooking`, `sealBarrel`, `eatSelectedFood`, `readRecipeBook`, `repairSelectedTool` into lane-owned files with no logic change; `monolith-extraction.test.ts` extended |
| **55-A4 client extraction** | `packages/client/src/interaction/*.ts` (new) | move the `F`-key chain, `interactionPrompt`, `activateInteraction`, and the station-window open chain out of `overworld-main.ts`; move station slot restrictions and `overworldUiLayout()` station branches out of `overworld-ui.ts`; no logic change |

A1 and A2 are independent of each other; A3 and A4 are independent of everything and
can start immediately.

### 18.2 Build lanes

| Lane | Depends on | Owns | Must not touch | Done when |
|---|---|---|---|---|
| **55-B0 event bus** | A1, A3 | `packages/sim/src/behaviour/raise.ts`, `registry.ts`; `packages/world/src/behaviour/applier.ts`, `interact-entity.ts`, `use-selected.ts`, `entity-timer.ts` | any handler file below | `raiseEvent` ordering tests; applier arm per effect with a golden row-write test; `interactEntity`/`useSelected` reducers exist and reject unauthorized senders |
| **55-B1 placeable handlers** | B0 | `packages/sim/src/behaviour/handlers/placeables.ts` + world moves for §11 rows 3–5, 8, 10, 13, 15 | items, processors, loot | golden effect tests per row; retired reducers removed from bindings |
| **55-B2 item lifecycles** | B0 | reviewed lifecycle source plus generated registrations for §11 rows 1, 2, 9, 11, 12, 18–20, 26 | placeables, processors | parity goldens pass; compiled `handlers/items.ts` bridge is absent |
| **55-B3 processor handlers** | B0 | `.../handlers/processors.ts`, one `settleProcess`, `process` definitions for §11 row 7 | frames | same; five `settle*` deleted |
| **55-B4 loot handlers** | B0, A2 | `.../handlers/loot.ts`, `loot` definitions for §11 rows 16, 17 | NPC | same; `food.ts` switches deleted |
| **55-B5 NPC, dialogue, quest events** | B0, A2 | `.../handlers/npc.ts`, `dialogue.ts` event hooks, `spawn`/`tick` wiring in `stepWorld` (extract first) | wildlife AI internals | §11 rows 21–24; `statistic`/`questState` raised through the bus |
| **55-C registry tables** | A2 | new tables §5.1, `publishContentChangeSet`, `restoreContentRevision`, grants, module cache in `packages/world/src/content/*.ts` | behaviour files | §15 world tests; 500-row publish inside budget |
| **55-D client registry** | A2, C bindings | `packages/client/src/content/*.ts` subscription, cache, `engineVersion` gate, draft overlay hook | UI screens | two-client test: published item appears without reload |
| **55-E Items tool** | A2 (C for live publish; mock adapter until then) | the Items Studio tool (`packages/studio/src/tools/items`; the uncommitted `editor/item-studio*.ts` draft until 56-S3 moves it) | other studios | draft, validation, history, publish of an item, recipe, price, process |
| **55-F object components** | A1, A2, B0 | `object` parser, data-graph handler kind, `stateJson`, `light` from data, Object Studio Behaviour tab | compiled handler files (B1–B5 convert their own rows) | §1 oil-lamp scenario end to end |
| **55-G frames** | A2, A4 (C for authority restrictions) | `frame` parser, generic renderer over `storage-frame.ts`/`compositions.ts`/`container-binding.ts`, Frame Designer, one window per sub-lane (G1 chest+barrel, G2 furnace+cooking, G3 press+fermentation, G4 crafting+pack, G5 shop) | reducers except the restriction read in `moveItem` | layout tests at UI scales 1–3; station branch deleted per window |
| **55-H NPC/dialogue/quest studios** | B5, C, D | NPC Studio, Dialogue Graph, Quest Editor, `npc`/`shop`/`dialogue`/`quest` parsers | handlers | Phase 4 Done-when |
| **55-I world tables and pack** | C, D | `crop`/`creature`/`spawn`/`space`/`skill_tree`/`effect`/`statistic`/`upgrade`/`balance` parsers, the World Tables and Pack Studio tools, `content:validate` | studios above | Phase 5 Done-when |
| **55-J retirement and release** | all | deletion of sim literals and remaining branches, `world:release`, docs/02 update | — | Phase 6 Done-when |

### 18.3 Parallelism map

```text
A3 ─┐                 ┌─ B1 ─┐
A1 ─┼─ B0 ────────────┼─ B2 ─┤
A4 ─┘        ┌────────┼─ B3 ─┼─ F ─┐
A2 ─┬─ C ─┬──┤        ├─ B4 ─┤     ├─ H ─┐
    │     └─ D        └─ B5 ─┘     │     ├─ I ─ J
    ├─ E (mock until C)            │     │
    └─ G1..G5 (authority read after C) ──┘
```

Wave 1 (four agents): A1, A2, A3, A4. Wave 2 (three to five agents): B0, C, E, G1,
and D as soon as C's bindings exist. Wave 3 (up to six agents): B1–B5 and G2–G5. Wave 4:
F, H. Wave 5: I. Wave 6: J. Each wave has one integrator; the integrator for waves 2–3
also owns `packages/world/src/index.ts` merges, since every world lane adds registrations
there.

### 18.4 Conflict rules specific to this plan

- `index.ts` registrations: each world lane appends its `spacetimedb.reducer`/`table`
  registrations in a clearly delimited block named for the lane; the integrator resolves
  ordering. Nobody reorders existing registrations.
- Generated bindings are regenerated only by the integrator after merging world lanes;
  client lanes code against the committed bindings of the last integration.
- Effect and condition vocabularies (§6.2) change only through A1; a build lane that
  needs a new opcode files a `TODO(55-A1)` and a DECISIONS `OPEN:` line, and works
  around it with a compiled handler until A1 ships the opcode.
- Golden fixtures under `packages/sim/src/behaviour/fixtures` are append-only during
  waves 2–3; changing an existing fixture requires the lane that owns the row.

## 19. Bookkeeping

- DECISIONS.md: the 2026-09-03 proposal is realized as JSON-in-row definitions and
  a separate `content_editor` grant; the Studio hostname and `support` grant have
  their own explicit decision entries.
- docs/00 gains this document; docs/14 gains milestone M5.15.
- On Phase 1 start: update docs/02 (content registry replaces sim literals), docs/08
  (content tables), docs/23 §4 (frames), docs/28 (processes), docs/31 (NPC
  definitions), docs/42 §7.1 (shared publish kernel).

## 20. Current completion boundary and remaining work (audited 2026-09-04)

Production Stage A is complete, not merely repository-ready. The latest successful
interaction-hotfix release used the mode-`0600` backup at
`/home/toby/backups/orchard/20260904T054800Z-interaction-hotfix`, rehearsed the
transition and drain on an isolated restore, published the pinned transition module
with `--delete-data=never`, advanced production reversibly to verified
`placeable_reads`, passed the same-identity version-2 rejoin comparison across 38
durable tables, and returned the world, game, and Studio services healthy without
storing credentials in evidence. Production deliberately retains 11 legacy chest
rows and 176 legacy slot rows beside their verified generic-placeable mirrors; the
isolated rehearsal, not production, reached literal-zero `drop_ready`; rehearsal and
production retained the verification fingerprint `chest-verification:6d0c7263`.

Backup and restore maintenance is now scheduled below the live services by default.
`backup-world.sh`, the restored-world rehearsal, and the retirement rehearsal lower
their shell and inherited checksum, archive, extraction, and disposable-authority
descendants to `WORLD_MAINTENANCE_NICE_LEVEL=15` and Linux idle I/O scheduling
(`ionice -c 3`) before heavy work. The override is range-checked, failures to lower
priority are explicit warnings, and the release-continuity tests cover all three
entry points. A later read-only verification rechecked the retained 6.26 GB world
archive and rollback bundle against both checksum manifests successfully while the
live authority remained healthy; no backup, restore, archive, checksum, or publish
process was left running afterward.

That release also deployed the interaction compatibility hotfixes. A Stage-A migrated
generic chest now resolves the existing `frame:chest` contract from either its chest
kind or `object:chest` definition id, and generic stations use the exact faced-tile
target contract instead of the radial check that rejected valid cardinal/facing
targets. Focused authority and frame-runtime tests cover both paths. The new
`scripts/placeable-interaction-acceptance.ts` harness can inspect an exact owned chest,
fruit press, or fermentation cask before a separately confirmed production
interaction; it snapshots every durable slot, closes the session after dispatch, and
requires the slots and open state to match afterward. A subsequent signed-in
production game browser opened and closed a Stage-A migrated generic chest without
moving an item; its contents remained present and no client or reducer error was
observed. This is direct chest interaction evidence, not processor evidence and not
permission to drain the retained legacy rows.

A separate processor acceptance used only the checksum-verified
`20260904T054800Z-interaction-hotfix` backup restored to a disposable loopback
authority. Legacy fruit press `4131`, whose durable `definitionId` is empty, passed
the inspect-first guard, opened its press frame with all three empty slots visible,
closed, and retained the exact slots, idle processor fields, and closed state with
zero item movement. The restored world's only legacy fermentation cask, `4129`, was
explicitly excluded: it contains an active `must` batch, and the authority settles a
processor before opening its frame. Instead, an owner-scoped empty cask fixture
`9223372036854792204` was created on that disposable clone through exact
admin-preview fingerprints; its fermentation frame opened with both slots visible,
closed, and retained its slots, idle processor fields, and closed state with zero item
movement. The isolated server, temporary data, local signing credentials, and fixture
were then destroyed. Production was neither contacted nor mutated by this processor
run. This is restored-clone evidence, not production processor acceptance: the mature
legacy cask was never opened, while focused runtime tests prove empty-definition
press/cask rows resolve their compatibility definitions and frame handlers.

The harness models generic-chest two-tile radial reach separately from exact
faced-tile processors, resolves legacy empty definition ids from runtime kind, and
describes non-owner inspection as an owner-scoped fingerprint limitation rather than
reporting false kind or facing failures.

Game startup has additional repository-tested safeguards. Collision and light-
occlusion compilation waits until connection, identity, world seed, clock,
environment, and authoritative player position are all present. The fixed-step RAF
loop performs at most four catch-up updates, discards excess stalled-frame time, stops
while the document is hidden, and restarts with a fresh timestamp. The revisioned PWA
worker releases successful navigation and static-asset network responses before a
best-effort `CacheStorage.put`, registers that write synchronously with `waitUntil`,
and preserves cache-hit and offline app-shell fallback behavior. These source tests
and builds improve launch robustness; they are not a substitute for the remaining
same-identity remote-browser and authored-content acceptance gates.

That release proves migration ordering, restored-world parity, rejoin continuity,
deployment of the tested interaction compatibility paths, and the later signed-game
chest open/close check. The later isolated restore proves safe press/cask frame and
slot behavior only at the restored-clone boundary; it does **not** prove a production
processor interaction or any browser-authored content flow. No
`world:stage-a:acceptance` evidence artifact or authenticated visual/mutable scenario
is present. In addition, the 2026-09-05 lifecycle ownership audit keeps Phase 6 open
for missing event raises, generic frame actions/processors, live-definition tool and
loot dispatch, object components, and remaining NPC/quest/commerce/landmark literals.
The following external and release gates remain open as classified in
`scripts/docs-55-56-acceptance-manifest.json`:

1. `55-tests-two-client` / `55-phase-1-live-content`: record a new private Stage-A
   read-only artifact, then publish a disposable item/recipe/price from authenticated
   Studio and craft, sell, and eat it from a distinct connected game identity; restore
   the prior content revision.
2. `55-phase-2b-oil-lamp`: publish the oil-lamp object graph and prove two-client
   interaction, lighting, reconnect, and rollback before deleting its compiled
   fallback.
3. `55-phase-3-live-frame-release`: retain the completed signed-game generic-chest
   open/close proof and the restored-clone processor evidence, then use the
   inspect-first harness and an explicit production confirmation on safe owned, idle
   fruit-press and fermentation-cask fixtures without moving items. Publish a
   disposable frame revision and visually verify all live game windows, restrictions,
   UI scales, and reconnect while production remains at `placeable_reads`.
4. `55-phase-4-narrative`: publish the mutually-referencing NPC/dialogue/shop/quest,
   observe materialization, and complete/rollback the flow from the second game client.
5. `55-phase-5-pack`: compare the committed fixture with the deployed head and run the
   receipt-backed playtest on a restored rehearsal authority and production.
6. `55-phase-6-retirement`: finish the audited lifecycle-ownership migrations and their
   arbitrary-definition semantic tests. Only after the preceding Stage-A visual/two-client
   checks, run `npm run world:release:finalize` to a freshly backed-up and rehearsed
   `drop_ready`; then remove the legacy chest/session/mapping declarations and bindings
   in source and run the separately guarded `world:release:retire-chests`. This single
   manifest entry deliberately aggregates all remaining repository retirement work;
   it is not limited to chest declarations.

That label describes the formal doc-55/56 acceptance manifest, not every remaining
Studio refinement. Doc 56 §13 separately records active Map and shell work that is not
the destructive chest-retirement gate.

The dated 2026-09-03 progress notes above are implementation history. Their statements
that no production publish had yet occurred are superseded only by the Stage-A result;
their phase-specific live Done-when scenarios remain unclaimed.


### Forward runtime recovery, 2026-09-05 (not deployed)

Production remains on the retained Stage-A world and its original revision-1,
459-definition head `ba28da55`. Authenticated diagnosis confirmed that the client
receives the original character, inventory, recipes and quests, but rejects the
content after adding parser defaults. Integrity now hashes original stored JSON;
semantic registry validation remains independent. The historical production payload
fixture proves successful adoption and cache restoration and rejection of tampering.
Release capture, publication, authority caches and Studio checkout use the same
durable-payload contract. Publication preserves untouched rows exactly.

Bootstrap compatibility projections no longer construct a registry during simulation
module initialization. Authored landmark groups admit registry-defined IDs and carry
explicit presentation layers. Golden continuity tests preserve all 184 original
landmark rows and the full 7,457-decoration stream. Placeable definitions, homestead
build palettes and refunds use registry-fed models and authored item-to-object edges;
unknown explicit durable IDs fail closed. Shop frames resolve authored dialogue
frame references. Vehicle movement, launch and mount interactions use authored NPC
mount metadata, while farming infrastructure uses authored irrigation, seasonal
protection and recipe skill requirements. The current export is 531 definitions in
21 files, hash `8cfe4746`.

The current item lifecycle source is revision 11 with 109 callback owners and 72
reviewed-inert items. Tier-B approval now follows the owner's latest 2026-09-05
decision: verbal approval in chat for the specific release after repository checks
and a short description of the live change. No owner-confirmation record, digest
approval environment variable, candidate spool, handoff CLI, or build service remains.
At the login-incident boundary, a paired guarded module/content release was
required because the served frontend had newer selected-item command parameters
than production accepted. The isolated frontend
hash-fix prototype and the retained rollback frontend were not deployed.

Pending legacy cooking jobs now retain their exact private escrow rows while authored
frame callbacks own collection and cancellation through the `frameAction` event.
The server grants the stored output only after the stored ready tick and original
station checks; cancellation refunds the stored input even if that station is gone.
Complete inventory insertion, an immutable resolution receipt, and escrow deletion
commit together. Historical skill credit is authored separately from current recipes.
The release checks schema retention and this tested lifecycle path instead of requiring
an empty private table. This does not claim live acceptance or authorize retirement.
Full repository checks, specific owner chat approval, a fresh backup and live-head
capture, no-delete restoration rehearsal, same-identity parity and production gameplay
acceptance remain prerequisites. Legacy chest declarations and data remain retained.
Broad editor visual refinement stays paused until runtime acceptance is complete.


### Routine input and entrance follow-up, 2026-09-05 (deployed)

The earlier forward recovery sections record the pre-release state. Production has
since received the preserved cooking lifecycle and both routine live-fix releases.
Version 0.2.4 is deployed with content revision 4, hash `1fd79ee9`, and 484
definitions in 21 files. Its sole new item-content change raises the authored sword Vigour
cost to 3,600 centi per hit, with the existing half-cost whiff rule preserved.

Client input now ignores distant fishing and farming clicks before invalid-target
feedback or optimistic costs, and skips SPACE requests while required jump skills
are unlearned. The server still owns all lifecycle effects and skill checks. New
roguelike runs require an in-range entrance in the active authored space; Marlow
has no authored entrance, so stale or direct start requests cannot restore the
removed shortcut. Retired spaces lose new entrances while their space resolution
and existing run exit/return paths remain available. This adds no stored table
change and does not erase existing runs or player state.

The guarded release passed 3,093 tests in 529 files, all typechecks, lint, lifecycle
integrity, content validation, the checked world build and both static builds.
Full private and public schemas matched the prior live module, and same-identity
parity passed across all 38 captured tables. Publication retained every content
ID, with one sword upsert and zero deletes. Both browser tabs reconnected with
content ready. The original processor, quest, recipe-book and multi-client gameplay
acceptance scenarios remain separate; a successful live sale is not yet claimed.
Release evidence is recorded in `ops/LOGIN-RECOVERY-2026-09-05.md`.


### Furnace admission and fishing completion, 2026-09-05

The 0.2.5 world module and content revision 5 are published: 484 definitions in
21 files, hash `8d549120`, with two upserts and zero deletes. Furnace fuel admission
now derives from active smelting process policies, replacing the conflicting
object-level fuel tag requirement. Empty or retired process sets reject new
insertion while existing contents remain extractable. Fishing completion is an
authenticated terminal no-op after a cast is consumed; client request sequencing
prevents duplicate pending or acknowledged reels. Existing active-cast timing
and tool checks remain enforced.

The original candidate passed 3,113 tests in 530 files and every repository,
content and build gate, with unchanged public/private schemas. Publication then
stopped web traffic on a strict Vigour mismatch. The original failure is retained;
review identified normal regeneration and subsequent presence-action cleanup as
two narrow transient changes reviewed by the root agent using independent
agent evidence. Fresh same-identity reconnect parity passed all
38 tables with the unchanged comparator. A separate offline/update UI repair
passed 111 focused checks, client typecheck, lint, isolated build and asset checks.
Static recovery completed with exact HTML/chunk checks on both canonical sites,
all three services active, final strict 38-table reconnect parity and unchanged
module/content/world-source pins. The shared browser reloaded into the corrected
0.2.5 build and rejoined as the same identity with content ready, 48 inventory
rows and full Vigour. A controlled presentation-only disconnected/update-state
check exercised the actual modal render and a real click, invoking refresh once;
all temporary overrides were restored. This does not claim a new live server
disconnect or real waiting-worker arrival on the corrected build. Actual furnace
fueling, fishing completion, original processor contents/progress, selling,
quests, recipe-book and sustained multi-client acceptance remain separate.
Evidence is in `ops/LOGIN-RECOVERY-2026-09-05.md`.

### Client walking performance release, 2026-09-05

The client-only 0.2.6 terrain-reuse and reconciliation-smoothing repair is deployed.
All 3,122 tests in 531 files, lint, client/engine/UI/Studio typechecks, the checked
world build and isolated client build passed. No module or content was published;
the live module, content head and Studio's 0.2.5 artifact remained unchanged. The actual
waiting-worker prompt accepted a real Refresh Now click, loaded the new build
and rejoined the same identity with content ready. The user confirmed the slight
walking jitter/delay was fixed. The scoped Node collision/light refresh benchmark
improved from 51.02 ms to 1.97 ms median; it excludes Canvas/network work and is
not a browser FPS measurement. Evidence and remaining gameplay acceptance limits
are recorded in `ops/LOGIN-RECOVERY-2026-09-05.md`. Broad Studio/map-editor visual
refinement remains deferred.


### Authored resource discovery, 2026-09-05 (deployed 0.3.0)

Version 0.3.0 adds five authored skill nodes, for 65 nodes across the three
existing tracks. The exported pack retains 484 definitions in 21 files, hash
`9d5ace3c`. Prospector leads to Ore Sense (15 tiles), Deep Ore Sense (60 tiles),
Ore Identification, and Ore Mapping. Fishing Mapping branches from Seasoned
Angler. Explicit all-owned prerequisites prevent reverse graph adjacency from
skipping the chain; server-owned ranks and active registry metadata determine
passive capabilities. Existing identities, ranks and spent points remain intact.

Buried detections remain anonymous grey markers until identification is learned.
World overlays, distant hover and minimap markers share a bounded cached
projection; distant hover never extends tool reach. Ore and fish minimap perks
have authored 60-tile ranges, exclude trees, and update after respec, excavation
and depletion. The skill UI receives the active registry's node model.

The guarded 0.3.0 release passed all 3,165 tests in 535 files, lint, all workspace
and release typechecks, and checked world/client/Studio builds. Complete private
and public schemas remain unchanged; the sole farming-tree upsert retained all
484 definitions with zero deletes. Content revision 6 is `9d5ace3c`. The strict
38-table reconnect comparison passed exactly after the expected content-head
change, and the prior module and static artifacts remain available for rollback.

A real Refresh Now click loaded `index-DmtcITOL.js`; the same Dastari identity
reconnected with no error, content ready, all five new nodes and 48 inventory
rows. The player initially owned none of the new ranks. Live positive ore
overlays, distant hover and minimap markers remain unverified; agents did not
purchase or reset player skills. This release does not complete the remaining
legacy gameplay acceptance checks. Evidence is recorded in
`ops/LOGIN-RECOVERY-2026-09-05.md`; broad Studio styling remains deferred.


### Material tools and mobile input, 2026-09-05 (deployed 0.4.0)

The deployed 0.4.0 pack contains **531 definitions across 21 files**, hash
`8cfe4746`: **181 items, 61 recipes and 37 processes**. Lifecycle revision **11**
has **109 callback-owned items and 72 reviewed-inert items**, source SHA-256
`3b9cd7a8dd00e1c92a1dc5a27164f89886b962b59fb0fe58933110453997b57f`.
The guarded release passed all 3,203 tests in 542 files, all workspace/release
typechecks, lint, content and lifecycle integrity checks, validation of 1,020
assets, and checked world/client/Studio builds. Complete public/private schemas
remain identical. Publication used no-delete protection, retained every one of
the previous 484 content IDs, and advanced the head to revision 7 with 531 total
definitions. The strict reconnect gate matched all 38 tables for the same owner
identity after applying only the reviewed content-head change.

Hoe selection, the painted range and authority now use the same tile centre and
authored two-tile reach. The pack supplies recipes for all 24 axe, hoe, pickaxe
and shovel combinations across wood, stone, copper, gold, silver and iron.
Existing wooden-tool IDs and stored wear remain intact. Mining eligibility comes
from authored tool capabilities: copper has wooden durability with iron mining
capabilities; gold has wooden mining capabilities. Shovels retain their existing
repair-only lifecycle and do not gain a new digging action.

The implementation defaults multiply each wooden tool's durability by **1,
1.5, 1, 2, 2.5 and 3** for wood, stone, copper, gold, silver and iron respectively.
These balance defaults are implementation assumptions, not a newly approved user
decision; the unanswered silver balance choice remains provisional. Iron's
primary mining payout is preserved, while a separate authored secondary loot
group adds a 10% silver-ore chance. The added furnace process smelts silver ore
into a silver bar without replacing existing iron inputs or outputs.

2026-09-15 balance amendment: the owner set Silver Pickaxe durability to **1,500**,
twice Iron Pickaxe's 750. Its swing speed, vigour cost, reach and mining permissions
remain unchanged. Full repair still costs one Silver Bar plus five bronze. This
supersedes the provisional silver multiplier for the pickaxe only; other silver
tools retain their existing durability.

Mobile world input distinguishes a single tap, a two-finger pinch and a
250 ms long press. A pending tap acts once on release; a pinch owns both fingers
without firing a tool; a claimed long press preserves bow charging until release
and cannot become a pinch midway. Retained UI and joystick touches stay outside
world pinch recognition. Controls settings expose a movement/action side swap
and a bottom-offset slider, saved for the browser/device and bounded to keep the
controls in view. Mouse-wheel zoom keeps its existing behavior.

Tool icons and avatar actions resolve authored presentation assets. The asset
batch covers 24 tool icons, 18 axe/hoe/pickaxe swing sets and silver ore/bar art;
the audit resolves all 181 active items to 150 icons with no outlined source
variant remaining. Hammer and legacy shovel use plain originals; the fishing
rod retains its rod/line pixels without the white halo. The atlas contains 1,020
assets. Exact ImageGen concept prompts and the four 1254×1254 wooden source images
are retained in `references/generated/tool-progression/`. The reproducible
`packages/tools/src/build-tool-progression-art.ts` derives native 16×16 icons
under `art/custom/tool-progression/`; licensed Kenmi swing geometry is retained
in 64×64 frames, packed into 64×1152 source sheets. Silver ore/bar images are
16×16 palette derivatives. Credits and derivation are recorded in `CREDITS.md`
and `art/custom/README.md`.

Independent release review passed against
`/home/toby/.local/state/orchard-040-tools-20260905/deployment-2`. A real Refresh
Now click loaded `index-C0Vu-_QU.js`; the same Dastari identity rejoined with no
error, content ready at revision 7/hash `8cfe4746`, and 48 inventory rows. In a
514×1110 CSS-pixel shared-browser preview, the real Controls toggle and slider
persisted a swapped layout and bottom offset of 60. This is not real-phone or
pinch-gesture validation. The user reported that the deployed wooden icons look
like thin diagonal sticks with indistinct heads at inventory scale; an art
correction is being prepared separately. Remaining legacy
processor/quest/multi-client acceptance is also incomplete. See `ops/LOGIN-RECOVERY-2026-09-05.md`
for release evidence and limits. Broad Studio styling remains deferred.


### Approved inventory tool silhouettes, 2026-09-05 (deployed 0.4.1)

After reviewing all six materials at the game's actual inventory scale, the
owner approved all 24 replacement icons and requested installation. Axe, hoe
and pickaxe retain licensed Kenmi No Outline native silhouettes; the shovel is
an original project-authored 16×16 drawing. The selected geometry and material
palettes are recorded in `references/generated/tool-progression/review-v2/`,
including the approved `shovel-redraw-inventory-preview.png`. The earlier
ImageGen wooden concepts remain historical provenance, not the current approved
silhouettes.

The frontend-only 0.4.1 art release is installed. Asset validation, relevant
workspace typechecks, focused tests, full lint and the staged production client
build passed. Independent review verified the approved native pixels, all four
seasonal atlas copies, unchanged swing/silver art, retained prior asset URLs and
the static graph. Authenticated checks before, immediately before and after
installation matched the deployed module and revision-7 content head exactly;
Studio also remained unchanged. The installed entry is `index-BtpMA4H1.js`, with
PWA cache `orchard-0.4.1-mto1b95s`. A real Refresh Now click loaded that entry;
the same Dastari identity rejoined with no error, content ready and 48 inventory
rows. Inventory, character, skill tracks, skill nodes and quests matched the
pre-refresh snapshot exactly. All four approved wooden icons were visually
verified in inventory/hotbar. Position and recipe-cache parity are not claimed;
a subsequently reported line artifact at fractional hotbar scaling is a separate
follow-up. Remaining gameplay acceptance obligations are unchanged. Exact
evidence and check limits are in `ops/LOGIN-RECOVERY-2026-09-05.md`.


### Fractional-scale inventory sampling and accidental map placement, 2026-09-05 (deployed 0.4.2)

The frontend-only 0.4.2 repair isolates inventory atlas frames in a reusable
cache before scaling; nine-slice rendering shares that cache. A Chrome pixel
comparison covered 768 scale/placement cases: 157 showed neighboring-atlas
bleed before the fix and none afterward, using 24 cached frames. The release
passed 157 focused tests in six files, client/UI typechecks, lint, content
validation, the production build, static checks and rollback verification. The
world module and content head matched before, immediately before and after
installation. A real Refresh Now click loaded `index-xF_puAhK.js`; the same
Dastari identity rejoined with content ready, no error and 48 inventory rows.
The hotbar icons were visibly clean at the observed DPR 1.6431677341461182 and
UI scale 1. These checks do not establish general gameplay parity.

Separately, the owner requested removal of one accidental legacy-editor apple
tree beside Fisherman Fin's hut. The existing owner-only map publication reducer
removed only object `asset-3132196081-animation-base-0-404-316-1`, using an exact
revision-2 compare-and-swap after capturing the original row/document. Live map
revision 3/hash `9b04389a` matched the expected document exactly: the other five
objects, shared prefab, all 184 landmarks, transitions, suppressions and terrain
were unchanged. This removed its 12-tile/192-subcell collision footprint without
deleting the nearby normal resource tree or hut. Original map bytes and server
revision history remain available. Release and operation receipts are recorded
in `ops/LOGIN-RECOVERY-2026-09-05.md`; other interaction/animation reports remain
separate follow-up work.


### Local action timing and contextual interaction repair, 2026-09-05 (deployed 0.4.3)

The frontend-only 0.4.3 release requires a real subscribed campfire row and
active authored secondary interaction before a contextual action can intercept
the selected tool. Local action presentation now keeps one monotonic timeline
through delayed server echoes, including overlapping swings; rejected requests
remove their own presentation token. Held bow previews and release echoes remain
separate, and selected tool poses use the active registry's equipment metadata.
Cosmetic weather phase no longer jumps when authority rows hydrate or a tab
resumes; actual weather, wind and calendar selection remain authoritative.

The release passed 59 focused tests in five files, client/UI typechecks, lint,
content/lifecycle checks and the staged production client build. The structural
extraction seam was recomputed with its existing AST algorithm; all six seam
tests are included in the passing focused suite. Guarded installation preserved
the world module, revision-7 content head and Studio, with the prior client and
old asset URLs retained. A real Refresh Now click loaded `index-86irvacy.js`.
After hydration the same identity reconnected with no error; inventory, character,
skill tracks, skill nodes and quests matched the pre-refresh snapshot exactly.
Positive live animation acceptance remains separate from that rejoin proof.

A separate owner-authorized map compare-and-swap removed only accidental object
`asset-3132196081-animation-base-0-376-350-1`. The exact result advanced live map
revision 3/hash `9b04389a` to revision 4/hash `21a3c554`, retaining four other
objects, the shared prefab, all 184 landmarks, transitions, suppressions and
terrain. The browser confirmed the target absent with four objects and 184
landmarks. Original map bytes and server history remain available. Evidence is
in `ops/LOGIN-RECOVERY-2026-09-05.md`.

The Fisher hut's left collision column and replacement of 54 remaining outlined
item icons were scheduled separately and subsequently released in 0.4.4, recorded
below. They were outside 0.4.3; broader Studio refinement remains deferred.


### Plain inventory icons and Fisher hut collision, 2026-09-05 (deployed 0.4.4)

The 0.4.4 world/client/Studio release replaces 54 remaining outlined crop, seed
and mineral icon frames used by 77 active item IDs with reviewed native plain
source cells. Earlier filename-based audits missed contours baked into generic
sheets; the correction uses explicit source/region mappings and exact pixel
checks. Crop and ore importers consume that same mapping so regeneration keeps
the selection. All 24 approved tool icons, fruit-press art and pixels outside
the 54 changed frames remain intact; the atlas still contains 1,020 assets.

The Fisher hut's transparent left collision column is now open at tiles
`(400, 313)` and `(400, 314)`, while the five-by-two facade remains solid. Client
and world authority share the same geometry. The fixed-seed server projection
was regenerated with `npm run world:collision:generate -w @orchard/tools`; its
only byte change is ground obstacle 104's left bound from 102400 to 102656. The
first release attempt stopped before publication when the full suite detected
the stale generated artifact. After regeneration, deployment 2 passed all 3,238
tests in 546 files, all typechecks, lint, content/lifecycle/asset checks and the
checked world plus both frontend builds.

Public/private schemas remained identical, no-delete publication preserved the
world, and the same owner's 38-table before/expected/after comparison was exact.
The reviewed content candidate had zero upserts/deletes, retaining revision 7,
hash `8cfe4746`, and all 531 definitions. The new world module is
`8b79bfd18b26148dfdb4f1a242ef8e7962f7038ea243d5ad26c15b589d321c40`.
A real Refresh Now click loaded `index-BjcxJFRJ.js`; the same Dastari identity
rejoined with no error and 48 inventory rows. Live map revision 4 still had four
objects and 184 landmarks, with the separately removed `(376, 350)` tree absent.
Read-only health sampling found no critical journal matches. Actual walking
along the hut and sustained weather playback remain unverified; the automated
checks and rejoin do not imply those results. Evidence is in
`ops/LOGIN-RECOVERY-2026-09-05.md`. Broad Studio styling remains deferred.

### Chest collision and embedded-player recovery, 2026-09-05 (0.4.5 pending release)

The prepared fix keeps chests and barrels solid while their lids are open.
Walk-through behavior now requires an authored collision state condition;
`object:fence_gate` declares collision while `open` equals `false`. Client
prediction and world authority resolve the same active definition and state.
The existing `setCollision` effect now updates that declared condition through
the state planner. Unsupported state changes, malformed state and explicit
unavailable definitions are rejected; an idempotent static-container effect
preserves the original state exactly. Container contents, custody and legacy
chest migration compatibility remain intact.

A player already embedded in an object can walk outward only while reducing
penetration without increasing overlap with another obstacle or entering a new
one. Ordinary collision, terrain/elevation restrictions and strict spawn/jump
landing checks remain in place; this introduces no teleport or destructive
world repair. The generated content export still has 531 definitions in 21
files, with hash `dfdf555b`; the only authored change is the fence-gate collision
condition. Lifecycle revision 11 and its 109 callback-owned / 72 reviewed-inert
items are unchanged.

The combined chest, durability and reconnect source passed all 3,368 tests in
562 files, all workspace and release typechecks, full lint, lifecycle integrity,
content validation and the checked world build. Client and Studio builds passed
with both default and actual release profiles. Private schema comparison was
identical. The full-suite count includes concurrent lighting work in the shared
worktree. Independent review confirmed that the gate condition is the only
content change and that static-container collision effects preserve valid state.

The pending 0.4.5 client also corrects durability bars for the 20 newer material
tool variants. Their authored durability limits and authoritative wear were
already present; live inventory, hotbar and shared slot presentation now read
the active registry rather than the old static tool list. All 24 material tools
show full, worn and broken states, and an unspecified stored durability is
presented consistently as full in bars and tooltips. This presentation fix
changes neither item balances nor stored durability. The focused regression
checks include authored maximum overrides and items without durability; the
combined focused run passed 115 tests in three files, and all six extraction-seam
checks passed. This release remains undeployed; the owner session was renewed
and the live content head captured on 2026-09-06.

The pending client now also provides canvas connection recovery: reconnecting
and offline states expose Retry, while an expired session exposes Sign In.
Each modal frame restores the retained world image before drawing its backdrop;
the update prompt retains priority. Recovery blocks world input even when the
HUD is hidden, clears stale movement/touch/bow prediction, and supports keyboard
activation. Visibility, page-cache restore and online/offline events share the
connection lifecycle without starting a hidden-page render loop. Eleven focused
overlay/lifecycle tests passed. An isolated local Chrome canvas harness verified
fully visible copy and button geometry at 1280×800 and 390×844 with UI scale 2;
real local pointer clicks reached Retry and Sign In callbacks. This uses the
actual gameplay UI assets, not a live authentication session or phone hardware.
The final combined gates include this reconnect work. This remains a prepared
fix, with no deployment, live reconnect acceptance or device-resume acceptance
claimed.

This release has not been deployed. The owner session was renewed and the live
content head captured on 2026-09-06. Reviewed content-head CAS, guarded publication
and same-identity chest acceptance remain outstanding. The concurrent lighting-default assertion has now been updated by its author;
the latest full run passed 3,374 tests in 563 files. Shared runtime release
coordination is still outstanding before publishing the combined client. Production remains on
0.4.4 with content revision 7/hash `8cfe4746`. No chest compatibility retirement
or live recovery is claimed. Evidence and the authentication blocker are recorded
in `ops/LOGIN-RECOVERY-2026-09-05.md`. Broad Studio styling remains deferred.

### Generated island gateway background, 2026-09-06 (next release prepared)

The game account and loading screens, pre-world recovery/update overlays, OIDC
login/registration/recovery pages, and all 38 native PWA launch screens now share
a static 1536×1024 render of the real generated island. The camera includes
Marlow's camp and Fin's lake/hut at zoom 1. Seed, source hashes, atlas revision and
image SHA are recorded in `art/custom/login-island/provenance.json`; two complete
renders produced identical bytes. No live account/player data is used.

The client loads the image without blocking sign-in and caches the cover-scaled,
tinted viewport by size and DPR. Twenty stationary frames caused zero source
resamples; a viewport or DPR change caused one. The same local image is packaged
with the Keycloak theme under content-hashed URLs; provider form behavior, fonts,
and accessibility remain intact. All seven native app icons are byte-identical.
Desktop and portrait screenshots verified the actual loading/account screens
and all three real provider forms. Actual Safari/PWA acceptance remains pending.

Regenerate all background/theme/splash artifacts with `npm run login:background`.
This presentation change is prepared for the pending release; no public deployment
or authentication-service restart is claimed by these local browser checks.

The shared package version was advanced to 0.5.0 by the concurrent lighting work
during these checks. The island changes remain prepared alongside the earlier
0.4.5 fixes; neither the game nor the Keycloak theme has been published here.
Owner sign-in and an independently reviewed one-upsert content candidate are
ready. The final repository run passed 3,374 tests in 563 files, with typechecks,
lint, content/lifecycle checks, checked world build and both application builds
passing. Publication is held for coordination with the lighting author, rather
than publishing their active work without a readiness handoff.

### Guarded 0.5.1 deployment, 2026-09-06

The pending chest, durability, connection recovery, island gateway, tree sway and
lighting work recorded above shipped together in guarded release 0.5.1. This
supersedes those earlier preparation-only checkpoints. All 3,386 tests in 565
files passed, along with the workspace/release typechecks, lint, lifecycle and
content validation, checked world build, and staged client/Studio production builds.
The verified deployment evidence is
`/home/toby/.local/state/orchard-051-20260906/deployment-4/`.

The release preserved the complete public/private schema and passed exact
same-identity parity across 38 tables. Publication used the no-delete guard;
all 531 content definitions were retained, with zero deletions and one reviewed
`object:fence_gate` collision-condition upsert. The resulting live content head
is revision 8, hash `dfdf555b`. The bounded lighting receiver pool fix is included:
all five source hashes in `output/lighting-lockup-20260906/fix-source.sha256`
match the deployed source manifest. Legacy chest compatibility remains retained.

The generated-island Keycloak theme is also live. Independent checks verified the
exact staged file manifest and served CSS/image hashes. All six fresh actual
login/registration/recovery desktop and portrait captures were byte-identical to
the approved previews. Keycloak and PostgreSQL are healthy; PostgreSQL's container
and start time were unchanged. No credentials or forms were submitted in those
anonymous visual checks. Evidence is recorded in
`ops/LOGIN-RECOVERY-2026-09-05.md`.

Physical iPad/Safari background-resume, sustained lighting and complete live
reconnect/UI acceptance remain open, as do the outstanding processor, quest and
chest gameplay scenarios. The shared T3 preview had advanced only one animation
frame; manually invoking update/render immediately drew the Basic scene. That
observation does not yet establish a production renderer failure or a successful
device recovery. Broad Studio visual refinement remains deferred.

### Active-definition authority completion checkpoint, 2026-09-11

The repository migration now covers the remaining high-risk definition seams without
rewriting retained world or player rows. Active authored object/process capabilities
drive processor admission, topology, press overlays and completion accounting; actual
authored outputs replace the former `must`/`pomace`/`bottles` statistic assumptions.
Chest, NPC, quest, recipe-book, equipment, watch/time, fishing-loot and UI item-slot
admission all reject missing or retired explicit definitions. Skill capabilities now
own jump/climb, minimap and mining decisions, including arbitrary renamed nodes and
prerequisite validation. Six authored enemy and five authored encounter definitions
own the outdoor runtime while preserving stable runtime IDs, generations, rewards,
contributions and claims. Creature and Hearth fixture presentation resolve active
metadata/tags rather than definition slugs; intrinsic renderer primitives remain code.

The deterministic bootstrap candidate is 895 definitions across 25 files, hash
`6af0522c`, with a 531,228-byte runtime payload inside the 532,480-byte gate.
Lifecycle revision 13 remains 119 callbacks with integrity hash
`cc95551b15bb9583c24f81028c18ded7f577d93f86ec847fde13ab1f2ebd00b1`.
Content validation and sim/engine/client/world typechecks pass at this checkpoint.
No game module or content head was published and no retained row was mutated. The
manifest's aggregated Phase-6 entry remains `repository_open` for the separately
owner-gated, quiesced legacy-chest finalizer and authenticated continuity journeys.

The closing gameplay-authority audit migrated the last substantive catalogs it found.
Homestead upgrades now carry compact semantic mechanics for soil, seed, barrel and
vintage behavior while retaining each durable `upgradeKind`; content-definition IDs
may therefore be renamed without rewriting saved homestead rows. Eight Delve boons
are active upgrade definitions whose compact tuples own durable boon identity,
modifier and magnitude. Offer generation, saved-run resolution, world rewards,
client prediction and Canvas presentation use that active catalog and fail closed
when it is missing, retired, incomplete or ambiguous. The remaining legacy rogue
skeleton attack families are active enemy definitions; a stored archetype no longer
recreates behavior when authored enemy content is absent. Melee prediction resolves
the current registry's tool metadata rather than the bootstrap string overload, and
fishing depletion statistics use the actual runtime resource kind. Residence
construction materials, furniture/seating, landmark placeables (including Farmer
Jane's memorial), ferry routing, supply caches, field targets, ambient outputs and
procedural decorations likewise resolve authored semantic metadata. The final audit
classified the surviving chest/farm names as guarded compatibility/retirement paths
and the surviving art/adapter discriminants as renderer or protocol primitives,
not parallel gameplay catalogs.

The integrated post-audit run passed all 4,623 tests in 823 files, all eight package
typechecks, the release-script typecheck, lifecycle/content integrity, lint, asset and
chunk validation, the checked SpacetimeDB module build, and the game production build.
The reviewed Studio-only artifact was rebuilt and deployed against these APIs with its
UI-kit guard unchanged; public static validation and an anonymous one-canvas/zero-console
browser check passed. This static deployment did not publish the candidate module or
content head. Live promotion still requires the separately recorded owner approval,
fresh rehearsal/parity and same-identity continuity gates.

The non-chest T11 farm/storage compatibility surface now has a separate guarded
retirement path. It covers `private_inventory`, `farm_parcel`, `crop_patch`,
`farm_activity`, and only the obsolete `wood`/`stone` columns of the retained
`player_survival` table. The dry-run/source implementation provides explicit
`inspect -> parity_verified -> draining -> schema_removal_candidate` receipts,
bounded 100-row drain plans, remaining-source fingerprints, owner-only reducers,
strict runner parsing, and a post-candidate schema checker. Nothing has been run
against a live database. Production drain and physical declaration removal remain
owner-gated behind the fresh-backup, isolated-restoration, exact-module rehearsal,
continuity comparison, pinned candidate, and no-delete upgrade prerequisites in
`docs/legacy-farm-retirement-finalizer.md`.

# 62 — Studio Tool Coverage: Authoring the Whole Game

Plan, **2026-09-23**. Status: **proposed; owner decisions A1–A3 settled 2026-09-23 (§7)**. Companion to
[61](61-world-editor-and-authoring-model.md), which covers the map model,
object archetypes, rule catalogue and UI-kit gate. This document audits every
Studio route. It then defines the tool set needed to author the game from start
to finish in Studio.

**Goal (owner, 2026-09-23):** everything in the game today can be created and
changed in Studio. That covers:

- maps and zones (including interiors, player farms and containers);
- tilesets and their rules;
- objects and machines, with their logic and window layouts;
- items and equipment with stats;
- quests and conversations, with scripting;
- NPC and mob AI;
- character, NPC and mob animation;
- audio and music.

Studio is built only from the shared UI kit (doc 61 §5).

## 1. Audit: what each route really does

Verified against `origin/main` 2e1d9a4f. "Publishes" means a revision-checked
content change set or admin reducer call that reaches the live authority.

| Route | Tool | Works end-to-end | Broken, stubbed or missing |
|---|---|---|---|
| `/build/map/live-island` | map | Terrain/object/layer editing, and a revision-checked map publish. Live placeables and chests can be moved, repaired or despawned (dry run first). NPCs can be moved. | Only works on `live-island` (space 0), and every live subscription is filtered to space 0 (`shell/studio-connection.ts:47-65`). Cannot render or edit interiors, the Delve or homesteads. No container contents. `procedural-world` and `terrain-lab` routes can't publish. Doc 61 §1 covers the model problems. |
| `/build/tiles` | tiles | Cliff-family role frames, transitions and clone. Publishes a `tileset`. | Cliff families only (doc 61 §1.6). |
| `/author/items` | items | Loads the live content head, validates, and publishes a change set. | Raw JSON, or a leaf-only form that can't add array entries. No reference pickers. `item.new`/`recipe.new` have no handler. Model features (prices, pickers, history, retire) aren't wired. The Lifecycle tab only downloads a bundle marked "NOT LIVE". |
| `/author/object` | object | Behaviour graphs publish. | Always edits `definitions[0]` (`object:anvil`), with no picker or "new". "Add interaction" inserts one fixed effect. Prefab mode saves to localStorage as `untitled-layout` and never publishes. No component editors. |
| `/author/ui-lab` | ui-lab | Widget catalogue. The Frame Designer (hidden inside it) publishes once per session. | Frame Designer can't create frames or add/remove panes/buttons. Its binding/restriction methods aren't wired. No visibility or `onInvoke` editing. |
| `/author/npcs`, dialogue, quests | narrative | Live content, undo/rebase, validation, history, and publish. Dialogue click-through, gated by quest state. | Raw JSON. The "graph" is a text list of `EDGE a → b` rows; `moveDialogueNode` is never called. No add node/choice/objective/reward. No pickers. Quest preview uses a fixture. No scripting. Nothing published to production yet. |
| `/author/character` | character | Paper-doll preview. | 28 hard-coded armour pieces not linked to items. No idle/walk animation, NPC or mob sprites. No save. |
| `/author/audio` | audio | Plays 3 songs and 9 SFX from a hard-coded list. | No editing or assignment. The game streams MP3 (`engine/audio/audio-bus.ts:18`); `*.song.json` and the sequencer are unused at runtime. |
| world-tables / pack-studio | world-tables | Real change-set publishing for 10 kinds, undo/rebase, and live playtest (spawn, effect, upgrade). | Raw JSON. No visual editor for interior geometry. |
| `/operate/players` | players | Real procedures. All 20 player reducers use dry run, fingerprint and undo. | Canned drafts with free-text fields (defaults such as `apple`, `orchard_welcome`, `stamina:100`). No pickers. Inventory is read-only. Tabs are JSON dumps. |
| `/operate/playbooks` | playbooks | Step engine; the missing-chest restore is real. | 3 of the 5 playbooks. Hard-coded targets (`identity-bea`, entity `10`, `apple ×1`). |
| `/operate/membership` | membership | Grant-editor/support/block buttons. | The preview is computed on the client, not the server, and audit ids are fabricated. Unaudited reducers with no reason recorded. Approve/role/revoke/unblock have no buttons. |
| `/operate/observe` | observe | Audit, connections, errors, telemetry (read-only, paged). | Presence covers space 0 only, so players indoors are shown at 0,0. No filters or timeline. |
| `/operate/world` | world | Backend supports flags, portals, repair, time, weather, wind, MOTD, notices, map restore and homestead move. | UI exposes only "+1 tick" and "preview safe repairs". The space list omits interiors, the Delve, residences and cellars, and has hard-coded sizes. |
| `/operate/containers`, `/operate/objects`, `/operate/npcs` | operate | Container slots by typed entity id; repair and despawn. Object query in a fixed −64..63 box. NPC relocate. | The id must be typed by hand. `set_container_slot` and spawn aren't exposed. The query box covers a corner of space 0 only. The server's area query stops after 2,048 scanned rows (`admin/procedures.ts:245`). |

**Cross-cutting causes.**

1. There is no schema-driven form. Every author tool falls back to JSON.
2. There are no reference pickers.
3. Live views are locked to space 0.
4. The admin backend is much richer than the UI that exposes it.
5. Seven content kinds have no editor: `loot`, `enemy`, `encounter`,
   `loadout`, `balance`, and parts of `object` and `space`.
6. A lot of tuning is TypeScript (§4).

## 2. Principles

1. **Every author tool supports the full lifecycle:** browse/search → create →
   edit (typed form, visual editor where it matters) → validate → preview →
   publish → history/restore → retire. Raw JSON is an advanced tab, never the
   only way to edit.
2. **Forms come from schemas.** Each content kind's parser exports a field
   schema: types, enums, arrays, references, units and help text. One kit form
   generator renders it, with array add/remove/reorder and typed reference
   pickers. This single foundation removes most of the "doesn't really work"
   gaps.
3. **References are clickable everywhere.** An item in a recipe, a frame on a
   machine or a quest on an NPC opens that definition in its own tool. Every
   definition shows "used by".
4. **Author, Build and Operate stay separate.** Author and Build edit content
   and publish revisions. Operate changes live rows with dry run, reason and
   audit. One live selection model is shared, so "open in Author" and "open in
   Live World" jump between them.
5. **One behaviour vocabulary.** Conditions, effects, states and transitions
   (doc 61 §3) are the same chips in objects, quests, dialogue, NPC AI and
   encounters. TypeScript lifecycle callbacks are the escape hatch in every one
   of them (doc 61 D4).
6. **Kit-only UI** (doc 61 §5). A missing widget is added to the kit with a
   specimen, then used.

## 3. Target tool set

### 3.1 Foundations (built first; every tool depends on them)

| ID | Foundation | Notes |
|---|---|---|
| F1 | **Schema form generator + reference pickers + "used by" index** | Replaces the leaf-only `shell/definition-fields.ts`. Kit components: form, array editor, reference picker with asset/sprite preview. |
| F2 | **Content kinds for everything still in code** (§4) | New or extended kinds: `balance` with named fields, `world_rules` (time, seasons, weather, lighting), `progression` (XP curve and awards), `audio_assignment`, `animation_set`, `delve_run`, `milestone`, `help_page`. |
| F3 | **Scripting** | Extend `packages/lifecycle-authoring` from item `onUse` to object hooks, `dialogueChoice`, `questState`, encounter and NPC hooks. Add a kit code-editor component, a type-checked API surface, and test-run against a sandbox snapshot. Scripts publish through the existing reviewed warm-build pipeline. Data graphs remain the default. |
| F4 | **Space registry + multi-space live viewport** | Covers static spaces (`spaces.json`), homestead exterior/residence/cellar, rogue rooms and correct sizes. Subscriptions take any `spaceId`. Non-document spaces are rendered through `terrainForSpace`, and later through chunks (doc 61 §2.5). |
| F5 | **Shared pickers for live entities** | Player, entity and space pickers used by every Operate tool, replacing typed ids. |
| F6 | **Permission scopes** | Replace the five fixed roles (`shell/access.ts`) with scoped grants. Scopes are per domain: `map`, `tilesets`, `objects`, `items_economy`, `frames`, `narrative`, `actors`, `loot_progression`, `world_rules`, `audio`, `art`, `scripts.author`, `scripts.approve`, plus `operate.players`, `operate.world`, `operate.membership`, `observe`. Roles become named presets of scopes. The server enforces the scope for each content kind on publish; the Studio UI only mirrors it. `scripts.approve` lets granted editors send scripts live (A2). The approver must differ from the author. Grants, approvals and revocations are audited. |

### 3.2 Build (world and art)

| Tool | Covers | Key capabilities |
|---|---|---|
| **World Map** (evolves `map`) | Every space: the island, interiors, Delve lobby, homesteads (any owner's farm), residences and cellars | Space picker and breadcrumb. Doc 61 terrain/object model, drawing bands and part stack. Portals as visible, editable links ("walk through" to the target space). Interior geometry edited visually and published as `space` content. **Live layer:** entities in view with a container/processor inspector (slot grid, `set_container_slot` dry run), state editing (growth, lit, open), NPC relocation and resource respawn. Go-to-player. Validation panel and minimap. |
| **Region Generator** (replaces `procedural-world`/`terrain-lab`) | New curated regions (doc 61 D1) | Runs the generator in Studio only. Seed/biome/size parameters, then preview. Output is **static chunks** that open in World Map for editing and publishing. |
| **Tilesets & Rules** (evolves `tiles`) | Every tileset family (doc 61 §4) | Atlas import, family creation of any kind, visual mask→frame grid, compatibility, formation preview. The terrain guide is generated from this data. |
| **Sprites & Animation** (replaces `character`) | Player, NPC, mob, object and tile art | **Phase 1 (import first, A3):** sprite import through the pixel-art pipeline, frame viewer/scrubber, animation sets (activity → animation, per facing) replacing the hard-coded 13-profile switch (`engine/overworld-art.ts:3393`), equipment layers from item definitions, appearance presets, pivot and hitbox. **Phase 2:** a full **pixel editor**. Palette-locked to the style bible palette. Layers, onion skinning and frame timeline. Tile mode with seamless-edge preview and autotile-role preview (links to Tilesets & Rules). Seasonal remap preview. Saves `*.sprite.json`/`*.tile.json` and rebuilds atlas packs. |

### 3.3 Author (content and logic)

| Tool | Covers (content kinds) | Key capabilities |
|---|---|---|
| **Objects & Machines** (evolves `object`) | `object` (incl. trees, crops and resources, doc 61 D3), `process`, prefab layout | Object picker and New. Tabs: States, Appearance (state × art grid), Footprint, Lighting, Transitions, Interactions, and Components (container, processor, farming, damageable, loot). **Machine view:** processor + container + frame ref + that station's `process` rows as one timing/throughput table. Per-process slot layouts and cycle times move out of code (§4). The adapter picker offers the supported adapters; a new adapter is a scripted hook (F3). |
| **Items & Equipment** (evolves `items`) | `item`, equipment slots/stats | Item cards with component sections (equip, modifiers, combat, tool, food, durability, quality, onUse). Icon picker. Slot/tag checker. **Stat comparison** across gear tiers. Bulk price sheet. |
| **Recipes & Economy** (split from `items`) | `recipe`, `shop`, currency | Recipe grid painter. Shop stock editor. Price sheet with buy/sell margins. Where-sold and where-crafted views. |
| **Frames & UI Layout** (new route; Frame Designer taken out of UI Lab) | `frame` | Create and duplicate. Add/remove panes, slots and buttons. Bindings and restrictions. Visibility conditions and `onInvoke` (the shared vocabulary). Preview at UI scales 1–3 with live sample data. Repeatable publish. Game windows (machines, chests, shops, trade) use these frames. |
| **Narrative** (merges the three narrative routes) | `quest`, `dialogue`, `npc` persona, `milestone` | Real node-graph canvas with saved layout. Typed node/choice/objective/reward forms. Condition/effect chips (quest state, items, skills, time, season, statistics). **Script tab** (F3) for `dialogueChoice`/`questState`/objective hooks. Play-through against a real player snapshot. Map handoff for locations. |
| **Actors & AI** (new) | `npc` definition, `creature`, `spawn`, `enemy`, `encounter`, `delve_run` | Behaviour states (idle, wander, schedule, flee, pursue, kite, orbit, warden) as a state machine using the doc 61 §3 components. Daily schedule table (time of day → location/activity). Spawn and encounter placement on World Map. Combat stats. Simulated behaviour preview. Script hooks. Delve run structure (rooms, acts, boons) moves from `sim/roguelike.ts` into data. |
| **Loot** (new) | `loot` (35 tables) | Weighted table editor. Simulate N rolls. "Used by" (resources, fishing, mining, enemies). |
| **Progression** (from world-tables) | `skill_tree`, `statistic`, `effect`, `upgrade`, XP curve and awards | Skill-tree graph. XP curve plotted and editable. XP award table replacing literals in `world/index.ts` and `sim/fishing.ts`. |
| **World Rules** (new) | `balance`, `world_rules`, `crop` tuning, fishing/mining/regrowth tuning | Named fields in place of unnamed tuples. Day/night and season calendar. Weather modes. Lighting and seasonal palette preview. Simulation hooks (`sim:pace`) show pacing effects before publishing. |
| **Audio** (rebuilds `audio`) | `audio_assignment`, songs, SFX | **Tracker composer** (A1): pattern/track editor, instrument designer (oscillators, filter, envelopes, effects sends), mixer, live preview through the game's synth. SFX designer. Assign music by space, time of day and event, and SFX by event and definition, replacing `songForAmbience` and SFX names in code. |
| **Player Setup** (new) | `loadout`, appearance catalogue, `help_page`, onboarding | Starting kit. Appearance options. Help book text (out of `ui/src/help-book.ts`). |

### 3.4 Operate (live world)

| Tool | Change |
|---|---|
| **Live World** | This is World Map's live layer (§3.2). The `objects`, `containers` and `npcs` routes become list views sharing its selection. The server's area query is fixed to page by area (not the whole space) and to include crops and farm parcels. |
| **Players** | Item, quest and skill pickers (F5). Editable inventory grid. Real stats/vitals forms. Go to player on map. |
| **World Control** | Environment panel: set time to a value, weather, wind, MOTD, notice. Space flags, portal repair, map revision restore, homestead relocation. The backend already exists. |
| **Playbooks** | Add the two missing remedies. Use shared pickers. |
| **Membership** | Server-audited reducers with reason and server-side preview. Full action set. |
| **Observe** | Presence across spaces. Audit filters. Revision timeline with diff and restore. |

### 3.5 Developer

**UI Lab** stays as the kit's widget catalogue and specimen gallery. It is not a
content tool.

## 4. Game rules to move from code into data

In priority order, from the systems inventory:

1. **Balance tuples.** The combat numbers (18) and world policy (11) get named
   fields and a Studio editor.
2. **Enemies, encounters and Delve structure** (`sim/roguelike.ts:7-189`).
3. **Loot tables.** The data already exists but there is no editor.
4. **XP.** The curve and respec costs (`sim/skill-trees.ts`), and award literals
   spread across `world/index.ts`.
5. **Time, seasons, day/night lighting, weather** (`sim/time.ts`,
   `engine/celestial-lighting-presets.ts`, `sim/weather.ts`).
6. **Process and station tuning.** Slot layouts and cycle times
   (`sim/cellar-production.ts`, `barreling.ts`, `cooking-fire.ts`,
   `smelting.ts`).
7. **World layout policy.** Island bounds, ferry, arrival points, combat
   regions, plot and gate tiles. These become space and region data, which
   chunks (doc 61 §2.5) make natural.
8. **Fishing, mining, crop, tree regrowth rules.** Folded into object
   `growth`/components (doc 61 §3).
9. **NPC AI modes and the mob activity→animation switch.**
10. **Audio assignment, the new-player loadout editor, the help book, village
    milestones.**

Each move follows the doc 55 invariant: add the data form, dual-read with a
parity test, then delete the code path.

## 5. Route migration

| Today | Becomes |
|---|---|
| `map`, `procedural-world`, `terrain-lab` | World Map + Region Generator |
| `tiles` | Tilesets & Rules |
| `object` | Objects & Machines (prefab mode kept only if it publishes) |
| `items` | Items & Equipment + Recipes & Economy |
| `ui-lab` Frame Designer | Frames & UI Layout |
| `ui-lab` | UI Lab (developer) |
| `narrative` ×3 | Narrative |
| `character` | Sprites & Animation |
| `audio` | Audio |
| `world-tables` / `pack-studio` | Split into Progression, World Rules, Actors & AI, Loot. The raw table view remains as an advanced tab. |
| `objects`, `containers`, `npcs` | Live World list views |
| `players`, `playbooks`, `membership`, `observe`, `world` | Same names, extended as in §3.4 |

## 6. Phases and parallel lanes

| Phase | Lanes | Depends on |
|---|---|---|
| **S0** | F1 form generator + pickers; F5 live pickers; F6 permission scopes; doc 61 P0–P3 (in progress) | — |
| **S1** | F4 space registry + multi-space World Map (read-only live layer and container inspector); World Control UI wiring; Players pickers | F5 |
| **S2** | Items & Equipment, Recipes & Economy, Loot, Progression on F1 | F1 |
| **S3** | Objects & Machines (on doc 61 P2), Frames & UI Layout | F1, doc 61 P2 |
| **S4** | F3 scripting; Narrative graph + scripts; Actors & AI | F1, F3 |
| **S5** | F2 kinds for world rules/balance/audio/animation; World Rules, Audio, Sprites & Animation, Player Setup | F1, F2 |
| **S6** | Region Generator + chunk delivery (doc 61 §2.5/P7) | doc 61 P1 |
| **S7** | Remove retired routes; delete replaced code paths (§4) | all |

**Acceptance for "author the whole game".** Starting from an empty content
branch, an author creates each of the following in Studio only:

1. a new island region;
2. an interior with a portal;
3. a new tree with four growth states;
4. a new machine with its processes and window layout;
5. a set of armour with stats;
6. a loot table;
7. a quest with a branching conversation and one scripted step;
8. an NPC with a daily schedule;
9. a mob encounter;
10. music assigned to the region.

After publishing, a player can do all of it in game. No TypeScript is edited
except scripts written in Studio.

## 7. Owner decisions (settled 2026-09-23)

- **A1 Music: tracker songs only.**
  - The streamed MP3s (royalty-free, 8.8 MB) are removed.
  - Music plays through the engine sequencer from `*.song.json`.
  - The synth must sound clearly better than General MIDI: layered voices,
    filters and envelopes, reverb/chorus buses, mastering.
  - The owner composes in Studio's tracker (§3.3 Audio).
  - Implementation began immediately in its own PR.
- **A2 Script approval: granted editors**, through proper permission scopes
  (F6, `scripts.approve`). Studio-authored TypeScript enters the reviewed
  warm-build pipeline (doc 55 §3.1). The approver must differ from the author.
- **A3 Sprite authoring: import first, then a full pixel editor** in Studio
  (§3.2 Sprites & Animation, phase 2).

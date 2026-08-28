# 34 — Backend & Client Scalability Hardening

Binding owner-directed spec (2026-08-26). Status: **stages 1–2 implemented**. This
doc records the full-stack scalability audit
(SpaceTimeDB module + client) run against the vast-world ambition of
[30-infinite-terrain.md](30-infinite-terrain.md), and turns its findings into
staged, prioritized work. Doc 30 phase 2 ("infinite plumbing") **must not start
before stages 1–2 here land** — they are its safety rails, and most benefit the
current island immediately. Line references were accurate at audit time
(2026-08-26, `index.ts` at 5,178 lines); re-verify against the tree.

[40](40-sanctuary-overworld-and-zoned-world.md) defers vast-world expansion but makes
stage 3, occupied-space working sets, bounded per-space caches, and the 1,000-space
churn fixture immediate gates for its Shared Spaces technology demo.

Measured baseline (built sim, current 832² world): 6,043 `world_resource`
rows; `generateSurvivalResources()` 78 ms; `createSurvivalCollisionMap()`
~290 ms + two 692k-element arrays; first wildlife generation ~3.1 s;
worst-case player-movement obstacle scanning **36 ms per 50 ms tick** at 25
players. At the doc 30 extent, publish-time resource generation extrapolates
to ~35 M rows and ~8 minutes — it aborts long before finishing.

## 1. The verdict, in three sentences

The architecture is right: seed-generated terrain on both sides, chunk indexes
on every spatial table, radius subscriptions, caller-filtered views, hash-
deterministic AI. The implementation is still fixed-island-shaped: **no server
code uses any `by_chunk` index** (they exist solely for client subscriptions),
several whole-world assumptions hard-halt at scale, and roughly half of
SpaceTimeDB 2.8's relevant features (Range scans, RLS, one-shot schedules,
multiple schedules, hash/direct indexes, procedures) are unused — and they are
precisely the fixes. Nothing requires architectural rework; this doc is
disciplined follow-through.

## 2. Findings register (severity-ranked)

### Blockers for a vast world

| # | Finding | Anchor |
|---|---|---|
| B1 | `stepWorld` materializes all of `world_resource` + `world_chest` every tick to rebuild collision; `positionCollides` linearly scans ~5,895 obstacle objects per movement axis-step — 36 ms/tick today, ~360 ms at 10× | `index.ts:4868`, `sim/movement.ts:79` |
| B2 | Projectile stepping builds a ~6,200-entry target list **per arrow per tick** from four full-table scans | `index.ts:4871-4917` |
| B3 | NPC stepping full-scans `world_npc` every tick with an inner full `active_dialogue.iter()` per NPC; full `world_wildlife_profile` → Map every tick | `index.ts:5069-5105` |
| B4 | Publish-time materialization of every resource row, **triplicated** in `init`, `onConnect` (first connecting client pays regeneration in their connect transaction), and `stepWorld` | `index.ts:1920, 2086, 4667` |
| B5 | Whole-world dense arrays: 3 module-level collision maps (~30 MB, ~900 ms cold-start) server-side; six world-sized arrays baked at module load client-side, on the critical path to first paint | `world-rules.ts:47-49`, `render/terrain.ts:61-92` |
| B6 | `world_item` never expires — `droppedAtTick` is written and never read; ground litter accumulates and re-downloads forever | `index.ts:797, 4198` |
| B7 | `world_wildlife_profile` subscribed globally unfiltered, one row per animal in the world, and has **no chunk columns** so it cannot be scoped without schema change; `world_hive` subscribed globally despite having `by_chunk` | `overworld-connection.ts:454` |
| B8 | Hard 25-concurrent-player cap (`survival_world_full` at spawn-slot 26) | `index.ts:2124` |
| B9 | Subscription radius clamps to **world size**, not cost — at doc 30 scale the clamp permits a 64-million-query subscription set | `overworld-connection.ts:28` |

### Needs work

| # | Finding | Anchor |
|---|---|---|
| N1 | `world_chest.by_carrier` index declared, never used — 9 full-scan sites; no rider index on `world_npc` — 15 full-scan "am I mounted?" sites | e.g. `index.ts:3410, 4954, 5052` |
| N2 | Non-wildlife NPCs (merchant, dialogue NPCs) have **no proximity gate** and write their row unconditionally every tick; wildlife gating skips compute but still iterates every row | `index.ts:5155-5175` vs `5118` |
| N3 | `player_position` written every tick per player even when unchanged; same for non-wildlife NPC rows (wildlife has the no-op guard — apply that pattern) | `index.ts:5036, 5164` |
| N4 | Audit tables (`connection_audit`, `membership_audit`, `world_admin_audit`) unbounded; whisper history bounded per conversation but conversation keys unbounded | `index.ts:2313+` |
| N5 | `player_public`/`player_appearance` global subscriptions grow with all accounts ever, not online players | `overworld-connection.ts:451` |
| N6 | Chunk-crossing resubscription rebuilds all (2r+1)²×7 queries with no hysteresis; square radius over-subscribes 16:9 viewports ~40%; `hydrateRegion` re-walks the whole cache per handover | `overworld-connection.ts:483-505, 687` |
| N7 | Client per-frame full-cache scans: gather-targeting materializes+filters the whole resource cache every frame; `find()` inside per-player loops (NPCs, chests, profiles); collator-based depth sort | `overworld-main.ts:741, 1299, 1406`, `renderer.ts:103` |
| N8 | Ground-cache LRU 64 already thrashes at 4K + min zoom (needs ~170; doc 30 says 256); O(n) eviction scan | `ground-cache.ts:38, 68` |
| N9 | Full-scan views re-evaluated per caller: `visibleChatMessages`, `visibleWorldSpeech` (no spatial index on speech) | `index.ts:1695, 1711` |
| N10 | 3.1 s first-call wildlife generation inside a 50 ms scheduled transaction after restart; `migrateWorldForOceanExpansion` walks 11 tables in one transaction | `index.ts:4846, 1483` |
| N11 | Dead schema: `connection_presence` v1 and never-written `player_equipment` still registered and shipped to clients | `index.ts:484, 325` |
| N12 | Unbounded caches: client `terrainClassificationCache` and sim seed-keyed mask caches never evict; a seed change leaks ~15 MB | `render/terrain.ts:62`, `survival-world.ts:446+` |
| N13 | Dynamic homesteads turn the authority `SPACE_TERRAIN_COLLISION` map into an unbounded per-space memory leak; leaving a subscription does not release server memory | `world-rules.ts:63-97`, docs/35 §3.1 |

### Verified healthy (do not re-litigate)

View-based privacy (17 caller-filtered views); `SenderError` discipline with
validate-before-write ordering; OIDC gating on every reducer; presence
leases; sweep expiry for speech/projectiles/effects; the zero-players early
return; **client unsubscribe genuinely evicts rows** (SDK refcounts overlaps;
all display-buffer maps drain on delete — verified against SDK internals);
depth-queue viewport culling; `i16` chunk columns already sized for doc 30.

## 3. SpaceTimeDB 2.8 features to adopt (the fixes live here)

| Feature | Applies to |
|---|---|
| **`Range` btree scans** (`by_chunk.filter(Range…)`) | B1–B3: chunk-neighborhood queries in `stepWorld`; N1 sites |
| **Row-level security** (`clientVisibilityFilter.sql`) | N5 (scope player registry to online), N9 (replace hand-rolled view scans), future per-space visibility |
| **`ScheduleAt.time` one-shot timers** | B6 (item despawn), hive production, effect expiry — replace polling sweeps with exact wakeups |
| **Multiple scheduled reducers** | Split the single 20 Hz tick: movement/projectiles at 20 Hz; regen/hives/wildlife-repop at 1 Hz; migrations/audit-trim at 0.01 Hz. N10's stall moves off the hot path |
| **`hash` / `direct` index algorithms** | rider/carrier identity lookups (N1); dense small integer keys |
| **`table.count()` / `table.clear()` / indexed bulk delete** | emptiness checks, version-bump wipes (B4), chunk-scoped despawns |
| **Unique constraints** | display-name uniqueness (currently an O(n) scan) |
| **Procedures** | admin/ops queries, leaderboards — RPC with return values instead of table round-trips |
| **HTTP handlers** | `/health` for the self-hosted deployment (docs/24 ops) |
| **View QueryBuilder semijoins** | `visibleChatMessages` joins `chat_channel_member` natively |

## 4. Staged work plan (binding order)

**Stage 1 — index discipline & guards** (small diffs, immediate wins on the
current island): use `by_carrier` everywhere (N1); add `by_rider` (hash) to
`world_npc` and use it (N1); chunk-scope `world_hive` client-side (B7-easy);
no-op write guards on player/NPC rows (N3); `world_item` expiry sweep + later
`ScheduleAt.time` (B6); audit-table trims (N4); delete dead schema (N11);
`table.count()`/`clear()` swaps. Done when: tick-time telemetry shows
collision+movement under 10 ms at 25 players and no unconditional row writes.

**Stage 2 — safety rails & subscription budget**: hard `MAX_VIEW_RADIUS`
independent of world size (B9); rectangular view bounds + chunk-crossing
hysteresis deadband + drop the redundant `hydrateRegion` walk (N6); add chunk
columns to `world_wildlife_profile` (or fold it into `world_npc`) and move it
+ hives into the chunk-scoped set (B7); lift the 25-player cap to a
config-driven spawn search (B8); RLS or view-scope the player registry (N5);
ground-cache capacity viewport-derived with O(1) LRU (N8).

**Stage 3 — chunk-scoped tick**: `stepWorld` computes the union of online-
player chunk neighborhoods once, then uses `Range` scans for collision
obstacles (B1), projectile targets over swept spans (B2), and NPC stepping
(B3 — non-wildlife NPCs gated exactly like wildlife, N2); split schedules per
§3; `active_dialogue` gets `by_npc`. Done when: tick cost is a function of
online-player neighborhoods only — full-table iteration inside the tick loop
becomes a lint offense (doc 30 §10's rule, enforced here).

**Stage 4 — de-materialization** (this *is* doc 30 phase 2, listed for
sequence completeness): lazy chunk materialization replaces the triplicated
publish-time generation (B4); chunk-keyed terrain sampling replaces
whole-world arrays on both sides (B5, N12); client per-frame scans get
per-frame indexes (N7). Owned by doc 30; doc 34 stages 1–3 are its
prerequisites.

## 5. Instrumentation (lands with stage 1, watched forever)

Server: per-tick duration, rows touched, obstacle count, and per-stage
timings logged at 1 Hz aggregate; alert threshold at 60% of the 50 ms budget.
Client F3: cache sizes per table, subscription query count, resubscription
rate, ground-cache hit rate. Every stage's Done-when cites these numbers.

### Homestead instance gate

Before docs/35 phase 2, add per-space cache entry count/bytes, hit/miss, and
eviction counters. Replace the unbounded authority collision map with a bounded
LRU and/or final-occupant eviction, and resolve dynamic space definitions from
the indexed `homestead` row rather than static lookup alone. A client
unsubscribe controls only its replicated cache; it is not a server-memory
primitive. The hot tick must construct work from occupied `spaceId` chunk
neighborhoods and perform no scan over offline homesteads.

## 6. Tests and acceptance

- **Reducer:** index-path equivalence tests (carrier/rider/chunk lookups
  return identical results to the removed full scans); item expiry;
  audit trims; spawn beyond 25; no-op guard (unchanged input ⇒ zero row
  updates in the tick, asserted via update counters).
- **Two-client:** wildlife-profile and hive scoping — client A sees only its
  neighborhood's rows; registry scoping — offline strangers' rows absent.
- **Load fixture:** headless 25-client bot run on the current island;
  tick-time and subscription-eval metrics before/after each stage, recorded
  in this doc's §7 log.
- **Client:** 4K + min-zoom ground-cache soak (no thrash); long-travel soak
  (stable memory, bounded caches).
- **Homesteads:** cycle through 1,000 synthetic `spaceId` values with a small
  configured terrain/collision cache; assert bounded resident entries after
  every departure and zero hot-tick work for unoccupied spaces. Re-enter an
  evicted farm and prove deterministic terrain plus persisted mutations rebuild
  the same result.

## 7. Verification log

**2026-08-26 — Stage 1, index discipline & guards.** Re-located against the
5,295-line module after concurrent combat/commerce work. Nine carrier checks
(including `stepWorld`) now use `world_chest.by_carrier`; 17 rider checks now
use the new `world_npc.by_rider` hash index. SpaceTimeDB 2.8.2 accepted the
`hash` index on `option<identity>` in a populated local migration, so no btree
fallback was required. It also accepted removal of the unused
`connection_presence` v1 and `player_equipment` tables; bindings were
regenerated and the latter binding was removed.

The 25-player randomized-movement fixture on the 832² world reported
`stepWorld` **8.16 ms average / 25 ms histogram p95** (5 seconds, 304 rejected
far-target harvest probes, 25/25 replay checks). The audited pre-stage
collision/movement path was **36 ms/tick**; final 1 Hz stage samples measured
collision **1.07 ms** + movement **2.79 ms** = **3.86 ms combined** under load,
below the 10 ms gate. A settled idle 1 Hz window reported **0 player-position
updates / 500 guarded no-op skips** and **0 non-wildlife NPC updates / 20
guarded no-op skips**. Telemetry also reports total rows touched, obstacle
count, expiry/projectile/NPC stage spans, and the 30 ms alert threshold.

Stage-1 acceptance coverage includes carrier/rider equivalence and source-path
checks, auth-before-index guards for every affected client reducer, unchanged
row update counters, item expiry at 24,000 ticks, 90-day connection-audit
retention (with membership/admin audit permanence), hive query budgeting, and
the docs/06 golden constant. `npm run check` passed: 79 test files / 479 tests,
workspace lint and typecheck, module build, 92.41% statement coverage, and all
488 art assets / 3 songs / 10 SFX / 2 maps validated.

**2026-08-26 — Stage 2, safety rails & subscription budget.** View radii are
now rectangular and independently capped at `MAX_VIEW_RADIUS = 9`. The
original stage-2 implementation reduced settled 1080p/1× subscriptions from
the stage-1 **991 queries** to a fragmented per-chunk set, but live 20 Hz NPC
updates exposed an SDK cache-refcount failure (`Updating a row that was not
present in the cache`). The corrected implementation uses one bounded
rectangular query for each of the ten regional tables: the public browser now
reports **36 settled queries** (8 global + 18 self + 10 regional) at every
viewport/zoom, and 56 during the deliberately overlapping handover.
An 8-tile centre deadband makes a chunk-boundary crossing and return produce
zero handovers while both positions stay inside it; radius debounce remains
180 ms.

`world_wildlife_profile` kept its normalized-table design and gained additive
`chunkX`/`chunkY` columns plus a btree `by_chunk` index. One NPC update helper
keeps paired profile chunks synchronized, and a one-time marker backfills
populated rows. The two-client scratch fixture gave client A **262/279
wildlife-profile rows** and **6/8 hive rows**, all inside its neighborhood.
Initial insert callbacks delivered all 262 + 6 rows before `onApplied`, proving
the former `hydrateRegion` cache walk redundant; it was removed.

SpaceTimeDB 2.8.2 accepted both proposed RLS rules at scratch publish, but an
ordinary client subscription rejected the appearance join with
`Subscriptions require indexes on join columns`. The sanctioned fallback is
therefore `online_player_public` / `online_player_appearances` views. The
existing 30-second presence lease supplies the recently-seen grace: the
two-client registry cache measured **2 rows while both were online, 2 during
grace, then 1** after the peer expired, with its appearance row absent too.

Spawn ownership now lives in the additive private `player_spawn` table. A
config-driven 60-tile ring search first preserves the established 25 natural
spawns, then chooses any free walkable tile without treating the legacy u8
slot as a capacity limit. The 26-client fixture completed **26/26** replay
checks at **8.57 ms average / 25 ms p95** `stepWorld`; `survival_world_full`
is reachable only if the configured spawn area is spatially exhausted.

The ground cache derives capacity from the viewport footprint with 1.5×
headroom and a floor of 64, and uses `Map` insertion order for O(1) LRU touch
and eviction. The 4K/minimum-zoom fixture selected **126 slots for 84 visible
footprint entries** and recorded zero second-pass rebakes. Final bindings were
regenerated, the additive module published over the populated local world,
and `npm run check` passed: **80 test files / 487 tests**, workspace lint and
typecheck, module build, 92.21% statement coverage, and all 488 art assets / 3
songs / 10 SFX / 2 maps validated.

**2026-08-26 — Stage 2 subscription correction.** A clean authenticated
`orchard.dastari.net` session reported 10 active regional / 36 total queries,
healthy connection state, and neighborhood-only NPC/profile caches after the
rectangular-query change. This supersedes the fragmented-query figure above;
spatial bounds, `MAX_VIEW_RADIUS`, per-axis radii, deadband, and overlapping
handover behavior are unchanged.

**2026-08-27 — Combat-target regional extension.** The additive
`world_combat_target` projection is the eleventh bounded rectangular regional table.
The settled budget is now **11 regional / 37 total queries** and a make-before-break
handover peaks at **48** until the previous eleven-query region unsubscribes. Target
collision, damage, and regeneration use the `[spaceId, chunkX, chunkY]` index; the
scheduled authority never iterates the full target table.

## 8. Bookkeeping

- **docs/30**: phasing gains the stage 1–3 prerequisite (its §11 note);
  **docs/22**: subscription-budget addendum pointer; **docs/29**: wildlife
  profile chunk-columns note; **docs/31**: NPC gating note; **docs/08**:
  audit-retention policy note. **docs/00**: doc-map row.
- **DECISIONS.md** on adoption: (1) doc 30 phase 2 is gated behind stages
  1–2 here; (2) full-table iteration inside scheduled tick reducers is
  banned once stage 3 lands; (3) subscription cost is bounded by a hard
  client-side radius constant, never by world size; (4) the tick splits into
  multiple scheduled reducers by cadence.

# 53 — SpacetimeDB Usage: Audit Findings & Optimization Plan

Status: corrected implementation plan from the 2026-08-31 SpacetimeDB usage audit.
The 2026-09-01 tree has ~13.6k lines, 97 tables, 123 reducer declarations (121
client-callable generated reducers; the two `onSchedule` reducers are private), and 41
views. Symbol names are authoritative; line references were refreshed on 2026-09-01 and
will drift as the monolith changes.

---

## Part A — Audit summary

### Headline

**Fundamentals are sound; problems are concentrated, not systemic.** Private-by-default
sensitive tables gated by ~40 caller-filtered `own*`/`visible*` views, chunk-composite btree
indexes on every spatial table, staged viewport-scoped client subscriptions with deadband
re-subscribe and gap-free region handover, 20 Hz-max event-driven input with zero idle
traffic, lazy settlement (crops/furnaces/hunger) instead of ticking, change-suppression +
per-tick telemetry in `scalability.ts`. The recurring defect pattern is **indexes that exist
but aren't used** (views and hot paths doing `.iter()` + predicate), plus one
client-lifecycle gap and ~20 reducers of dead/duplicated surface. The original audit's
scheduled-reducer auth finding was based on pre-2.x behavior and is corrected below.

### Findings by severity

| Sev | Finding | Where |
|---|---|---|
| HIGH | `homesteadForSpace` scanned all homesteads; non-topside `collisionForSpace` also scanned despite the PK. Topside's all-homestead tent pass is intentional and remains. | index.ts:2649, 2810 |
| HIGH | Every-tick (20 Hz) full-table expiry sweeps: trade sessions, overflow, effects, items, speech | index.ts:12543–12744 |
| MED | Caller-scoped trade/homestead/chat/speech views scan; the two legacy online-player views are unused by the current client | index.ts:5188–5481 |
| MED | Three parallel container-move reducer families (~8 redundant reducers, several hundred duplicated lines) | index.ts:8179–8343, 10289–10478 |
| MED | 15/119 generated reducers never called from client (party ×5, superseded quick-move ×4, legacy farm, …) | world + client/net/generated |
| MED | `request*` reducers implement queries as table writes; `requestBalanceTop` is any-member O(all wallets) | index.ts:6694, 6734 |
| MED | Interest management is client-enforced only — a raw subscriber can take all of public `player_position` | index.ts:564–594, view fallback comment near 5049 |
| MED | No client websocket reconnect/backoff — disconnect requires page reload | overworld-connection.ts:406–429 |
| MED | Derived state stored & broadcast: `calendarTick` at 20 Hz; `equippedKind` resync duplicated in ~15 reducers | index.ts:12677, 10070 |
| MED | `world_resource` 20+-column public row mixes static data with high-churn mining-lease state | index.ts:1514–1601 |
| MED | Legacy farming/inventory system (`farm_parcel`/`crop_patch`/`private_inventory`, `useFarmTile`) still live in parallel | index.ts:635, 1996–2069, 12439 |
| LOW | Per-action scans that should use `by_chunk` (item merge/pickup, player-overlap checks) | index.ts:3886, 10725, 8527, 8541 |
| LOW | Monolith reducers (`stepWorld`, `onConnect`, `useHands`) | index.ts:12496, 6119, 8759 |
| LOW | Misc: time-recovery subscriptions accumulate; token in localStorage; `farm_activity` duplicates `player_statistic`; hex-string identity compares | client + world |

Correction verified against current SpacetimeDB 2.x docs and generated bindings:
`onSchedule` reducers are private by default. `stepWorld` and `decayEmptyTopsideSoil` are
absent from `packages/client/src/net/generated`, as required. Defense-in-depth now rejects
senders other than `ctx.databaseIdentity`; that SDK context accessor was verified against
the installed SpacetimeDB 2.8.2 declaration before implementation.

---

## Part B — Task list

Ordering rule: close the corrected T1 finding, take the behavior-preserving T2/T4 index
wins, establish scan telemetry, then split T3 by sweep. Schema retirement and column
splits require staged migrations. Each numbered task or lettered subtask is one reviewable
change. Use `recordTickRowTouch` for writes and the `*RowsScanned` counters for tick scan
cost; view and per-action changes need focused tests or a repeatable load scenario.

### P0 — audit correction (completed)

**T1. Confirm scheduled-reducer privacy. — Completed 2026-09-01.**
- `stepWorld` (index.ts:12496) and `decayEmptyTopsideSoil` (index.ts:12043) use
  `onSchedule` and are omitted from generated client reducer bindings, as required by
  SpacetimeDB 2.x.
- Both reducers guard `ctx.sender.isEqual(ctx.databaseIdentity)` before database access;
  `scheduled-reducer-authority-schema.test.ts` pins the guard ordering and binding omission.

### P1 — hot-path index fixes (behavior-preserving; additive indexes only)

**T2. Index the homestead space lookups. — Implemented 2026-09-01.**
- `homesteadForSpace` (index.ts:2810) now resolves an exterior through the primary key,
  then a residence/cellar through `firstIndexRow(by_residence_space.filter(...))`; the
  cellar lookup guards `spaceId === 0` before subtracting one.
- `collisionForSpace` (index.ts:2649) preserves the intentional all-homestead topside tent
  pass but uses the primary key for non-topside exterior collision. It does not introduce
  residence/cellar boundary obstacles that were absent before.
- `homestead-authority.test.ts` pins both the indexed paths and the one remaining topside
  scan.

**T3. Remove the every-tick full-table sweeps in `stepWorld`.** Each letter is a separate PR.
- **T3a — Implemented 2026-09-01:** `player_trade_session` and `inventory_overflow`
  maintenance now run at 1 Hz. Requester/recipient indexes cannot perform a global sweep.
  Connect-time overflow recovery remains immediate; capacity opened later drains within
  one second. Trade acceptance now validates request TTL synchronously.
- **T3b — First stage implemented 2026-09-01:** `player_effect`, party invite,
  `world_item`, and `world_speech` storage cleanup now runs at 1 Hz. Gameplay reads still
  validate expiry synchronously. This reduces steady-state candidate scans by 95%; use the
  new counters to decide whether `expiresTick` indexes or timers are still warranted.
  `world_item` would need an additive expiry field because expiry is derived from
  `droppedAtTick`.
- **T3c — Implemented 2026-09-01:** retention uses additive indexable time data and a
  cadence-bounded range scan, including a one-shot legacy zero-key backfill path.
- **T3d — Implemented 2026-09-01:** active growth uses the explicit regrowth-progress
  indexes; `by_depleted` is only one half of the bounded candidate union.
- Baseline and verify each PR with the corresponding `*RowsScanned` counter added to the
  1 Hz tick telemetry on 2026-09-01.

**T4. Use indexed caller-scoped views. — Implemented 2026-09-01.**
- `ownTradeSession`, `ownTradeOffers`, and `tradeForPlayer` use
  `by_requester`/`by_recipient`; `ownHomesteadUpgrades` and `ownHomesteadMembers` use
  `homesteadForOwner`/`by_owner`. See index.ts:5214–5226, 5389–5407, 9656.
- `onlinePlayerPublic` and `onlinePlayerAppearances` remain as old-client compatibility
  views but now use `by_online` and appearance PK lookups; the current client continues to
  use indexed query-builder subscriptions.
- `visibleChatMessages` uses `by_conversation`, `by_sender`, and `by_recipient` without a
  message/player scan. `visibleWorldSpeech` uses the additive `by_space` index before its
  caller-distance predicate.

### P2 — hot-ish per-action scans

**T5. Chunk-bound the world-item and overlap scans. — Implemented 2026-09-01.**
- `dropWorldItemStack` merge pass (index.ts:3886) and `pickupWorldItem` multi-pickup
  (10725): filter via `by_chunk` over the drop/pickup chunk neighborhood (merge
  radius is 8 px — one chunk ring suffices).
- `tileOverlapsAnyPlayer`/`tileOverlapsAnyOtherPlayer` (index.ts:8527, 8541): use
  `player_position.by_chunk`; called from every farm-tool swing and placement. Query exact
  neighboring chunk keys rather than relying on a broad composite-index prefix.
- Switch the remaining hex-string identity comparisons in these paths to `isEqual`.

**T6. Stop broadcasting derived state through an additive migration. — Implemented 2026-09-01.**
- `calendarTick` (index.ts:12677): add and store only `cropCalendarOffset`, changed by
  `setWorldTime`; derive `calendarTick = authorityTick + offset` at read sites and on the
  client. Retain the old column during rollout because automatic migration cannot remove it.
- Route all inline `player_position.equippedKind`/`equippedLit` resync blocks through
  `updateEquippedForIdentity` (index.ts:10070). Do not derive remote equipment from private
  inventory: observers need a public position/equipment projection to render other players.

### P3 — reducer-surface consolidation

**T7. Collapse the container-move families. — Implemented 2026-09-01.**
- Fold the inventory-only variants (`moveInventoryItem` 8179, `quickMoveInventoryItem` 8244,
  `quickMoveAllInventoryItems` 8284, `distributeInventoryItem` 8304) and chest-specific
  variants (`moveChestItem` 10289, `quickMoveChestItem` 10349, `quickMoveAllChestItems`
  10385, `distributeChestItem` 10438) into the generic menu family built on
  `loadOpenMenuInventory`/`writeOpenMenuInventory` (4505, 4578).
- Client already only calls the menu family — the four `quickMove{Chest,Inventory}*`
  reducers have zero client call sites.

**T8. Delete or wire the dead API surface (15 uncalled reducers). — Partially completed;
product decisions intentionally pending.**
- Superseded: `quickMoveChestItem`, `quickMoveAllChestItems`, `quickMoveInventoryItem`,
  `quickMoveAllInventoryItems` (absorbed by T7), `tendTree`, `useFarmTile` (absorbed by
  T11). Delete after confirming no old-client compat window is needed (the
  `repairSelectedTool` comment near 7893 documents that policy — apply it explicitly).
- Decide: party system ×5 (`createParty`…`removePartyMember`, 9770–9866) and homestead
  moderation `approveMember`/`revokeMember` — build the client UI or delete the reducers.
- Admin/debug (`grantPlayerGold`, `adminRelocateHorse`): keep if CLI-invoked; note that in
  a comment so the next audit doesn't reflag them.
- Also merge the thin wrappers: `buyMerchantItem`/`sellMerchantItem` (10176, 10192) are
  one-line cart calls; `cancelTrade` vs `declineTrade` (9925, 9930) differ only in a state
  precondition.

**T9. Decide how to serve the ops "queries" without unbounded caller work. — Implemented 2026-09-01.**
- `requestLastConnections` (index.ts:6694) and `requestBalanceTop` (6734) full-scan
  `connection_audit`/`player_wallet` and insert up to ~13 `session_chat_notice` rows per
  call. Do not default to an always-subscribed ranking view: that can turn an occasional
  scan into continuous recomputation on wallet changes.
- Compare an owner-gated transient view, rate-limited reducer, and scheduled/materialized
  bounded leaderboard. Preserve the chat-command UX. `requestBalanceTop` is currently
  any-member callable, so whichever design wins must bound player-triggered work.

**T10. Split the high-churn fields out of `world_resource`. — Implemented 2026-09-01.**
- Move the mining-lease/claim state (`miningClaimedBy` etc., comment at 1524 admits it's
  "private to one solo miner") out of the 20+-column public row (1514–1601) into a private
  or narrow companion table, as was done for `world_chest_damage` (1743) and
  `projectile_charge` (1661). Cuts whole-row rebroadcast to every regional subscriber on
  every mining hit and regrowth update.
- Same review for `player_position` prediction bookkeeping (`lastProcessedSequence`, jump
  fields — 556): only the owner needs them; move to `player_input` (private, 586) or an
  own* view.
- Migration constraint: add companion tables, backfill and dual-write, cut clients over,
  then leave legacy columns inert until an incremental migration or planned database reset.
  Automatic migration cannot remove existing columns.

### P4 — legacy retirement & code health

**T11. Retire the legacy farming/inventory system. — Implemented 2026-09-01.**
- Remove `useFarmTile` (12439, unindexed `farm_parcel.iter().find` at 12454), tables
  `farm_parcel`/`crop_patch`/`farm_activity` (1996–2069), `private_inventory` (635), and
  `player_survival.wood/stone` (645) after a one-shot migration into
  `world_soil`/`world_crop`/`inventory_slot`/`player_statistic`. spaces-schema.test.ts:86
  already labels it "legacy". `farm_activity` counters duplicate `player_statistic`
  (12299–12328, 12379–12491).
- Automatic migration cannot remove tables or columns. Treat retirement as: stop reads,
  backfill, stop writes, remove client bindings, and only then use an incremental migration
  or explicitly approved database reset to remove schema.

**T12. Extract the monoliths (no behavior change). — First extraction completed 2026-09-01.**
- `stepWorld` (~1,085 lines) → `expireRows`, `stepProjectiles`, `stepPlayers`, `stepNpcs`,
  per-cadence helpers. `useHands` (8759, ~344 lines) → per-branch placement helpers.
  `onConnect` (6119, ~540 lines) → separate the five migration guards from session setup.
  Also relocate to `@orchard/sim`: mining orchestration (11553–11623), `stepRogueEnemy`
  (11294), projectile hit resolution (12902–13110).
- Low-risk cleanups: add `requireAuthorizedSender` to `closeChest` (9295) and
  `closeNpcDialogue` (9644) for consistency; normalized-name column + btree for the
  `setDisplayName` uniqueness scan (7609).
- Split extraction into separate PRs for `stepWorld`, `useHands`, and `onConnect`; moving
  pure algorithms into `@orchard/sim` is a later PR after the local extraction is stable.

### P5 — client lifecycle & architecture decisions

**T13. Client auto-reconnect.**
- overworld-connection.ts:406–429 tears down cleanly but nothing retries. Add reconnect
  with exponential backoff + jitter, re-running the four-stage subscription bootstrap
  (time → globals → self → region) and clearing prediction state; surface a "reconnecting"
  UI state instead of the terminal `NETWORK` toast (overworld-main.ts:1905–1910).
- Retry both established disconnects and initial `onConnectError`; distinguish intentional
  shutdown, ignore callbacks from stale connection generations, reset backoff after a
  successful connection, and test with fake timers.
- While in there: unsubscribe stacked `timeRecoverySubscriptions` handles
  (overworld-connection.ts:264, 944) after recovery succeeds.

**T14. Decide the position-privacy threat model.**
- All spatial tables are public; honest clients subscribe to chunk rectangles
  (overworld-connection.ts:1020–1057) but a raw subscriber can take the whole
  `player_position` table (564–594) — exact position/action/equipped item for every player
  in every space, including homestead interiors and others' rogue runs. If ESP/stalking
  matters: gate positions by space membership via views or RLS (the comment near 5049
  says RLS was abandoned on 2.8.2 — re-evaluate on the current SpacetimeDB version). If
  accepted for a co-op farm game, record the decision here and close.
- Related LOW leaks to fold into the same decision: `homestead.owner` (1350),
  `world_crop.owner`, `world_item.reservedFor`, `cellar_excavation` layouts,
  `farm_activity` per-identity counters (2039).

---

## Definition of done

- [x] T1 corrected: both `onSchedule` reducers are private and absent from generated client
      reducer bindings on SpacetimeDB 2.x.
- [x] T2 indexed exterior/residence/cellar resolution implemented without changing the
      intentional topside all-tent collision pass.
- [x] Zero `.iter()` calls inside `stepWorld`'s per-tick path except deliberate bounded
      cadenced sweeps, each with a comment stating its cadence and bound.
- [x] Every `own*`/`visible*` view resolves through an index (grep-able: no `.iter()`
      inside `spacetimedb.view` bodies without a justifying comment).
- [ ] Generated client bindings contain no reducer with zero call sites (party/admin
      exceptions documented inline).
- [x] Tick telemetry distinguishes candidate rows scanned from rows mutated for the T3
      trade/overflow/regrowth/effect/invite/item/audit/speech sweeps.
- [x] T3 PRs reduce their corresponding `*RowsScanned` counters; before/after captured from
      the same load scenario. T2/T4/T5 use focused lookup tests or dedicated action/view
      measurements rather than `recordTickRowTouch`.
- [x] T6/T10/T11 include additive/dual-write/cutover migration notes and do not attempt a
      forbidden automatic table or column removal.
- [ ] Client survives a forced websocket drop without page reload (T13).
- [ ] T14 decision recorded in this doc (gated or explicitly accepted).

# 22 — Netcode: Prediction, Interpolation, and Input Robustness

Status: **implemented and locally verified (2026-08-24)**.

Binding owner-directed spec (2026-08-24). Companion to
[21-unified-renderer.md](21-unified-renderer.md); implement after it (the F3 overlay
and single-snapshot-per-frame from doc 21 are prerequisites). The transport model is
fixed: SpaceTimeDB 2.8 — clients call identity-authorized reducers up, and receive
atomic table-cache commits down through the generated bindings. No hand-rolled
protocol, no side channels.

All of this is rate-agnostic: the authority stays at 20 Hz
(`AUTHORITY_HZ`, `world-rules.ts`) with 3 shared sim steps per tick. Raising it is a
combat-era decision, deliberately deferred; nothing below may bake in the 50 ms
interval except through the named constants.

Note: line references were accurate at authoring time; re-verify against the tree.

## 1. Problems this fixes (current behavior, measured/verified)

1. Reconciliation is an error-blend (`overworld-main.ts:108-126`): nudge predicted
   toward an authoritative row that is one RTT + up to 50 ms stale. While moving,
   that target is always behind the player → a permanent rubber-band drag
   proportional to speed × latency (~6 px at 100 ms RTT).
2. Remote avatars use `display += trunc((target - display) / 3)`
   (`overworld-main.ts:160-167`): a lag filter with no time basis (2–3 frames of
   speed-dependent error), which never fully converges (`Math.trunc` parks it up to
   2 fixed units off), and `remoteDisplay` entries are never pruned — a slow leak.
3. Input is edge-triggered only (`setInput` fires on direction *change*, plus a
   10 s heartbeat piggyback): one dropped/rejected reducer call leaves the server
   walking a stale direction for up to 10 s, and a crashed client keeps walking
   until the 30 s presence lease expires.
4. Interactions (`harvestResource`, `selectHotbar`, `dropSelected`,
   `pickupWorldItem`) are bare round-trips with no local feedback until the toast.
5. `network.snapshot()` materializes 6–7 arrays + a `Set` + a sort from the table
   cache and is called twice per frame — steady GC churn.
6. Player actions are invisible to observers: the axe swing renders only for the
   local player (`overworld-main.ts` computes `axeFrame` only when `local`), and
   tool selection lives in the private `player_survival` row — a remote player
   sees a tree fall next to a motionless avatar holding nothing.
7. Movement is *sampled*, not *accounted*: the authority applies 3 steps per tick
   of whatever direction is current when its 50 ms timer fires. A tap shorter
   than the sampling window moves the client's prediction but never moves the
   authority — a guaranteed snap-back on rapid taps (owner-observed) — and every
   start/stop/turn can disagree by a step or two of timing skew. Replay (§3)
   alone cannot fix this: once the authority acks a sequence having applied fewer
   steps than the client predicted, replay faithfully reproduces the server's
   wrong answer. Requires the step accounting in §3.1.

## 2. Schema additions (additive; republish module + regenerate bindings first)

- `player_position.authorityTick: u64` — the `stepWorld` tick counter at which the
  row was written. This is the timeline for remote interpolation (§4). Increment a
  single counter in `stepWorld`; do not use wall-clock time in rows.
- `player_input.updatedAtMicros` (or reuse an existing timestamp if present) — set
  in `setInput` and by the heartbeat piggyback; read by the stale-input failsafe
  (§5).
- `setInput` gains `clientTick: u64` — the client's monotonic 60 Hz sim-tick
  counter at the moment of the transition — and `player_input` stores the open
  run's direction/start tick plus applied/settled step counters (§3.1). The tick
  counter is a *claim about time*, never trusted raw: the server clamps derived
  step counts against its own elapsed clock (§3.1), preserving the
  inputs-not-values rule.
- `player_position.actionKind: string` + `player_position.actionStartedTick: u64`
  — the replicated action channel (§6.1). Written only by reducers, always in the
  same transaction as the world mutation they animate (`'swing_axe'` commits
  atomically with the tree's health change). `'none'` when idle.
- `player_position.equippedKind: string` — the selected slot's item kind, mirrored
  by `selectHotbar` (and by inventory changes) from the private hotbar row. Public
  on purpose: held-tool rendering, carry poses, and doc 21 §5's lantern/torch
  light on *remote* players all require it; the rest of the hotbar stays private.
- No other schema changes. Do not touch reducer validation logic — the
  direction+sequence-only, validate-in-transaction authority model is correct and
  stays exactly as is.

## 3. Local player: prediction-and-replay reconciliation

Replace the error-blend with the standard replay loop. Every piece already exists
(deterministic shared `movePlayer`, fixed-point state, `lastProcessedSequence` on
the position row); this is assembly, not invention.

- Keep a ring buffer of `(sequence, direction)` for every input the client sends,
  capacity ~256 (>4 s at worst-case send rate). Entries are appended in
  `sendDesiredDirection` (including the periodic refreshes of §5).
- Each frame, before stepping prediction: if a new own-position row has arrived,
  set `predicted` to the authoritative position, then re-apply every buffered input
  with `sequence > row.lastProcessedSequence` in order — for each, run the same
  per-frame `movePlayer` steps the original send covered — against the current
  client collision map. Drop buffer entries at or below `lastProcessedSequence`.
- Because client and authority run byte-identical `movePlayer` on byte-identical
  fixed-point state, replay error is zero in steady state; the only visible
  corrections are genuine mispredictions (e.g. a tree felled between send and ack).
  Keep the existing >2-tile hard-snap as a last-resort safety net; remove the
  `dx/8` blend entirely.
- Edge case: collision-map divergence during replay (a resource row arrived between
  the original prediction and the replay) is *correct* behavior — replay against
  current truth is the point. No special handling.
- Acceptance: with 150 ms artificial latency (§8), walking in a straight line shows
  zero rubber-band; direction changes correct within one authority round-trip; the
  reconciliation-error metric (§7) reads 0 while unobstructed.

### 3.1 Step-accurate movement — kills the stop/tap rubber band

**Invariant:** every client-predicted movement step is either applied by the
authority exactly once or explicitly rejected (collision or rate cap) — never
silently lost to sampling and never duplicated. Replay then makes predicted and
authoritative positions bit-identical in steady state, so stopping and rapid
tapping produce zero visible correction.

- **Runs, not samples.** A held direction is a *run*: opened by the transition
  that starts it (`direction`, `clientTick`), closed by the next transition. While
  a run is open the authority integrates 3 steps/tick exactly as today; when the
  closing transition arrives, it settles the run to the exact step count implied
  by the client-tick delta. A shortfall — including a tap that fell entirely
  between two authority ticks — is queued and drained at up to 6 steps/tick
  (catch-up), each step still collision-checked through shared `movePlayer`.
  Overshoot within jitter bounds (≤ one authority tick) is forgiven, not rewound
  — committed rows are never walked back.
- **Rate cap (anti-speedhack).** Total credited steps per player ≤ elapsed server
  time × 60 Hz + a burst allowance of ~6 steps; settle backlog capped at ~12
  steps. Excess is dropped and the input rejected, which the client observes via
  `lastProcessedSequence` and replays against — a cheating client slows down, an
  honest client under jitter never notices.
- **Replay integration.** The §3 ring buffer stores `(sequence, direction,
  clientTick)`; replay re-applies exactly the steps of runs (or run fragments)
  past the ack point. The periodic refresh (§5) carries the current `clientTick`
  for observability but does not close a same-direction run: settlement happens on
  direction transitions. Treating a refresh as a close double-credits steps already
  due in the next authority tick when reducer arrival straddles that tick.
- **Presentation smoothing.** Genuine mispredictions (a tree felled mid-flight, a
  rate-cap rejection) correct predicted state *instantly*; the renderer may
  smooth the resulting visual offset over ≤100 ms. The smoothing offset lives in
  the render layer only — never fed back into predicted or authoritative state.
- Acceptance (all at 150 ± 50 ms artificial latency): releasing a held key stops
  with zero net correction; 5 Hz direction tapping for 10 s ends with client and
  authority byte-identical positions; a single 30 ms tap moves both sides the
  same number of steps.

## 4. Remote players: timed snapshot interpolation

Replace the `/3` filter with a snapshot buffer per remote identity:

- On every remote `player_position` commit, push `(authorityTick, x, y, direction)`
  into that player's buffer (keep ~10, prune older).
- Maintain an estimated `renderTick`: latest `authorityTick` seen across all rows
  minus a fixed delay of **1.5 authority ticks** (75 ms), advanced smoothly each
  frame by `dt × AUTHORITY_HZ` and softly re-synced toward the observed latest
  (small correction per frame). A reconnect/background discontinuity greater than
  ten authority ticks snaps once to the current timeline; otherwise an expired
  one-shot can remain frozen at frame zero while a stale clock catches up.
- Each render frame, find the two snapshots bracketing `renderTick` and lerp the
  fixed-point position between them (round at draw time as usual). If the buffer
  runs dry (stall/packet gap), extrapolate along the last direction for at most
  2 ticks, then hold position; never extrapolate through collision.
- Walk-animation state for remotes derives from actual displayed movement delta,
  not from the raw row direction, so animation and motion can't disagree.
- Prune a player's buffer and display state when their row is deleted or leaves
  the subscribed region (fixes the `remoteDisplay` leak).
- Acceptance: a remote player walking a straight line at 150 ms latency moves at
  constant velocity with no stutter, no parking offset, and stops within ~2
  authority ticks of the real stop.

## 5. Input channel robustness

- **Periodic refresh:** while direction is non-idle, or until an idle transition is
  acknowledged, resend the current direction with a fresh sequence every 20 sim
  ticks (~333 ms). Cheap (a no-op-sized reducer
  3×/s), and it bounds the damage of any single lost/rejected call — including the
  critical *stop* edge — to one refresh interval instead of 10 s. Each refresh
  carries the current `clientTick`, refreshes liveness, and advances the
  acknowledgement sequence without closing or re-settling a same-direction run (§3.1).
- **Failure retry:** on a `setInput` reducer error callback, resend the current
  direction immediately with the next sequence (one retry, then rely on the
  periodic refresh). Never silently swallow reducer errors — surface persistent
  failures on the F3 overlay.
- **Server stale-input failsafe:** in `stepWorld`, if a player's
  `player_input.updatedAtMicros` is older than 2 s and their direction is
  non-idle, treat it as idle for that tick (do not mutate the input row — just
  don't move them). A crashed client now stops walking within 2 s instead of 30;
  the 30 s presence lease continues to govern online visibility, unchanged.
- Sequence-resync on reconnect (`lastProcessedSequence` → outgoing counter) stays;
  the §3 ring buffer must be cleared on reconnect.

## 6. Interactions: optimistic where safe, authoritative where it matters

- `selectHotbar`: apply locally the instant the key is pressed; the own-row
  subscription confirms or reverts (revert = re-read the row, no special code).
- Tool use / harvest: play the swing animation and SFX immediately on `F` (pure
  client cosmetics), but apply **no** optimistic world-state change — resource
  health, depletion, wood grants, item drops, and pickups remain strictly
  row-driven. The transaction *is* the anti-dupe guarantee; do not predict it.
  On reducer error, the existing toast path stands.
- `dropSelected` / `pickupWorldItem`: same rule — instant animation, world/item
  rows change only on commit.
- This split (cosmetics predicted, state authoritative) is the standing pattern for
  future combat feel; note it in DECISIONS.md.

### 6.1 Replicated animation model — covers all current and future animations

Avatars have exactly **two animation channels**. Every animation, present or
future, must fit one of them or be re-classified as a world entity/effect; never
add a third channel or a bespoke field for one animation.

- **Locomotion (derived, never replicated):** idle/walk today; swimming, mounts,
  and carry-walk later. Computed client-side from displayed movement, `facing`,
  terrain underfoot (§4 terrain array), and `equippedKind`. No new row fields for
  locomotion, ever.
- **Action (replicated):** the `actionKind` + `actionStartedTick` pair. It covers
  one-shots (tool swings, hoe, watering, bow release, hurt, death, emotes) and
  channeled/looping states (fishing wait, bow draw hold, sitting, sleeping): a
  looping kind stays set until a reducer clears it or — for kinds flagged
  movement-interruptible — until the authority observes movement in `stepWorld`.
  A repeated one-shot is signalled by a fresh `actionStartedTick` with the same
  kind.

Rules that keep it future-proof:

- **Registry, not enum.** Action kinds live in one shared registry module in
  `packages/sim` with per-kind flags `{ oneShot | loop, interruptibleByMovement }`.
  Reducers may only write registered kinds. Adding any future animation =
  registry entry + reducer write + art. Zero netcode or schema changes.
- **Art-driven timing.** Clients resolve `actionKind` + `facing` + `equippedKind`
  to a sprite animation group by naming convention (`<kind>_<facing>` groups in
  the sprite JSON); frame count and fps come from the atlas `animationMeta`,
  never from the network. Duration is presentation-only — the gameplay effect
  already resolved inside the reducer transaction. The licensed farmer axe sheet's
  existing `axe_<facing>` groups are an explicit compatibility alias for semantic
  `swing_axe_<facing>` lookup; missing art takes the generic fallback path.
- **Forward compatibility.** An unknown `actionKind` (module republished before
  client art ships) plays a generic use/fallback pose and logs to F3 — never
  throws, never freezes the avatar.
- **One controller, two feeds.** A single per-avatar animation state machine
  drives both the local player (fed by predicted input, so swings start on
  keypress per the cosmetic-prediction rule above) and remotes (fed by the row,
  with one-shots scheduled on §4's interpolated `renderTick` so the swing lands
  in sync with the interpolated pose rather than the raw row arrival). This
  controller **retires the global `animationTick` clock** (`overworld-main.ts`)
  and the `floor(tick/8)%4` frame math: each avatar owns its own phase, resets to
  frame 0 when locomotion starts, advances it from *displayed displacement* (so a
  blocked or sliding avatar can't march in place or glide with idle feet), and
  uses the fps authored in the atlas `animationMeta` instead of magic divisors.
  Non-avatar cosmetic timers (tree shake) move to per-entity timers on the same
  pattern.
- **What is NOT action state:** projectiles, spell visuals, fishing bobbers,
  dropped items, and damage numbers are world entities (public rows) or client
  particles triggered by row changes — never encoded in `actionKind`. Hit-flash
  and invulnerability blink are client cosmetics driven by future status fields,
  not animations.

## 7. Client data flow and metrics

- Replace per-frame `snapshot()` materialization with persistent keyed stores
  (`Map` by id) maintained from the generated `onInsert/onUpdate/onDelete`
  callbacks — no arrays rebuilt, no sorts, no `Set` allocation per frame. The
  renderer iterates these stores directly; `snapshot()` survives only for tests.
  Called-once-per-frame (doc 21 §8) becomes moot but keep the single read path.
- Interest region (viewport-derived chunk radius) gains hysteresis: recompute the
  radius only when zoom settles (doc 21's zoom lerp must not thrash
  subscriptions), and keep the subscribe-first `onApplied` handover exactly as is
  — it is correct and tested.
- F3 overlay additions: RTT estimate (reducer call → own-row commit, EMA),
  reconciliation replay depth (inputs re-applied per correction) and error
  magnitude, remote snapshot-buffer depth (min/max across players), input refresh
  age, and subscription handover count.

## 8. Test harnesses (required, per docs/07 §7)

- **Latency/jitter injection (dev only):** a wrapper in the client net layer that
  delays outgoing reducer calls and incoming row-commit application by a
  configurable `?lag=150&jitter=30` — SpaceTimeDB is a TCP stream, so model
  latency and stalls, not packet loss. Incoming callbacks carrying the same SDK
  transaction event id share one sampled delay and are applied together, preserving
  the table cache's atomic commit boundary under injection. All acceptance checks in
  §§3–5 run at 0 ms, 150 ms, and 150±50 ms.
- **Load harness:** a script (extend `scripts/world-smoke.ts` patterns) driving 25
  headless SDK clients walking randomized paths and chopping; assert authority
  tick duration stays under budget and no client desyncs (final authoritative
  positions match a replayed shared-sim check).
- **Crash-ghost test:** kill a headless client mid-walk; assert its avatar stops
  moving within 2 s (§5) while its presence row survives until lease expiry.
- Unit tests: replay reconciler (deterministic fixture: inputs, delayed acks,
  collision change mid-flight), snapshot-buffer selection/extrapolation clamps,
  renderTick resync smoothing, ring-buffer wraparound, reconnect reset, action
  registry flags, one-shot retrigger via `actionStartedTick` change, loop
  clear-on-movement, unknown-kind fallback, run settlement (tap wholly between
  authority ticks, shortfall catch-up drain, overshoot forgiveness, rate-cap
  rejection and its replay).
- **Two-client action check:** client B sees client A's held tool, the swing
  animation, and the tree state change in commit order; a registry kind with no
  client art yet degrades to the fallback pose on B without errors.

## 9. Out of scope

Combat primitives and authority-rate increase; auth/OIDC/friends allowlist;
farm-economy tables and offline advance; permission/role model; removing vestigial
M5.5 tables (`world_tree`, `tendTree`, v1 presence orphan) — flag them in
DECISIONS.md as a separate cleanup, do not delete here.

## 10. Bookkeeping

Update docs/02 (prediction paragraph) and docs/19 §3 (interpolation promise now
implemented) to match. DECISIONS.md entries: replay reconciliation replacing the
error blend; timed snapshot interpolation with 1.5-tick render delay; periodic
input refresh + 2 s server stale-input failsafe; cosmetics-predicted /
state-authoritative interaction split; `authorityTick` on `player_position` as the
interpolation timeline; the two-channel animation model (derived locomotion +
registry-driven replicated action channel) with the public `equippedKind` mirror;
step-accounted movement runs settled against server-clamped client ticks.

## 11. Implementation verification

- Additive schema published over the durable local database and SpaceTimeDB 2.8
  TypeScript bindings regenerated without resetting data.
- Deterministic acceptance fixtures pass straight travel and 5 Hz direction tapping
  at 0 ms, 150 ms, and ordered 150 ± 50 ms latency/jitter. Run settlement tests cover
  between-tick taps, catch-up acknowledgement, overshoot forgiveness, backlog/rate
  caps and rejection replay, collision-divergence replay, reconnect ring reset,
  snapshot selection/collision-stepped extrapolation, timeline discontinuity resync,
  locomotion restart, and missing/unknown animation fallback. A live shared-browser
  150 ± 50 ms one-second move plus sudden stop ended with predicted and authoritative
  fixed-point positions identical and reconciliation error 0.
- `npm run world:tap-check` aligned a 30 ms press wholly between authority ticks and
  confirmed both the claimed two client steps and the authoritative result exactly.
  Tap, action, crash, and load checks each recreate a dedicated test database; none
  connect throwaway identities to the durable player world.
- `npm run world:load` drove 25 SDK clients for five seconds: the authority clock
  averaged 50.85 ms between observed commits under 301 randomized chop attempts;
  all 25 final authoritative positions exactly matched independent shared-sim
  replays. Host metrics measured `step_world` at 1.20 ms average and 5 ms p95. The
  command recreates only the dedicated `orchard-cellar-netcode-load` test database
  so repeated runs cannot be blocked by retained crash-presence leases.
- `npm run world:crash-ghost` killed the moving SDK process with `SIGKILL`: movement
  stopped within the two-second bound while its separate presence remained online under the lease;
  the killed process itself owned the websocket (there is no surviving CLI child).
- `npm run world:action-check` path-found an actor to a live tree and proved a second
  client saw the held Axe plus the replicated swing and tree-health mutation atomically;
  that observer then received a real `drop` action with no art and resolved it to the
  generic fallback.
- A fresh shared-browser run exercised movement, sudden stop, and tool use; after the
  one-shot window the authoritative action was `none`, predicted and authoritative
  positions were identical, and reconciliation error was 0
  (`browser-recording-mt7blixo`).
- `npm run check` passes 208 tests, 99.29% sim line coverage, lint, all workspace
  typechecks, the module build, and validation of 100 art assets, 3 songs, 10 SFX, 2 maps,
  55 palette colors, and four seasonal remaps.

# Hearth, Harbour & Embers implementation ledger

Implementation started 2026-09-09 under the user's explicit goal. Publication is
held until the complete patch is ready for testing. This ledger records evidence;
an implemented helper or passing unit test does not close a gameplay release gate.

| Slice | Status | Evidence / remaining work |
| --- | --- | --- |
| P0 baseline and study | In progress | Initial Astra layout review complete; 832×832 envelope retained. Original generator/collision/resources/landmarks/transitions hashes verified unchanged. Live occupied-row survey and performance baseline remain open. |
| P1 combat foundation | In progress | Region-policy primitives and shared incoming mitigation; Delve armor path fixed. Outdoor policy integration, enemies, dodge/block and multiplayer/touch verification remain open. |
| P2 equipment | In progress | 45 fixed definitions/icons; trained/effective projection, stat budgets, active main-hand shortcut, Body relocation/version handshake, saved rank priorities, authority/client effect compiler and inspection UI implemented locally. Full transactional restore/reconnect/trade/crafting/Delve journeys and visual review remain open. |
| P3 archipelago and Delve | In progress | Bounded map composition and native terrain study; player-hitbox ferry/terrace round-trip checks. Live installation, ferry authority, cave/lobby and legacy returns remain open. |
| P4 village and homes | In progress | Ten native village facades with separate foundations and door/path tests. Interiors, NPC services, homes, furniture and safe construction remain open. |
| P5 volcano/economy | In progress | Fixed gear catalogue authored. Acquisition recipes/shops, encounters, reserved rewards and contracts remain open. |
| P6 release review | Held | Full journeys, continuity, restore rehearsal, Astra implementation/visual review and performance gates. |

## Release dependencies

- Doc 59 still records open performance acceptance and physical iPad evidence.
  Its successful code checks are not equivalent to gameplay performance acceptance.
  Offline implementation can proceed; no publication is justified by those checks alone.
- Preserve old-island coordinates, seed and saved rows. No world-size increase or
  experimental generator adoption is currently necessary.
- Cellar UI changes must use `/home/toby/projects/orchard-cellar-studio-release`.
  Preserve this checkout's Studio prebuild guard and active static artifact.
- No active-run return rewrite, data reset, or current player-state migration is
  performed during design work. Persistence changes need an isolated rehearsal.
- The original working tree contains extensive unrelated changes. Keep task edits
  scoped and do not reset, clean, or publish unrelated working-tree state.

## Review record

Independent `gpt-6-astra` layout and foundation findings are recorded in
`60-astra-design-review.md`. Its real hitbox audit caught a ferry marker outside
land; this is corrected and now covered by a forward/reverse movement test.
Completed populated scenes and authority integration still require final review.

## Reproducible offline evidence

- `npx tsx packages/tools/src/verify-hearth-continuity.ts` compares the immutable
  original-island baseline in `output/doc60/legacy-island-baseline.json`.
- `npx tsx packages/tools/src/import-hearth-buildings.ts` imports ten facades at
  native resolution with door-aligned anchors. Imports remain draft until scene review.
- `npx tsx packages/tools/src/render-hearth-study.ts output/doc60/willowharbour-buildings.png`
  renders the candidate through shared ground, raised-terrain and prefab drawing.
  Add `--cinderwake` for the volcanic terrain study. These are incomplete authoring
  studies, not performance measurements or publication acceptance.
- Targeted tests: `hearth-archipelago.test.ts`, `hearth-village.test.ts` and
  `combat-regions.test.ts`; real collision-plane/player-hitbox movement is included.
- New map wire serialization is compact to stay within the existing 4 MB authority
  limit; canonical pretty serialization and hashes remain unchanged. Publisher
  integration and full occupied-row conflict handling remain required.

Known terrain work: volcanic shoreline/banks/lava animation, a second ascent route,
scenery and native paving edging. No candidate has been installed on the live server.

## Current authoring checkpoint

- Ten facades plus native market stalls, an animated fountain, benches and garden
  hedges are imported. Astra reviewed `willowharbour-town.png` and requested open
  service frontages and distinct working yards; open service frontages, working-yard props and revised stalls are now visible in the refreshed study.
- Village asset tests live in `packages/tools/src/hearth-village.test.ts` because
  they inspect actual imported native dimensions. Decorated-door connectivity passes.
- P2 now has `skill-gear-metadata.ts` and `equipment-skills.ts`, with ten tests for
  rarity examples, training/prerequisite isolation, duplicate instances, contextual
  effects, respec/unequip and both loadout budgets. This is now connected to equipped
  inventory in the shared loadout compiler. Authored skill-tree metadata and 45 items have been exported through the normal content validator.

## Equipment integration checkpoint

- `import-hearth-equipment.ts` reproduces 45 exact native Raven crops, fixed
  item definitions and ten weapon lifecycle bindings. Armor has no durability;
  the reviewed inert catalogue accounts for its equipment-only behavior.
- Main Hand uses actual global inventory slot 33, reached by the V/HUD shortcut.
  Watch and Pack retain their indices. Body adds slot 39; all nine crafting cells
  move to 40–48 after any older hotbar migration. The cursor and station queues
  have no global slot references. The additive migration is locally built, not
  run against live data; isolated transactional rehearsal remains required.
- The new client acknowledges inventory protocol 1 before becoming ready.
  Inventory/lifecycle entrypoints reject an unacknowledged connection; admission
  coverage is under independent review, including multiple tabs and old clients.
- The shared loadout compiler keeps trained ranks separate, applies global/context
  effects once, suppresses inactive Main Hand and drawn-bow Off Hand, and enforces
  equipment-only stat budgets. Saved priority is private to the caller and locked
  during a Delve. Changing equipment settles old regeneration and clamps new maxima.
- Ordinary/Delve weapon damage reads item content. Arrow damage/critical result is
  frozen at launch, with a one-time compatibility snapshot for existing in-flight
  arrows. Delve incoming attacks use the same mitigation math as other combat.
- Astra found excessive small-hit armor budgets; the revised full armor+shield
  totals are 140/174/208 centi for common/rare/legendary. Actual-loadout tests cover
  500–2,000 centi hits. Per-hit legendary/rare weapon ratios are within 25–35%; this
  is not sustained DPS, guardian or boon acceptance.
- Broad simulation/UI/lifecycle run: 1,496 passed, six failures identified in old
  fixture offsets/counts/registration expectations and new-biome generator scope.
  Affected checks are being rerun after fixes; no full release gate is closed.
- Offline UI evidence uses `render-hearth-equipment-ui.ts` (add `--skills`). These
  are native-renderer fixtures without a live authority connection.

## Astra integration corrections

- Menu mutations and crafting closure now share protocol and Delve run locking.
- All vital settlement honors active bow/sprint suppression, including repeated
  same-slot selection and priority changes. Single-row gear consumption, repair,
  durability and quest removal settle both loadouts; dropped drawn weapons cancel
  draw and restore off-hand presentation. No reserve is refilled by re-equipping.
- Executable production-callback checks cover bow draw/cancel/release, switching,
  disconnect cleanup, dropping, menu locks and current-client admission. The actual
  connection callback preserves sparse crafting plus cursor metadata through both
  historical migrations and a second reconnect. 28 focused checks passed.
- Small-resolution native UI inspection now shows non-overlapping skills tabs,
  trained/effective ranks, priority and learn/reset controls. Details scroll.
- The wider authority suite found six obsolete catalogue/source assertions; these
  are updated to the expanded catalogue and shared snapshot/compiler contracts.
- P1 action rules still need to settle the cost/recovery of implicit bow cancellation
  consistently with explicit cancel. This remains a tracked implementation task.

## Combat timeline checkpoint

- Optional `MapDocumentV3.combatRegions` now round-trips and validates bounds,
  IDs and overlap before authority loading. Runtime caches the policy beside map
  collision. Old editor publications preserve unspecified policy; explicit empty
  policy and historical restores remain supported. Stored publication JSON is
  compact while canonical content hashes are unchanged.
- Persistent `enemy_attack` holds frozen origin/target/plane, sequence, quota target,
  timings and hit identities. Delve enemies now commit readable tells, sweep their
  attacks, recover, and release commitment on death/cleanup. Stale missed ticks
  cancel instead of replaying attacks. Three commitments per player are allowed.
- Contact-to-victim obstruction checks prevent radial hits around a thin wall.
  Hop/charge/dive bodies follow their committed paths; blocked movement cancels
  the attack. Surface hostile encounters still need policy consumers and spawning.
- Nearby clients receive attack commitments and draw floor telegraphs below actors.
  Pulse countdown includes hop time; chevrons distinguish charges from aimed bolts.
  Native enemy anchors now match ground-contact rows rather than padded sheet bottoms.
  `render-hearth-combat-study.ts` records native actor/cue readability on light/dark
  backgrounds; it is not a day/night lighting acceptance test or a live fight.
- Six pure action/defense math checks and production-callback combat checks cover
  timeline boundaries, dodging geometry, block budgets, hit-once sweeps, sidesteps,
  walls, elevation and stale attacks. Dodge/block authority and controls remain next.
- Wider authority run: 630 passed and one old fishing-damage source assertion moved
  to the new attack resolver; the affected 26-check group passes after that fix.
  No publication or release acceptance has occurred.
- The new thin-side-wall executable regression exposed that the old projectile
  helper checks terrain only. `combatSegmentObstructed` now includes exact segment
  intersections with authored object obstacles; the 24-test combat/equipment/math
  group passes including this case. World/client/tools typechecks and targeted
  lint pass. Furniture source/economy recommendations are now recorded separately
  in `60-astra-furniture-catalogue-review.md`; those are not implemented items.

### Player defense checkpoint (9 September, local only)

- Implemented private player combat state and per-connection defense command
  high-water marks. Dodge pays 1,800 Vigour immediately, starts next authority
  tick, commits six collision-checked steps / 1.5 tiles, avoids hits for its first
  four ticks and retains eight recovery ticks. Movement credit and queued sprint
  cannot accumulate during exclusive defense. Recovery currently allows walking
  and regeneration but rejects another combat/item action.
- Held shields use a dedicated 750 ms input lease, 250 ms client refreshes,
  frozen frontal direction, 30 Vigour/tick drain, impact cost and guard-break
  recovery. Guard facing is echoed to the avatar. Mounting/build mutations are
  rejected during defense/recovery; active defense rechecks mounts, carrying,
  health, space and stale ticks. Teleport/disconnect cancel motion/hold while
  preserving paid recovery. Another tab cannot release the controlling tab's hold.
- Delve committed attacks resolve dodge/block before damage and consume avoided
  contacts once per victim/sequence. Player movement now precedes projectiles;
  projectile player hitboxes reload positions after movement. These are local
  authority changes, not evidence of a live two-player encounter.
- All bow cancellation routes pay the server-timed charge cost and recovery,
  including switch/drop/disconnect. Draw-time cost snapshots survive equipment
  changes. Exhausted players can always cancel; repeated cleanup is idempotent.
  Fire marks its draw already paid, avoiding double expenditure.
- Added R dodge / held X guard and labeled touch controls. Guard releases behind
  blocking UI or lost focus; old asynchronous failures cannot poison a new hold.
  Defense movement discards obsolete client prediction without rewinding its
  credit clock. Existing avatar art uses a small guard arc/dodge foot ring;
  this is not a new armor appearance or animation set.
- Astra reviewed server implementation and native controls. All concrete findings
  in those bounded reviews were addressed, including overlay guards and async
  hold generations. `output/doc60/combat-defenses.png` is an offline native
  portrait/landscape control study (SHA256
  `9ebcba8d5e09e19a6e85e4d6f05376b78b9c6603e4136af6d658d7dcbe5f56b7`).
  Actual avatar/terrain alignment, touch device usability, delay/packet-loss
  response and cooldown/hit feedback still require gameplay acceptance.
- Verification: broad world suite 644/644; subsequent added movement-credit
  regression and async hold tests pass in the 31-test focused group. Earlier
  combined combat/UI/netcode group 96/96. World/client/tools typechecks and
  targeted lint pass. Bindings regenerated without publication.
- P1 remains open: outdoor spawn/attack/reward authority, committed melee input
  buffering, confirmed hit/block/miss feedback, full stale-restore and real
  multiplayer/touch/latency journeys. P3–P5 content and P6 release acceptance
  remain open. Nothing has been published or marked ready for user testing.
- Final checked world build succeeds; the post-regression world typecheck also
  passes. No live service was restarted and no Spacetime module was published.

### Outdoor encounter rules and sites checkpoint (9 September, local only)

- Astra independently checked five candidate camp squares against authored cells:
  ash shore678,204/L0, south basalt715,205/L0, terrace kiln725,169/L1,
  skull roost736,147/L2, Warden721,117/L3. The reviewed manifest now records
  member homes, operating radii, enemy HP/damage/range candidates, five-minute
  ordinary / fifteen-minute guardian respawn delays and explicit Warden activation.
  Full body/scenery collision, density, lava treatment and alternate ascent are
  still open; these are not final visually accepted camps.
- Added shared outdoor encounter state transitions: aggregate pack health, actual
  applied-damage credit, bounded useful-support credit, recent contribution
  eligibility (5% original HP, support weighted half), one completion per
  encounter/generation, spawn-time copies of reward inputs, deterministic grants,
  unfinished-pack leash reset without seed change and quiet respawn generation.
  Contribution storage is bounded at64 recent participants; stale entries cannot
  occupy all slots and exclude a new fighter. This limit needs populated-world
  acceptance along with support attribution at the authority boundary.
- Nine focused tests pass for rules and terrain candidates. They cover duplicate
  killing blows, overkill conservation, last-hit stealing, deterministic drop
  bounds/0%/100%, reward-content mutation, leash/respawn rules and camp surfaces,
  planes and sanctuary exclusion. Sim typecheck and targeted lint pass.
- This is shared simulation plus authored candidate data, not live encounter
  installation: private persistence tables, immutable claim delivery/XP receipts,
  actual NPC spawn/damage/tick consumers, KO return, support attribution and
  restart/claim journeys remain to integrate. Candidate volcanic material IDs in
  the manifest also need authored content/acquisition before runtime activation.
  Nothing published; the complete patch remains the active objective.

### Outdoor reward authority and damage checkpoint (9 September, local only)

- Added private encounter, contribution, immutable completion and reserved claim
  tables, plus a spatial outdoor enemy profile. Completion writes its receipt,
  owner item entitlements and Combat XP together. A second kill sees completed
  state; claiming/reclaiming never issues XP. Older generation entitlements survive
  later completions. Conflicting restored active state beside an existing
  completion key fails closed.
- Owner-only claim reducer uses the existing inventory transaction planner.
  Full inventory preserves the exact entitlement for retry. Astra found that
  large grants exceeded source-stack limits; collection now splits frozen totals
  into valid stacks before planning the whole insertion. Executable checks cover
  stone100, two stone75 lines merged to150, and two nonstackable durable swords.
- Added outdoor melee/ranged damage routing with authored-region and elevation /
  obstacle checks. Whole native NPC HP becomes actual appliedHP×100 contribution
  credit; overkill is clipped. A two-member pack test confirms partial death pays
  nothing and final death grants once. Stale member generations reject damage.
- Projectile segment policy expires arrows crossing the protected dock boundary
  at their last valid location, retaining ordinary recoverable-arrow cleanup.
  Peaceful historical maps and non-topside spaces preserve existing arrow behavior.
- Added client pending-reward state/claim API and topside-only spatial outdoor
  profiles. Native enemy rendering recognizes those profiles and loads the existing
  red-slime sprite. This does not add the guild reward-collection UI or install NPCs.
- Astra's bounded ledger review found no duplicate-XP path in the transactional
  completion/claim design. It also found contributor saturation: selection now
  retains the strongest64 recent scores deterministically, so negligible entries
  cannot exclude substantial later damage. Current eligibility intentionally allows
  a recently contributing player to retreat/disconnect before completion; it does
  not demand current proximity or reconnection. Useful support still needs an
  actual encounter-attributed producer; clients cannot submit contribution credit.
- Verification: broad world650/650 before the final ranged/stack edge additions;
  focused reward authority11/11, shared encounter rules8/8, regional subscriptions
  12/12. World/client typechecks and targeted lint pass. Bindings regenerated
  without publication. Callback fixtures test production functions and real
  inventory planning, not a live Spacetime restart or transactional restore.
- Remaining integration: camp installation/activation, bounded AI/leash/quiet
  respawn, policy-revision invalidation, outdoor incoming attacks and no-loss KO,
  material definitions/gathering, UI claim collection, Warden phases/adds and
  real client/touch/delayed/restore journeys. No island is installed on live state;
  all P3–P6 requirements remain in scope. Nothing published.

### Volcanic material content checkpoint (9 September, local only)

- Authored Basalt, Ashwood, Cinder Ore, Emberglass and Guardian Seal as stackable
  materials with reproducible native Raven icon imports in
  `packages/tools/src/import-hearth-materials.ts`. Every camp reward now resolves
  to an item in the bootstrap pack. No material is directly purchasable.
- Astra reviewed material distinction and reward valuation. Applied both findings:
  Ashwood uses a visibly grained gray-blue native log instead of a bar-shaped crop;
  Guardian Seal carries `trade.unsellable`, since a zero price alone would let a
  merchant consume it. The mixed Basalt/Seal sale regression rejects atomically.
- Intended distinct recipe sinks: Basalt masonry/reinforcement, Ashwood frames and
  bow stocks, Cinder Ore smithing, Emberglass lights/magic fittings, Guardian Seal
  deterministic legendary choice. Recipes/gathering/acquisition are still pending;
  avoid buy-and-convert sale loops when adding them. Current ordinary camp material
  payout is 170 bronze per full rotation before travel/combat/quiet respawn delays.
- Updated reviewed inert-item classification to 231 items / 119 authored callbacks /
  112 inert items. Bootstrap has 581 definitions, hash prefix `63a29a1d`.
  Native atlas build passes with 1,089 assets and 39 pages per season.
- Fixed outdoor enemy profile chunk/space metadata synchronization in
  `updateWorldNpc`. A production-function regression covers boundary movement and
  suppressing redundant metadata writes, preventing profiles disappearing from
  nearby regional subscriptions after movement.
- Verification: focused content/merchant/encounter/reward tests passed (28 before
  the additional regional metadata regression; outdoor authority now 12/12).
  World/tools typechecks, content validation, lifecycle integrity, targeted lint,
  atlas build and checked world build passed. No schema change in this checkpoint.
- **Not complete:** camp population/spawning/AI, no-loss outdoor knockout, Warden
  phases, useful support credit, reward collection UI, recipes/gathering, map
  installation, village services/interiors, furniture ownership, travel and P6
  acceptance. Camp activation was investigated but not implemented in this slice.
  No deployment or publication occurred. Full Doc 60 goal remains active.

### Outdoor population and committed combat checkpoint (9 September, local only)

- `stepOutdoorEncounters` now owns five indexed packs/seven native enemies and runs
  before the ambient NPC loop. Stable reserved NPC IDs are preflighted as a whole
  pack; foreign occupants, missing materials, blocked homes, absent combat policy
  or an unusable recovery area cannot be overwritten or activated accidentally.
  Camp generation/reward snapshots survive resets, and only completed quiet packs
  advance generation. No island-wide NPC scan was added.
- Initial packs prewarm before arrival, while no online player is within the camp
  plus the authority-owned 176-tile visibility bound. The bound covers the client's
  maximum nine-chunk region, alignment, centre hysteresis and edge margin; a client
  regional test checks that relationship. Respawn requires both the five/fifteen
  minute cooldown and 600 quiet ticks. This is intentionally conservative; actual
  ferry integration must ensure prewarm precedes first teleport. The current test
  covers prewarm and a shore approach, not an implemented ferry journey.
- Packs acquire reachable targets, stagger initial member tells by six ticks, and
  use the shared committed attack resolver with the global three-attacker quota.
  Sanctuary/plane/target validity is checked during commitments. Outdoor movement,
  outgoing damage and impact paths respect authored camp/policy/elevation bounds.
  An 80-tick loss of reachable targets starts a whole-pack return/reset. Dead pack
  members never pay a partial clear, and return/reset keeps the same reward seed.
- Return navigation now uses bounded BFS with per-segment live collision validation.
  Its small disposable route cache contains no reward/phase authority. Temporary
  policy/home/path/recovery conflicts suspend combat, preserve phase/cooldown and
  generation, and revalidate instead of permanently disabling the camp. Interrupted
  active fights resume through a return/reset. A blocked dock suspends both outgoing
  and incoming combat, preventing invulnerable reward farming.
- The Warden starts dormant and cannot take incidental damage. An authenticated,
  living player must explicitly activate it within range, on the right plane and
  without obstruction. The client exposes “Awaken Caldera Warden” through the
  existing E/touch interaction path. Reset requires a fresh opt-in. This is the
  activation/commitment foundation, not the completed boss phase encounter.
- Lethal outdoor impacts now recover the player at a collision-checked sanctuary
  dock tile with 35% Health, at least 25% Vigour and a short action recovery. The
  item/currency/claim rows are untouched. The committed-hit regression verifies a
  second same-tick old-position contact re-reads the relocated player. Teleport,
  custody, latency, restart and actual live recovery still need full P6 acceptance;
  the test uses the production hit/recovery callbacks with DB-shaped fixtures and
  mocked teleport/stat services, not a deployed server.
- Client melee selection recognizes outdoor profiles and the target panel uses
  their authored maximum Health. Public profile chunk tracking remains intact.
  Generated bindings now include `activateOutdoorEncounter`; the private camp row
  gained last-near/last-target/return timing, engagement and conflict metadata.
- Astra reviewed the actual implementation, found and had addressed first-spawn
  overlap, the first-ferry exclusion, permanent conflict state, greedy return routes,
  immediate blocked-approach leash and asymmetric blocked-dock immunity. The bounded
  population review reports no remaining critical issue; full patch approval is
  still open. See the final population sections of `60-astra-design-review.md`.
- Verification in this checkpoint: population authority 13 tests, reward/damage
  authority 14 tests; combined population/reward/region checks 39 before the latest
  authored-boundary regression. World/client typechecks and targeted lint passed.
  The first full world run had 670/671 passing, exposing stale 226/107 catalogue
  fixture counts; corrected to the reviewed 231/112 and its focused checks passed.
  Final full-suite/build results are recorded below when finished.
- Still pending: Warden thresholds/vents/add waves, mage burst cadence, skull
  orbit/retreat and speed tuning, useful support producer, reserved-reward collection
  UI, actual ferry/lobby/map installation, gathering/gear recipes/contracts, village
  NPCs/interiors, furniture ownership/building and full P0/P6 evidence. No service
  restart, module publication or game/Studio deployment occurred. Goal remains active.

- Final population pass also removed repeated full-resource collision gathers:
  `outdoorCollisionMap` probes camp/dock chunk keys, and the controller reuses one
  reducer-local collision map for spawning, movement, attacks and recovery. Cold
  packs outside engagement range do not rebuild collision merely because a player
  is inside the wider visibility exclusion. A production-function regression checks
  exact chunk tuple probes, a bounded query count, one build for all five prewarms,
  and no idle rebuild. Existing generic collision handling of placeables/homesteads
  remains; end-to-end performance is still unmeasured.
- The checked module build exposed its older standard-library target rejecting
  `Object.hasOwn`; replaced with the equivalent portable own-property check. The
  checked world build then passed. Population/reward authority now passes 28/28
  tests (14 population + 14 reward/damage), and client typecheck remains green.
- Final full world suite: **673/673 passed**, recorded in
  `/tmp/doc60-population-world-suite-final.json`; final targeted lint passed. Checked
  world build and client typecheck passed. No active validation process or deployment
  remains from this checkpoint. Next implementation work is the authored enemy/boss
  behavior and collection UI, followed by the still-open full patch scope above.


### Ordinary enemy behavior and Expedition Rewards — local checkpoint

- Pyromancers keep a three-to-six tile casting range and commit bolt/bolt/burst
  cadence, with a weaker 7 HP burst. Every cast respects the minimum range;
  close targets cause retreat instead of point-blank firing. Skull movement now
  approaches, orbits, dives and repositions; normal movement uses the authored
  50%/65% speeds with deterministic fixed-point stepping. Attack-cycle state is
  persisted and generated bindings are refreshed.
- A blocked lunge retains its complete authored recovery and attacker quota.
  Recovery-only commitment rows prevent a blocked skull dive from immediately
  retreating. Production callback tests cover all recovery ticks; range tests
  cover 2.9/3/6/6.1 tiles for every mage cast. Astra rechecked both timing fixes.
- Expedition Rewards is available from the Game Menu and O. It displays native
  material icons, saved quantities and XP already awarded at completion, with
  collection/retry, paging and scrolling. Delve collection is disabled. Pending
  requests survive closing/reopening, repeated Enter cannot duplicate requests,
  failed full-bag collection retains the authoritative receipt, and stale responses
  cannot change a newer selection's completed state. Owner subscription revisions
  invalidate the presentation cache, including updates with unchanged row counts.
  A new-reward toast points to O. No reward is removed optimistically.
- Astra approved the bounded native screenshot at 480×270 logical pixels:
  `output/doc60/equipment-rewards.png`, with adjacent offline provenance. Its
  four-material inventory is a presentation fixture, not the actual Ash Shore
  payout. Real subscription/restart/full-bag journeys and physical touch acceptance
  remain open; this screenshot is not live verification.
- Verification: targeted behavior/population/UI/model tests 146/146 before the
  additional close/reopen integration test; full UI plus selected client tests
  **500/500** including that integration test; full world suite **675/675** at
  `/tmp/doc60-behavior-world-suite.json`. Client/UI/world typechecks, targeted lint,
  and checked world module build passed. No module publication, service restart,
  client deployment or Studio deployment occurred.
- Warden phases/vents/adds are next. The broader P0–P6 scope above remains open;
  this checkpoint does not complete the content patch or authorize publication.

- Follow-up UI validation added a help-book O shortcut and native 360×270 logical
  full-bag/Delve-disabled states at `output/doc60/rewards-full-bags-compact.png`
  and `output/doc60/rewards-delve-compact.png`. Both were visually inspected with
  clear status text and no clipping. Help tests passed (3/3); final UI/client
  typechecks passed after correcting a readonly callback declaration in a test.
- Astra's Warden design review now specifies phase thresholds at 300/150 HP,
  transitions after existing recovery, a distinct base/add membership partition,
  a 45,000-centi base-only completion pool, two stable add slots, telegraphed
  summons at candidate pads (715,116)/(727,116), and no add reward/contribution.
  Summons require live pad/body/route/player checks and cleanup on boss death,
  return/conflict/reset; boss/add impacts need initial spacing. This is reviewed
  design for the next implementation, not an implemented three-phase boss.


### Caldera Warden phases and bounded summons — local checkpoint

- Implemented authoritative monotonic phases at 300/150 HP. Desired phase follows
  current HP; applied phase/cycle/cue timing persist on the outdoor profile. A
  threshold crossed during tell, active frames or recovery preserves the original
  commitment. At the safe boundary, one 20-tick cue precedes a fresh tell; a large
  hit can skip directly to phase three. Death never queues a transition.
- Phase one charges; phase two opens with a vent and alternates vent/charge;
  phase three opens with charge and alternates while introducing two optional adds.
  Charges use 14/8/16 tell/active/recovery ticks, vents 20/1/16. Warden/add impact
  windows are spaced by at least six ticks and retain the global three-commitment
  limit. Existing collision-clipped lunges retain the full authored recovery.
- Outdoor profiles now distinguish base/add roles and persist each reserved add
  slot's pending/marking/spawned/dead state. The two pads use stable boss+1/+2 IDs
  at (715,116)/(727,116). Full body, policy, elevation, route, player clearance and
  nearby NPC checks precede marking/spawn. A blocked pad defers independently.
  Marks last 20 observed ticks; a processing gap re-arms the complete warning.
  Spawned adds get 20 ticks of grace, with six additional ticks for the second
  slot, before their ordinary full hop tell. Spawned/dead slots never reset merely
  because processing resumes. Missing dead corpses do not invalidate base membership.
- Add HP never reduces the 45,000-centi boss completion pool and produces no
  completion contribution, Combat XP or claim. Final base death removes add NPC,
  profile and attack rows. Return/conflict cancels adds; phase/wave reset happens
  only with the full quiet reset, retaining unfinished generation/reward identity.
- Astra found a scheduled-loop stale snapshot hazard after add deletion. The
  ambient NPC pass now reloads every cached NPC and skips absent rows before
  classification. A regression executes the actual extracted scheduled loop over
  snapshots retained before real boss cleanup. The committed outdoor-hit callback
  also rejects deleted actors/profiles and completed camps before damage.
- Native client presentation now draws angular blue summon marks, a small gold
  guardian crown with phase pips, and the phase in the target health panel name.
  Astra's initial concern that a gold ring resembled another damage area was
  addressed by replacing it with the crown. Native day/dark shape study:
  `output/doc60/warden-cues.png`. Actual compiled basalt texture fixture:
  `output/doc60/warden-arena.png`. Both have offline provenance. The terrain fixture
  is a composed static scenario, not a running authoritative fight; the arena
  still lacks final scenery/landmarks and is not visually complete.
- Astra reviewed the implementation and follow-up fixes, reporting no further
  critical issue in that bounded review. Full live/touch/latency/restart/performance
  and actual three-phase terrain-fight acceptance remain open. Vent aftermath and
  broader confirmed hit/miss/block feedback still belong to the remaining combat pass.
- Verification: focused phase/population/reward tests **48/48**; full world suite
  **685/685** at `/tmp/doc60-warden-world-suite.json`; world/client/engine typechecks,
  targeted lint and checked world build passed. Bindings regenerated with phase,
  role and summon timing fields. No publication, deployment or service restart.
- The full content patch remains active and incomplete. Next work includes the
  island travel/lobby integration and final volcanic environment, then the still
  open village interiors/NPCs, furniture/building, recipes/acquisition/contracts,
  remaining combat polish/support, P0 and P6 acceptance. Publication stays held.

### Island ferries — local checkpoint

- Added three fixed, free routes using Fin's existing dock and the two authored
  island docks. E opens an explicit destination menu; merely opening it or pressing
  Enter does not travel. Native compact/touch buttons show the volcanic danger
  warning and retain errors for retry. Pending requests cannot duplicate departure.
- Authority checks route identity, living topside player, dock reach/plane/obstruction,
  installed destination policy and Cinderwake encounter preparation. Homeward travel
  remains available if the new island policy is removed. Arrival selection is bounded,
  safe and connected to the destination ferry threshold by a full-body-clear route.
- Astra reproduced a thin obstacle missed by the original anchor-ray route check.
  Cardinal edges now sweep the exact player hitbox rectangle against obstacles and
  plane-aware terrain; regression verifies free endpoints, blocked midpoint and a
  valid unobstructed control. An isolated free arrival pocket is also rejected.
- Departure settles a charged bow before using the shared portal/teleport custody
  path. The extracted real helpers test bow payment, carried chest/barrel movement,
  and a return trip. Wallet/bag/cursor snapshots are fixture evidence, not a live
  inventory-table or deployed transaction acceptance claim.
- Verification: full world suite **691/691**, UI plus selected client/simulation
  suite **498/498**; final focused ferry suite **10/10** after the swept-body fix.
  Client/UI/world typechecks, checked world build, generated bindings and targeted
  lint passed (final swept-body lint below). Native compact menu fixture is
  `output/doc60/equipment-ferry.png` with adjacent provenance; Astra found it readable.
- No map candidate has been installed and no ferry journey has been accepted on a
  live server. Fin interaction priority/occupied dock survey, real full-inventory
  travel, first Cinderwake arrival/prewarm, reconnect and touch remain open.
  No publication, deployment or restart. Cave/lobby implementation is next.

### Delve admission preparation — local checkpoint

- The checked-in authored space pack currently contains no run entrances. Existing
  saved tent returns remain independent of new admission; no active member return
  coordinates or tent portals were changed.
- Before adding the cliff lobby, admission now validates a body-clear source and
  threshold on the same elevation with an unobstructed body-origin sight line.
  Stale, distant, wall-separated and blocked-threshold requests cannot create runs.
- Admission advances vitals, rejects a dead player, settles a charged bow and reloads
  survival before saving return resources. Thus cancellation cost/hunger is retained
  on exit and the charge token cannot enter the run. Run hunger initialization and
  existing run cleanup remain unchanged.
- Nine focused admission/entrance tests pass, including the actual extracted reducer
  and actual bow cancellation/hunger helpers; this is not a live database journey.
  Targeted lint passes. Lobby geometry, art, portals, confirmation journeys and final
  cave coordinates against the occupied live map still remain to be implemented.
- Astra independently passed **10/10** ferry tests and **9/9** admission/entrance
  tests, closing both bounded review findings. Final combined targeted run is
  **19/19**; world typecheck and checked build pass after the admission changes.
  Admission fixtures mock advancement/initialization/teleport, so full exit-path and
  reconnect acceptance remains open. Final swept-body lint also passed.

### Safe Delve lobby terrain — local checkpoint

- Added a shared 24×24 authored excavation with a southern arrival neck, broad
  gathering hall, western supply alcove and eastern practice bay. New `delve_lobby`
  generator uses the same wall-plane collision bytes in authority and the renderer;
  non-ground movement is blocked. No authored space/portal has been activated yet.
- Native projected walls occupy more than the logical wall tile. Full-body traversal
  exposed two invalid draft interaction positions: descent now uses (12,5), practice
  (18,10). Arrival (12,19), outside exit (12,21) and counter (5,14) remain reachable.
  Tests traverse edges at fixed-unit resolution, not merely tile-centre adjacency.
- `render-hearth-study.ts --lobby` produces the native offline scene at
  `output/doc60/delve-lobby.png` with provenance. Astra reviewed the bare shape and
  shared collision, independently passing 3/3 tests. Its palette review found the
  solid rust entrance floor looked unfinished; native cave-floor autotile detail
  now textures that alcove and surrounding solid terrain retains the masonry field.
- Latest image SHA256:
  `fdae674f283f24df7dfcc93f5836977520ebbc539d3b81611595ec0f69f97c96`.
  The scene is still bare: deliberate entrance threshold, cave wall treatment,
  descent/outside doorway art, counter, benches/stash, practice presentation,
  lighting and player-scale review remain. This is not final visual acceptance.
- Verification: shared layout, renderer parity and world collision suite **34/34**;
  client/engine/world typechecks and checked world build passed for the generator.
  Final floor detail is a renderer-only adjustment. No publication or restart.

### Lobby furnishing and projection correction — local checkpoint

- Added seven native furniture pieces: supply table, two bookcases, two stools and
  two benches. Shared authored lower footprints feed authority and client prediction;
  the same scene producer renders the client and offline study. Central passage and
  all five interaction positions remain reachable with furniture present.
- Astra found a real two-row wall/collision mismatch: renderer datum 0 versus the
  dungeon family's default datum 1 in collision compilation. The compiler now accepts
  an optional explicit projection datum, retaining existing defaults. Lobby and both
  existing rogue-room consumers explicitly use datum 0 to match their renderer.
- Regression checks visible northern contour faces against physical mask cells in
  every rogue act, plus exact lobby wall rows and player-foot clearance. The temporary
  interaction workaround is superseded: descent threshold is now (12,3), practice
  (18,8). Arrival, exit and counter coordinates remain unchanged.
- Astra independently passed 41/41 lobby/terrain tests and closed the projection
  blocker. Combined local terrain/lobby/world-rules suite passed **72/72**. Furniture
  layout follow-up tests passed **4/4**. Client/engine/world typechecks and checked
  world build passed; targeted lint passed.
- Followed Astra's composition feedback: bookcases now flank descent against the
  north wall, stools sit near the supply table. Added native dungeon descent and
  cave outside doorway art. Latest offline scene:
  `output/doc60/delve-lobby.png`, SHA256
  `23c20ba9ac6cc40261785a00b1ceb70eba85e97c3848c166c2f1dbf062e60c0a`.
- Doors are presentation only at this checkpoint; no space/portal content activated.
  Sealed descent treatment, masonry/cave threshold, lighting/player-scale review,
  practice/stash/supply functionality, cliff survey and full travel/run return journeys
  remain open. No publication, deployment or restart.

### Authored lobby admission and practice — local checkpoint

- Added local `space:delve_lobby` (65532), 24×24 underground, with the authored
  `cliffside-descent` at (12,3), reach 1.5. The space pack now has 582 definitions;
  export/check pass. No exterior portal is authored or installed yet. Existing tent
  definition and saved return coordinates remain intact.
- Provisioning adds a real regenerating archery target at (20,9), ID4294966903,
  only while the lobby generator is active. Repeated provisioning preserves health.
  A mismatched existing row now raises `hearth_lobby_target_conflict`, preserving
  the row; carry preflight rejects this fixed target. Native client target rendering
  follows the ordinary subscribed target path, not a duplicate decoration.
- Homestead/private-run allocation now skips authored static space IDs. Residence
  pair allocation already checked active definitions. This protects future allocation,
  not existing occupants: P0 must prove 65532 is unused by existing homesteads,
  child spaces, instances and portals before activation. Do not shadow old geometry.
- Astra independently passed 13/13 authority/admission/entrance tests and reviewed
  these changes. Target provisioning currently runs on init/connection; the future
  cave portal must provision/validate it before opening the new route after a live
  content-head activation. This remains an explicit integration requirement.
- Full world suite **703/703** at `/tmp/doc60-lobby-world-suite.json`; focused
  authority/content/admission **16/16**. Final target-conflict test, world typecheck,
  checked build and targeted lint pass. Latest native offline practice fixture is
  `output/doc60/delve-lobby.png`, SHA256
  `53618b55ee49a2503f12f2335c091fdfd4699c15d95d97985892689adca29baf`.
- Read-only live survey attempted against explicit `orchard-cellar-world` on local
  server: both CLI identity and anonymous SQL return403 `authentication_invalid_issuer`.
  Shared canonical preview opened as tab_3 and is at Account, without a usable signed-in
  session. Asked user asynchronously to sign in or supply an authorized token-file
  path (not a token in chat). Live occupied-map/cave coordinates remain unverified.
- Supply/stash services, lighting, sealed door/threshold polish, functional outside
  portal and all live journeys remain open. Local work can continue while awaiting
  survey authentication. No publication, deployment or restart.

### Lobby supply counter and authored NPC artwork — local checkpoint

- Added Orrin, the lobby quartermaster (NPC4294966920), at (5,11), using native
  `npc_cf_miner_mike`. His dialogue opens the existing shop frame and explains
  explicit Begin Delve confirmation and fixed equipment during a run. Shop offers
  arrows, torches and apples at existing prices; no custom grants or new economy
  rules. Normal cart tests cover mixed purchase cost, full bags and unoffered gear.
- The actual merchant admission helper uses an inclusive three-tile radius, as
  does client targeting. Full-body frontage and nearby-position tests prove the
  supply counter is accessible. Astra retracted its initial 1.5-tile range concern
  after checking the actual merchant path; that smaller constant is ambient AI.
- Fixed the shared renderer's hard-coded merchant artwork fallback. Authored NPC
  asset mappings now feed actor drawing, hit bounds and portraits. The client loads
  mappings on content-head changes; non-merchant authored residents also render via
  the humanoid path. Boats/horses retain their separate mounted/wildlife rendering.
- Artwork loads commit atomically. Three attempts with 250/1000ms backoff retain
  successfully loaded assets; state ownership prevents an obsolete success or
  failure from replacing/restarting a newer head. Permanent failure leaves the last
  good mapping and logs once for that head. Astra reviewed this and independently
  passed 9/9 focused artwork/authority tests.
- Native scene now shows Orrin clearly behind the counter; moved his home north
  one tile after the initial table occluded him. Latest offline fixture/provenance:
  `output/doc60/delve-lobby.png`, SHA256
  `e937a1006c2bd9b75266d2cdf82461f06ddbc2265d44ee2c778dce2e8cec6665`.
  Astra found the current counter/shelves/practice composition readable, but this
  remains an unlit offline scene, not full live service acceptance.
- Content export/check validates 585 definitions. Updated explicit NPC projection
  and lifecycle registration expectations for Orrin's spawn/dialogue handlers.
  Full world plus selected art/supplier suite passes at
  `/tmp/doc60-supplier-world-art-suite.json`; client/engine/world typechecks, checked
  world build and targeted lint pass. No publication or restart.
- P0 must also verify NPC4294966920 is unused before content activation. Authentication
  request for the live survey remains pending. Sealed descent/exit composition,
  lights, stash and functional cave travel remain open, alongside the wider patch.

### Lobby native doors and lighting — local checkpoint

- Imported the kit's exact 32×32 `Dungeon_1_Door_Closed.png` as
  `prop_cf_dungeon_door_closed`; native source reviewed and approved. The northern
  descent now reads as a sealed door. Existing run admission remains explicit;
  this artwork does not open a run by itself.
- Added six permanent, nonblocking standing torches through the ordinary native
  item renderer and flame emitter contract. Authority ticks drive animation and
  deterministic flicker; Dynamic uses normal projected lighting and Basic keeps
  the native sprite plus ambient composite. No mutable placeable rows or extra
  world IDs are required. The northern pair moved south to clear the bookshelves.
- Replaced the rotated, combat-glowing southern arch with an upright cave opening
  mounted on the southern wall. It is submitted alongside raised terrain at the
  wall's presentation plane, with the receiver sampled at the physical exit.
  Player collision and the solid boundary remain unchanged.
- The native study now uses the actual gameplay queue and optional production
  Basic/Dynamic lighting. This exposed cap occlusion that the old raw queue missed.
  A native avatar at the original exit was hidden by the wall. Moved the unpublished
  exit interaction to (12,19) and arrival to (12,18); the wall-mounted opening stays
  in place. The avatar is now fully visible at the interaction point without relying
  on terrain cutaway. This supersedes earlier arrival (12,19)/exit (12,21) notes.
- Astra reviewed the closed door, six flames, revised exit pose and Basic/Dynamic
  fixtures. Bounded visual checks pass; no live movement, portal or run journey is
  implied. Artifacts: `output/doc60/delve-lobby.png`, `delve-lobby-basic.png`,
  `delve-lobby-dynamic.png`, `delve-lobby-exit-player.png`, with adjacent provenance.
- Focused lobby geometry, authority and lighting suite: 18/18. Client/engine/tools
  typechecks, checked world build, targeted lint and diff checks pass. Full asset
  validation currently flags earlier Hearth source-palette assets still marked
  unapproved; these need their outstanding art review before final release. The
  closed-door source itself has now been approved. Nothing published or restarted.
- Next lobby work: owner-private stash slots/session through existing inventory
  transfer authority (not shared chest storage), rechecking lobby/reach/Delve lock
  on every mutation and preserving cursor custody. Astra's detailed review includes
  acceptance cases. Cave travel still depends on final P0 survey coordinates and
  must provision/validate the practice target before entry after a content-head
  change. Authentication for that live survey remains pending. Wider P0–P6 work
  and final publication hold remain unchanged.

### Personal lobby stash — local implementation and review

- Added private `hearth_stash_slot` rows (owner identity + slot, 20 slots) and a
  private `active_hearth_stash` session owned by the opening connection. Owner-only
  views expose contents and session; no public chest/placeable storage is used.
  Opening and every menu load/write enforce persistent-inventory protocol/Delve
  locks, living lobby presence, full-body clearance, line of sight and 1.5-tile
  reach to the shared stash point (8,13).
- Stash uses existing menu inventory transfer authority for move, split, cursor,
  quick craft, pickup-all, hotbar swap, quick transfer, distribute, sorting and
  explicit throw. Exact durability/lit metadata is retained. Unique quest-item
  deposits are rejected before writes, avoiding abandon/reaccept regrant duplication.
- Explicit close settles the private cursor through existing storage/overflow
  custody. Travel, frame replacement, NPC greeting and owning-connection disconnect
  invalidate the stash session; contents remain. Replaced connections cannot access
  a newer session. Astra identified the direct NPC-greeting cleanup gap and confirmed
  its correction alongside the quest-item restriction.
- Client subscribes to private views, clears caches on disconnect and only presents
  an active window when its connection matches. An E/touch interaction opens the
  authored `frame:hearth_stash`, titled PERSONAL STASH, with 20 stash, 20 backpack
  and 10 hotbar slots. Explicit `stash` slot bindings preserve container identity
  through pointer and quick-transfer paths. The native cabinet at (8,12) has a
  shared physical footprint and leaves the service frontage/routes clear.
- Astra reviewed backend ownership, native cabinet placement and compact 360×270
  frame. Artifacts: `output/doc60/equipment-stash.png` (SHA256
  `475639f8082234d71e8c8f37955c4805cf2d3ab96c954a526c7030c3bcecc674`) and
  `output/doc60/delve-lobby-stash.png`, each with provenance. This is bounded offline
  approval, not live persistence or publication approval.
- New production-helper tests cover Alice/Bob owner isolation, lazy/idempotent
  materialization, metadata round trips, full destination refusal, replaced/wrong
  connection, stale reach, Delve lock, quest-item rejection and cleanup preservation.
  UI test checks all 20 slots, actual pointer dispatch for slot19 and quick-move
  mappings. Client reconnect test verifies private slots rehydrate without reopening
  a stale session; delayed old callbacks cannot reactivate it.
- Broader client/UI/world plus focused lobby suite: 1616 passed, 0 failed,
  `/tmp/doc60-stash-integrated-suite.json`. Fixed stale test fixtures: protocol-ack
  async reconnect handshake, two combat region subscription counts, identity canvas
  transform, and explicitly re-captured the reviewed package-seam source tripwire.
  Client/UI/tools typechecks, checked world build, content validation (586 definitions),
  generated bindings, targeted lint and diff checks pass. No publish/restart.
- Remaining acceptance: real database restart persistence/transaction rollback,
  all live cursor/full-bag/travel/Delve custody journeys and interaction movement.
  Current helper tests stub unrelated persistence/cursor services and do not prove
  those whole-system cases. Final cave approach/portals and P0 live survey remain
  next; pending authentication, outstanding asset approvals and wider P0–P6 content
  requirements still prevent publication.

## Lobby portal approach and stash custody audit — local implementation

- Lobby entry/exit preflight now checks the source space, active Delve, carried
  entity, mount, exact full-body landing and living state before teleporting.
  It provisions the practice target on entry and settles bow/equipment state;
  ordinary teleport cleanup continues to close inventory/dialogue sessions.
  Saved legacy Delve returns and existing Marlow portal rows are unchanged.
- A shared `hearthLobbyPortalApproachClear` predicate drives both the client
  prompt and authority: inclusive 1.5-tile radial reach, clear player/threshold
  bodies, matching terrain plane and unobstructed interaction segment. Astra
  found the initial client square-range mismatch and redundant legacy check;
  both are corrected. Generic portals retain their legacy range contract.
- Tests execute actual client targeting and authority portal functions, covering
  both exact radial boundaries, diagonal rejection, cliff plane, thin obstacle,
  blocked arrival, mount/carry/Delve/dead refusal and generic portal preservation.
  Targeted client/sim/world suite: 18 passed. Checked world build, client
  typecheck, targeted lint and diff checks passed. The preceding full world
  suite passed 719 tests; that run preceded the shared reach extraction.
- Private stash rows now participate in the read-only admin custody/content
  reference audit. Missing owners are reported without automatic destructive
  repair; occupied stacks contribute item references.
- Astra approved the bounded portal correction (43 focused tests independently).
  No exterior portal pair is activated. Live occupied-space/ID survey, actual
  cliff placement, entry/exit/Delve return journeys and restart persistence still
  require acceptance. No publication or restart performed; the wider patch
  remains incomplete.

## Willowharbour service interior foundations — local implementation

- Added six distinct shared layouts in `sim/hearth-interiors.ts`: inn with guest
  alcoves and widened rear kitchen area, compact general store, carpenter,
  furnisher display alcoves, compact smith and library/guild. Static IDs
  65520–65525 are provisional only: no content space rows, exterior portal pairs
  or NPC rows are activated for them pending the occupied-space survey.
- New `village_interior` terrain dispatch uses the same floor geometry as world
  authority. Exact furniture bases reach authority collision and client prediction;
  the game decoration painter and offline review share native furniture drawing.
  Customer frontage is two tiles from service anchors; workshop/smith counters
  are offset toward their working sides. Southern arrival/exit and a two-tile
  central path remain clear.
- Native study: `output/doc60/willowharbour-interiors.png` with provenance,
  SHA256 `05b2b21c8fb3ca78e66039e5d32e65e0f8fa087d3ac1b9d4ee5fbb3381f09d65`.
  Reproduce: `npx tsx packages/tools/src/render-hearth-study.ts output/doc60/willowharbour-interiors.png --interiors`.
  This is an unlit structural study, not a completed six-shop visual acceptance.
- Existing `tile_cf_interior_wall` is a transparent source region. Kept that
  legacy asset unchanged and imported a dedicated native plaster panel from
  `Interior_Walls.png` crop104,48 size16×48, anchor8,47. New
  `tile_cf_hearth_plaster_wall` remains a draft pending art approval. Atlas build
  completed normally (1091 assets); no validation guard was bypassed. Native
  three-course wall footprints are reserved against playable floors, including
  the inn guest rooms and furnisher connectors.
- Focused sim/engine/world suite:25 passed, including full-body swept paths to
  every service/exit/alcove, all projected wall cells, client terrain parity and
  actual content-registry authority furniture collision/air-water exclusion.
  Checked world build, client/tools/world typechecks, targeted lint and diff
  checks passed (unused local fixed after initial lint report).
- Astra supplied pre-layout guidance and reviewed the initial native study;
  corrections widened the kitchen area, varied counters and fixed temporarily
  colliding service points. Updated structural/native wall review requested.
- Still required: real merchandise fixtures rather than bookshelf placeholders,
  kitchen/forge/cooling details, full architectural edges/windows/lighting,
  catalogued display furniture, eight service NPCs and four residents, functional
  stock/contracts and portal journeys. These foundations do not fulfill the six
  enterable-service-interior requirement yet. No publication/restart.
- Updated Astra result: structural pass approved, independently25/25 tests;
  no new geometry blocker. Wall ends/skirting/doorway trim remain visibly
  unfinished. Require player-scale depth-sorted scenes with real NPCs and the
  southern exit before final visual acceptance.

## Willowharbour service roster and starter shops — local implementation

- Authored six `space:willow_*` indoor spaces at provisional IDs65520–65525,
  eight service NPCs and four residents at IDs4294966930–4294966941. Roles:
  Mara/innkeeper, Nell/cook, Tavi/storekeeper, Rowan/carpenter, Ada/furnisher,
  Bram/smith, Iona/archivist and Pip/harbour guide; residents Fern, Wren, Ellis,
  Otto. Each has a distinct runtime kind, dialogue and native actor asset.
  Existing starter NPC identities and services are preserved. Core service NPCs
  are stationary and available without time-of-day locks.
- Six real catalogues use ordinary commerce: fruit, five cooked meals, farming
  supplies/tools, construction materials/workbench, existing storage/lighting,
  and all eight common Shorehand gear categories. No higher rarity is offered
  for ordinary purchase. Cooked buy prices88/56/64/72/72 are twice base sale
  values; standing torch buy60/sell20. Other existing prices unchanged. This
  supplies common equipment acquisition but does not complete gear progression.
- Twelve introductory dialogues link actual shop frames where applicable and
  explain village services, free ferry destination choice and trained/effective
  skill ranks. Guide/archivist/resident dialogues contain no shop node. The
  existing merchant profile fallback is inert there because authority requires
  the active shop node for purchase. Quest-giver lists remain empty until real
  contracts are authored; dialogue is not claimed as contract implementation.
- Native player/NPC scale capture exposed counter and southern-door occlusion.
  Shopkeepers now stand beside their counters, customer frontage stays two tiles
  away, arrival is(16,24), exit interaction(16,25), and visual wall door remains
  at(16,28). These supersede the preceding interior foundation coordinates.
  No exterior portal pair exists yet.
- Desert trader source art contains only `idle`. Merchant draw and visual bounds
  now share the existing available-animation fallback, fixing the invisible
  storekeeper without rotating/replacing native art. Regression executes actual
  drawing and bounds; authored asset loading and portrait behavior retained.
- Updated capture `output/doc60/willowharbour-services.png`, SHA256
  `3bb044c932d65919dbae32b675262604ac735bc76032166225596cc116489b1d`,
  with provenance and authored NPC/exit-avatar fixtures. Unlit offline study;
  public exterior NPC positions and live service journeys are not verified.
- Checks:33 focused service/geometry tests,5 native-art tests; checked world build,
  client/tools typechecks, targeted lint/diff and content validation622 definitions
  pass. Wider world suite735 passed/2 stale count expectations failed; corrected
  lifecycle counts for12 new spawn/dialogue registrations and scoped exact starter
  projection assertions, then8/8 affected tests passed. Authority geometry tests
  now read the actual authored six spaces instead of synthetic debug-space rows.
- Astra reviewed roster, source choices and starter economy; updated scale/content
  review requested. The full furniture/plans catalogue, contracts, rich furnishings,
  final wall trim/lighting, public NPC placement survey and travel/commerce live
  acceptance remain open. IDs/content have not been published. No restart.
- Astra's updated bounded review passed (37 independent focused checks): all
  main merchants visible, exit avatar stays on visible floor, single-idle trader
  draw/bounds agree, starter shops match scope. No new blocker. Preserve Nell's
  separate kitchen approach when adding cooking fixtures; decorated-map survey
  and complete service interiors remain required.

## Public village access and first native furniture assets — local work

- Added a decorated-map access check that composes the actual village facades and
  scenery using native source dimensions/anchors, compiles the terrain and applies
  production4×4 prefab collision obstacles. Pip and all four residents are
  full-body clear and reachable from the ferry using swept movement. Test passes
  in about3 seconds. This verifies authored candidate geometry only; it does not
  replace the pending live occupied-map/ID survey.
- `render-hearth-study.ts --residents` now draws the authored public NPCs in the
  native village depth queue. Uses a3584×3584 view centred162,410 to include all
  five homes. Capture `output/doc60/willowharbour-residents.png`, SHA256
  `90ca9c481b255392aa222578377db94ee9b8414d42e15ed07f2576d486c85b00`,
  with source provenance. This is a static unlit candidate, not live dialogue or
  NPC schedule acceptance.
- Imported the reviewed first eight behaviour-spanning furniture crops from the
  native House_Decor sheets: ladder chair, timber dining table, green single bed,
  timber chest, gold woven rug, blue table lamp, wall mirror and potted foliage.
  Tool `packages/tools/src/import-hearth-furniture.ts` records exact source crops;
  `render-hearth-furniture.ts` renders native pixels into
  `output/doc60/furniture-first-eight.png` with source hashes and ordered manifest.
  Chest was corrected to its actual16×16 source cell instead of padded16×32.
- The rug's native48×48 canvas calls for a3×3 floor footprint, superseding the
  catalogue's provisional2×2 envelope. Furniture art remains draft/unapproved.
  No new furniture item, shop offer or recipe is claimed functional yet; placement
  support/ownership/layers, storage, seating and the remaining24+4 assets still
  require implementation. These assets do not complete the32+4 requirement.
- Targeted access test, tooling typecheck, lint and diff checks run for this slice.
  Astra crop/style/access review requested. No publication or restart.
- Astra's completed bounded review approves the eight native crops and confirms
  the decorated public-NPC access result. Table envelope is3×2 (native48×32),
  rug3×3 nonblocking; mirror1×2 visual wall attachment, lamp requires tabletop
  support; chair/plant use lower physical bases. Chest needs native open frames
  when storage behavior is connected. The eight native assets are now marked
  art-approved, superseding the draft flag above; functionality remains pending.
  Re-import preserves approval only when all source/crop/pixel metadata matches;
  unchanged re-import verified8/8 approvals retained. Contact-sheet provenance
  refreshed. Other pending Hearth asset approvals are unaffected.
- Reviewer still requires purposeful harbour, bridge, working yards and gardens;
  this access/asset pass is not final village composition or publication approval.

## Shared furniture placement preflight — local implementation

- Added `sim/hearth-furniture-placement.ts`, exported through sim, with reviewed
  first-eight shape IDs and distinct floor/standing/tabletop/wall layers. Placement
  envelopes and lower physical bases are separate; even-width bases use the
  boundary anchor that fits their declared cells. Metadata rejects nonfinite,
  oversized or negative bases. Authority must resolve these shapes by ID; client
  shape objects are not authorization.
- Pure preflight checks builder capability, bounded residence geometry, reserved
  approaches, same-layer overlap, containing tabletop support, south-facing wall
  support and physical occupant clearance. Rugs can lie below standing furniture.
  Plane-aware terrain checks reject projected wall cells; physical bases also
  check fixed collision obstacles. These two cases were found by Astra and fixed.
- Exit flood uses actual full-body swept movement and compares before/after
  reachable floor, preventing sealing an empty room as well as trapping current
  occupants. Exact occupant anchors must connect to the tested grid. Attachment
  dependency query is provided for support movement/removal gates; inventory and
  removal transactions are not bound yet.
- Tables declare inset support bounds and lift relative to their native baseline.
  First dining table has an upper3×1 support surface with20px lift; a lamp cannot
  occupy the leg row. Shared presentation-anchor helper avoids double-applying
  the upper row offset. Native parent-then-attachment fixture:
  `output/doc60/furniture-table-lamp.png` with provenance. Supported objects need
  parent-owned depth composition when wired into the gameplay renderer.
- Tests cover ordinary placement, rugs, overlapping furniture, support dependency,
  missing/outside/leg-row supports, mirrors, roles, bounds, reservations, occupants,
  sealed-room escape, projected walls, fixed counters, even widths and invalid
  bases.8 placement tests plus4 ferry tests pass; full sim typecheck passes after
  correcting an older ferry test fixture to use Int16Array elevations. Targeted
  lint, tools typecheck and diff check run. Astra independently confirmed8/8 and
  closure of both findings; native attachment fixture review requested.
- This is a shared rules/presentation foundation, not completed furniture gameplay.
  Still bind ownership from actual estate roles, consume/return inventory exactly
  once, persist support relationships, reject occupied storage removal, implement
  move/undo, preview errors and validate the live placement/custody journeys.
  No furniture items/recipes are advertised from this helper alone. No publish.
- Final bounded Astra attachment review passed: native lamp base contacts the
  tabletop correctly,8/8 tests independently pass. Preserve parent/attachment
  grouping in world depth. Tools typecheck initially caught a direct cross-package
  source import; corrected the renderer tool to use the public sim export and
  rechecked successfully. No remaining local check failure for this slice.

### Furniture persistence and native collision — local integration

- Added `sim/hearth-furniture-state.ts`: explicit stored definition wins over
  legacy kind; geometry comes from the reviewed catalogue. Stable attachment IDs
  use canonical decimal u64 strings without JavaScript number conversion.
  Corrupt state never invents a support or removes a standing base. Support
  changes preserve unrelated JSON; mutations reject corrupt state.
- The reserved attachment field stays outside authored state effects. World
  object state/light updates preserve it; malformed metadata rejects mutation.
  The dedicated furniture chest must use its own kind, since the legacy chest
  mirror intentionally replaces JSON with its open state.
- Server `collisionForSpace` and client `createClientCollisionMap` now replace
  recognized furniture's full-cell footprints with the same native lower bases.
  Rugs, mirrors and supported lamps do not gain floor obstacles. Carried rows
  remain excluded. Furniture collision is fixed; effects cannot switch it off
  or use a conditional collision contract that these geometry consumers ignore.
- Legacy spawn/carry/place-carried actions reject recognized furniture so they
  cannot bypass the forthcoming placement and support-dependency transactions.
  No furniture item definitions, purchase offers or dedicated reducers are enabled
  by this change. Actual residence scoping, support existence, inventory custody,
  move exclusion, storage-safe pickup and client controls remain required.
- 38 focused tests pass across placement, saved state, client collision and
  authored object runtime. Sim/engine typechecks, checked world build, targeted
  lint and diff check pass. Corrected the test fixture's fixed-unit assumption
  and missing terrain fields, and used the world's supported own-property API.
- Astra independently reviewed the adapter and both collision consumers, found
  the missing malformed-state light guard and fixed-collision effect mismatch;
  both were corrected and independently verified (30 focused tests). Bounded
  approval only; no claim of completed furniture gameplay or live persistence.
  Publication remains held for completion of the full patch.

### Furniture authority transactions and first item definitions — local implementation

- Added `placeHearthFurniture`, `moveHearthFurniture`, `pickupHearthFurniture`
  reducers and generated TypeScript bindings. They require authenticated persistent
  inventory access, a living unmounted actor with free hands, residence ownership
  context and the estate builder role. Placement recomputes shape and content
  eligibility on the server and checks bounded reach plus fixed-geometry sight.
- Placement protects residence arrival, exit and cellar approach, checks current
  occupants and escape connectivity, and consumes one carried item after preflight.
  Same-space uncarried rows supply support links; corrupted furniture state blocks
  mutation. No client-provided geometry or global support lookup is trusted.
- Moves update the same placeable ID, coordinates, chunk and attachment JSON;
  storage, provenance and light state survive. Old furniture geometry is excluded
  from the placement baseline, then the shared validator adds the remaining bases.
  Supports with attachments and open containers cannot move or be picked up.
- Pickup refuses occupied/processing storage and a full bag. It returns exactly
  one item with its light state and deletes the row/empty slots/provenance only
  after a complete inventory insertion. Repeated pickup cannot reimburse twice.
  These first definitions are nondurable; placement and pickup explicitly reject
  durable definitions until a condition-preserving furniture contract exists.
- Closed the direct legacy homestead placement and demolition paths as well as
  the previously guarded behavior actions. Furniture cannot enter salvage refunds
  or bypass support/exit rules through old building APIs.
- Added eight matching item/object definitions to the native art/shape catalogue:
  chair, dining table, bed, chest, rug, lamp, mirror and fern. Residence-only
  placement, fixed collision and builder role are authored. Chest has independent
  private16-slot storage and its own runtime identity; lamp has steady switchable
  light. Catalogue count is638. No furniture shop offers or recipes yet.
- Five extracted-authority tests pass, including actual inventory load/write,
  consume and insertion helpers: an unlit lamp round-trips, incompatible lit-state
  stacks in a full bag reject without mutation, and a compatible stack fills.
  Tests also cover role/space/Delve/mount rejection, missing/cross-space support,
  attached support refusal, stable stored contents on move and duplicate pickup.
  This proves local execution, not live transactional restart/connection acceptance.
- Broader content/object/authority suite:128 passed; two catalogue contract tests
  also pass. Updated stale pre-village NPC, stash-frame and pack-count/hash fixtures;
  equipment tests now select actual equipped items rather than all volcanic materials.
  Checked world build, content export/validation, sim typecheck, targeted lint and
  diff check pass. Bindings generated through the normal CLI without publication.
- Astra independently confirmed the nondurable guard and actual inventory-helper
  evidence, with16 focused tests passing. No new bounded transaction blocker.
  Still implement furniture controls/ghosts/undo, native parent/attachment rendering
  and lighting, open-chest animation, bed/chair behaviors, full32+4 catalogue,
  recipes/licenses/offers, expanded cottage layouts and live acceptance. No publish.

### Furniture gameplay rendering — local integration

- Added a shared persisted-row scene projection and stable parent/attachment
  draw grouping. Same-space uncarried support must contain the tabletop footprint;
  orphan, cross-space, carried-parent and out-of-surface attachments are withheld.
  Attachment art uses the reviewed native lift while sampling its parent's floor
  contact for terrain projection. Stable ordering draws parent before lamps even
  when subscription insertion order is reversed.
- Actual client placeable producer now draws furniture from these groups, with
  rugs in the surface phase below actors. The shared painter retains a producer's
  requested phase; ordinary producers still default to entity depth. Native
  furniture uses authored assets rather than legacy kind rendering fallbacks.
- Client object presentation accepts the reserved canonical support ID without
  treating it as authored state. Supported lamp lights follow the shared visual
  anchor and parent contact plane. Off-state lights remain disabled.
- Astra found a missing-parent visual hazard: corrupt or still-loading table art
  could leave a floating glowing lamp. Both actual producers now require a valid,
  loaded parent before showing attached art/light; collision remains intact.
- Four focused files/14 tests pass, including actual placeable and decoration
  producers with the real presentation cache. Assertions cover table88,96 /
  lamp88,76, steady emitter88,56 and floor contact96, grouped commands, rug phase,
  and suppression for corrupt/loading parent art. A separate retained-painter test
  proves a rug sorts below an actor north of its baseline.
- Native `output/doc60/furniture-table-lamp.png` now uses the shared scene/group
  projection, including deliberately reversed input order; contact remains correct
  on visual inspection. Provenance includes the grouping source hash. This fixture
  is not a furnished-room day/night or actor-depth-crossing acceptance capture.
- Normal atlas build passed:1099 assets,9 categories,39 pages per season. Client,
  sim and tools typechecks, checked world build, targeted lint and diff check pass.
  Astra independently verified the parent-art/light fix and14/14 tests; bounded
  review approved. Controls, placement ghosts, move/pickup/undo UX, catalogue and
  room-level Basic/Dynamic visual acceptance remain open. Nothing published.

### First furnishing controls — local integration

- Residence builders can enter the existing build palette with B. It switches
  to FURNISH, eligible furniture items and intact pickup language, hiding exterior
  upgrades. Exterior building keeps its existing behavior. The current-estate
  subscription supplies residence ownership/member context; authority still
  validates every request. Added typed network wrappers for all three reducers.
- Residence previews use a separately retained collision baseline excluding
  furniture bases while retaining fixed furniture, terrain and other obstacles.
  Shared placement rules add the current furniture bases once. Preview draws
  full logical footprint cells and native composed art; tabletop support is
  inferred from the actual containing surface. Click sends its stable ID.
- Added shared definition eligibility used by server placement, palette and
  preview: active nondurable item, reviewed shape, residence placement, fixed
  matching collision. Corrupt existing state produces a repair-needed preview.
- Pickup targets the top logical layer first, allowing lamp-before-table and
  furniture-before-rug. Known attachment, reach and active-container failures
  show red with reasons. Otherwise selection is amber with explicit bag/storage
  validation on click, since remote private storage and concurrent activity
  cannot be promised from the client. Pickup routes to intact-return authority.
- Cached preview validation by collision/content/resource revision, builder
  permission, tile/item, quantity and actor/occupant positions. An extracted test
  of the actual adapter proves120 unchanged frames invoke the validator once;
  inventory, movement, geometry and row revisions invalidate it. No repeated
  escape flood while hovering over unchanged geometry.
-15 focused tests pass across control helpers, actual preview adapter cache,
  authority transactions and palette. Corrected occupant test coordinates to
  reflect the actual player body's six-pixel foot offset. Client/UI/sim typechecks,
  checked world build, targeted lint and diff check pass. Astra independently
  confirmed15/15 and closure of preview cost, pickup feedback and eligibility
  parity findings.
- This enables the initial keyboard/mouse placement and pickup loop locally;
  complete move/undo and touch affordances, active-state feedback, shop/recipe
  acquisition, full catalogue and real rendered room journeys remain required.
  No deployment or publication.

### Furniture move and last-move undo — local integration

- Added a two-click furniture move tool and last-move undo through the existing
  authoritative move reducer. The destination preview excludes the source row,
  retains attachment constraints and infers the destination tabletop support.
  Moves preserve stable IDs, storage and authored state; no local inventory edits.
- Geometry carries a canonical u64 revision. Moves require the expected revision
  and increment it transactionally; stale inverses fail even after an intervening
  move away and back. Legacy rows begin at zero. Light/state effects preserve the
  geometry revision and support metadata without exposing either as authored state.
- Client history clears on identity/session/room/permission changes. Operation
  ownership prevents an unresolved old request from blocking or unlocking a new
  session. Corrupt selected state produces repair feedback instead of escaping
  the pointer handler. Astra confirmed closure of these two review findings.
- 50 focused tests pass across controller races/inverse requests, moving preview,
  cached preview, palette controls, actual authority transactions, metadata,
  authored state effects and client presentation. Client/UI/sim typechecks,
  checked world build/code generation, targeted lint and diff check pass.
- This is last-move undo only. Placement/pickup undo, touch affordances, final tool
  art and actual rendered room acceptance remain open alongside the full patch's
  acquisition, catalogue, town/island composition and release gates. No publish.

### First-eight furniture acquisition and production crafting — local integration

- Willow furnisher now offers the eight reviewed finished furniture items and
  individual plans. Reading consumes one document through existing authored
  effects and adds the persistent recipe shortcut. Plans cost rounded-up half of
  finished price and sell for zero; existing finished resale is below both its
  purchase price and every recipe's raw-material sale opportunity value. Totals
  are 1,310 bronze finished and 670 for plans. These are initial test prices.
- Eight workbench recipes use the reviewed catalogue materials and produce the
  exact same item definitions as the shop. Knowledge remains a reusable shortcut,
  consistent with existing crafting authority, rather than a new permission gate.
- Fixed overlapping shapeless recipes: the UI prefers its selected matching
  recipe, and craft authority validates that exact requested recipe against the
  real grid. Craft-all keeps that selection across iterations, never switching
  to planks or another cheaper recipe. Retired and unknown recipes are rejected.
- Added shared quantity-aware grid targets for visible ghosts and the actual
  atomic fill helper. Large recipes use stacks, split by current max-stack rules;
  small/shaped layouts remain intact. Production fill resolves current content,
  tops up partial cells from multiple carried stacks, and never swaps a target
  with same-kind ingredients having incompatible lit/durability metadata.
- Astra found and helped close an initial production-path gap (the client move
  planner is not the live autofill route) and the incompatible-metadata swap
  edge. Tests cover actual atomic fill and extracted craft reducer callbacks,
  selected-result UI dispatch, full-bag/cursor failure, live recipe revisions,
  split stacks, source immutability and economy margins. 188 focused tests pass;
  UI/sim/client typechecks and content validation pass. Pack now has 654 entries,
  deterministic prefix cae30759.
- Still required: purchase material/footprint previews, full 32+4 catalogue,
  plan-reading and purchasing live acceptance, other village services/quests and
  all broader release gates. No publication or deployment.
- Final checked world build, targeted lint and diff check also pass. Astra
  independently confirmed 50/50 tests and closed the bounded helper review;
  this does not approve the full patch for publication.

### Furniture purchase inspection — local integration

- Furniture offer names/art open a dedicated inspection view; plan documents
  resolve their taught recipe's output through authored references and show the
  actual piece. Details include offered name, plan versus finished identity,
  current offered price, canonical occupied footprint/layer, station and every
  ingredient quantity. The mirror correctly reserves1x2 despite its tall art.
- Catalogue/Escape return without spending. Add to Cart/Enter add one through
  the existing bounded cart controls and never invoke purchase. Touch inspection
  occurs on release and cancels after a list swipe. Description scrolling uses
  the shared scrollbar with wheel, keyboard and touch; controls stay outside
  the text region. Hidden filter focus is released and stale offers clear detail.
- Native offline render caught the existing custom-shop frame exceeding compact
  width because hidden authored inventory panes imposed their minimum sizes.
  The modal now projects an authored-style surface with a minimal synthetic pane,
  leaving authored source panes unchanged and honoring the visible modal bounds.
  The corrected360x270 fixture has complete borders, readable artwork/materials,
  separated price and buttons: output/doc60/furniture-purchase-details.png, with
  source/atlas hashes and reproduction flags in its provenance file.
-21 focused interaction/detail tests pass. UI/client/tools typechecks, targeted
  lint and diff check pass. Astra reviewed resolution, interaction and native
  readability; final compact-frame correction is awaiting its closure note.
  This is an offline native fixture, not live purchase/read journey acceptance.
  The full catalogue and wider content/release gates remain open. No publication.
- Astra subsequently viewed the corrected native screenshot and closed the
  compact-frame/readability review; both borders fit and details/buttons are clear.

### Full 32-piece base catalogue — native art and local content integration

- Added the remaining24 base pieces from the independent source review. All32
  now have native assets, item/object definitions, residence placement shapes,
  finished-item offers, individual learnable plans and workbench recipes. Pack
  contains750 definitions, deterministic prefix2579af47. Authoring preserves
  existing entries and requires reviewed shapes and existing crops before writing.
- Exact source manifest committed at packages/tools/src/hearth-furniture-crops.json;
  reviewed economy table and additive authoring script sit alongside it. Native
  shapes supersede provisional sizes: horizontal2x1 runner with small fringe,
  actual2-wide desks/tables,3x3 large rugs,2x1 washstand,1x1 range and flowering pot.
  No fabricated rotations/recolors/composites. First dining table now retains
  native alpha shadow fringes with its unchanged physical contact anchor.
- Wardrobe/shelves/cabinets use existing private16-slot storage and intact-return
  furniture custody. Range has an actual native off/burn pair bound to lit state
  and the existing cooking processor/frame. Floor lamps use measured-23px
  emitters; dark-grate hearth-8 and range-6, bounded3tile radii. Range lifecycle
  and new storage behavior still require actual room journeys.
- Astra compared34 imported frames/28,678 pixels against source: zero differences,
  including alpha. Bounded ART approval granted and flags applied to32 assets.
  Native all-piece contact sheet and four shared-scene table/lamp fixtures are
  output/doc60/furniture-base-catalogue.png and furniture-table-surfaces.png.
  All four tabletop contacts were reviewed as plausible; this is not complete
  full-body room access or lighting acceptance.
-62 focused tests pass across content/shape/acquisition, shared placement/scene,
  authority, state presentation and crafting. World build/content validation and
  sim/client/UI/tools typechecks pass. Normal atlas build completed1123 assets,
  nine categories,39 pages per season. Palette shifts upward to keep the32-piece
  base catalogue inside a320x180 viewport (dedicated containment test added).
- Remaining P4 work includes four expedition trophy variants, functional seating,
  catalogue placement usability at compact sizes, source-backed room construction
  and expansions, full day/night/touch/two-builder/live acquisition journeys.
  Larger patch village/island/combat/release gates also remain open. No publish.
- Final palette containment check passes4/4; corrected its test-only layer type to
  the existing `prop` UI category. Targeted lint and diff check pass.
- Full assets:validate remains failing:69 older native-palette assets still need
  approval, plus the existing tile_cf_hearth_plaster_wall is16x48 where tile assets
  require16x16. There are no prop_cf_furniture validation errors. Full evidence:
  output/doc60/base-catalogue-asset-validation.log. These release blockers are not
  waived by the successful atlas build or bounded furniture art approval.

### Interior wall asset format correction — local integration

- Reclassified the complete native16x48 plaster panel as
  prop_cf_hearth_plaster_wall in props rather than a16x16 terrain tile. Updated
  both OverworldArt loader references and native-study provenance. Kept all
  frame pixels, source palette, dimensions and anchor8,47 unchanged; ground
  cache already draws source dimensions and therefore retains the full wall.
- Astra compared all768 pixels with Interior_Walls.png crop104,48: zero
  differences. Bounded native-art approval applied. Normal atlas rebuild passes
  with1123 assets,9categories and39pages per season.
- Rebuilt all six interiors through GroundChunkCache and actual gameplay depth
  drawing. output/doc60/willowharbour-interiors.png shows the full-height walls,
  service NPCs and southern exits; updated provenance names the prop source.
  This remains an unlit structural fixture, not room-design/lighting completion.
-19 focused interior tests and engine/tools typechecks pass; targeted lint and
  diff check pass. Full asset validation now reports68 older unapproved native
  assets only; the wall-size and wall-approval errors are resolved. Evidence:
  output/doc60/interior-wall-asset-validation.log. No publication or deployment.
- Astra viewed the rebuilt six-interior image and closed wall integration: full
  panel height and floor boundaries remain intact, with identical fixture pixels
  across the final approval/atlas refresh. Room finish and live acceptance stay open.

### Furnishing catalogue collapse — local interaction integration

- Choosing a furniture piece, pickup or move collapses the catalogue into a
  32-pixel bar, freeing the room for placement at the 320×180 minimum UI size.
  Enabled last-move undo also collapses it; disabled undo leaves it open.
  Clicking the bar reopens the catalogue without issuing a world action or
  changing selection. Reopening build mode or changing home/session opens it.
- The compact bar retains the selected native icon and shows current placement
  failure/pending/custody status, falling back to the selected piece/tool name.
  Astra identified the initially missing status and that feedback is integrated.
- Five palette tests pass, including world hit passthrough and scope changes;
  UI/client/tools typechecks, targeted lint and diff checks pass. Native render:
  output/doc60/furnishing-compact-bar.png, with reproducible provenance. This is
  an isolated UI fixture; actual furnished-room and touch acceptance stay open.
  No publication or deployment.

### Willowharbour native furnishing — local room composition

- Replaced legacy placeholder beds/tables/chairs/bookshelves in six interiors
  with native catalogue pieces. Inn guest rooms now have distinct beds/storage,
  a kitchen range and hearth; the furnisher has four bedroom/dining/lounge/bath
  display alcoves including a supported table lamp. General store cabinets,
  workshop benches/chests and smith hearth/storage distinguish service roles.
- Static furniture now shares player-home physical bases and presentation anchors.
  Rugs enqueue as surface/flat light receivers; tabletop decorations draw with
  their support at its contact depth. Original reserved service/exit aisles remain.
- Astra reviewed native room captures, identified an obscured inn grate and a
  missing flat rug receiver. Both corrections are integrated. Final capture:
  output/doc60/willowharbour-interiors.png and its updated provenance.
- 26 focused tests cover terrain parity, continuous full-body arrival/service/exit
  access, native footprints, tabletop support, wall courses and receiver grouping.
  Sim/engine/client typechecks and targeted lint pass. Static emitter lighting,
  wall trim/windows and live shop journeys remain open. No publication/deployment.

### Willowharbour static lighting — local integration

- Service-room lamps/hearths now produce point lights from their active catalogue
  light components. Permanent showroom fixtures resolve lit=true; the cooking
  range draws its authored burn frame. Parent/item art guards prevent invisible
  emitters; table-lamp source height and receiver contact use the shared support
  anchor. Added standing lamps to the general store, workshop, inn and archive.
- Gameplay decorations submit the shared lights through normal visibility and
  terrain projection. 27 interior tests pass, including every room having an
  emitter, exact supported lamp height/contact and missing-parent suppression.
  Engine/client/tools typechecks, targeted lint and diff checks pass.
- Offline renderer now supports interiors with --basic/--dynamic and a same-
  Dynamic --no-interior-lights control. It initializes opaque room backdrops
  before multiplying lighting, correcting the fixture's transparent void tint.
  Captures: output/doc60/willowharbour-interiors-basic.png,
  willowharbour-interiors-dynamic.png and willowharbour-interiors-dynamic-control.png.
  On/control delta measures 13,501 changed pixels, RGB sum +98,307; the showroom
  lamp patch has 1,546 changed pixels and the inn grate patch 244. This establishes
  subtle local contribution at current warm indoor ambient, rather than relying
  on a Basic-versus-Dynamic comparison. Detailed delta: interior-emitter-difference.json.
- Astra requested the backdrop correction and same-renderer control; integrated.
  Live room traversal, switching personal lamps, day/night and device acceptance
  remain open; static service lamps are permanent fixtures. No publication.

### Seating admission model — local foundation, not yet playable

- Investigation found sitting only in the generic action registry: no furniture
  reducer/client route or modular character action mapping currently implements it.
- Added sim/hearth-seating.ts with a shared one-occupant-per-piece admission plan
  for the six base seats. It reconstructs physical furniture collision, checks
  a short unobstructed full-body approach, rejects occupied seats and requires a
  clear nearby standing destination with the seat's own base restored. A blocked
  actor start is explicitly rejected rather than relying on movement's escape
  allowance. Ten focused geometry tests, sim typecheck and targeted lint pass.
- Astra inspected native source: rows50–52 are two-frame down/right/up straddle
  poses; all24 action layers and four armour sources fit existing32×40 crops.
  Bare hands down/up are intentionally empty and must not fall back to idle hands.
  This is a seating adaptation, not a proven chair-specific source animation.
  Preliminary native composition suggests action draw-anchor offset+12px from
  seat anchor for chairs/stool/upholstery, +8px for bench; parent-contact grouping
  and actual renderer captures are required before accepting the visual mapping.
- Remaining: import modular poses, seated authority/custody and interruption,
  interaction prompts, parent/actor render grouping, occupied-seat move guards,
  reconnect/stand journeys. The planner alone does not make seating playable.
  No publication or deployment.

### Native seated character poses — local rendering integration

- Canonical modular rows50–52 now import as sitting_down/right/up (two frames,
  looping) for24 action layers and4 armour layers. Character action resolution
  treats sitting as body-only. Source-empty directional hands remain transparent.
- Added engine/hearth-seating-scene.ts: one parent/actor draw group, south-facing,
  +12px reviewed actor anchor for chairs/stool/upholstery and+8px for bench.
  Native game-renderer fixture output/doc60/seating-native-poses.png shows both
  frames across all six seat types; Astra accepted the contacts as a straddle
  pose adaptation. Authority position and safe stand geometry remain separate.
- Review/test caught the old action extractor's universal non-loop metadata.
  It now honors canonical entry.loop; action/armour sitting metadata both use2fps.
  The eventual gameplay action clock must also honor this seated cadence.
- Exact source test covers28assets/168frames/215,040pixels with zero differences,
  including intentional empty hands, source crops, loop and FPS. Fourteen tests
  pass across native import/character contract/seat geometry suites; engine/tools
  typechecks and targeted lint/diff checks pass. Normal atlas rebuilt1123assets,
  now40pages/season due added modular poses; no renderer guard was bypassed.
- This is visual infrastructure only: authority sit/stand/reconnect/occupation,
  client prompts and gameplay depth-group integration remain unfinished. No publish.

### Furniture seating authority — local integration, controls pending

- Added private player_seat custody with identity primary key and unique seat ID,
  plus sit/stand reducers. Admission rechecks invited residence access, health,
  free hands, combat/jump/bow/input readiness, current content and shared geometry.
  Standing recomputes room collision and occupants; no saved destination is trusted.
- Movement input now treats seating as an exclusive previous run: a fresh held
  direction stands first, blocked attempts discard run history, and only a fresh
  successful packet preserves held direction. Explicit/clock standing resets input
  queues, acknowledgements and credit. Seated packets acknowledge their sequence
  even when standing fails, without banking movement. Normal physics skips seated
  bodies rather than pushing them out of their chair each tick.
- Furniture move/pickup and admin object mutation reject occupied pieces. Teleport
  releases custody; orphan deletion releases it if the actor's current body is
  clear. Same-space external relocation clears custody without moving the actor
  back. A corrupted missing-seat state with blocked current body still requires
  safe relocation; this slice does not invent an unchecked teleport destination.
- Seventeen focused tests exercise actual reducer/standing/setInput bodies plus
  shared geometry, including visitors, occupied seats, revoked access, blocked
  exits, held-key wake, blocked200-tick interval, replayed input and orphan recovery.
  World checked build is clean; targeted lint and diff checks pass. Build wrapper
  now also rejects `Error: Errors occurred:` diagnostics even if CLI exits zero;
  reproduced failure/success stub checks confirm exit1/exit0 respectively.
- Client generated bindings, prompts, seating render-group integration, authority
  restart/role-revocation/cleanup journeys and live acceptance remain pending.
  No publication or service restart.

### Seating controls and gameplay rendering — local integration

- Generated local module bindings for sit/stand without publishing; connection
  methods now invoke the reducers. Normal E/touch Interact shows Sit for eligible
  faced seats and Stand while seated. Dedicated seat footprint targeting ignores
  floor rugs and recognizes both columns of benches/loveseats.
- Player producer resolves the parent from authoritative sitting/contact state,
  never predicted/interpolated coordinates. It draws one seat/actor group at the
  parent's floor depth with the reviewed2fps pose (reduced motion freezes frame0).
  The ordinary placeable producer suppresses that occupied seat. Seated hidden
  held tools no longer leave a held-light source behind.
- Astra identified prediction/culling drift and rug-first targeting. Both are
  corrected: reconciliation discards pending movement on every seated frame,
  local physics freezes but still sends movement intent for authority standing;
  labels, anchors and culling use the seat pose position before producer submission.
- Thirty-two tests across six suites pass, including actual local/remote painter
  producers with prediction/interpolation displaced9000px, one parent draw,
  rug-first/two-column targeting, repeated seated prediction suppression,
  reconnect regressions and authority/geometry tests. Client typecheck, targeted
  lint and diff checks pass. Existing native pose fixture covers sprite contacts.
- Real authenticated multiplayer/touch journeys, occupied-seat restart and content
  mutation/role-revocation acceptance remain open. No publication or restart.
- Follow-up review caught a double-subtracted player foot offset in seated
  projection sampling. Seated labels/targets now sample the parent contact
  directly; the actual producer test uses a nonzero, sample-dependent projection
  and passes for local/remote players (2/2), with targeted lint passing.


### Residence expansion envelope — local groundwork

- Persisted homestead `residenceExpansionRank` defaults to zero; generated local bindings updated. No purchase reducer or migration that grants rooms exists yet.
- Starter room remains x3–12/y3–12 in a16×16 space. Rank1 adds east10×10 room and3×3 hall; rank2 adds south10×10 room and3×3 hall. Both expanded envelopes are32×32. All original floor, furniture coordinates and portal points remain unchanged.
- Shared geometry drives engine terrain and server collision; rank participates in both terrain caches and client presentation key. Rank1→2 changes presentation without requiring different streaming bounds.
- Shared `residenceReservedTiles` protects portal approaches, halls and both mouths in client furniture preview and server destination validation. Future internal construction must consume the same reservations. Purchase preflight must reject existing obstructions or invalidated wall supports.
- Astra independently reviewed layout/connectivity/cache parity; accepts this bounded geometry, not visual/building completion. Native residence walls still need replacement and projected-footprint validation.
- Validation:19 focused geometry/furniture tests pass; client/world typechecks, local binding generation and checked world build pass. Integration test lives in tools to keep browser engine dependencies out of server compilation.
- Still pending: upgrade economy/purchases/UI, full-body furnished expansion journeys, native architectural walls/floors/doors/windows, restart/migration proof and live testing. Nothing published.

### Residence expansion safety preflight — local shared implementation

- Added `hearthResidenceExpansionFailure` for sequential ranks and a correctly sized proposed envelope. Authority will supply the proposed collision with architectural obstacles and persisted furniture; this helper does not charge money or change rooms.
- Added layout-wide furniture validation: supports, native wall requirements, same-layer overlaps, reserved approaches, full-body escape and exact occupant-to-grid travel. Existing records are read without relocation or recreation.
- New-room access probes use reserved hall centres and room mouths; requiring every reserved edge cell to fit a standing body was too strict. Probes also avoid arbitrary room centres that may legitimately contain existing furniture.
- Astra reviewed the preflight and identified offline seated visitors as a potential upgrade blocker. Added an explicit seated-occupant input: verifies actual seat/custody coordinates, calculates a safe stand route against all other occupants, then checks that virtual destination can reach the exit. Actual actors/custody remain unchanged. The authority caller must partition standing/seated occupants from persisted rows.
- Validation:30 focused tests across four suites pass, including geometry/authority parity, existing furnishings, doorway obstruction, invalid wall/tabletop support, disconnected halls, rank guards, exact occupant collision and offline seating. Sim typecheck and targeted lint pass.
- Still not wired to a purchase reducer or UI; no economy values assigned, no publication. Architecture/wall rendering and live transactional/restart validation remain outstanding.
- Astra follow-up closed the seated-guest finding with no additional material issue. Virtual standing destinations prove each guest's ability to leave; they are not a simultaneous teleport plan. Purchase must preserve current actor positions and seat custody.

### Native residence wall rendering — local architectural fixture

- Residence terrain now draws the reviewed16×48 native plaster wall instead of the legacy interior-wall sheet. Each panel must occupy three blocked courses immediately north of walkable floor; it cannot project over another room or outside the map.
- Ground-cache wall pass includes the next two anchor rows beyond a chunk, allowing the canvas to clip overhanging courses at chunk boundaries. Existing Marlow and village paths remain separate.
- Added offline `render-hearth-study.ts --residence` fixture for all three purchased envelopes through actual GroundChunkCache/atlas loading. Output: `output/doc60/residence-expansion-walls.png` and source-hashed sidecar. Labels below rooms keep wall pixels visible.
- Validation:14 geometry/cache/engine-authority tests pass; engine typecheck and targeted lint pass. Wall counts10/23/30 match rank0/1/2 and no three-course footprint intersects playable floor. Fixture visually inspected locally.
- This proves native north-facing wall placement only. Doors, windows, perimeter trim, modular architecture, furnished gameplay/lighting and live journeys remain incomplete. No publication.
- Astra accepted the three authored ranks but requested actual cache-boundary evidence. Added a fourth synthetic room with wall base at row16; actual GroundChunkCache output is compared byte-for-byte against the uninterrupted rank0 wall. All30,720 pixels match (zero RGBA differences); fixture generator fails on differences and records the result in its sidecar. Current fixture is4096×1024, including this synthetic fourth panel.

### Residence expansion purchase authority — local integration

- Added owner-only `purchaseResidenceExpansion(expectedRank)` reducer. Owner must be at estate/home; current rank must match expected rank. Initial testing prices are3,200/4,200 bronze from the existing Astra catalogue economy baseline (roughly9/12 proposed350-net orders). Actual repeatable order pacing remains unproven; these are not release-balanced prices.
- Collision helper accepts a proposed rank without mutating the home. It retains fixed surfaces/obstacles while excluding movable furniture for shared preflight. Sequential quote, wallet sufficiency, geometry, furniture/support, occupant and persisted seat-custody checks all run before wallet/home writes.
- Purchase updates wallet and home rank, records spending, and grants no farming/combat XP. It never rewrites furniture/storage, moves occupants or clears seat custody. Expected rank rejects duplicate clicks before charging a second expansion.
- Regenerated local bindings and added network wrapper. No purchase UI yet.
- Six tests invoke the actual reducer AND actual collisionForSpace helper with fake database tables: both ranks/prices, duplicate/max rejection, funds/nonowner rejection, doorway furniture obstruction, offline seated guest preservation/mismatched custody, and a fixed hallway obstacle retained in proposed collision while persisted rank remains unchanged. Tests prove local control flow, not database transaction/restart semantics.
- Local generation and checked world build pass; targeted lint/diff check pass. Publication remains held. UI, modular construction, pricing gameplay and live/restart acceptance remain open.
- Client/world typechecks pass. Astra independently ran all six purchase tests and closed the requested collision/custody coverage, while retaining live transaction/persistence acceptance as open.

### Residence expansion purchase UI — local integration

- Added a fourth furnishing tool (`+`, hover text ROOM EXPANSIONS). The32 base pieces plus4 tools occupy exactly36 cells/four rows at320×180. Opens a separate detail view; opening it does not purchase.
- Detail view shows next room,10×10 dimensions/connecting hall, exact shared quote and wallet. Owner-only purchase, insufficient-funds, pending and completed states are explicit. Client submits the displayed expected rank through the new network wrapper; authority remains responsible for all checks/debits.
- Pending state stays latched until the authoritative home rank changes; rejection allows retry. Scope/rank changes clear stale state. Each operation has a monotonically increasing token, so an old rejection after leaving/re-entering the same room cannot unlock a newer operation.
- Native fixture `output/doc60/residence-purchase-ui.png` reviewed locally at320×180/UIscale3; button labels corrected to centred inset text following Astra feedback.
- Nine palette tests cover compact bounds, furnishing controls, explicit purchase, rank update, owner/funds/max guards, rejection retry and leave/re-enter request ownership. Client typecheck and targeted lint pass.
- No authenticated live purchase/touch/reconnect journey yet. Final architecture, modular construction and economy playtesting remain open; nothing published.
- Astra follow-up independently passed9/9 palette tests and closed both request-token and label-alignment findings. Live acceptance remains open.

### Modular residence architecture — shared composition groundwork

- Added typed sparse cells for rustic/townhouse floor finish, one-tile physical partitions, supported contiguous doorway openings and wall-supported windows. Complete layout composition rejects unpurchased cells, duplicates/invalid definitions, approach partitions, missing window support and missing jambs. Floor finishes may cover reserved approaches and sit beneath furniture.
- Planner preserves baseline collision/fixed obstacles and does not mutate input cells. Structural footprints reject fixed or movable furniture overlap. Each doorway needs a sampled full-body crossing with fixed AND movable furniture present, independently of whether another route exists.
- Whole-layout preflight checks furniture/attachments, occupants and every free standing cell's route to the exit; empty sealed rooms are rejected. Existing seating custody must be resolved to verified virtual standing points by the eventual authority caller.
- Astra source review recommends native low cutaway bands for one-tile internal partitions; filler sheets are materials, not invented perspective corners. Full-height window visibility needs a cutaway policy. No architecture art rendering is connected yet.
- Eight architecture tests pass, including fixed/movable obstacle regressions requested by Astra. Existing furniture and residence-purchase regression suites pass; sim typecheck/targeted lint pass.
- This is shared logic only: persistence, reducers, inventory/material accounting, architecture UI and native art still need implementation. No publication.
- Astra follow-up independently passed16/16 architecture/furniture tests and closed both obstacle-overlap and unusable-doorway findings. Persistence/native rendering/live acceptance remain open.

### Revisioned construction edits and material provenance — local shared planner

- Added version1 construction state with u64 revision and batches of up to32 unique cell edits. Expected revision rejects stale builder actions; unchanged/removal-repeat requests have no state or material effect.
- Immutable v1 recipes define material value per authored component (floor, wall, doorway, window). Replacement nets old/new materials; demolition returns the recorded recipe-version value. Implicit starter flooring is never refundable. Windows must be removed before their supporting wall.
- Added strict JSON state codec: exact decimal u64 revision, known recipe version/components, bounded coordinates/count/size and duplicate-cell rejection. Unknown future/corrupt paid state is rejected instead of silently losing or revaluing construction.
- Astra found that current-world validation of the old layout could prevent repairing an obstructed doorway. Prior refundable components are now validated against immutable purchased-room geometry; only the proposed result must satisfy current furniture/obstacle/occupant/escape checks. Safe-removal regression verifies this repair path.
- Ten edit/codec tests pass, including charge-once/refund-once, concurrent revision, replacement netting, attachment removal order, exact u64 persistence and obstructed-doorway repair. Sim typecheck and targeted lint pass.
- No persistence table/reducer or inventory mutation is wired yet. Authority must enforce reach/role, resolve seating, verify all material consumption/refunds fit, then commit inventory and state atomically. Native architecture rendering/UI and live acceptance remain open. No publication.
- Astra independently passed10/10 edit/codec tests and closed the repair finding. Sim typecheck passes after retaining the material-key tuple's literal types. Atomic inventory/refund integration remains open.

### Construction inventory pre-commit planning — local integration

- Added live-content-aware signed material inventory planner. Only hotbar/active backpack fund construction; compatible metadata and slot restrictions are respected. Equipment/crafting/cursor/storage remain untouched.
- Consumes on copies, then chunks refunds through the existing live-resolver quickMoveItemStack path. Any shortage or partial/full refund failure returns only an error; no partial inventory snapshot is exposed.
- Added combined `planHearthConstructionTransaction`: revision, geometry and material planning must all succeed before returning construction state plus inventory for an eventual atomic reducer commit.
- Rejects occupied rows beyond active capacity, mismatched container IDs and malformed occupied quantities before copying/padding slots. This prevents silent loss from truncated malformed inventory. Existing stacks above a recently lowered live cap remain intact.
- Eight inventory/integration tests pass: cross-container consumption, metadata/read-only/equipment guards, live refund caps, full-refund failure, invalid deltas, overflow-row preservation, malformed quantities and combined state/inventory success-or-failure. Sim typecheck and targeted lint pass.
- Still a pre-commit planner, not a database transaction: persistence/reducer integration, seating/reach guards, native rendering/UI and live restart/refund tests remain unfinished. No publication.
- Astra re-read the final eight-test version, independently passed8/8 and closed overflow/malformed-stack/combined-failure coverage. Actual database atomicity remains unverified.

### Construction persistence and authority — local integration

- Homestead now stores `residenceArchitectureJson`, defaulting to empty version1 state. Regenerated local bindings and added typed client reducer wrapper. Dynamic space definitions/presentation keys carry the saved state.
- Engine and authority terrain read identical saved construction through strict shared parse/composition. Invalid state blocks the affected home's collision rather than deleting walls or crashing an entire world tick. Authoring rejects invalid paid state for repair.
- Added `editResidenceArchitecture(expectedRevision, editsJson)`: builder/auth/liveness/residence guards, strict bounded edit decoding, expected revision and reach checks, proposed geometry/furniture/full escape validation, exact persisted seating custody and virtual safe standing, followed by live inventory planning. Serialization precedes writes; reducer writes inventory and home state in the same invocation without moving occupants or editing seats/storage.
- Candidate validation builds bare residence collision via explicit exclusion of saved architecture; normal movement continues to read saved partitions. Purchases preserve the architecture state.
- Astra identified revision-cache growth and later furniture blocking doors. Saved-state cache misses now retain at most four recent keys per home/cache prefix in engine terrain/classification and authority collision. Twelve-revision regression proves old terrain/classification/authority objects are evicted. Furniture place/move authority and preview recheck doorway approaches against fixed and candidate furniture bases.
- Local tests:9 authority/collision tests pass (actual reducer/helper with fake DB tables, saved collision parity, corrupt state, bounded cache eviction and doorway obstruction).17 related purchase/codec/inventory regressions pass. World/client typechecks, targeted lint, local binding generation and checked world build pass.
- This does NOT prove live database rollback/restart, two-client concurrency or touch journeys. Construction UI/native cutaway wall/window rendering remain incomplete; saved internal walls currently have collision but their finished rendering is pending. No publication.
- Added bounded strict edit-decoder regressions (4codec tests) and dedicated architecture reach helper: four-tile distance plus a clear full-body/LOS approach from any cardinal face. Construction no longer inherits south-facing mirror reach. Five authority/helper tests now pass, including actual reach from north/south/side; reducer admission/persistence remain faked in the fixture.
- Astra independently passed26 focused tests and closed cache-growth and later-furniture doorway findings. Checked world build and world typecheck pass after importing the shared foot offset for the new reach helper. Live rollback/restart and finished rendering/UI remain open.

### Saved construction native rendering — local cutaway integration

- Engine terrain retains the purchased envelope separately from saved internal partitions. Ground rendering now uses the envelope for external three-course walls, draws saved floor finishes, and renders the exact lower16px native plaster course inside blocked partition cells. Full-height internal walls no longer risk covering playable floor.
- Added draft native straight gray timber floor and narrow arched window crops, reproducible through `import-hearth-architecture.ts` and `hearth-architecture-crops.json`; two exact-source pixel/anchor tests pass. These are still draft assets, pending final visual treatment; this floor is not parquet.
- Shared window producer draws native art separately from the always-visible low wall band. Bounds-based fading reads final player draw anchors at callback time, including predicted/interpolated/projected anchors populated by the player producer. Three rendering tests cover exact native band, head/torso overlap, late anchor reads and alpha restoration.
- Astra caught stale ground chunks after edits/expansions. GroundChunkCache now retains only the current residence terrain reference and clears on change; same terrain reuses chunks. Seven ground tests pass, including one cache across rank1→2 and a saved floor/wall edit in chunk(1,1). Astra closed this blocker.
- `render-hearth-study.ts --architecture` renders saved construction and two native standing-avatar fixtures through the sorted gameplay painter. Both architecture and existing residence study preserve all30,720 seam pixels with zero differences. This is unlit offline evidence, not a live two-builder journey; seated/Dynamic/readability review remains open.
- Engine/client typechecks passed. Tools typecheck exposed a cross-package integration test inside tools/src; moved it unchanged apart from imports to `scripts/hearth-residence-expansion.test.ts` so tool builds do not compile client/world sources under the tools rootDir.
- Native doorway jambs, final floor/window styling, construction authoring UI, live atomic rollback/restart and multiplayer/touch journeys remain unfinished. No publication.
- After relocating the cross-package test, tools typecheck passes. Final focused suite passes17/17 (integration envelope/caches, ground cache, cutaway rendering and source pixels).
- Standing-avatar recapture through the actual sorted painter supports bounded visibility: Astra confirmed both avatars remain identifiable, windows fade and low bands stay opaque. This does not close seated/lighting acceptance.
- Replaced the initial gray floor candidate after both reviews found a grating-like repeat. Current draft is the warm native diagonal-board crop(96,0,16,16), recorded in the reproducible manifest; atlas/study regenerated and exact-source tests still pass. Awaiting bounded recapture review, no publication.
- Astra approved the warm diagonal floor and arched-window crops after recapture, plus bounded standing-avatar readability. Marked only these two native asset sources approved. Seated overlap, lighting, jambs, finished rooms and whole-patch publication remain open.

### Construction tools and review-before-apply flow — local integration

- Added a residence Construction subview to the existing furnishing palette: rustic/townhouse floors, walls, north/south and east/west doorway stamps, windows and component-specific removal. It preserves the32-piece furnishing catalogue and existing move/undo/expansion controls. Scope changes reset construction selection.
- Shared component tools preserve unrelated paid floor/partition/window components. Window support must be removed explicitly before replacing its wall. North/south doorway placement is an atomic wall/door/wall stamp; east/west is wall/door/door/wall for full-body passage. Removal selects the connected opening as one bounded batch. Real planner tests prove both orientations build/remove, preserve floors and charge/refund the correct totals.
- Astra caught the original one-cell authoring limitation, clipped costs and incomplete failed-stamp highlights. The final flow stages a proposal on world click without spending. The compact32px tool bar expands to a116px review only after a tile is selected; it shows the tool, full footprint, each signed material total, provisional reach/space/bag checks, Apply and Cancel. The full intended stamp remains visible in red on layout failure, including unchanged jambs.
- Apply rechecks scope, tool, revision, edit contents and shared layout before submitting the existing atomic reducer. Changed proposals require fresh selection. Pending submissions disable repeat Apply/Cancel and remain pending until authoritative revision/scope changes; late failures cannot clear a newer request. No optimistic inventory/state mutation.
- Client layout preview checks purchased geometry, fixed obstacles, furniture and connected escape floor; authoritative reach, actual seated/standing custody and inventory/refund fit remain checked on Apply. Preview stays amber and says these checks are provisional. One cached preview is retained per collision/key, rather than running the full layout planner every frame.
- Native fixtures: `render-hearth-equipment-ui.ts --construction output/doc60/construction-ui.png` and `--construction-review output/doc60/construction-review-ui.png`. The latter is an explicit three-material-line layout stress fixture, not a live material quote. Both fit320×180. Astra closed both feedback findings and the doorway authoring blocker after inspecting source/fixtures and independently passing18focused tests.
- Added actual-handler AST regression proving first click sends nothing, Apply sends once, acknowledgement alone does not unlock pending, and stale revision/scope proposals cannot commit. This uses a fake network/planner and is not a live transaction test. Additional full-footprint regression brings the focused suite to19tests.
- Client/tools typechecks and targeted lint passed. Live multiplayer/touch construction journeys, native doorway jambs, seated/lighting artwork acceptance and whole-patch release gates remain open. No publication.

### Native doorway jambs and hardware reservations — local integration

- Added three native Interior_Walls crops: open front frame(48,16,32,26), left post(48,34,5,8) and right post(75,34,5,8). The frame deliberately excludes the closed sill at rows42–47. Import manifest and exact-source pixel tests cover all three. Astra approved the crops and corrected unlit standing fixture; marked these three sources approved.
- Shared `hearthDoorwayRuns` derives supporting cells from saved architecture for both authority and renderer. Low timber posts are drawn entirely inside blocked supports, including east/west openings. Single-cell north/south openings additionally receive the native front frame; wider openings retain low posts without stretched or overlapping arches. Full frame visibility fades using its32×26 bounds; ground posts remain opaque.
- `enqueueHearthArchitectureFeatures` now covers windows and doorway frames through the existing sorted gameplay painter. The native residence study includes three standing-avatar fixtures across both doorway orientations. It validates each constructed layout with the real shared planner before rendering. The existing30,720-pixel wall-seam comparison remains exact.
- Astra identified a real allowed-layout overlap between windows and doorway posts. Shared construction planning now reserves supports against windows and wall-layer furniture. Both later furniture authority and actual client preview reject a mirror on a doorway support with a clear support-space message. Moving the example window alone was not used as the fix.
- Legacy paid window conflicts do not block physical collision or destroy refund provenance. Edit planning permits only a strict subset reduction of the same conflict locations, allowing removal one window at a time with originalv1 refunds. New conflicts, equal-count trades and unrelated edits while conflicts remain are rejected. Existing ornaments can be moved/picked up before construction.
- Validation:39 shared construction/codec/inventory/tool/support tests pass;7 actual reducer/helper fixture tests pass, including sequential legacy refunds and later mirror rejection;3 actual client preview/cache tests pass. Four doorway geometry tests, four feature-render tests and five source-crop tests pass. Added mirror-support demolition regression (included in the39 shared tests).
- Checked world build, world/client/sim/tools typechecks and targeted lint passed. Reducer fixtures still use fake database/network boundaries; they do not prove live rollback or restart. No schema change in this step.
- Seated overlap, Basic/Dynamic lighting, furnished-room doorway recognition, live two-builder/touch journeys and the broader content/release requirements remain open. No publication.

### Arrival and carpenter introductory contracts — local integration

- Authored the first two of six introductory contracts: `hearth_willowharbour_arrival` (free ferry, reach Willowharbour and meet Pip) and prerequisite `hearth_meet_carpenter` (meet Rowan). Each pays150bronze once, with no XP/item reward. Fin or Pip accepts/completes arrival; Rowan or Pip accepts/completes the carpenter introduction. Existing shops remain available.
- Arrival's eight-tile location region includes the real Willowharbour ferry arrival and Pip's reachable frontage. Players can begin after arriving or after already visiting Rowan without requiring a return journey merely to trigger progress.
- Dialogue acceptance credits only the currently admitted speaker's recorded conversation and immediately checks current location. Lifetime talk counters are unchanged; earlier conversations with a different NPC retain their acceptance baseline. Credit is restricted to an active quest accepted on this authority tick. The actual dialogue caller checks session admission, authored choice and quest requirements before effects/credit.
- Validation:21 focused tests pass, including Fin-first/Pip-first/prior-Rowan routes, wrong-space rejection, runtime dialogue/reward registration, current-location refresh, duplicate acceptance, forged/unavailable choices and rejected NPC admission. Actual reducer callback tests use fake database/admission/lifecycle boundaries; they do not establish live transaction behavior.
- Canonical content export/validation, world/sim/client/tools typechecks, targeted lint and checked world build pass. No schema change. Compact actual-dialogue fixtures `output/doc60/arrival-contract-ui.png` and `carpenter-contract-ui.png` are readable and unclipped; they supply completion state and use blank fallback portraits, so are not live journey evidence.
- Astra found no design/correctness blocker and closed the actual-caller evidence recommendation after independently passing21tests and inspecting both images. The other four introductory contracts, repeatable peaceful farming/cellar income orders, live journeys and whole-patch release gates remain unfinished. No publication.

### Furnished-room introductory contract — local integration

- Added `hearth_furnish_room` / A Corner to Call Home after the carpenter introduction. Rowan offers a once-only350bronze reward for a seat, table, lamp and rug currently placed inside the original residence room. No item consumption or XP. Existing pieces and guest-builder work count for the homeowner; public furniture, another home, bags and expansion-room placements do not.
- New explicit `furnishing` quest objective uses current counts, with zero acceptance baseline. All six native seat types, four tables, four rugs/runners and both floor lamps or a supported table lamp qualify. Light need not be lit. Full logical footprints must lie within the original x3..12/y3..12 floor.
- Shared evaluator excludes carried/unknown/retired/corrupt furniture and validates declared state types plus reserved revision/support metadata before admitting supports. Astra caught both malformed metadata and valid-but-forbidden support metadata on standing tables; regressions include a corrupt lamp parent alongside a second valid table. Unsupported lamps cannot complete the contract.
- Authority lazily reads only the owner's indexed residence rows. Actual turn-in rederives current contents; removing a required piece makes the quest active again, while a turned-in quest cannot pay twice. Successful furniture place/move/pickup refreshes the owner's quests, including guest-builder mutations.
- Existing private quest-baseline view now adds optional `currentValue` through `PlayerQuestProgressBaseline`, derived from the caller's residence. No new persistent table or lifetime statistic. Generated bindings and client journal consume the projection, preserving remote progress while visiting Rowan without streaming home furniture into the player's viewport. This changes the view return contract and requires coordinated game client/world release.
- Thirty focused tests cover shared eligibility/current state, actual private view/owner lookup, actual turn-in/refresh with fake database and reward boundaries, remote client journal, and previous introductory quests. Typechecks for sim/world/client/tools, canonical content validation and targeted lint pass. Checked world build passes after the final support fix.
- Native compact offer fixture `output/doc60/furnishing-contract-ui.png` uses the actual dialogue renderer and fits the full offer/reward text. Portrait is still the fixture's blank fallback, and completion state is supplied rather than acquired in a live journey.
- Astra closed both validity findings and approved the readable compact offer after independent focused tests. Live view invalidation, guest-edit concurrency, restart and end-to-end furnishing/claim remain unverified. The remaining three introductory contracts, repeatable peaceful income orders and broader patch gates remain open. No publication.

### Expedition introductory branch — local integration

- Added the remaining three introductory contracts: `hearth_prepare_expedition` / Ready for the Ash Shore (Bram or Iona,200bronze), `hearth_clear_ash_shore` / An Opening on the Ash Shore (Iona,300bronze), and `hearth_return_basalt` / Stone from the Cinder Shore (Iona,200bronze). All are once-only with no additional quest XP. Peaceful furnishing and combat branch independently after arrival; furnishing is not required for expedition access.
- Preparation uses an explicit current `equipment` objective. A valid usable weapon in Main Hand and armor in Body count immediately, including better tiers; drawing/selecting the weapon is not required while talking. Broken/retired/duplicated/wrong-slot/invalid stacks do not qualify. Bows require ten matching shots in hotbar or the active backpack; cursor, crafting and inaccessible backpack slots do not count. Runtime damage/tool/vigour/ranged definitions are shared with combat checks.
- Authority and the existing private quest-baseline view derive readiness from the caller's indexed inventory, lazily once per projection. Client journal uses optional `currentValue`, as for furnishing. No new table or further view-shape change. Actual inventory refresh and turn-in recheck current equipment; no lifetime ownership counter or fresh-acquisition requirement.
- The first Ash Shore camp awards clear credit to each eligible completion-grant recipient when its durable reward receipt is created. Credit is independent of claiming loot/full inventory, only applies to `cinder-ash-shore`, and uses the existing cumulative quest-action baseline so the clear must follow acceptance. Ineligible contributions, unrelated camps, repeated killing blows and repeated claims cannot grant credit.
- Delivery consumes two basalt at successful turn-in. Ash Shore already guarantees two basalt; accepted/reminder text tells players to collect Expedition Reward[O] and keep them. Already-carried stones count immediately after acceptance, avoiding another respawn cycle. Actual delivery test consumes across inventory/cursor, preserves other materials and rejects a second payment.
- Forty-five focused tests pass: readiness/quest branch, actual private projection, client journal, actual completion/claim and delivery handlers with fake database/reward boundaries, plus previous introduction and quest regressions. Canonical content validation now covers756definitions. World/sim/client/tools typechecks, targeted lint and checked world build pass, including the final added-test typecheck.
- Compact native offer fixtures are `output/doc60/preparation-contract-ui.png`, `outpost-contract-ui.png` and `basalt-contract-ui.png`. All fit. Astra found no authority blocker and requested clarification of the preparation payout; both offers now explicitly say the player is paid200bronze. Astra closed that finding after inspecting the refreshed capture. These remain offline state-fed fixtures with blank fallback portraits, not live playthroughs.
- All six introductory contracts are now locally authored and wired. Live preparation/equipment changes, ferry/camp access, multiplayer reward eligibility, delivery transaction rollback/restart and full journey acceptance remain unverified. Repeatable peaceful income orders, the broader content patch and publication gates remain open. No publication.

### Repeatable peaceful orders — catalogue and pre-commit planning

- Added seven shared order definitions: raw carrots/potatoes/grapes at Tavi; preserved carrots/potatoes/grapes at Nell; one estate bottle at Mara. No combat/introduction prerequisite or arbitrary daily quota is designed. These are not yet available in gameplay: authority admission/receipt persistence and the review/deliver UI remain unfinished.
- Quotes preserve the exact current normal sale value and add350bronze. Bottle orders retain all four owner estate-vintage price tiers, rather than exchanging a5,000–40,000bronze item for a small flat payout. Missing/retired/durable/directly buyable order goods are unavailable; bottle quotes also require an active fermentation process.
- Pure `planVillageOrderDelivery` verifies current receipt revision, expected content hash, expected quoted total and u64 wallet/revision limits. It validates active carried custody and delegates exact hotbar/backpack consumption to the existing merchant-sale planner on copies. Equipment/crafting/cursor/storage are not consumed; read-only or invalid matching stacks and hidden overflow slots reject the whole plan. It returns next inventory, wallet balance and receipt revision for a future atomic reducer commit.
- Astra identified that content hash alone did not freeze a vintage-dependent quote. Required `expectedTotalBronze` now rejects a same-content vintage rank change before consumption; a refreshed quote succeeds. Repeated deliveries require the next current receipt revision, while stale packets cannot produce a plan.
- Added source-hashed `output/doc60/village-order-economy.md`, reproduced by `packages/tools/src/report-village-order-economy.ts`. It distinguishes total cash from the incremental350bronze bonus. Premium-only comparisons give5/10/12orders for the sample room/east/south expansion; actual gross farm deliveries often need only3–4/6–7/7–9, and a single bottle already exceeds either expansion price even without the order. Overall doc60 income pacing remains unresolved.
- The direct-purchase guard is not a transitive conversion/arbitrage proof. Purchased apples already feed timed must/bottle production. Production time, station costs, actual crop yield/season income, recipe conversions and final housing pacing still require measurement before release. No bottle/core-economy repricing was silently introduced.
- Focused tests cover exact payouts/vintage ranks, copy-only split consumption, stale revision/content/quote, legitimate repeat revision, shortage, wallet/revision overflow, read-only/inaccessible custody and live retirement/direct purchase withdrawal. Full authority rollback/concurrency/reconnect, private receipt projection and native order UI remain open. No publication.
- Astra closed the quote-integrity finding and accepted the report's distinction between gross payouts and bonuses. Five new order tests plus thirteen existing merchant-cart regressions pass(18total); sim/tools typechecks, targeted lint and diff checks pass. This remains a pre-commit plan, not a completed order feature.

### Repeatable order authority and private quotes — local integration

- Added private `player_village_order_receipt`: one row per identity containing a global revision, last successful order and completion tick. Revision0 is implicit until the first success. Receipt storage stays bounded and serializes requests across different orders/NPCs without resetting completed introduction quests.
- Added `fulfillVillageOrder(orderId, expectedRevision, expectedContentHash, expectedTotalBronze)`. It authorizes the sender, rejects Delve inventory lock, re-admits live merchant dialogue/NPC reach/space, advances survival before requiring a living player, and rejects mounted/carried-hands custody. The live order NPC definition/runtime identity must match the admitted NPC.
- Reducer loads current caller inventory, wallet, receipt, registry and estate-vintage rank; the shared planner rejects every stale/invalid quote before commit. Inventory, wallet and receipt writes share the reducer transaction, followed by existing equipment/quest refresh and sale/item/bronze statistics. Currency-only payout works with full bags because delivery removes goods. No optimistic inventory/reward changes.
- Added `own_village_orders`, a caller-derived quote view including NPC, quantity, ordinary sale value, bonus, total, content hash and global receipt revision. Owner vintage rank comes from indexed own-estate/upgrade reads. The receipt table is private; the view neither scans nor exposes another player's inventory/receipt.
- Regenerated bindings, added client `fulfillVillageOrder` wrapper, private subscription/store, initial snapshot hydration, insert/update/delete handling and disconnect clearing. UI must preserve the displayed quote/revision while pending and require explicit fresh review after rejection; it must never automatically rebase/retry a stale delivery.
- Six actual reducer/session/view/helper tests plus five planner and thirteen merchant regressions pass(24total). Tests cover full bags, exact consumption, valid repeat delivery, stale cross-order/cross-NPC requests, readmission/space/reach/liveness/custody failures, quote/content/shortage rejection without writes and owner-only vintage/receipt queries. Database, auth, inventory persistence and statistic boundaries are faked; these do not prove live rollback or isolation.
- World/client typechecks, checked world build, binding generation and targeted lint pass. Astra found no concrete implementation blocker and accepted privacy/ordering/client reset-resync wiring after independent focused tests. The final added privacy-test typecheck also passes.
- This adds a private table and public caller-dependent view/reducer contract; coordinate world/client deployment when the entire patch is ready. Native order UI, live two-connection/reconnect/rollback acceptance, transitive conversion audit and economy pacing remain unfinished. No publication.

### Native village order conversations — local UI integration

- Tavi, Nell and Mara conversations expose the caller-derived orders for that NPC. Selecting an order opens a separate review showing goods, normal sale value, order bonus and total bronze before an explicit Deliver action. Keyboard and pointer input use the same flow; shops retain their existing dialogue behavior.
- Review freezes quantity, NPC, revision, content hash and quoted payment. A pending request cannot be submitted again, including after closing/reopening the local panel. A reducer acknowledgement alone stays pending until authoritative quotes update. Changed/withdrawn quotes discard review without claiming that this connection completed a delivery; rejection requires fresh explicit review. Late responses cannot alter a newer connection/NPC scope.
- Main client now supplies private order quotes and connection generation and invokes the exact reviewed reducer arguments. No optimistic bag changes, payment, retry or automatic quote rebasing. Friendly errors cover shortage, stale price/content, reach, dialogue, wallet and custody failures.
- Twenty-three focused flow, actual NPC input integration and existing dialogue tests pass. UI/client/tools typechecks, targeted lint and diff checks pass; client production build succeeds into `/tmp/hearth-orders-client-build` without publication.
- Reproducible compact native captures: `output/doc60/village-orders-ui.png`, `village-order-review-ui.png`, `village-order-pending-ui.png`, with source-hashed provenance and actual catalogue quote helpers. Astra independently approved lifecycle behavior and closed final list contrast/bevel findings after inspecting all three corrected screens. These are offline renderer/input fixtures, not live delivery evidence.
- Live two-connection/reconnect/rollback, touch journeys, transitive conversion audit and housing-income pacing remain open, alongside the wider map/combat/release gates. No publication.

### Village path and arrival composition follow-up

- Connected the eastern pond pavement at153,382 around the inn garden to the square via153,394→163,394. Added a short paved approach to Pip at207,398 and a compact barrel/chest cargo group beside the general store at200,396/201,397. Original island coordinates and ferry/arrival positions are unchanged.
- Added paved-network verification for all ten building doors, both pond banks and the new inn continuation. Actual full-body collision checks now assert the entire ferry corridor x202..211/y398..403 stays clear, in addition to reaching all five exterior NPCs. Five focused native-asset/access tests pass; sim/tools typechecks and targeted lint pass.
- Added `--harbour` to the offline native map renderer, capturing `output/doc60/willowharbour-arrival.png` with source-hashed provenance; regenerated the town view. Astra reviewed the changes and independently passed the access test.
- The arrival view still lacks a recognizable quay. The existing pond pavement leaves a tiny southern water fragment and requires a dedicated native bridge with deck/rail collision and bank reshaping. Astra recorded concrete next coordinates in the design review. This is a path/access improvement, not final village or live journey approval. No publication.

### Native pond bridge and connected banks — local implementation

- Replaced the paved-over southern pond crossing with a native modular stone bridge spanning x130..150. Two deck lanes379..380 connect the cottage/west path to the inn/square; north378 and south381 rails have separate solid prefab collision. Restored water south of the crossing and removed the ellipse's single-cell bank spikes.
- Nine reproducible exact-source modules come from `Bridge_Stone_Horizontal.png` through `import-hearth-bridge.ts`. Astra caught baked bank colours in the initial full-height rail crops; corrected north y1..15 and south y48..59 exclude them and retain native pixel alignment. No stretch or colour substitution. Assets remain draft pending final visual approval.
- Ground-layer authored map objects now use the renderer's existing surface depth phase. This keeps the deck below actors regardless of their row while the separate rail objects retain ordinary entity depth. Added `--pond` native renderer fixture with a player on the bridge; `output/doc60/willowharbour-pond-bridge.png` provenance hashes the source sheet, all nine assets, importer and runtime. Town view regenerated.
- Twelve focused native pixel, village connectivity, actual collision and map-runtime tests pass. The new bank-to-bank test moves the actual raised foot box at one-pixel intervals through both deck lanes and checks solid rails. The initial test incorrectly centred sprite anchors rather than physical feet and was corrected using exported hitbox constants. Sim/engine/tools typechecks, targeted lint, local atlas build and diff checks pass.
- No live crossing/lighting/touch acceptance or publication. Quay/harbour furnishings and broader village/patch gates remain open.

### Bridge review closure and stone quay foundation

- Astra closed the corrected native bridge crop, bank join, player-depth and collision review. Marked all nine bridge modules reviewed and rebuilt the local atlas. Added an actual `enqueueLiveMapObjects` regression with only asset loading mocked: ground instances draw in surface phase below a northern actor, while ordinary objects/canopy preserve entity ordering. The regression passes; the bridge traversal now checks both directions in both lanes.
- Reused the reviewed native modules for a short stone quay x212..219: north rail399, deck400..401, south rail402. Explicit bounded deck terrain extends beyond the coast; the surrounding ocean remains blocked. Arrival204,400, ferry209,400, guide207,397 and reserved corridor202..211/398..403 remain unchanged and clear.
- Added one-pixel full-body approach/return tests for both quay lanes, side-rail collision and the ocean beyond220. All seven composed map/connectivity/access tests pass, alongside the production ground-depth and source-pixel tests. Sim/engine/tools typechecks, targeted lint and diff checks pass. Fixed a TypeScript literal-union inference in the shared span loop without changing geometry.
- Expanded `--harbour` capture to include the full tip and surrounding water. `output/doc60/willowharbour-arrival.png` and pond captures include bridge/source/runtime provenance. Astra independently passed all three physical-access cases and approved the bounded quay foundation after inspecting the widened capture.
- These are offline native-renderer and simulation results. Harbour signage, maritime dressing, lighting and live ferry/traversal acceptance remain open, as do the wider village/combat/economy/release requirements. No publication or service restart.

### Harbour boat and native wayfinding

- Added the existing approved native animated boat beside the quay at221,400, using its left-facing visual. The small water gap reads as mooring while the boat stays beyond the walkable deck; ferry travel still uses the existing209,400 interaction. No new boarding mechanic or sea access is introduced.
- Added a native right-pointing arrow sign at202,396, outside the reserved arrival corridor, with reproducible `import-hearth-harbour.ts`. Final exact source crop is `Signs.png` x16/y16,16x32. Astra caught and corrected initial left-arrow/two-board crop choices; final image and source were reviewed before marking this asset approved.
- Updated the native harbour capture and provenance to include boat, sign and importer hashes. Seven map/connectivity/full-body tests pass after the boat move, including both quay directions, blocked sea/rails and clear ferry/guide/resident access. Sim/tools typechecks, targeted lint and diff checks pass. Astra independently passed all three physical-access cases and approved the bounded sign/boat composition.
- This adds generic visual wayfinding; Pip's existing directions still explain free ferry travel. Harbour lighting, live ferry discoverability and journeys, farmyard/service details and the rest of the full-patch gates remain open. Local atlas/captures only; no publication.
- Release integration still needs an explicit composition/export path for these facades/scenery against the surveyed saved map. Current callers of `buildHearthVillageScenery` are the offline renderer and tests; reviewed scene fixtures alone do not install the objects into the live map.

### Saved-map content composition — pure integration foundation

- Added `composeHearthContentMap` combining the archipelago with the same native facades/scenery used by reviewed fixtures. Trees are generated from the canonical contribution, so extra saved paving cannot silently select a different village layout. Existing original-map rows/provenance are retained; changed composition advances revision once and exact reruns retain the original document/revision.
- Duplicate/changed prefab or object IDs, conflicting/extra saved island cells, overlapping foreign objects (including disabled and transformed visual overhang), unresolved visuals, island anchors/scenery and incompatible transitions/stairs return conflicts with no candidate document. Exact existing rows are compared canonically, never accepted by a name-prefix exemption. Prefab normalization matches save/parse behavior.
- Unchanged built-in landmark rows are preserved. Additional/modified legacy landmarks currently require a visual resolver/survey and return a conflict; that resolver and raw input/export validation remain unfinished. This API is explicitly a local candidate composition step, not a publication gate or live export command.
- Astra reproduced two initial gaps: unreviewed extra island cells could extend the quay, and JSON property ordering could duplicate an equivalent transition. Added extra-cell rejection and fixed-order semantic transition deduplication, with regressions for both.
- Four focused tests pass: original data preservation, no mutation, revision/idempotence including serialize/parse, changed/duplicate own IDs, foreign disabled overhang, extra quay land and reordered transition keys. Sim/tools typechecks, targeted lint and diff checks pass.
- A CLI that validates the saved input/generated registry, records hashes and asset review state, and writes a staged candidate artifact remains to be implemented. No live map export, publication or service restart was performed.
- Astra independently reran the four tests and both reproductions, closing the extra-land and transition findings. Bounded pure-composer review is closed; exporter/resolver and whole-patch gates remain open.

### Offline map candidate export — local integration

- Added `npx tsx packages/tools/src/export-hearth-map.ts <saved-map-v3.json> <new-output-directory>`. It performs no network, database, publication or restart action. Input must be a lossless current V3 export; unknown root fields, dropped/normalized authoring changes, invalid IDs/references and composition conflicts reject before creating candidate output.
- Extracted the atlas builder's exact source-revision calculation into a shared helper. Export rejects stale/mixed generated asset revisions and validates unique registry IDs/names, source identity/anchors, named visuals and dimensions. All frames of animated placements are checked, as are saved legacy scenery states. Used native asset files are rechecked for changes during export.
- A fresh output directory contains map.json, manifest.json and COMPLETE written last. Existing output/input are never overwritten; a write failure removes only the directory created by this invocation. The manifest records exact input/registry/category/compiler/native source file hashes, canonical asset payload hashes, candidate hash/revisions/counts/bounds and unapproved art. `publishReady` is always false.
- Six focused tests pass: real candidate output and input/existing-output preservation; explicit unknown-field rejection; stale source rejection; conflicting saved terrain with no output; malformed later animation frame; missing saved scenery state. Tools typecheck, targeted lint and diff checks pass. Astra independently passed6/6 and closed the root-field, animation and legacy-state findings.
- Demonstration only: `output/doc60/map-export-baseline-fixture.json` is a generated baseline fixture, not a live-map export. Its `output/doc60/map-candidate-fixture-v1/` contains40,658cell overrides,43prefabs and509objects, with43native source file hashes and17unapproved assets reported. It proves the composition/export path without claiming live survey or release readiness.
- Additional/modified legacy landmark visual resolution, saved/live-map reconciliation, remaining art approvals/content and full release acceptance remain open. No publication.

### Village source-art review closure

- Astra inspected the14underlying native sheets/files covering the10village facades,3market stalls, bench, fountain and2hedge modules and approved those17source selections within scope. This closes their source-art draft status, not village composition, signage, lighting or live service acceptance.
- Added17pixel-fidelity tests comparing every imported pixel to its native source crop, including all8fountain frames. All pass. Marked these17assets approved only after the review and fidelity checks.
- Updated building/decoration importers to preserve approval only when regenerated content is unchanged. Re-ran both importers after approval: all17files reproduced byte-for-byte, including flags. Local atlas build, tools typecheck, targeted lint and diff checks pass.
- Fresh offline `output/doc60/map-candidate-fixture-v2/` uses the same generated baseline fixture and records zero unapproved assets among its43referenced village/map assets, with509objects. `publishReady` remains false. The earlier v1manifest remains historical evidence of the prior17draft flags.
- This does not approve other patch asset families or prove a live-map export. Remaining village details, legacy landmark resolution/live reconciliation, combat/equipment/economy and release gates remain open. No publication.

### Customized common landmark preservation

- Added a shared native asset catalogue used by both game/editor art loading and the offline landmark bounds resolver. Supported single-sprite landmarks now use the actual native anchor/dimensions, runtime flip/rotation/scale order and a union with physical collision. Disabled rows are checked as if enabled. Multipart/special renderers still return explicit survey conflicts.
- Customized supported landmarks outside the new islands are retained exactly. Visual or collision overlap rejects the candidate; missing native assets fail closed. Export provenance includes the resolver/catalogue and native source files used by these customized landmarks.
- Astra reproduced a fractional eastern-edge overlap missed by integer-cell intersection. Separated continuous envelope intersection against the island's outer tile edges from integer cell membership, and added native east/south edge regressions. Astra independently passed all16resolver/composer/exporter tests and closed the finding.
- Sim/engine/tools typechecks, targeted lint and diff checks pass. A normal native-renderer harbour smoke capture (`output/doc60/legacy-landmark-render-smoke.png`) has exactly the same RGBA digest as the reviewed harbour image. This verifies the shared asset routing without claiming live editor/browser acceptance.
- Supported customized landmark preservation is complete within this offline workflow. Unsupported multipart landmarks, actual saved-map survey/reconciliation and the broader village/content/release requirements remain open. No publication or service restart.

### Farmyard scenery and approaches

- Added two native cultivated beds north of the greenhouse, with30carrot/wheat plants on authored visual farmland. These are nonblocking scenery and do not create player-owned soil or harvest rewards. A two-tile paved aisle connects to the public northern road and stops before the greenhouse wall.
- Added a native fenced hay pen east of the barn with a two-tile eastern opening connected to the public lane. Hay stays inside the pen; randomized village trees are excluded from the farmyard and its approach margins. Reused six existing approved native assets without editing their pixels or approval flags.
- Twenty existing village/connectivity/composer/export tests pass. Added a full-body farm test covering both beds, pen, barn/greenhouse approaches and blocking fences; all four physical-access tests pass. The first barn check incorrectly centred the sprite anchor rather than its raised collision box; farm targets now use physical-foot centering, preserving existing NPC checks.
- Sim/engine/tools typechecks, targeted lint and diff checks pass. Added reproducible `--farm` native capture at `output/doc60/willowharbour-farmyard.png`, including the six farm asset hashes in provenance. Astra inspected the native crop/fence/hay sheets and final capture, approved the static farmyard composition, and independently passed all four final access tests.
- Fresh offline fixture candidate v3 contains49prefabs/568objects with no unapproved referenced assets and `publishReady:false`. This remains a generated baseline demonstration, not a surveyed live map. Livestock/working-farm interactions and the rest of the patch remain unfinished. No publication.

### Public service thresholds and frontage identity

- Six enterable services now share the existing reviewed native32x18 rustic runner, drawn as nonblocking ground scenery on a shallow3x2 paved apron. Four private/agricultural facades retain bare thresholds. Original facade/door pixels remain intact; no incompatible door overlays were introduced.
- Added an inn terrace barrel, store stock chest, guild bookshelf display with a paved public link, and furnisher standing-lamp display, complementing the existing workshop/anvil/table frontages. These are static visual role cues; they do not claim new shop or lamp-light interactions.
- Added a threshold contract test for exactly six markers, private-door exclusion, ground depth, empty collision and paving. Added actual full-body reachability to all six service doors. The preceding22village/access/composer/export tests pass; the final10village/access tests also pass after the guild approach link and new six-door check.
- Sim/engine/tools typechecks, targeted lint and diff checks pass. Final full-village native capture `output/doc60/willowharbour-service-frontages.png` records the four reused asset hashes. A temporary draft mat experiment was removed; the final atlas returns to the1138existing assets, with no art approval changes.
- Astra approved the runner alignment and guild/furnisher cues, but identified the legacy asset named barrel_apples as a leafy planter. Replaced only the new store placement with an existing chest; Astra approved the final replacement capture and independently passed all10village/access tests, closing this frontage review. These cues still need live discovery, entrance/interior and night-lighting acceptance. No publication.
- Final replacement checks:23village/access/composer/export tests pass, including physical approach to every service door. Final sim/tools checks and engine check pass. Fresh fixture candidate v4 records52prefabs/578objects, no unapproved referenced assets and `publishReady:false`; it remains offline fixture evidence only.

### Authored map lamp emitter integration

- Added `liveMapObjectPointLights` beside the actual map renderer. It resolves explicit native torch/lamp visual bindings against current content sprite/light components and loaded visual frames; disabled objects, missing prefabs/assets, retired/mismatched content and unlit visuals emit nothing. Immutable authored lamps use the explicit lit state. No coordinate-only or permanently cached ghost emitters.
- Native light offsets follow placement rotation and parent mirror/scale/rotation, using the same transformed placement origin as drawing. Flicker identity derives from object/placement IDs and remains stable on array reorder. Source radius stays content-authored rather than expanding with visual scale.
- Astra identified that a rotated offset can move the flame across a terrain-plane boundary while the physical lamp stays put. Extracted the existing projection into `projectPointLightToTerrain` with optional contact X as well as Y; the map-light producer passes both. The live topside painter collects these lights through the existing lighting path, with influence-radius visibility checks and debug-hidden/active-space guards.
- Three collector/projection tests and two existing actual furniture producer tests pass: loaded/disabled/off/retired/mismatched-content admission; q1/q3 scale2 projection at a synthetic plane boundary; placement rotation plus parent mirror/origin; stable flicker on reorder. This is local code evidence, not outdoor lighting visual acceptance.
- Existing authored furnisher lamp can now emit through the map renderer. Additional harbour/service outdoor light placements and Basic/Dynamic captures remain unfinished. Astra approved the bounded implementation and independently passed the five collector/projection/furniture tests. Engine/client typechecks, targeted lint and diff checks pass; no publication.

- Added the actual decorations-producer integration regression requested by Astra: offscreen-but-influence-visible emission, exclusion beyond radius, forwarding both contact coordinates, and no map-light collection in other spaces, debug-hidden mode or with lighting disabled. All six focused tests pass. The fixture initially omitted the required empty homesteads collection and was corrected; production code was unchanged.

### Outdoor torch placement and controlled harbour studies

- Added12existing approved native animated standing torches: one beside each public service, two harbour approaches, both pond bridge banks, the southern farm path and central junction. The existing furnisher lamp brings the actual loaded map emitter count to13. No new art import or approval flag change.
- Astra identified a physical-margin issue at211,397 and a store-path obstruction. Moved the harbour torch to211,396 and store torch to194,407; all23village/access/composer/export tests now pass, including the entire ferry corridor and all six service doors. Sim/tools typechecks, targeted lint and diff checks pass. Astra considers the final placements sound.
- Added controlled-ambient outdoor Basic/Dynamic study support and an explicit `--no-map-lights` comparison to the native renderer. Map object and NPC receivers participate; ground map sprites, full celestial/tree shadows, native emitter alignment and live rendering remain explicit unresolved limits. Full placement capture: `output/doc60/willowharbour-outdoor-lights.png`. Harbour Basic/Dynamic/off studies and provenance are alongside it.
- Initial study incorrectly fed movement obstacles to light occlusion, attenuating each torch inside its own cell. The live client currently supplies no soft obstacles there. Corrected the study to match that production setup. An on/off pixel comparison now shows adjacent path(264,600) RGB167/86/62 versus79/63/61, and(264,624)135/71/61 versus79/63/61. This verifies a controlled emitted-light effect, not correct native flame alignment or live shadow acceptance.
- The study exposed a real rendering gap: flat authored map sprites use `worldAssetFrameSource` without the `groundSpriteSource` hook, leaving the quay deck bright under Dynamic lighting. The standing-torch content offset(-6) also needs comparison with its native flame/anchor. Both findings remain open; no global offset or lighting workaround was applied. Astra lighting review stays open.
- Fresh offline fixture candidate v5 records53prefabs/590objects and no unapproved referenced assets, with `publishReady:false`. This remains generated-baseline evidence rather than a surveyed live export. No publication or service restart.

### Flat authored sprite ground-light sampling

- Fixed the bright quay by routing ground-layer map art through `groundSpriteSource` before drawing. Native textures and draw transforms remain intact. The sampler receives the composite placement/object rotation, reflection and scale, plus the transformed native top-left; camera zoom is excluded. Ordinary entity objects avoid this additional basis work.
- Extended the ground-sprite callback with an optional native-pixel-to-world basis. CPU light-field multiplication uses its inverse inside a saved/restored scratch-canvas transform, then reapplies source alpha. Invalid/singular bases reject before CPU/GPU submission; identity callers retain their existing coordinates.
- GPU source descriptors now carry the basis and generate four independent light UV pairs, consumed in the actual six-vertex quad order. Existing production unverified-ground/receiver guards remain intact. This implements coordinate plumbing, not GPU accuracy/release approval.
- Sixteen focused tests pass across actual map source/depth, light projection, CPU lighting lifecycle, GPU corner submission and cleanup. A browser fixture (`--ground-light-check`) exercises actual CPU groundSource against a nonuniform field:987 RGB comparisons cover q1/q3, reflection, scale2, combined transforms, transparency and an identity draw after a transformed draw. Singular/nonfinite inputs reject. The initial producer assertion distinguished -0 from0; corrected the assertion without altering transform geometry.
- `output/doc60/ground-light-transform-check.png` and provenance record the controlled pixel fixture. The actual map capture `output/doc60/willowharbour-harbour-ground-lit.png` now shows the quay receiving ambient/ground light. Engine/client/tools typechecks, targeted lint and diff checks pass. Astra independently passed11tests and all987browser pixel checks, inspected the corrected harbour and closed the bounded affine-ground review. Three additional raw-field/production-guard tests pass.
- Native torch emitter alignment, authored map occlusion, full celestial/tree shadows and live lighting acceptance remain open. No publication or service restart.

### Standing torch native emitter alignment

- Audited all eight native burn frames and the asset anchor[8,31], plus authored-placeable/map and lobby fallback draw contacts. The authored offset(-6) placed the source below the flame; the fallback(-20) aimed near its varying tip. Both now use-15, placing the source at native(8,16), within the orange/yellow flame core in every frame. Colour, radius and flicker remain unchanged.
- Added a native-frame test checking the exact warm-core palette at the emitter coordinate for all eight frames, authored/fallback position parity, every lobby torch contact and disabled authored emission. An initial assertion incorrectly required yellow in every frame; one frame uses orange at that point, which is still flame. The corrected test checks both actual flame-core colours.
- All12focused native-alignment, source, transformed map-light and actual map producer tests pass. Engine/sim/tools typechecks, targeted lint and diff checks pass. No asset pixels or anchors changed.
- Fresh controlled Dynamic captures: `output/doc60/willowharbour-torch-aligned.png` and `output/doc60/delve-lobby-torch-aligned.png`. Added content objects.json to renderer provenance because its current light component drives authored light positions. Astra approved the native offset and both refreshed captures, independently passed11tests and closed the bounded alignment review.
- Full live lighting/shadow/occlusion and patch acceptance remain open. No publication or service restart.

### Authored-map shadow integration investigation and mask foundation

- Confirmed live elevated/tree shadow collectors cover legacy decorations and resource rows, but omit the new authored map facades/scenery. Collision refresh also lacks map-asset readiness in its key; an initially unavailable sprite mask could therefore remain absent without a subsequent map/content/resource change.
- Astra identified additional integration requirements: equal-depth shadow ownership must follow actual painter ties; compound prefabs must not duplicate their entire base for every visual or fill intended gaps; native receivers and bases need one consistent terrain projection; transformed alpha caching must avoid per-tree raster churn. These remain explicit collector work, not accepted shortcuts.
- Added `transformedLightSprite` as the required mask primitive. It transforms anchor-relative native alpha by inverse pixel-centre sampling, retains holes and plane metadata, shares identity mask storage, and rejects singular/nonfinite/over-budget transforms before allocation. It does not change movement collision or wire incomplete shadows into production.
- Three tests pass, covering all16quarter-turn/reflection/scale1-or2 combinations, every native occupied/transparent pixel centre, output area, identity sharing/fractional placement and invalid/budget guards. Engine typecheck, targeted lint and diff checks pass. Astra independently passed3tests and a negative-world-contact reflection check, finding no blocker in the bounded helper. Strengthened the scale test to check every destination pixel; all3tests still pass. Fractional nonidentity browser parity is unproven (authored map instances currently permit only integer tiles and scales1/2).
- The authored-map shadow collector, tie ownership, compound bases, readiness invalidation and visual/night acceptance remain unfinished. No publication.

### Authored-map sprite readiness foundation

- Added `liveMapObjectAssetReadinessRevision()` to the existing native map asset loader. It advances only after a successful, deduplicated first load, giving retained alpha-lighting consumers a constant-time invalidation signal.
- The actual loader test covers pending requests, concurrent/repeated preload deduplication, successful availability and failed loads. Five focused readiness/transform/ground-source tests pass; engine typecheck and targeted lint pass. The fixture's distinct prefab `object` and instance `objects` layer types were corrected during typechecking.
- Astra independently approved this bounded first-availability contract. Existing failed requests remain terminal for the session (reload to recover); already-cached atlas replacement is not tracked. Both limits are documented at the API.
- The counter is deliberately not added to collision refresh before the authored shadow collector consumes loaded masks. Collector integration, painter ownership, compound contact bases, cache reuse and live/night acceptance remain open. No publication or restart.

### Shadow receiver painter ownership

- `LightTrunkOccluder` now accepts a separate visible `painterOrder` descriptor. Retained occlusion sorts with the renderer's shared comparator, so physical shadow contact does not substitute for visible depth, plane or lexical ties. Missing descriptors use a total, stable legacy fallback instead of a nontransitive pairwise tie exception.
- Migrated ordinary live decoration/resource/chest/placeable/tree producers. Special tent depth and authored landmark ties match their visible producers. `light-caster-painter-order.ts` supplies the same projection, elevation epsilon and depth offset as the actual gameplay enqueue boundary.
- Grouped furniture/occupied seats remain outside this migration; their current generic masks/contact anchors need a dedicated collector fix. Furniture deliberately retains legacy fallback rather than receiving an incorrect ordinary-placeable descriptor.
- Ownership tests inspect the rasterized overlap winner and input-order independence. Separate plane tests establish ordering, not cross-plane raster isolation. The client parity test exercises actual enqueue preparation and compares its retained lexical `debugTie` (the prepared `tie` is an identity hash).
- Astra independently found no blocker for ordinary migrated casters and ran 14 ownership/occlusion tests. Engine/client typechecks and targeted lint pass. Authored map prefab collection, compound bases, transformed mask cache, readiness wiring and visual/live acceptance remain open. No publication or restart.

### Authored silhouette cache and contact allocation

- Added `TransformedLightSpriteCache`: an 8 MiB LRU of transformed alpha keyed by native alpha identity, anchor/dimensions and basis. Integer world translations share pixels; receiver plane is reapplied per instance. Identity transforms keep native storage, fractional contacts retain exact uncached pixel-centre sampling, oversized entries bypass retention, and `clear()` releases cached masks.
- Added `mapShadowContacts`: assign exact occupied 4px collision bits once to the nearest compatible visual (deterministic tie), deduplicate cells, keep each row's gaps, select a single contiguous near-foot contact run. Full `rectangularBase` is returned only when every bit fills that rectangle. A placement with no owned bits has no contact entry; its future collector must retain silhouette and disable contact, not invent a footprint.
- Tests cover exact native 0x0660 tree bases, compound split ownership, gap preservation, planes, visual-span exclusion, repeated cells, negative-world facade contacts, transformed alpha reuse/invalidation/eviction and fractional sampling. Ten focused tests pass; engine typecheck, lint and diff checks pass.
- Astra independently approved the bounded helpers and verified a large 256×256 collision-cell fixture does not overflow argument limits. Contact rectangles remain logical/unprojected; collector must normalize physical plane inputs and project each result once.
- These helpers are not yet wired into the authored-map collector. No claim of complete shadows, animation-frame handling, live visual acceptance or full performance acceptance. No publication or restart.

### Authored-map shadow collector wired locally

- Added `createFrameLightOccluder` to read the exact frame selected by the native map animation clock. Existing sprite-mask API delegates to it, retaining native alpha/baked-shadow caching.
- `liveMapObjectLightOccluders` now collects enabled nonground map visuals without viewport-anchor culling. It applies native placement/object transforms through the bounded cache, assigns contact bits on the physical terrain plane, retains exact rectangular tree columns, and uses whole-alpha silhouettes for other visuals. Mask/base projection is applied once; caster and receiver carry terrain plane and actual painter ordering.
- Optional `contactEnabled` reaches the celestial bridge. Baseless visuals keep silhouette shadows while suppressing the approximate contact ellipse.
- Client retains legacy/base occlusion separately, recomposes authored masks when readiness or selected animation frames change, and invalidates celestial static casters with the same key. This runs before lighting preparation using the same weather visual clock as native map rendering; it does not rebuild movement collision on animation ticks.
- Astra found and the implementation corrected an emitter-binding defect: light and shadow collectors now share current object/sprite/default-visual/retirement validation. Shadow exclusion additionally requires current `collision.occludesLight === false`; removed, retired, rebound or explicitly occluding lamps cast again.
- Engine/client typechecks and targeted lint pass. Collector tests cover readiness, disabled/ground exclusion, exact projected tree base/plane, animation frame selection, baseless contact suppression and current-content lamp mutations. Celestial bridge regression verifies disabling contact preserves the silhouette.
- Astra's remaining evidence requirements are open: collector terrain/alpha tests are mocked; real raised-map painter/receiver parity and full village timing/build counts are not proven. Animated fountain frames currently trigger recomposition of the whole static authored cohort; profile and improve retention before performance acceptance. No publication, restart, or full visual acceptance.

### Full-village shadow collection measurement and retention

- Offline native harbour capture now passes actual authored map masks to the local lightmap. Its collector traverses the complete village document: 590 objects, 542 casters, including 285 exact tree columns. Capture uses controlled ambient with celestial intensity zero; it is not a live night or directional-shadow acceptance fixture.
- Baseline `willowharbour-authored-shadows.png` provenance records 24 local headless-host collector/frame-key samples: mean 2.558 ms, max 16.3 ms; cold collection 14.7 ms. Measurements exclude full sorting/raster/lighting/presentation cost.
- Added per-object retained caster results keyed by immutable document/object identity, terrain identity/version, registry identity, readiness and selected animation frames. Static trees/facades now retain their receiver/contact objects across animated neighbours. `clearLiveMapShadowCaches` is called by actual dynamic-lighting release alongside native-mask reset.
- `willowharbour-authored-shadows-retention-counts.png` records the same 542 casters with 0 initial, then alternating 3/15 recreated casters per sampled frame. Local mean 0.317 ms, max 0.7 ms; cold 15.9 ms. This is collector CPU evidence, not full frame, GPU, iPad or release performance acceptance.
- Baseline/retained/count captures have identical decoded RGBA hash `4961a9bf9752a03269a32895b27e84bddd053136bc1c87b1b0ce809abddcafca`. Astra independently compared 6,193,152 channels with zero differences and found no retention blocker under the existing immutable source contract.
- Seven focused shadow/light tests pass, including static-vs-animated identity, terrain/content/document invalidation and explicit cleanup. The harbour viewport itself is weak visual shadow evidence: its visible tree lies beyond both torches and most facade art is offscreen. Next required fixture must put controlled light beside a native tree/facade and compare caster-on/off, then verify real raised-map parity. No publication or restart.

### Controlled native local-shadow probes

- Extended the offline native study with `--tree-shadow-probe` and `--facade-shadow-probe`, fixed synthetic warm light, target camera/asset/foot provenance, and target south/flat RGB samples. Controls: `--no-map-shadows`, `--no-probe-shadow`, `--only-probe-shadow`, and `--omit-shadow-object=<id>`. Art remains present in each control; only caster participation changes.
- Corrected a probe-only direction error: source facing initially used target foot Y instead of synthetic source Y. Historical `front` captures are not receiver-facing evidence. Final `*-shadow-probe-sampled-{on,off}` captures use the corrected physical point-source direction.
- Native oak at 207,392: south RGB187/125/66 and flat194/130/69 remain unchanged on/off at its own foot, while 12,389 surrounding pixels darken with casters. Astra observed warm trunk/canopy lighting and suppression behind the tree. This establishes bounded flat local tree behavior, not celestial/raised-map acceptance.
- General-store probe initially sampled zero with all casters, versus south109/73/39 and flat143/96/51 with none. `facade-shadow-probe-isolated-off` (remove only building) remains zero. `facade-shadow-probe-only-target` and `facade-shadow-probe-no-west-flower` both restore the same positive values as the no-caster control. The west flower at189,402 lies directly on the synthetic light-to-facade-foot ray; its native silhouette, not facade self-alpha, causes the blockage. No production rendering change was justified by this diagnosis.
- Final artifact metadata records target/camera/source coordinates and participating controls. `output/doc60/compare-shadow-probes.ts` reproduces decoded on/off pixel differences. The facade uses existing uniform foot-sampled tint, not per-pixel wall illumination; these probes do not approve large-facade lighting quality generally.
- Tools typecheck, lint and diff checks pass. Real raised-map draw/mask parity, combined transforms under projection, celestial shadows, full frame/device performance and live patch acceptance remain open. No publication or restart.

### Opt-in recipe knowledge authority for equipment progression

- Rechecked the plan's legendary recipe unlock requirement against current manual crafting. Added optional strict-boolean `requiresKnowledge` to authored recipe definitions, compiled projection and shared runtime recipe types. Omitted/false preserves ordinary manual crafting; no existing recipe has been opted in yet.
- Actual `craftInventoryRecipe` validates the matched requested recipe's canonical bare-ID entry in the sender's known-recipe ledger before any consumption, single craft, batch craft or inventory/cursor mutation. Existing station/skill requirements and learned recipe-book fill remain intact.
- UI result locking now includes learned knowledge and shows `LEARN THIS RECIPE FIRST`; subscription/model updates unlock the result. Manual matching prefers an available recipe when another match is blocked by knowledge/station/skill, while explicit selection retains its intended match and explanation.
- Broader tests exposed two real UI selection failures: result clicks cleared the explicit recipe before dispatch, and bootstrap manual matching selected station-locked furniture ahead of available planks. Fixed result-click selection preservation and active/bootstrap registry matching with current availability; existing tests were preserved.
- 130 targeted schema/runtime/actual-authority/UI tests pass. Tests cover strict parsing/compiler propagation, unknown legacy success, opted-in single/batch rejection with unchanged materials/cursor, learned canonical ID success, overlap selection and real UI click/tooltip/unlock behavior. Astra independently ran all130 and found no remaining gate blocker.
- Sim/UI typechecks and targeted lint pass. World typecheck exposed the earlier landmark helper's ES2022-only Object.hasOwn call; replaced it with equivalent Object.prototype.hasOwnProperty.call for the server compiler target.
- Recipe catalogue enablement, guardian-seal choice/exchange, duplicate-unlock protection, acquisition economics and legendary output-alias audit remain unfinished. Lighting's raised/celestial/device/live checks also remain open. No publication or restart.

### Equipment recipe and plan catalogue authored locally

- Added deterministic `buildHearthEquipmentAcquisition` and `author-hearth-equipment-acquisition.ts`. Generated45 exact gear recipes,37 one-recipe plans and8 legendary unlock candidates. Eight common recipes remain manually craftable (their plans are optional shortcuts); all37 noncommon outputs require knowledge. Legendary recipes have no purchasable plan or alternate recipe output alias.
- Common materials use wood/stone/fiber; uncommon adds2–4 ashwood and basalt each; rare combat recipes use one iron bar plus2 of each shore material. Epic/legendary add cinder ore/emberglass. Five utility pendant recipes use only iron_bar/wood/fiber, keeping the utility branch peaceful. All use supported workbenches; showroom anvil art was not treated as authority station state.
- Each recipe fits9 crafting slots/current stack limits and has material sale value strictly above the finished gear's resale value. This is a local conversion check, not whole-economy or live gathering pacing acceptance.
- Bram stocks32 combat plans; Iona's newly linked archivist shop stocks5 utility plans. Testing prices: common75, uncommon200, rare400, epic850, utility350 bronze. Plans reuse the existing native book icon and learn-then-consume effects. Duplicate nonlegendary plan consumption retains existing book semantics; an actual new-plan authority-use journey still needs a focused test.
- Three guardian seals are proposed per chosen legendary recipe unlock (not per crafted copy). The eight recipes remain inaccessible until the dedicated unknown-only seal exchange is implemented; no seal transaction or acquisition completion is claimed. At current15-minute Warden respawn, the earliest third clear is30 minutes after the first, before travel/combat/quiet-region constraints; whole-set pacing remains unverified.
-124 catalogue/equipment/actual-crafting/UI tests pass; Astra independently ran10 acquisition/knowledge/authority tests and found no catalogue blocker. Sim typecheck/build, tools typecheck and content validation pass. Fixed authoring JSON canonical order so the normal content check passes; rerunning authoring is byte-identical across items/recipes/shops/npcs. No publication or restart.

### Equipment plans: actual use authority and merchant access

- Added `hearth-plan-authority.test.ts`: all37 real plans go through `useSelectedBehaviour`, the actual `objectGraphRegistryForContent` composition, and the extracted production `worldBehaviourEffectWriter`. Each records the sender's bare recipe ID/source/tick before consuming its selected inventory item. Duplicate book use adds no duplicate knowledge and preserves existing read/consume statistics.
- Astra corrected an initial diagnosis based only on generated code registrations: plan `onUse` already compiles through the supported item data-graph fallback, and the client supports its secondary action. Temporary duplicate code registrations were removed; lifecycle source and generated artifact integrity remain at the unchanged revision12/hash. No missing plan or weapon dispatch capability was established.
- Found and fixed actual merchant access: Iona's NPC shop reference alone did not expose the shop through her dialogue. Deterministic authoring now adds the dialogue shop reference, greeting choice and merchant frame node for the five peaceful utility plans, preserving existing quest and advice nodes. Catalogue tests check both sellers' greeting-to-shop path.
- Replaced Array.at in the catalogue generator with equivalent ES-compatible suffix extraction after world typecheck caught the server target mismatch.
-12 focused acquisition/knowledge/actual-crafting/plan-authority tests pass. World/tools typechecks, targeted lint, content validation, lifecycle integrity and diff checks pass. Authoring all five content files is byte-identical on rerun. Live purchase/transaction/reconnect acceptance and guardian-seal exchange remain open. No publication or restart.
- Astra independently approved Iona's bounded shop-access change: greeting opens the merchant frame and returns correctly; existing quest/advice/goodbye behavior is preserved. Its four catalogue checks pass. This does not replace live or compact-screen visual acceptance.

### Guardian-seal exchange authority implemented locally

- Added `hearth-seal-exchange.ts`: server-owned eight-recipe allowlist, current nonretired gated legendary output validation, three-seal quote, content-hash comparison, known-recipe rejection, and immutable exact hotbar/backpack consumption. Other custody containers do not count.
- Added actual `unlockHearthLegendaryRecipe` reducer. It requires authorized/persistent inventory, Iona's open shop session and existing merchant space/XY reach, living/unmounted/free-hands state. Inventory consumption and the unique sender/bare-recipe knowledge row commit together. Retrying a learned recipe rejects before writes; no additional receipt table or book-read statistic is used.
- Actual merchant admission requires nodeId `shop`. Corrected the previous Iona merchant node name from `equipment_plans` to `shop`, retaining the readable choice ID and existing dialogue behavior. New authority fixture follows the actual authored greeting choice through production `activeMerchantSession`, catching the constraint missed by the earlier graph-only access check.
- Astra found nondurable inventory normalization drops raw durability. Added accessible stored-row metadata validation before writes; hidden overflow is excluded rather than consumed. Independent tests invoke actual loadPlayerInventory/storedStack/storedDurability/storedLit/writePlayerInventory with current capacity/offset helpers. They prove split-stack payment, remaining lit state and unrelated/hidden/crafting-row preservation, malformed accessible metadata rejection, insufficient accessible seals and duplicate retry protection.
-22 focused acquisition/order/crafting/plan-use/seal tests pass. Sim typecheck, content validation and targeted lint pass; catalogue authoring remains byte-identical across five files. Astra's six focused exchange tests pass. Iona's authored interior is flat; existing merchant admission is not a general plane/LOS policy.
-Client bindings, recipe-selection/review UI, authoritative acknowledgement flow, compact visual checks and live transaction/reconnect acceptance remain unfinished. This is not a complete player-facing acquisition route yet. No publication or restart.
-World typecheck also passes with the production inventory tests. Astra closed the bounded raw-metadata/custody finding; no transaction blocker remains in this local review scope.

### Guardian-seal client command and acknowledgement flow

- Generated the actual new reducer bindings with `npm run generate -w @orchard/world`; its local world build succeeded. Added the typed `OverworldConnection.unlockHearthLegendaryRecipe` command. This command did not publish a module or restart a service.
- Added `HearthSealFlow`: eight current missing recipe offers restricted to Iona's shop, frozen review with content hash and quoted seals, duplicate-submit prevention, and no automatic retry. A successful reducer promise leaves the review pending until the owner known-recipe model includes the selected ID. Subscription completion before a late promise settles is preserved by serial guards.
- Reconnect/identity/session/shop changes clear stale review and invalidate callbacks. Content changes invalidate the quote. Rejections require an explicit new review; insufficient-seal feedback names hotbar/backpack custody. This class still needs the actual NPC panel/model connection; no complete visible UI route is claimed.
-14 flow/order/actual seal authority/inventory tests pass. Client and UI typechecks, targeted lint and diff checks pass. The all-eight selection panel, confirmation copy, paging/touch/compact visuals and live acquisition acceptance remain open. No publication or restart.
- Astra independently ran all four standalone flow tests and approved the bounded serial/scope/knowledge-acknowledgement behavior. Integration must supply actual identity/connection generation and current owner subscription readiness; closing the panel alone must not erase a pending exchange.
- Added an unconnected `hearth-seal-panel.ts` draft with six choices per page (two pages for all eight), review cost/custody/crafting copy and pending controls. It is not yet wired to NPC input, rendered in a capture, or visually accepted. Treat it as implementation work in progress.

### Guardian-seal panel integrated and reviewed locally

- Connected the actual `NpcInteractionUi` to `HearthSealFlow` and the typed network command. Iona's shop exposes a separate Seals footer button (and L shortcut), preserving search, Back and Purchase. Six choices per page expose all eight missing recipes; arrows/1–6 keys and pointer controls select a recipe before a separate Unlock action.
- Actual client model supplies owner learned-recipe IDs and identity/connection-generation scope only after `network.gameplayReady`. Closing just the panel retains pending exchange state; reopening cannot double-submit. Leaving the admitted shop, changing identity/session or losing readiness clears the old interaction. Modal pointer/wheel/key handling isolates the panel from the underlying shop cart.
- Extended native offline UI study with `--seals=shop|list|page2|review|pending|learned`, actual `NpcInteractionUi`, current native art and source/atlas/image provenance. All six 320x180 logical captures are under `output/doc60/seal-exchange-*.png`; they do not connect to live authority.
- Captures exposed inherited compact merchant geometry: third row overlapped footer and balance overlapped search. Visible row count now derives from available vertical space; compact balance occupies the line above tabs/search. Tests cover compact list/footer separation. Long shop names now ellipsize before quantity controls.
- Astra independently reviewed integration and all six captures. Fixed its findings: review tells players to close the shop before O for rewards, and seal-cost text sits above the button bevel. Refreshed shop/list captures close both readability findings. Empty-state copy avoids falsely claiming all recipes learned when current content may make offers unavailable.
-32 focused UI/order/flow/actual exchange tests pass;20 merchant/panel tests rerun after readability edits pass. Client/UI/tools typechecks and targeted lint pass. Astra approved this bounded UI integration/visual slice. Live exchange, reconnect/database transaction acceptance, gathering pacing and the rest of doc60 remain open. Nothing published or restarted.

### Cinderwake gathering audit and legacy resource partition

- Actual audit confirms ashwood/basalt/cinder ore/emberglass currently come from camp rewards; no authored gatherable Cinderwake resource instances exist. Astra recommends separate Hearth kinds plus a fixed-site manifest, retaining existing loot/tool/claim/drop authority. Its detailed art, plane/LOS, placement, cooldown and reconciliation requirements are recorded in the design review.
- Found a real prerequisite defect: any high-ID topside mineable resource entered Orchard's rotating ore respawn branch. Added `legacySurfaceOreSlot` recognizing only the original48 reserved IDs, original ore kinds and topside space. Both the legacy active-site set and relocation branch now use that partition. Original generator arrays/counts remain unchanged.
- New tests invoke actual `respawnMiningResources`: a high-ID authored ore stays at its coordinates; original slots still relocate; interior veins stay in place; repeated sweep does not refill twice; authored spawn-site metadata cannot reserve a legacy candidate. This proves partition/location behavior, not future Cinderwake quiet replenishment.
-14 partition/mining/archipelago tests pass, including compiled full-body archipelago route coverage. Astra independently approved the bounded48-slot partition. It found the next required integration fix: `reconcileGeneratedSurvivalResources` deletes topside IDs absent the legacy generator, so validated manifest-owned rows must be preserved before installing nodes. Manifest-owned nodes must also bypass generic refill and tree regrowth once their quiet controller exists.
-Shared new resource kinds, active tool capabilities, exact native node art, world instances, harvest plane/LOS admission, quiet replenishment and acquisition pacing remain unfinished. No gathering completion or release readiness is claimed. No publication or restart.
-World/sim typechecks, targeted lint and diff checks pass for this partition change.

### Fixed gathering candidates and reconciliation preservation

- Added six fixed candidate sites in `hearth-resource-sites.ts`, separate from original generator arrays: two basalt sites at674,207 and681,201 (ash-shore); two ashwood at710,208 and718,209 (south-basalt); cinder at728,172 and emberglass at727,165 (terrace-kiln). Reserved IDs8600000001–6. Shore sites are level0 and terrace sites level1. Initial yields2 per mineral node/3 logs per ashwood tree are tuning candidates, not live pacing acceptance.
- Added exact immutable row identity validation: reserved ID, kind, topside space, tile, chunk and spawnSiteId must all match. `reconcileGeneratedSurvivalResources` preflights the full reserved cohort before any legacy mutations, then preserves valid rows and their mining claims. Mutable health/richness/depletion/regrowth/ordinal/cooldown state is not reset. A conflicting reserved ID in any space fails reconciliation; live ID occupancy survey remains required before activation.
- Production reconciliation tests preserve all six depleted rows/claims across repeated calls while existing generated rows still move/remove normally. Kind/space/tile/chunk/spawn identity conflicts reject before any row/claim writes. Compiled bare-terrain tests verify declared planes, cardinal body clearance and bidirectional full-body ferry-to-approach routes for all six sites.
-10 reconciliation/partition/mining/site tests pass; world/sim typechecks, targeted lint and diff checks pass. Astra independently passed3 new reconciliation/route tests and closed these bounded findings.
-These are candidate manifest entries, not installed world nodes. New-kind tool/loot/render capability, native footprints and composition, current occupancy, plane/LOS admission, quiet lifecycle controller and live gathering acceptance remain open. No publication or restart.

### Shared Cinderwake tool and loot capability

- Extended `MiningYieldState.kind` with a separate Hearth mineral union without appending to original ore/tree generation arrays. Added explicit `RESOURCE_LOOT_IDS` entries for tree_ashwood, rock_basalt, ore_cinder and ore_emberglass.
- Deterministic local `author-hearth-gathering.ts` writes four normal authored loot profiles and adds the three mineral capabilities to the six existing pickaxes with mineableResources. Hammers/other tools without that capability are not widened. Each mineral yield returns exactly one named material; only cinder/glass flag ore. A full-stage ashwood tree returns three logs only at health0, with no payout on partial hits or young stages.
-16 gathering/mining/tool tests pass, including actual loot resolver across node classes/seeds/ranks, all six pickaxes, wrong-tool exclusion and unchanged generator species lists. Content validation, sim/world/tools typechecks, targeted lint and diff checks pass. Items/loot authoring is byte-identical on rerun.
- Astra independently passed17 gathering/mining/loot tests and approved this bounded capability slice. Guaranteed mineral profiles intentionally ignore ore_dressing/rockhound/mother_lode yield bonuses; efficient-strikes work remains separate. Future ashwood regrowth must not expose silently harvestable young trees with zero return.
-World resource recognition/harvest integration, native art bindings, actual installation, plane/LOS admission and quiet replenishment remain unfinished. These definitions alone do not enable gathering at the candidate sites. No publication or restart.

### Gathering depletion persistence and quiet replenishment — local implementation (2026-09-10)

- Added a pure fixed-site replenishment planner: ten minutes of authority-time cooldown plus thirty fresh continuously observed quiet seconds. Advancing unsafe observations reset quiet; tick gaps or wall-clock continuity loss restart the quiet interval. Stale ordinals, non-depleted resources, malformed timing and u32/u64 overflow fail closed. No rewards are emitted.
- Added private `hearth_resource_depletion` rows with stable resource ID/generation, depletion tick, last observed tick, optional quiet start and wall-clock timestamp. Actual mineral/tree depletion transactions record trackers. Existing trackers are not silently rewritten; missing trackers on old depleted rows start a conservative new cooldown.
- The outdoor authority step probes the six exact IDs, observes sight and engagement every tick, and persists normal samples at one hertz plus immediate sight/engagement/policy interruptions. A wall-clock gap over1.5seconds resets quiet even when authority ticks resume consecutively. Refill and claim/tracker removal share the authority transaction; duplicate sweeps cannot increment twice. Ashwood restores full growth and the shared full-tree health, independently of its three-log loot amount.
- Refill requires current hostile-region policy, no suppression/conflict, no player in the existing176-tile padded encounter sight region, a non-engaged encounter, a clear same-plane3x3 body approach envelope, and no nearby living NPC. Unknown/returning encounter phases fail closed. Completed camps may retain `activated:true`; the corrected phase-aware check lets them become quiet instead of waiting for a second camp generation.
- Legacy mining migration, mineral replenishment and tree regrowth now skip reserved site IDs before any refill or claim deletion. The existing reconciliation conflict guard still rejects mismatched immutable identities. No resource rows are created by the new controller.
- Astra independently reviewed the planner and controller and added completed/unknown-phase regressions. Candidate terrain tests now check the entire3x3 respawn envelope at all six sites. Local world build/binding generation succeeds; the private tracker is correctly omitted from client bindings.
- This is controller evidence, not full gathering acceptance: classification, native node art/footprints, real harvest plane/LOS and reserved ashwood drops, guarded installation/current-map occupancy, actual database restart/transaction tests and live pacing still remain. No publication, deployment or service restart occurred.

### Hearth harvest recognition and authoritative admission (2026-09-10)

- Shared classifiers now recognize ashwood, basalt, cinder ore and emberglass via explicit additions outside the original generator arrays. A separate `MineableOreKind` includes the authored ores; client identified-ore perception accepts it while the procedural buried-vein cache retains its original species type. World mining preserves `rock_basalt` rather than collapsing it to legacy `rock_large`, so actual mineral resolution uses the authored material profile.
- `requireHearthResourceHarvestAccess` runs before harvest validation can spend vigour, wear tools, create claims or emit loot. Every Hearth-kind or reserved-ID target must match the complete immutable fixed-site identity and current space. Ashwood must be fully grown. The shared site-enabled check requires current hostile-region policy, a present nonconflicting associated camp, and no map suppression; removing expedition policy therefore suspends both harvesting and refill.
- The authority builds its bounded Cinder collision map with only the target resource omitted, preserving other resources, chests, terrain and authored obstacles. It rejects a blocked player body, either endpoint on the wrong site plane, and an obstructed segment from physical player interaction origin to the nearest resource footprint point. Existing tool reach, tool capability, vigour/durability and mining party-claim checks remain in the normal transaction.
- Ashwood break drops now carry the mining-style recipient reservation and item-obtained accounting. The compiled resource-handler dispatcher is explicitly tested for the ashwood break registration; existing named-loot tests establish its full-stage three-log result.
- New tests invoke the actual production admission and elevation helper with real collision/segment geometry. They cover all six sites with matching/wrong tools, depleted resources, wrong cliff plane, thin fence, blocked body, immature ashwood, conflicting identity/space and all site-disable conditions. The respawn fixture now exercises the same shared enablement helper.
- Native node artwork/footprints and population installation still remain, as do the client target/preview mirror and a full actual harvest transaction/claim/drop journey. No live resources were installed and nothing was published or restarted. This does not establish completed gathering or whole-patch acceptance.

### Hearth client target geometry and collision provenance (2026-09-10)

- Extracted the existing authoritative body/plane/tool-segment geometry into shared `hearthResourceGeometryAllows`; world admission calls it after private site-policy checks. This keeps client geometry and authority geometry on the same implementation.
- Engine client collision now retains a map from each resource ID to its exact obstacle object. The normal collision refresh preserves those references when adding authored map objects, combat targets and fixed furniture; targeting removes only the requested resource's own reference. Another obstacle with identical bounds remains blocking.
- `targetResource` filters Hearth candidates through exact site/space/maturity, authored mineral tool permissions and shared geometry before its normal specialization/facing/reach selection. Missing or mismatched resource/collision provenance fails closed. Legacy targets keep their existing rules.
- New client tests construct the actual engine collision map and verify all six nodes, depletion, permissions, young ashwood, identity mismatch, missing/stale provenance, cliff-level mismatch and a distinct coincident obstacle. Client/world/engine focused suites pass16tests; client, world and engine typechecks pass. Astra independently passed the16tests and reviewed the integration; its defensive stale-provenance recommendation was added and the client suite rerun.
- This mirrors geometry and visible resource eligibility, not private camp conflict or mining-claim state. Public-policy preview filtering now uses the current live document’s combat regions, retained with the collision refresh; an absent expedition policy hides the target. A regression covers policy removal. Native art, guarded node installation and actual end-to-end harvesting remain open. No publication or service restart occurred.
- Final client hardening: public expedition policy is checked from the same live-document refresh as collision, and the provenance object must still occur in the active collision list. The updated client suite passes4tests; final client typecheck/lint and sim typecheck pass.

### Native gathering node candidates and contact study (2026-09-10)

- Imported four exact native world-node candidates with `import-hearth-resources.ts`: basalt from Volcano_Rocks(0,112,32,32), cinder(16,16,16,32), emberglass(96,16,16,32), and ashwood from the full48x64 Dead_tree source. No recoloring, scaling or inventory-icon substitution. Native colors and alpha are preserved; imports are deterministic.
- Astra reviewed the source sheets and recommended fissured cinder without a molten ground ring, avoiding a false hazard cue. Contact anchors are basalt16,23; cinder8,29; emberglass8,28; ashwood25,52. Basalt/ashwood native shadow is#00000028; cinder/emberglass use#00000064. Validation caught the differing opacity and metadata was corrected.
- `hearth-resource-assets.test.ts` checks every source RGBA pixel, exact complete crop/anchor and opaque contact baseline. `render-hearth-resources.ts` produces `output/doc60/gathering-native-candidates.png` and source/image-hash provenance: baseline study only, not a runtime lighting capture. Astra independently passed the pixel test and reviewed the image, with no bounded crop/contact blocker.
- Reuse of the genuine existing `prop_cf_poi_stump` is the candidate ashwood cut state; renderer contact must be checked against its own opaque roots rather than assuming its padded anchor. Runtime art bindings, stump continuity, terrain contrast, raised-plane draw/light/shadow contact and guarded resource installation remain open. All four new assets remain unapproved drafts pending those checks.
- Tools typecheck/lint pass. Full assets validation is not clean: these and other existing exact-palette drafts require approval, and existing bridge south pieces have anchors outside their cropped height. No validation guard was bypassed; no atlas was released, no resources installed and nothing published or restarted.

### Bridge south-rail validator repair (2026-09-10)

- Resolved the three bridge-south `anchor must be inside the asset` failures. Their native source crops remain16x12 at y48 with anchor8,15; the asset canvas now adds four transparent bottom rows to reach16x16. Every visible pixel and its draw coordinate stays unchanged, without reintroducing the source sheet's bank colors.
- Updated the deterministic bridge importer and native-pixel test. Astra independently passed the pixel and ground-depth tests2/2 and checked placement: anchor tile pivot remains0 and ceil(canvasHeight/16) remains1. Only conservative transparent visual bounds grow by4pixels.
- Restored the prior bounded reviewed-source approval on those three assets with Astra's agreement. Re-import preserves bytes and approval. No new bridge design, native scene or lighting approval is implied.
- Source validation no longer reports the bridge anchors or new resource baked-shadow errors; draft exact-palette approval gates elsewhere still prevent a clean overall validation. Tools typecheck/lint pass. Atlas metadata must be rebuilt as part of the eventual validated asset build; no atlas was released, and nothing was published or restarted.

### Gathering runtime artwork binding (2026-09-10)

- Added a named Hearth resource-art bank to game and Map Editor loading. It checks the current generated registry before requesting new assets, keeping older atlas cohorts loadable during development. Missing encountered artwork uses the explicit missing-art marker; native node installation remains gated on the complete release assets.
- Mineral drawing uses its own native basalt/cinder/emberglass asset for every node class/richness. The gameplay resource producer has an explicit basalt path instead of the old generic small-rock decoration. Full ashwood uses its native dead-tree crop; its cut state uses the genuine existing stump with a local anchor override8,13 (shared source asset remains8,15). Immature ashwood presentation stays at the stump until quiet full-growth activation.
- Corrected both ends of ashwood's contact contract: the engine omits the legacy internal+4, and the gameplay producer supplies the actual resource foot instead of the legacyfoot−4. Astra caught the producer discrepancy during review. Drawing and optical collectors now share `hearthResourceVisualAsset`; elevated mineral and mature-tree collectors therefore use matching native assets rather than legacy basalt art or missing new-ore keys.
- Five engine tests pass for actual draw coordinates, mineral classes, full-tree/stump contact, missing-art visibility, older-atlas loading and nonmutating stump anchoring. Client typecheck passes. Runtime scene imagery, actual dynamic shadow/receiver parity, terrain readability, final native-art approval, atlas rebuild and guarded node installation still remain. No publication, service restart or resource installation occurred.
- Astra added and independently passed2 actual gameplay-producer regressions using native asset dimensions/anchors and real engine drawing at zoom2 with a nonzero camera. Full ashwood, depleted stump and defensive immature stump all place opaque roots on the same world foot; the former caller offset would fail by8screenpixels. Client typecheck/lint pass. Independent engine/art/source suites pass32tests. These close the selection/contact bugs, not raised-scene or actual pixel-shadow acceptance.

### Gathering native terrain and depleted-state study (2026-09-10)

- Added `render-hearth-gathering-study.ts`: local browser capture through actual GroundChunkCache, composed Cinderwake terrain, raised-terrain queue and engine resource draw functions. It injects exact source-asset pixels for review without rebuilding/publishing an atlas or contacting authority. Six panels use the actual fixed site coordinates; active/depleted images and source/image/atlas provenance are under `output/doc60/gathering-sites-{active,depleted}.*`.
- The first capture exposed poor emberglass readability: the small dark crystal read as incidental rubble against the repeated volcanic floor. Following Astra's image review, replaced it with the complete taller dark crystal crop(0,16,16,32), anchor8,29, preserving native#00000064 shadow and the same physical footprint. Refreshed import, contact study, both terrain captures and test expectations.
- The taller crystal now has a distinct readable upright silhouette beside the orange-fissured cinder node. Active and depleted ashwood panels visibly share ground contact; stump color reads as fresh-cut wood. Six source/draw/actual-producer tests pass; tools typecheck/lint pass.
- These are unlit resource/terrain studies without encounter population or decorative scene dressing. Actual Dynamic/Basic lighting, raised-plane optical parity, final populated-site routes and guarded installation remain open. No atlas was rebuilt or released, no resources installed and nothing published or restarted.
- Astra independently passed the6tests and approved all four node assets for the bounded source-art gate after the taller-crystal rerender. Set their source approval flags; deterministic re-import retains identical approved files. Refreshed capture provenance against those reviewed sources. Overall validation now has51remaining exact-palette approval gates elsewhere and no gathering-node, bridge-anchor or baked-shadow errors. Lighting, scene population and whole-release approval are explicitly not granted.

### Native equipment/material icon approval and safe re-import (2026-09-10)

- Astra reviewed all45 gear icons as native-source/import pairs and all five material icons, approving their bounded source-art gates. The ashwood material uses the previously corrected grained log. Restored source approval on all50 files; this does not approve worn-avatar art, balance or release.
- Both native icon importers now retain approval only when the freshly generated asset exactly matches the previous asset apart from its approval flag. Added an explicit `--assets-only` path so art regeneration does not overwrite subsequently implemented equipment acquisition, material definitions or lifecycle callbacks. Reimport preserved all50 approved file hashes and the complete items/lifecycle source hashes byte-for-byte.
- Added a50-icon native RGBA regression test and reproducible material contact sheet/provenance. The pavement audit independently locates all four existing variants at exact native16x16 source regions and records that provenance; its regression test checks every source pixel. Four icon/pavement/resource/bridge source tests pass, tools typecheck/lint pass, and content validation accepts843 definitions across21 files.
- No publication, deployment, service restart or resource installation occurred. The local atlas and gathering loader checks are tracked below; source-art approval is not whole-patch acceptance.

### Clean source validation and actual gathering atlas loading (2026-09-10)

- Astra approved the pavement quartet after native pixel and village-tiling inspection. Recorded exact source regions and explicit `frameKinds.base: variant` so future animation metadata cannot reinterpret these four variations. Every remaining source-art approval gate is now resolved: full validation passes1142 art assets,3 songs,10 SFX,55 palette colors and all four seasonal remaps.
- Built the normal local atlas successfully:1142 assets,9 categories,40 pages per season, revision `79e7ab84d7e4c616595e`. The approved south bridge canvases and four new gathering nodes are included. This writes only local generated artifacts; it is not a deployment or release.
- Added `--atlas` to the gathering study. It uses the real `loadOverworldArt` resource bank without source reconstruction. Astra identified that a truthy loaded entry could still be a fallback placeholder; the corrected capture requires each of the five exact registry IDs and explicitly rejects placeholder/mismatched assets. Provenance records all five IDs and actual draw counts:6 active nodes,2 depleted stumps.
- Viewed both actual-atlas captures. Their complete RGBA hashes equal the previously reviewed source-fixture images for active and depleted states. Minerals disappear when depleted; both ashwood stumps retain their native ground contact. These are still unlit local terrain studies with no encounters, players or live data; `releaseReady:false` remains explicit.
- Source tests4/4 and actual engine/loading/gameplay-producer tests7/7 pass; tools typecheck/lint pass. Guarded population installation, live harvest/restart/claim journeys, populated scene design and actual lighting acceptance remain unfinished. Nothing was published or restarted.

### Guarded volcanic gathering installation (2026-09-10)

- Added an explicit owner-only `installHearthGatheringSites` reducer with expected live-map revision/hash and content hash. It does not run during startup, ticks or legacy resource reconciliation. A private installation receipt and all inserted nodes commit together; a later missing node is a custody conflict rather than an opportunity to create fresh harvest rewards.
- Preflight examines all six reserved identities before writing. Matching existing rows and both mining-claim/depletion tables remain byte-for-byte untouched, including depleted states. Missing rows with orphaned claims/trackers, conflicting IDs or an incompatible receipt fail. Unrelated resources are never reconciled, moved or deleted.
- New rows use explicit authored mineral richness, full ashwood health/growth, stable spawn-site IDs and activation ordinal1. Current policy/suppression, associated camp state, online sight, offline player body occupancy, living NPC proximity and cultivated soil/crops are checked. No resource installation has been invoked.
- Shared geometry checks the exact12x8 mineral or8x6 trunk bases against terrain and existing obstacles, adds every proposed base together, then validates connected full-body harvesting/retreat stances. A bounded bidirectional route search connects the actual sanctuary recovery position to each site; one-pixel edges and exact-obstacle spatial buckets reject thin fences and enclosed but locally clear rings. The owner installer deliberately uses full-space collision, because the camp-scoped tick map can omit obstacles along a detour. Camp homes and safe recovery are rechecked after adding the nodes.
- Astra caught and corrected the content lookup's prefixed-ID error and incomplete readiness test. Shared `hearthGatheringContentReady` now verifies active authored and compiled materials, exact deterministic loot profiles/final-hit ashwood conditions, and usable common axe/pickaxe capabilities. The authority fixture now uses the real bootstrap registry, not a permissive item lookup stub.
- Twelve focused content/geometry/actual-installer-helper tests pass; additional reconciliation/respawn regressions passed18 tests before the content integration. World/sim typechecks and targeted lint pass. The local module build succeeds; generated bindings are being refreshed below. These fixtures do not establish actual database transaction rollback/restart, live map reconciliation, current population layout, deployment asset availability or live harvest/claim pacing. Final reviewed artifact deployment remains an operational prerequisite; no client-supplied ready flag is accepted.
- Final local world build and binding generation succeeded after the full-space route correction. Codegen explicitly omits the private installation receipt; the owner reducer binding is present. No live rows were inserted and no deployment or service restart occurred.
- Client typecheck also passes with the regenerated bindings.

### Gathering content changes after installation (2026-09-10)

- The shared site-enabled authority gate now revalidates the current deterministic gathering content contract, covering both harvest admission and quiet refill. Later content publication that retires a material, removes loot or disables required common-tool capabilities suspends existing nodes without resetting their harvest progress or custody.
- Real-registry transition regressions retire basalt, remove cinder loot and remove pickaxe permissions at the refill boundary. Each leaves the resource/claims untouched and resets the quiet interval. Restoring valid content must earn a fresh600 authority ticks before exactly one refill, generation advance and claim removal. Harvest retirement rejects before collision/tool work and restores admission without row mutation.
- Client targeting computes the same content readiness once per target search and hides affected Hearth targets. Its legacy-resource early return remains unchanged; this client Boolean is only preview state and is never accepted by authority as proof of readiness.
- Astra independently passed22 content/harvest/respawn/installation tests and reviewed transition semantics. Client targeting tests5/5, world/client typechecks, targeted lint and the local world build pass. No live node installation, content publication, deployment or service restart occurred. Actual database restart/claim journeys and full populated/lighting/pacing acceptance remain open.

### Native Cinderwake scenery foundation (2026-09-10)

- Audit confirmed the content-map composer currently adds Willowharbour facades/scenery but no authored Cinderwake scene dressing. The remaining volcanic environment work is real implementation scope, not covered by the six isolated gathering studies.
- Imported six exact native source candidates: small/large orange-foliage trees, violet plant, plain column cluster, broad basalt pillar and complete96x144 tower. The importer retains native translucent shadow RGBA, records exact crop provenance and places the visual anchor on the native opaque ground-contact row; reviewed-source approval is preserved only for an otherwise identical reimport.
- The first large-tree crop omitted its left crown and shadow. Astra caught this during source review; widened it from48,0,32,48 to32,0,48,48 with anchor22,41, preserving the same world ground contact. The native pixel regression now locks that complete rectangle/anchor. The contact study and provenance were regenerated and viewed.
- Astra's layout study keeps the protected ferry/arrival route broad, marks both sanctuary departures, reserves the six harvesting rings/camp floors, and places bright foliage sparsely outside attack cues. A northern tower is only a candidate backdrop until full-base elevation, collision and populated-scene checks pass. An inert chest must not be described as the plan's functional supply cache.
- The six-source native RGBA/contact/shadow regression passes; tools typecheck/lint pass. Source review is bounded separately from physical footprint, map placement and lighting acceptance. No new scenery was placed in a map and nothing was published or restarted.
- Astra approved the corrected six candidates for source-crop/contact only. Restored those flags, verified byte-identical approved reimport, and refreshed contact-sheet provenance. Full asset validation passes1148 assets; the normal local atlas build succeeds at revision `4761e767a80760b1e101` (9 categories,40 pages per season). No source-crop gates remain for this set. Asymmetric anchors, actual map collision, scenery placement and lighting remain to be implemented/reviewed.


### First composed Cinderwake scenery and landing candidate (2026-09-10)

- Added15 native Cinder scenery objects through the actual conflict-checked, idempotent content-map composer: four pillars, four rock/flower groups, two peripheral blossom trees and the northern level3 tower. Astra found and repaired half-tile native-base alignment: partial4px collision masks now cover opaque eastern feet without moving the reviewed art anchors.
- Three composed-map regressions pass for all full foundations/planes, all six combined harvest rings and bidirectional arrival routes, camp-member body clearance and exact native base coverage. Map-composition/export checks also passed for this15-object slice. Tools typecheck and targeted lint passed.
- Rendered and reviewed unlit native landing, shore, east and caldera studies with actual composer objects, six gathering nodes, enemy tells, Warden/summon fixtures and a player. Corrected the offline harness to apply the same raised-foot projection used by the client rather than hiding raised objects beneath terrain. These are offline fixtures, not live gameplay or lighting acceptance.
- Astra accepts this initial placement slice but explicitly rejects whole-island readiness: natural pillars do not yet communicate a safe boundary; the road is not visually distinct; ruins, alternate crossings, lavafalls and a complete volcanic composition remain outstanding.
- Offline fixture export v6 has59 prefabs/605 objects, zero unapproved assets and atlas revision4761e767a80760b1e101. Its input is a synthetic baseline fixture, not a live saved-map export; publishReady remainsfalse. Subsequent export manifests now include the Cinder scenery compiler hash.
- Next local candidate adds a paved protected landing, a moored native boat, ferry sign, benches/cargo and the actual personal supply-cache access point at650,202. The complete ferry return route remains clear. Composed body checks found650,203 too close to the chest; the usable frontage is650,204. Functional cache integration and review are in progress, so this candidate is not yet accepted for release.
- No map/resource installation, publication, deployment or service restart occurred. The full doc60 goal remains active.


### Protected landing and shared personal supply cache (2026-09-10)

- Completed the local landing grouping: native moored boat, ferry sign, cargo, benches and a paved quay/cache apron. The Cinder composer now contributes22 objects (15 volcanic scenery plus7 landing objects), reusing reviewed village-kit prefabs. The boat remains on blocked water, the walkable quay stays accessible, and the original ferry threshold/arrival retain a complete safe return route.
- Added a functional personal supply-cache endpoint at650,202 with body-clear frontage650,204. It shares the existing20 owner-private Delve-lobby stash slots; opening it does not mint consumables or expose a communal chest. E/touch uses the existing container UI and explains the shared contents.
- Authority validates the exact active native map object/prefab, sanctuary, plane, body clearance, bounded reach and line of sight to the actual chest edge. An intervening foreign fence blocks access without excluding any unrelated obstacle. Mounted/carrying/seated, bow/defense/recovery, death and Delve-custody conflicts are rejected. Session rows bind endpoint and connection; subsequent loads/writes revalidate access, preserving contents when an endpoint is removed or disabled.
- Local bindings regenerated successfully. Final combined checks pass28 tests across6 suites (composed geometry, exact endpoint validation, extracted storage authority, actual client activation/target priority, map composition and export). Tools/client/world typechecks and targeted lint pass; the final checked world build succeeds after the LOS correction. Tests use fake DB/controller state and actual native composition, not a live persistence transaction.
- Refreshed and viewed `output/doc60/cinder-landing-station.png` with the player at the real usable frontage. Astra accepts the station's improved identity and shown player clearance. Bright rectilinear paving is a recognizable landing treatment, not approval of the whole island's environment composition or lighting.
- Offline synthetic-baseline export v7 contains40665 authored cells,59 prefabs and612 objects, no draft assets, and current Cinder compiler provenance. It remains explicitly publishReadyfalse. This does not replace the required live saved-map survey.
- Next environment work: visible protected/hostile boundary at actual crossings, distinct onward routes, a coherent ruined terrace with alternate passage, native lava crossing/lavafall composition and fuller island dressing. Moving combat, Basic/Dynamic/day-night, live ferry/cache persistence and the wider doc60 acceptance gates remain open. Nothing was published, installed or restarted; the complete goal remains active.


### Cinder boundary geometry and policy notice (2026-09-10, in progress)

- Moved the four reviewed pillar objects into two open four-tile gate pairs: north662/669,192; east668,203/211. Safe-side paving connects the landing to north x664–667/y192 and east x669. It ends at the exact combat-policy edge; it does not redefine the protected region or classify every unpaved tile as hostile.
- Added current-policy notice semantics for protected, within-three-tiles-of-hostility and hostile states. Tests cover inclusive east max668/physical edge669, exact north192, changed/removed policy, other spaces and nonfinite positions. The client uses the authoritative player position, not the scenery's apparent boundary.
- Composed geometry proves every pixel of all four lanes through both approaches is body-clear, with the six harvest rings/routes and camp positions still clear. The map/policy/composer/export batch passes20tests/4suites. Offline synthetic export v8 remains explicitly not publication-ready.
- Native north/east captures show clear approaches and enemy cues. Astra rejected the first standalone top-center HUD integration because it overlaps the existing zone/minimap controls at compact widths. Integration into the existing zone display and full-HUD compact review are underway; standalone captures are not accepted HUD evidence.
- User reported signing into a shared browser. Rechecked accessible canonical Orchard tabs3/5: account/loading state, no saved OIDC session and no responding same-origin peer session. No token value was read or printed. Reloading the account tab did not establish a session; asked which shared/browser window was used. Live survey remains unverified while local work continues; this does not block the whole active goal.
- No publication, deployment, resource installation or service restart.

### Boundary HUD integration and reviewed compact layout (2026-09-10)

- Resolved Astra's compact-screen overlap finding by integrating protected/danger-near/hostile state into the existing stacked zone ribbon. Its rectangle, watch, moon display, minimap and collapse controls remain authoritative for both rendering and hit testing. Removed the temporary independent banner and its unused UI helper.
- The model uses the authoritative player's own space/coordinates. Danger state participates in the retained status-cache key, so boundary transitions repaint. The collapsed zone tab carries P/! and its existing tooltip explains the state. Protected text says enemy damage is blocked; it does not claim all combat actions are disabled.
- Native complete HUD captures at320 and360 logical pixels are `cinder-danger-full-hud-320.png` and `cinder-danger-full-hud-360.png`. Root and Astra viewed them. Longer “SAFE / DANGER NEAR” text visibly clipped at320; retained fully readable “DANGER NEAR”, with explicit current protection in the zone tooltip. These are bounded HUD fixtures, not live touch/latency or full gameplay acceptance.
- World-only north/east boundary captures were regenerated without the superseded standalone banner. Astra accepts the shown gate approaches and scene cue clearance. Tests additionally prove every Cinder paving cell remains sanctuary and policy adjoining other peaceful/unclassified regions does not create false hostile-border warnings.
- Final root map/policy/composer/export batch passes21tests/4suites; Astra's UI/ribbon batch passes116tests. Client/UI/tools typechecks and targeted lint pass. Offline v8 retains40665cells/59prefabs/612objects, zero draft assets and publishReadyfalse.
- Visible onward hostile routes, quiet ash-floor variation, ruins/alternate crossing/lavafalls and full moving-combat/lighting/live acceptance remain open. Shared-browser authentication clarification remains pending; no credentials were exposed, no live map survey claimed, and nothing was published or restarted. Full doc60 goal remains active.

### Shared-preview session mismatch follow-up (2026-09-10)

- User confirmed signing into this thread's shared Orchard preview. Revalidated automation tabs3/5 without clearing storage or logging out: both reported Account and no tab-local OIDC session; snapshot failed with PreviewAutomationExecutionError. No credential values were inspected or printed.
- Requested the normal account sign-in action through the page's existing Enter handler in tab5. Unlike the automation key tool, the page event actually initiated the standard OIDC redirect. It reached the provider's unsigned-in email/password form, with no filled credentials or automatic SSO return. This establishes that the browser session exposed to automation is not receiving the user's reported login; it does not contradict the user's action or justify asking for credentials in chat.
- Left the ordinary sign-in form open. No authentication bypass, token extraction, live SQL request, survey claim, publication or restart occurred. Live survey remains unverified; local patch work can continue while the shared-session handoff is resolved.

### Shared preview authenticated; actual live revision captured (2026-09-10)

- The user's latest sign-in handoff worked in shared tab1. The game was connected; saved live map revision4/hash21a3c554 was captured without exporting credentials. Earlier tab3/5 authentication findings are superseded.
- Exact83692-byte map saved at output/doc60/live-survey-20260910-r4/map.json. Browser and filesystem SHA256 match02bd20095af6595294dd0c4858c5992f87ea84c87f9513bd4ddca3dd951d5809. Source metadata and51 read-only SQL query outcomes are saved alongside it. SQL requests used the existing browser session locally; no token was copied into an artifact.
- Composing against this actual baseline succeeded without conflicts: candidate revision5,40665cells,60prefabs,616objects, zero draft assets, publishReadyfalse. The difference from synthetic v8 preserves the live map's existing prefab and four objects. Candidate: output/doc60/map-candidate-live-r4-v1.
- Public global SQL found no resources, NPCs, placed objects, players, soil, crops, chests, items, surfaces, hives, cellar excavation or combat targets inside either proposed island's exact bounds. Public occupancy queries for reserved spaces65520–65525/65532 and fixed gathering/NPC/practice IDs returned zero. Existing homestead/portal rows do not use these reserved spaces. These are sequential snapshots, not atomic publication locks; revalidate before activation.
- Private player_spawn/rogue_run/rogue_run_member tables were inaccessible to this account. Their allocation/return occupancy remains unverified. Exact island bounds do not prove absence of visual overhangs from outside those bounds.
- Astra approved the cave facade481,415, lower-plane threshold481,416 and return481,418 against the real saved terrain/native art. All291 sampled approach positions were body-clear against saved geometry; preserve terrain collision and avoid the asset's blanket3x3 collider.
- The public cave-area survey additionally found29 resource rows, including nearby birch479,418 and spruce482,413. NPC/placeable queries were empty. A subsequent health/depletion query returned401 ExpiredSignature; this does not invalidate earlier successful captures, but resource state was not obtained. Astra is checking the conservative fully-grown case. Production depth sorting, upper-plane rejection, lighting and dressing remain open.
- No live data mutations, gathering installation, publication, deployment or restart occurred. The complete patch is not ready for testing; remaining implementation/acceptance gates above still apply.

### Publication approval and preflight result (2026-09-10)

- User explicitly approved publishing everything in the current patch. This approval is retained; another permission request is not required for this release. Approval does not establish completion of the outstanding implementation or data-preservation checks.
- Fresh lifecycle:integrity passes (119 artifacts, digest e34afcb149c43f2384cf5db64bc48bc77dbb47a2cad753015a96b8c74c29fd34). Fresh content:validate passes843 definitions in21 files. Logs: /tmp/hearth-publish-lifecycle.log and /tmp/hearth-publish-content.log.
- Executed the actual Studio prebuild verifier; it exits1 because this checkout still contains the retired renderer. The guarded world release rebuilds this Studio path. Integrate the reviewed source at /home/toby/projects/orchard-cellar-studio-release before that workflow; do not bypass the guard.
- This shell has no configured WORLD_REJOIN_TOKENS_FILE, WORLD_RELEASE_CONTENT_CANDIDATE or WORLD_RELEASE_CONTENT_OWNER_LABEL. Browser authentication used for the survey is not a prepared rotating rejoin credential file or reviewed content-head release candidate. No credential was exported. Stored-data migration/reconnect checks remain unexecuted.
- Publication did not start. World, game frontend and Studio services remain active, with no restart or live mutation.

### Actual release scope, renewed authentication and reviewed Studio staging (2026-09-10)

This entry supersedes the earlier Studio-source and missing-credential blockers. Existing user approval remains valid for this update.

- Read `.git/cellar-ui-release.md` and the AGENTS release-source section. The main Studio guard remains byte-identical (SHA256425a634fc8e88722a151e3c58ee969cc0f534ab747c4b2811e0562c6ee97e9e9). New `scripts/build-reviewed-studio.sh` stages the reviewed kit source in an isolated workspace with current bindings, content, simulation/auth/engine and assets, retaining its reviewed renderer adapters. It runs the normal guard/typecheck/production build and pins copied inputs and dependency lock. Both release paths use this source; no guard bypass or retired-renderer deployment.
- Compared actual live full stored schema with candidate:119→135 tables,16 additions,0 removals and4 existing row changes. An isolated archived baseline matches every actual live stored table. The rehearsal caught residence fields inserted before `gateOpen`; moved them to the end. Corrected candidate is append-only with defaults, and an actual `--delete-data=never` update succeeds on that isolated baseline. Evidence `output/doc60/release-preparation/schema-diff-fixed.json`. This is schema compatibility evidence, not a restoration of production rows.
- Added an explicit `WORLD_RELEASE_MIGRATION_KIND=schema-only` path: retain fresh verified backup, isolated production-row restore, no-delete publication, content CAS and durable reconnect parity; skip unrelated chest backfill/phase/draining. Legacy chest mode remains the default. Documented applicable snapshot paths in runtime README.
- User's renewed shared-preview sign-in successfully renewed the existing private mode0600 reconnect file at `/home/toby/.local/state/orchard-release/rejoin-credentials.json`. Encrypted handoff only; no plaintext token was printed. Temporary key deleted. Browser relinquished the rotating refresh token to the file. Repeated required-refresh commands succeeded. Authentication is no longer the release blocker.
- Authenticated capture obtained actual live program82e566438482f72cdf0f46136e046c0d8ec1d60a9a4482485b2fb817d33d949c and live content revision8/hashdfdf555b/531definitions. Fresh reviewed candidate targets revision9/hash5b3399a3/843definitions,333 canonical upserts and0deletes. Candidate SHA2564e2e2c89c53aa75f1fd3bee17ce88cca8ee5968bb50ed494203635c16f51d303. Fresh live CAS assertion passed; nothing applied. Private candidate and captures are under `/home/toby/.local/state/orchard-hearth-release-20260910`.
- Durable reconnect coverage now includes own stash slots, equipment preferences, outdoor rewards and village orders. Active stash window and transient combat state have explicit ephemeral exclusions; durable contents/vitals remain checked. Regression verifies private-row scoping and loss detection.
- Fixed narrative preview for equipment/furnishing objectives. Reviewed Studio equipment rendering now presents exactly10 canonical cells including Body and compact hotbar0, without invalid cells10/11. Astra native review and554 strict snapshot/component tests pass; evidence `output/doc60/release-preparation/studio-equipment-review.md`.
- Added34 missing reviewed UI-kit sprite sources to the current atlas, bringing it to1182 assets. Corrected Emberglass/Guardian Seal to native plain sheets; Astra approved both and all50 icon pixel checks pass. Evidence `material-outline-review.md`. Older v6 release archives and pre-correction map atlas headers are superseded and must not be published.
- Workspace typechecks and lint pass after targeted source fixes and excluding generated evidence/artifacts from source lint. Latest bounded release/reconnect/combat/furniture/Studio model tests:98/98 across11files (`/tmp/hearth-release-bounded-final.log`). Full coverage run ended with exit143 and several failures; no complete suite or coverage pass is claimed.
- Remaining test failures include genuine content envelope overflow (614868bytes exceeds512000budget), missing lifecycle ownership/capability coverage for new interactions, plus stale exact content/graph/structural fixtures and a shadow-art expectation. Preserve those gates while resolving them; do not merely increase budgets or classify interactive furniture as inert to force green tests.
- Full restored-production-row rehearsal, final current-atlas artifacts, final live CAS/occupancy checks, map/portal/resource activation and the earlier full doc60 gameplay/lighting/performance acceptance remain outstanding. No world/content/map publication, installation or production service restart occurred. All three production services remain active. Full patch is not ready for testing.

- Final staged artifacts rebuilt with atlas revisioncf36c18e54741eecd13b: reviewed Studio v10 production build/typecheck/static checks pass, and its strict554-test equipment/registry acceptance also passes with all current assets. Game v2 production build/static and chunk checks pass. Current-atlas map candidate is `output/doc60/map-candidate-live-r4-v2`, still explicitly not publication-ready. Archived884 files plus source/lock/static/hash evidence in `/home/toby/.local/state/orchard-hearth-release-20260910/candidate-v10`; this supersedes the earlier v6 static artifacts. Latest changed-source lint and shell syntax checks pass. The disposable3317 schema rehearsal authority was stopped; production services were untouched.

### Requested publication: release preflight repairs (2026-09-10)

- User again requested publication. Ran the guarded schema-only release with the existing reviewed content candidate and renewed reconnect file. Authentication, content candidate verification, fresh live CAS, rollback packaging, lifecycle integrity and builds/typechecks passed. First coverage run exposed the previously recorded failures; that obsolete preflight was cancelled before downtime while fixes were prepared. Production was not changed by that attempt.
- Corrected the real action-rig art regression: `action_cf_base` had lost its exact `#00000064` baked-shadow marker when sitting animations were imported. Restored the marker and updated the canonical action extractor to retain it. No pixel recolouring. Existing shadow tests pass.
- Astra integrated explicit four-way item ownership:119 generated callbacks,112 reviewed actionless items,69 real plan data graphs,32 dedicated furniture transactions. All69 graphs are dispatched in tests to verify exact learn/consume effects, and furniture routes retain authorization/custody/generic-placement negatives. No interactive item was relabelled inert.26 focused tests and targeted lint/typechecks pass; `output/doc60/release-preparation/lifecycle-ownership-review.md` records the evidence.
- Corrected stale homestead palette expectations (32 residence-only furnishings must not be outdoor builds), zero-sale-value economy expectations, complete843-definition hash fixture and reviewed object/registration counts. Re-captured the existing structural seam tripwire for the already reviewed residence/seating and boundary HUD work. Fourteen focused model/art tests,18 object graph tests and15 remaining gate tests pass. The two AST-heavy escrow mutation tests now allow30s under coverage; their negative assertions are unchanged.
- Measured the actual uncompressed content subscription on an isolated authority: all20 clients received557488bytes, exceeding the unchanged500000-byte limit. Added an anonymous `runtime_content_definitions` view with only id/kind/original JSON. The game uses this view; Studio retains complete authoring rows with revision, slug and editor audit fields. The game still independently checks complete row count, original-payload hash and semantic validity. No stored table/data is removed.
- The same actual20-client acceptance now passes at490169bytes per client, with a1000-definition atomic update delivered to all20 without reload/reconnect. Registry build p95=23.26ms against30ms. Evidence `output/doc60/release-preparation/content-wire-acceptance.json`. Static measurement now separately reports full authoring JSON envelope size and BSATN runtime row payload size; budgets were not raised.32 focused client/reconnect/measurement tests pass.
- Regenerated bindings and the1182-asset atlas; latest offline map export is `output/doc60/map-candidate-live-r4-v3`. Older staged v10 artifacts are superseded by these runtime-view/shadow changes. The second guarded release is running from current source; no successful production release or complete patch acceptance is claimed until its final checks finish.

- The second full coverage run completed: 748/750 files and 4,259/4,261 tests passed. Its only failures were stale smith catalogue and lobby torch-offset assertions; corrected those assertions against the actual plan catalogue and shared emitter definition. Both files then passed all 10 targeted tests. A third guarded release is repeating full coverage before downtime.
- Astra independently reviewed the runtime content view and client event handling, with 20 focused tests passing. Added exact original-row preservation and per-observer raw-payload hash checks to the disposable 20-client measurement. The first rerun overlapped full coverage and exceeded the existing registry CPU timing budget; rerun without that concurrent workload before claiming the stronger measurement passes. No budget was raised.

### Interrupted publication recovery (2026-09-10)

- Third full coverage run passed all 750 files / 4,261 tests. Reviewed Studio and game builds/static gates passed. Verified production backup is `/home/toby/backups/orchard/hearth-release-20260910-attempt3`.
- Release was terminated during isolated archive extraction, before restored-host startup or production module/content publication. Container records an OOM kill; `/tmp` is tmpfs. Changed the large restore workspace to disk-backed `.release-work`, rejecting tmpfs, retaining isolated cleanup. All 10 release-continuity tests pass.
- Original world source manifest still matched SHA256 `4a699a62fb8e29df6e98fd2886915be67c5c9b1499e3cc5f1f23d51364227dd2`. Resume stopped at expired refresh-session HTTP 400 before further rehearsal. Restored the exact previous game and Studio static artifacts from the verified rollback archive and restarted all three services. No new module/content/map was published.
- Shared preview has no saved session after restart. Renewed sign-in is required before another guarded release attempt; since the old world is serving again, capture a fresh backup/CAS before mutation. Existing publication approval remains valid.

### Successful guarded publication (2026-09-10)

- User renewed shared-preview sign-in. Encrypted handoff renewed the mode0600 reconnect file; refresh token has one owner and temporary private key was removed. No token printed.
- Reused unchanged passing world source manifest and full 4,261-test result; fresh live CAS, rollback capture and production backup performed after recovery. Backup: `/home/toby/backups/orchard/hearth-release-20260910-attempt4`.
- Disk-backed isolated restore completed without another OOM. Actual restored-production no-delete schema upgrade, content CAS and reconnect verification passed. Production no-delete upgrade and333 upserts/0deletes then succeeded: content revision9/hash5b3399a3/843 definitions. One identity matched all42 durable views against the restored expectation. No chest backfill or drain ran.
- Game `/assets/index-kgbP28iK.js` and reviewed Studio `/assets/index-bTJNq6QM.js` deployed. All three services active; canonical public static checks pass and public HTML byte-matches installed artifacts. Studio guard remains unchanged. Release/source/lock evidence in `build/releases/hearth-20260910`; active source/rollback recorded in `.git/cellar-ui-release.md`.
- Stronger disposable20-client payload acceptance now passes: all843 original rows preserved per observer, every final payload hash verified,490169 initial bytes/client, registry p95=23.43ms. Existing budgets unchanged.
- This is code/schema/content/static publication, not completion of the whole doc60 plan. The new map layout, portal/resource activation and outstanding full gameplay/visual/performance acceptance remain staged/open. Do not report the new islands as live.

- Post-publication independent browser smoke: Studio canvas rendered the map workbench and reported zero console errors/warnings. Screenshot `output/playwright/hearth-release-studio.png`. Shared hidden-preview blank capture was not reproduced in the independent browser. This is a render smoke check, not complete editor UX acceptance.

### Island layout activated (2026-09-11)

- Renewed user-authorized session and repeated54 live survey queries. Live map remained revision4/hash21a3c554, matching the preserved input bytes; live content remained revision9/hash5b3399a3/843definitions. Public occupancy checks found no player positions/homes/placeables/resources/crops/items in island bounds. The five existing outdoor NPCs matched authored Willowharbour identities. Private-table queries failed explicitly and were not treated as empty. No private rogue/spawn state was changed by this map-only activation.
- Verified exact deployed asset registry hash, current candidate/compiler/used assets and Astra design review. Root39 targeted tests and Astra28 focused tests passed. Published through owner-only publishLiveMapDocument with expectedRevision4 and mutation IDhearth.islands.activate.20260911.r5. Live map is now revision5/hash38ce9f5e, candidate SHA256ef53c93da32b0eabcae33477317effeb1f49c6b53e81dfa96cec69b96ace087b. Original map retained in local before capture and durable revision history.
- Seven Cinderwake enemy bodies provisioned automatically after policy activation; public island NPC count rose5→12. The guarded installHearthGatheringSites operation succeeded with exact map/content hashes, and all six reserved resource rows were verified. Existing mutable resource state was not reset.
- Existing signed-in game client received revision5/hash38ce9f5e,616objects/60prefabs and the three island combat regions without a frontend redeployment. Evidence and scripts in output/doc60/map-activation-20260911. No service restart or Studio guard change.
- Actual ferry journeys, service-interior portal binding and cave facade/lobby activation remain distinct acceptance work; this operation activated the reviewed island terrain/scenery/policy and gathering nodes, not the complete doc60 patch. No claim of completed end-to-end travel testing.

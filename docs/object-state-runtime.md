# Object state runtime

Status: implemented on `feat/object-state-runtime`, stacked on PR 78 (`2dda559c`). Final clean full-suite validation is running. Only GoldCondor coordinates merges; no deployment is authorized.

## Contract and decision record

Implements docs 61 §3 and docs 62 object runtime priority: authoritative lazy state settlement, one resolved appearance for rendering and collision, and compatible natural-object projections. Existing resource/crop/placeable row identities and payloads remain readable. No table retirement or destructive migration occurs.

Persist lifecycle anchors separately from presentation state. Settlement uses authority ticks and the shared PR 65 bounded state machine; an event transaction persists its anchor and routes each firing through PR 78 graph/callback policy. Missing legacy anchors initialize from current declared state; corrupt anchors fail closed rather than replaying callbacks. Region activation and authority interaction are settlement boundaries; no whole-world per-tick lifecycle sweep is introduced. Nested event dispatch shares a bounded transaction budget.

Natural resources and crops gain deterministic object projections with explicit aliases; authored object definitions take precedence. Legacy harvest, loot and farming adapters remain responsible for their existing storage during dual read. Their visual and collision semantics must remain equivalent before adoption.

The Canvas workload is the existing game sprite renderer (60 Hz target, visible map placements and placeables); it retains one frame loop, asset and transformed-mask caches, camera/input conversion, resize/DPR handling and depth order. State/content changes invalidate presentation entries; idle definitions do not introduce frame-time state-machine execution. Resolved sprite, footprint, lighting, light, interaction and target data come from the shared resolver. Map lighting binds by authored sprite/animation semantics, never an asset-name prefix or a hand-maintained light list.

D6 owns medium, traversal abilities and hazard policy. This lane supplies solid footprint projection only. Frozen wave-one branches are not edited.

## Validation and handoff

Validation completed: 166 focused tests across 23 files; a separate 78-test regression run covers interior compatibility, cleanup, rendering signatures and package seams. Added deterministic renderer tests cover arbitrary-named lights/column casters, off-state map lighting and independent local/celestial occlusion. Workspace typechecks, lint, world build, guarded Studio production build, client production build, lifecycle integrity, 919-definition content validation and 1320-asset validation passed during implementation. Final checks are repeated after the last source changes.

The initial full coverage run completed 981 files with 6044 passing tests, 8 failures and one skip while fixes were in progress. All eight failures were diagnosed and fixed; this is not recorded as a clean full-suite pass. A fresh complete `npm test` run is active at `/tmp/orchard-object-state-full-test-final.log` (session 61577). Final results and PR readiness must be updated before handoff.

Versions: repository 0.26.0, sim 0.24.0, world 0.23.0, engine/client 0.21.0, world-bindings 0.17.0. Generated bindings add only private-row type descriptors; no new public subscription or reducer API is required.

## Implemented authority and migration boundary

`object_lifecycle_state` privately stores each placeable's definition, versioned JSON anchors and `settledAtTick`. The public placeable `stateJson` remains the presentation projection. Bigint ticks use decimal strings; missing anchors initialize at first authoritative observation, while malformed/future anchors fail closed. Explicit state mutation settles the old state before applying its patch, preserving paused growth and state-entry times.

`object_environment_epoch` and its singleton head journal weather-mode/calendar-offset changes. Lazy growth splits at those epochs and automatic weather/season boundaries. Fractional progress credit and unfinished sweep time survive each split; growth samples the environment in which a sweep completes. Watered/fertilised flags come from declared object state, and authored preferred-biome modifiers read the current topside map tile. Catch-up is capped at 512 environmental intervals per scheduled transaction; a persisted checkpoint resumes a longer gap. Interactions reject `object_state_catching_up` until that object's scheduled work catches up. Transition chains and nested scripts retain the 32-invocation transaction budget and 64-effect cap.

Nearby active chunks enqueue settlement at one hertz using the existing private `entity_timer`. Each object settles in its own scheduled transaction: blocked or unapproved callbacks roll back that object's state, not movement or another object. There is no global object scan. Creation raises spawn/place; interaction, explicit state change and timers route through the same planner. Deleting a placeable removes its lifecycle anchor. Callback approval remains exact-hash, separate-reviewer and definition-owned as in PR 78. Event-owned transition graphs are excluded from duplicate normal dispatch; timed graph references may still expose a separate manual interaction.

Resource/crop definitions remain the source rows for the compatibility adapters. The registry supplies `object:` projections for them unless a real authored object of that ID exists. Existing resource/crop ids, loot, health, mining variants, farming clocks and storage remain unchanged. Projection-only objects are excluded from the legacy compact interior-furniture fingerprint catalogue so their artwork cannot make an existing room ambiguous. This PR does **not** retire those legacy tables or move existing resource/crop instances into placeable storage; that migration needs its own backfill/parity/retirement review.

Map bindings match authored sprite/default visual and resolved state overrides, with explicit legacy native-art aliases in the compatibility adapter. Matching definitions with conflicting appearance fail closed. A new authored lamp or arbitrary-named column caster needs no renderer asset list or prefix convention. Existing canvas transforms, cache invalidation and painter depth remain covered by render tests.


## Integration and next-session handoff

Worktree: `/home/toby/projects/orchard-object-state-runtime`; branch: `feat/object-state-runtime`. Base: `feat/lifecycle-object-quest-hooks` / PR 78 at `2dda559c`. Do not change the frozen predecessor heads or integrate partial main while GoldCondor resolves the coordinated batch. Combine additive schema declarations and generated types with D6's separate `traversal_hazard_state`; preserve both lanes' sim exports and use the highest applicable feature versions.

Read this document, `AGENTS.md`, docs 61–62 on `origin/docs/world-editor-model`, then verify branch/PR state and pending checks. The implementation has no live publication or destructive migration. Existing resources/crops remain in their legacy authoritative stores; do not describe this compatibility stage as completed table retirement. Review any future migration against preserved ids, loot/collision/growth parity and an explicit backfill/verify/retire plan. Environment epochs are retained because older object anchors can still need them; do not prune without proving the minimum live anchor.

Next milestone: record the final clean test/check results, open/update the separate PR, send its exact head and integration notes to GoldCondor, and release reservations. Any merge or deployment is coordinator-owned and separately gated.

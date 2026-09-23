# Timing delivery handoff

Owner authorized following BrownHorizon mail 324; GoldCondor coordinates integration.
Do not merge or deploy from this workstream.

- A: PR #84 (`fix/timing-clock-domain`) separates raw process time and calendar time.
  Workspace typecheck/lint, content validation, world/client builds pass. Full suite
  reached 978 passing files with one obsolete source-location assertion, subsequently
  corrected and verified (9 targeted tests). The cumulative B/C run validates the repair.
- B: `feat/shared-processor-timing`, stacked on A, adds the shared projection,
  authored kit panes, hover picking and bounded caches. Game/world builds,
  typecheck/lint/content validation pass. Focused timing/bundle tests: 25 passed;
  reviewed structural-seam recapture: 6 passed. Full suite pending.
- C: growth adapters and honest paused/conditional timing follow B. Private generic
  lifecycle anchors from #81 must remain private; exact public generic ETAs need
  an explicit presentation contract. No new authority or epoch system is introduced.

## Local browser evidence

Disposable loopback world on port 3701 and local client 5178; production untouched.
Temporary fixture uses real processor inputs and a calendar offset of 354191 ticks.
Furnace shows IN PROGRESS / 0:20 LEFT, then READY with a copper bar and fuel consumed.
Barrel shows IN PROGRESS / 0:20 LEFT with four raw beets, then four preserved beets after settlement. Captures:
`/tmp/timing-furnace-running.png`, `/tmp/timing-furnace-panel.png`,
`/tmp/timing-barrel-running.png`, `/tmp/timing-barrel-settled.png`. Closed stale furnace hover reads COLLECT TO CONFIRM
and ESTIMATED. No inventory tokens or credentials are included in evidence.

Retained authored-frame rendering also consumes `ui.timing` through its typed
model and update method. Frame pixel goldens and the bootstrap content manifest
were regenerated for the five authored frame changes. Fixture verification:
563 tests passed; final ordinary (non-update) replay includes Studio shell assets.
The first full run also needed generated Studio public assets in the isolated
worktree; `npm run ui:assets -w @orchard/tools -- studio` supplies them.

## C implementation

`feat/shared-growth-timing` stacks on B. Crop/tree/fruit and authorized stateful
projections share the contract and existing math. Spatial hover is independent
of action reach and invalidates only for relevant row/content/map revisions.
No lifecycle view/schema is added: generic private anchors remain unavailable
to public hover until a separately authorized public projection is supplied.
Focused growth/spatial/kit checks: 19 passed before final integration; workspace
typecheck/lint/content validation and world/client builds pass. A fresh full
`npm test` is running against cumulative A+B+C, including B fixture repairs.

Local C browser checks at four tiles from the player (beyond action reach)
showed beetroot PAUSED: NEEDS WATER with no countdown, watered beetroot
GROWING / 15:00 LEFT, winter DORMANT UNTIL SPRING with no countdown,
and tree/fruit hover over the authored trunk target. Evidence:
`/tmp/timing-crop-dry.png`, `/tmp/timing-growth-wet.png`,
`/tmp/timing-growth-winter.png`, `/tmp/timing-growth-tree.png`,
`/tmp/timing-growth-fruit.png`.

## Final validation

Full coverage pass: 985 files, 6189 tests passed, one skipped. Exhaustive pass:
7 files, 101 tests passed. Total: 992 files / 6290 passing tests. Commands were
`npm run test:coverage -- --fileParallelism --maxWorkers=4` followed by
`npm run test:exhaustive` (the two steps of `npm test`; four coverage workers on
an eight-core host). The preceding sequential run was stopped after a late
regression test encountered an older cached module; the fresh run was clean.
Workspace typecheck/lint, 919-definition validation, game/world builds, lifecycle
integrity and 1320-asset validation pass. Disposable local browser/world stopped.

GoldCondor mail347 approved retaining private anchors. ChartreuseDuck mail352
requested explicit observation/caughtUp semantics. The final small adapter guard
adds missing/incomplete/future checkpoint rejection and conditional stale-checkpoint
ETA; focused timing regressions and type/lint checks accompany that follow-up.
No world schema/view or frozen #81 source changed. Integration must preserve
#81's fractional remainder and historical environment epochs.

PR stack: [84](https://github.com/Dastari/orchard-cellar/pull/84) →
[85](https://github.com/Dastari/orchard-cellar/pull/85) →
[86](https://github.com/Dastari/orchard-cellar/pull/86). GoldCondor owns integration;
no merge or production deployment occurred in this lane.

Final checkpoint follow-up verification: 29 focused tests passed; full workspace
typecheck/lint and game/world builds passed again. CI remains the integration
gate on the pushed PR heads. Leases are released at handoff.

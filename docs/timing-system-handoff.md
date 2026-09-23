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

# Studio integration review — 2026-09-21

Scope: move the reviewed editor into the current repository while preserving
independent game and Studio outputs. Owner authorized integration and deployment;
this review does not authorize merging the PR.

Two independent reviewers examined source compatibility and release continuity.
The final pass found no unresolved integration issue.

| Finding | Resolution and evidence |
| --- | --- |
| Copying old shared packages would regress current game behavior | Import reviewed Studio/kit and adapt to current content, skills, appearance and world APIs; retain current game wrappers, auth, sim and bindings. |
| Exporting the kit from the shared UI root inflated the game chunk | Separate `@orchard/ui/studio`; real Vite fixture builds reject editor dependencies, including dynamic imports. Independent game build passes its chunk checks. |
| Two text-editor classes broke instance identity | Existing shared path reexports the kit editing model; bridge identity regression passes. |
| Old item publish fixtures omitted current hash/readiness contracts | Preserve current serialization, verified content-head and numeric NPC ID behavior; publish/bootstrap/New-action regressions pass. |
| Duplicated public symbols and external source overlay could drift | One `packages/ui/public` source, per-app build copies, and a single-source staging helper with before/after manifests. |
| Broad worktree deletion could destroy unrelated work | Archive private inputs; remove only clean merged checkouts after process checks; retain branches and unique/open-PR work. |

Main advanced to PR #24 during validation. The integration was rebased onto
`2aee1799`, retaining the new icon imports and game chrome. All 544 kit registry
checks passed with the rebuilt 1,187 sprites; no further screenshot baseline
changes were needed. Six earlier baseline updates cover reviewed current
barrel/fermentation/help/frame behavior rather than reverting shared content.

The phase-zero source-shape digest was reviewed again: the only seam difference
from updated main is the shared player-rig export. Import-direction assertions
remain and explicitly reject game imports of `@orchard/ui/studio`.

Operational results and final validation are recorded in
[the integration handoff](../studio-integration-handoff.md).

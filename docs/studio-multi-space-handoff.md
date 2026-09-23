# F4 multi-space backend handoff

Branch: `feat/studio-multi-space-backend`, based on main `2e1d9a4f`.
PR: https://github.com/Dastari/orchard-cellar/pull/74 (draft pending clean broad validation).
Owner-authorized wave 2. No merge, deployment or world publish in this task.

Implemented shared registry, seven area keyset indexes, admin-gated metadata and
paged entity procedures with regenerated bindings, Studio per-space subscriptions,
all-space presence, F5 data sources and read-only runtime route/terrain hooks.
Visual World Map rendering and picker widgets belong to the next UI lane.
Container editing reuses the existing tested two-phase ContainerManagerModel.

Integration: preserve wave-1 PR70 schema regeneration and `ffd61232` ES2021 fix.
World index hunks are spatial table indexes and procedures, disjoint from F2 XP
and F3 lifecycle changes (coordinated through Agent Mail). Regenerate bindings
after combining world lanes. Keep retired farm_parcel private and inactive.
Version bumps are relative to this branch's base; retain higher integration
versions and add the new shared barrel export alongside other lanes.

Validation: 61 focused tests in 12 files, all-workspace typecheck, lint, world build,
919-definition content validation, lifecycle integrity, 1,320-asset validation and
guarded studio-production build passed. Exhaustive tests passed: 101/101 in seven
files, log `/tmp/orchard-f4-exhaustive.log`.

Broad coverage finished with **5,940 passed / 1 failed**, across 962 files
(961 passed / 1 failed), in 1,179.36 seconds. The original `npm test` command
therefore failed; see `/tmp/orchard-f4-test.log`. Its sole failure was ENOENT for
`references/art/kenmi/cute-fantasy/core/Player/Player_Base/Player_Base_animations.png`
in `hearth-seating-assets.test.ts`. Linking this worktree's ignored `references/`
to the existing local source repaired setup, and that exact test passed on a
separate targeted rerun. This is not evidence of a clean full-suite rerun.
Exhaustive tests ran separately because the failed coverage command skipped the
chained exhaustive step. Initial Studio build also needed generated assets linked
from the prior same-base rebuild. No tracked art or production files changed.

Next coordinator action: obtain clean broad validation after repaired worktree
setup or review final-head CI before changing readiness. No merge or deployment
is authorized for this wave-2 PR. File reservations have been released.

## Reviewed wave1 integration

The source now includes final wave1 main and preceding PR75. Both new spatial
reads explicitly require `operate.world`, preserving the scoped main helper and
private projection checks. Public bindings are regenerated from the combined
module; higher versions and the world-chunk export are retained. Integration
behavior passed the full combined PR87 rehearsal (6,310 coverage + 101 exhaustive
tests). Prefix checks and fresh source CI are recorded in the PR. No deployment.

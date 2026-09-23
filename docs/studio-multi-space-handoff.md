# F4 multi-space backend handoff

Branch: `feat/studio-multi-space-backend`, based on main `2e1d9a4f`.
PR: https://github.com/Dastari/orchard-cellar/pull/74 (draft while full tests run).
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

Validation: 61 focused tests in 12 files, all-workspace typecheck, lint, world build, 919-definition
content validation and guarded studio-production build passed. Full repository
tests are running (session 36325, `/tmp/orchard-f4-test.log`); results will be recorded
in the PR. The first Studio build lacked local generated assets; linking the
previously rebuilt assets from the same base resolved that worktree-only setup.

# Mining skills and Silver Pickaxe PR handoff

PR: https://github.com/Dastari/orchard-cellar/pull/3
Branch: `feat/mining-skill-coverage`, based on upstream `main`.
Status: open; not merged or deployed. GitHub CI is pending.

## Delivered

- Silver Pickaxe maximum 1,500, unchanged other stats and repair.
- Efficient Strikes contributes 3/4/6 work to walls and ore nodes. Preserve legacy
  wall hits through an appended private default-zero work column.
- Shared authored Rockhound bonus for ordinary rocks, basalt and completed walls.
- Mother Lode support for rich pure cinder/emberglass; existing richness-two sites
  remain ineligible. Ore Dressing remains relevant only to mixed deposits.
- Skill descriptions, content readiness, migration fixtures, specification,
  architecture and 0.7.0 changelog updated. Content: 896 definitions / `0ec81315`.

## Validation

Module and game-client builds, all workspace typechecks, lint, asset validation,
content validation and deterministic content regeneration passed. Targeted tests
exercise all pickaxes and ranks, actual authority spending/wear, mixed-rank and
legacy progress, preflight and rejection, final hits and missing/retired loot.

`npm run check` reached coverage tests and reported three wildlife-generation
failures. Reproduction against untouched upstream main confirmed a 15-second test
timeout (21.8 seconds for the first test). The slow full coverage run was stopped
after this baseline reproduction; no complete coverage pass is claimed. A complete
run without coverage found a stale Studio bootstrap manifest; it was updated to
896 definitions / `0ec81315`, and all three model tests passed on rerun. The
remaining full-run result is recorded separately in the PR.

## Release considerations

Publish module and content together through the normal release workflow after
review. The live database upgrade has not been rehearsed; migration logic is
covered by transaction fixtures and the module builds with the defaulted column.
Existing Silver durability values are preserved until repair. The Studio renderer
prebuild guard remains intact. Local AGENTS.md and skill-installation changes
were excluded from the gameplay commits.

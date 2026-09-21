# Willowharbour visual pass handoff

PR: https://github.com/Dastari/orchard-cellar/pull/33 (unmerged; current checks and readiness are recorded on the PR).

Branch: `feat/west-town-visual-pass`, isolated worktree
`/home/toby/projects/orchard-west-town`, based on upstream `main` at `1d2462cd`.

## Delivered

Organic coastline and varied beaches; northern cliff shelves; deterministic
mixed-age forest clusters and undergrowth; native grass transitions on stone and
dirt public paths; furnished outdoor gardens, market, workshop yards and farm;
all ten furnished, connected interiors with differentiated room floor materials.
The original island and Cinderwake authoring remain unchanged.

## Review and evidence

Independent Astra comparison: [visual review](review/west-town-visual-pass-01.md).
Native browser-renderer images (local, ignored because they contain licensed art):

- `output/town-review/before-town.png`
- `output/town-review/final-island.png`
- `output/town-review/final-town.png`
- `output/west-town-interiors-final.png`

The render tools write image/source hashes and reproducible settings next to each
image. They use the game terrain compiler, atlases, ground cache and object painter.
These are offline candidate renders, not an authenticated playthrough of a deployed
world. The canonical shared-browser URL remains https://orchard.dastari.net/.

## Release

This PR is unmerged and not deployed. Publish the new authored content (908
definitions), upgraded saved map, authority and client together using the normal
world release procedure. The four extra interiors and all ten ENTER/LEAVE routes
need post-publication authority round trips. Studio's prebuild guard is untouched.

The offline exporter accepts a reviewed prior map as an explicit third argument;
see [export procedure](west-town-visual-pass-spec.md#exporting-an-existing-town).
Rehearsal artifacts are `output/town-review/prior-main-map.json` and
`output/town-review/upgraded-candidate-final/`. Rehearsal verified unchanged non-town cells
and exact candidate recomposition. A fresh production export and previously reviewed
production baseline are still required at release; independently edited village
cells/objects/prefabs/contours produce conflicts for review.

## Checks

Workspace typechecks/lint and the world, simulation, engine, tools and client
builds passed. Atlas/PWA assets, client chunk checks, all 908 content definitions
and the 534 KiB payload budget passed. Focused suites cover exterior access and
return landings, ten interior plans, native art crops, deterministic generation
and upgrade conflicts. Final coverage passed all 832 suites (4,736 tests, one
skipped), with 92.71% lines, 88.57% statements, 94.19% functions and 83.76%
branches. The final run used four workers; the earlier serial run identified
three stale fixtures and a stale local atlas, all corrected before the clean run.
The separate exhaustive terrain/world suite passed all 51 tests. Asset validation
passed all 1,186 assets, three songs and ten SFX. GitHub checks were queued at
handoff; local checks passed. One earlier coverage process was terminated before
reporting a result.

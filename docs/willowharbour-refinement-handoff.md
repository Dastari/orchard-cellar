# Willowharbour refinement handoff

PR: https://github.com/Dastari/orchard-cellar/pull/39
Branch: `feat/willowharbour-river-gardens`.
Worktree: `/home/toby/projects/orchard-town-refinement`.
Based on current upstream integration `8d8abf53`, preserving the prior town pass.
Release: game/content/authoring 0.16.0; no Studio source or deployment changes.

## Delivered

Continuous town river with four bridge crossings and sandy estuary; shallow native
turf banks; native cobbled civic square; connected hedge elbows/end caps; white
picket frontage returns/gate openings; cultivated flower beds, pots, mature garden
trees and warm authored streetlights. Explicit tree-species selection prevents
prop catalog additions from corrupting woodland generation. Northern woodland
steps sit clear of the widened river.

Interior floor envelopes separate domestic wings while retaining distinct barn,
conservatory, forge, retail/store and inn hall layouts. The shared cached renderer
draws wall faces, caps and vertical edges without covering collision-floor cells.
Service markers stay aligned with NPC homes; the inn kitchen passage includes
the cook’s spawn and the showroom lamp retains its table support and height.

Reference analysis and independent Astra review:
[review report](review/willowharbour-refinement-pass-01.md).
The review rejected intermediate forest, estuary, fence and interior issues;
those were corrected before final acceptance.

## Evidence and checks

Local licensed-art evidence is ignored, not included in a fresh clone:
`output/town-refinement/final-island.png`, `final-town.png`, `final-interiors.png`,
`final-night.png`, `final-inn-crop.png`, and `final-estuary-crop.png`.
JSON sidecars record renderer provenance; captures use native game code, not live
production data. Canonical live preview remains https://orchard.dastari.net/.

Focused checks passed: 62 exterior/interior/river route and fixture tests, 42 native
source-pixel comparisons, 22 authoring/scenery/composition tests. Builds and asset
validation passed for 1,213 assets. All 919 content definitions validate; runtime
payload is 559,597 bytes (content hash `b5bfc431`), within the existing 547 KiB
budget. The final coverage report has 924 files passing, 5,643 tests passing and
2 skipped; line coverage is 92.75%. All 51 exhaustive terrain tests, lifecycle
integrity and final workspace lint/typecheck checks pass. GitHub CI status is
available on the PR.

## Publication

Unmerged and not deployed. Existing saved towns require the explicit reviewed
baseline upgrade; edits to prior cells, objects or prefab definitions fail closed.
Rehearsal regenerated prior-main authoring, exported the upgraded map successfully
and checked unchanged non-town terrain by value. Use a fresh production export and
reviewed baseline for a real release, and publish content, saved map, authority
and client together. Verify all ten portal round trips against live authority
before considering a coordinated production release complete.

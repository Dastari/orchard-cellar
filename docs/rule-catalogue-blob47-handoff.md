# Blob47/fringe migration handoff

PR [#79](https://github.com/Dastari/orchard-cellar/pull/79), branch `feat/rule-catalogue-blob47` in `/home/toby/projects/orchard-rule-blob47`,
stacked on frozen PR #73 `052f23e1`. Assignment #179; GoldCondor coordinates.
See [specification](rule-catalogue-blob47-spec.md).

Implementation complete: masked matching, independently composed catalogue layers,
compiled terrain lookups, five authored families, shared hoed/authored farmland
selection. Existing wet occupancy, exact parts, native fringe ordering/heights
and all recorded baseline outputs are preserved. No runtime traversal switch.

Validation before full suite: 186 focused tests passed, one existing skip; eight
schema/fingerprint/manifest checks passed. Earlier 156 topology/layer/draw checks
passed. Repository lint/types, content and asset validation, lifecycle integrity,
world build and guarded Studio production build passed. Full repository build
also passed. Final `npm test` on immutable production-source commit `67c9acae`:
978 coverage files, 6,180 tests passed and one existing skip; statements 89.01%,
branches 84.33%, functions 94.49%, lines 93.02%, all thresholds passed. Exhaustive:
seven files, all 101 tests passed. Exit status 0; log
`/tmp/copper-blob47-full-test.log`. Subsequent closeout edits only update this
handoff. Local ignored licensed art and custom progression art are linked from
the canonical checkout. GitHub CI was pending when local validation finished;
check its current result before any separately authorized merge.

Content: 919 definitions, hash `f0da8070`, 616,383 runtime bytes, 771,045 authoring-row
JSON bytes; measured guard 602 KiB. Existing basic row is 59,271 compact bytes
against the 65,536-byte limit. No new rows. Pixel differences: none in recorded
all-mask and mixed-height/family probes. Grass fringes stay separate transition
entries because their native artwork/composition differs from blob47.

Integration: regenerate F1 schemas from the merged types (SageIsland D6 shares the
generated output on a separate branch); recompute content hash/manifest and measured
budget with other content lanes. Preserve #71's sim subpath exports if integrating
that lane; do not replace its package manifest with this branch's earlier base.
World parser must precede a later content publish using new fields. No merge,
deployment or publishing is authorized for this follow-on.

## Reviewed combined source integration

The refreshed source is stacked on #75 → #74 → #76 → #78 after final wave1 main.
Combined F1 schemas, public bindings, progression scope, historical migration
fixture, manifest/hash and measured payload guard are retained. Current hash is
`7dcab09f`, 920 definitions / 26 kinds, 618,309 runtime bytes (604 KiB guard) and
773,245 authoring-row bytes. The basic tileset is 59,271 bytes, below 65,536.

The entire production tree exactly matches tested PR87 production head `a59d85ad`;
only source handoff documentation/CHANGELOG differ, and rehearsal-only
`docs/wave2-rehearsal.md` is absent. That immutable production snapshot passed the
complete check: 6,310 coverage tests / 1,000 files + one skip and 101 exhaustive
tests / seven files, all coverage thresholds, world/types/lint/content/assets.
Fresh prefix checks and hosted CI status are recorded in the PR. No force-push,
PR merge, deployment or later runtime activation occurred.

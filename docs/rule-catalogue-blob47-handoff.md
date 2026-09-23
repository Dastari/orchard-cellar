# Blob47/fringe migration handoff

Branch `feat/rule-catalogue-blob47` in `/home/toby/projects/orchard-rule-blob47`,
stacked on frozen PR #73 `052f23e1`. Assignment #179; GoldCondor coordinates.
See [specification](rule-catalogue-blob47-spec.md).

Implementation complete: masked matching, independently composed catalogue layers,
compiled terrain lookups, five authored families, shared hoed/authored farmland
selection. Existing wet occupancy, exact parts, native fringe ordering/heights
and all recorded baseline outputs are preserved. No runtime traversal switch.

Validation before full suite: 186 focused tests passed, one existing skip; eight
schema/fingerprint/manifest checks passed. Earlier 156 topology/layer/draw checks
passed. Repository lint/types, content and asset validation, lifecycle integrity,
world build and guarded Studio production build passed. Full repository build and
`npm test` final results are recorded on the PR once complete; do not infer green
coverage from the focused tests. Local ignored licensed art and custom progression
art are linked from the canonical checkout before the full run.

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

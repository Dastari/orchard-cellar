# Atlas audit release handoff — 2026-09-22

PR [#61](https://github.com/Dastari/orchard-cellar/pull/61) is open and unmerged.
It includes the already deployed fence fix from open PR #60. Do not merge either
without user approval. Studio's standing independent deployment authorization
was used; no game, world, schema, content or map publication occurred.

## Installed Studio

Studio **0.13.1**, source `1beffda5`, root 0.23.1, assets 0.18.0, tools 0.19.0.
The guarded `studio-production` build retained the reviewed UI-kit check.
Reviewed source and artifact are under the owner-local release directory:
`atlas-studio-0131-source` and `atlas-studio-0131-artifact`. Evidence and verified
rollback to Studio 0.13.0 are in `atlas-studio-0131`. The canonical checkout's
`.git/cellar-ui-release.md` records the full paths for subsequent publishing agents.

Public entry: `/assets/index-Uc4o63f9.js`; SHA256
`6799cbcdcbcf5d8e92723d7c17eab79e823d2ba4cee24bb8fbb6068ee722898a`.
Installed manifest equals the staged manifest; public bytes match. Previous hashed
chunks were retained. Only `orchard-studio.service` restarted; world and game PIDs
were unchanged. Authenticated browser checks show Marlow's T-shaped path, native
paving choices and Smart terrain thumbnails with the mode menu remaining open.
Screenshots are retained in the private release evidence directory.

## Validation

- Full repository suite: **5,928 coverage tests / 958 files**, followed by
  **101 exhaustive tests / seven files**, passed; coverage thresholds passed.
- The later thumbnail correction passes its retained-popover regression plus
  the agent's 28-test terrain/canvas suite, Studio typecheck and touched-file lint.
- All workspace types and lint, world build (validation only), lifecycle integrity,
  content validation, asset build/validation and reviewed Studio build passed.
- Atlas count/revision reconciliation has zero errors; native source-pixel/import
  fingerprint tests pass; all 303 terrain artifacts match deterministic generation.
- GitHub CI remains pending at this handoff; check current status before merging.

The initial full-suite attempt exposed missing ignored owner-local custom art in
this worktree. After restoring those fixtures and installing locked workspace
dependencies, the complete suite above passed. No test gate was bypassed.

## Findings and scope

The [main guide](README.md), [visual catalogue](terrain/index.html),
[inventory findings](inventory/findings.md) and [live-map report](live-map.md)
retain reproducible evidence and explicit gaps. Licensed complete source-sheet
contact images are generated locally and ignored, consistent with source policy.
The registered-art diagrams and all source inventory metadata are committed.

The live map was read only: 35 lamp backing rows correspond to 35 authored lamps;
there is an exact authored hedge duplicate at (127,400), plus a possible memorial
double-draw at (390,371). No rows were removed. Player-Owned remains non-movable.

The audit is comprehensive accounting, not a claim that all source art is imported
or all join rules are complete. Unimported sheets, partial provenance and unverified
joins are enumerated. Existing invalid geometry remains legal; automatic joining
is local placement assistance. A later game asset release needs its own approval.

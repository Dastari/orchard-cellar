# Studio smart placement handoff — 2026-09-22

## Candidate and scope

Branch: `feat/studio-smart-placement`, based on `2d13a3ee` (production 0.21.1).
Versions: root 0.22.0, Studio 0.12.0, sim 0.21.0, engine/UI/client/world 0.20.0.
The user approved merging and publishing PR56. It merged and deployed on
2026-09-22 from `5ed1422a3574b6fa4d3f1c3f9cdf0d4c4bc94358`, after the preceding
PR57 release and its explicit checkout/credential handoff. Live map content was
preserved.

## Completed production release

[PR56](https://github.com/Dastari/orchard-cellar/pull/56) is merged. Root 0.22.0,
game/world 0.20.0 and Studio 0.12.0 are live. Both final PR checks passed. The
guarded routine release reran all workspace/release typechecks, 6,006 tests across
961 files, lint, content validation, unchanged full/private schema and public
binding comparisons, production builds, reviewed Studio UI-kit guard, no-delete
publication, content CAS, strict 42-table same-identity reconnect parity, and
public artifact-byte validation.

- Game bundle: `/assets/index-DROBHHg6.js`; SHA256
  `4aebc382daf1e71a793fa5f4ecf23ece88597409642eabed8e7215508e54df93`.
- Studio bundle: `/assets/index-DQjSAMGS.js`; SHA256
  `a37216e9404c5cfdc9f107e3fec60e1cd815a8d905e114013a42f642f537847a`.
- World module: `3f4a2d8d28b80e1b85c73ef3904fa3d72880dd0b613f5a0db46e2397f3f9ed13`.
- Database identity remains
  `c200af6ca3e4663bde9be65c18114d5d296f4b811bf0fa35d3771f8fdba89c21`.
- Content remains R16 / `0f06c798`, with zero upserts or deletions. Map remains
  R8 / `1859cc67` before and after release.
- Evidence and rollback:
  `/home/toby/.local/state/orchard-release/studio-smart-0220-routine` (`deployed`).
- Preflight log and authenticated browser screenshots:
  `/home/toby/.local/state/orchard-release/studio-smart-0220-preflight`.

A fresh dedicated-account browser loaded the new game bundle, connected as Admin,
reported content ready and no network error, and observed map R8. Studio signed in
through normal SSO and rendered `/build/map` with Smart Placement, the enlarged
toolbar, native scrollbar, and layer eyes. Its compact palette tooltip remained
visible across redraws; the Studio console reported zero errors or warnings.
No production map edits were made during verification. All three runtime services
are active. The earlier standalone review artifacts below are not the installed
combined release.

The implementation addresses compact stable tooltips; larger toolbar buttons;
native scrollbars and unclipped layer eyes; one-cell connected fence families;
new same-layer overlap prevention; sprite selection tint; right-click Delete and
right-drag pan; stable inspector scrolling; labelled property controls; removal
of the redundant Selection dropdown; Smart/Exact palettes; and shared typed
appearance/growth state. Exact terrain pieces are Ground Details overlays.

Authored-object edits and resource state edits use browser drafts and small delta
publication. Functional live placeable/chest properties and deletion retain the
existing explicit audited Preview/Confirm flow. Resource state publication compares
against live values, applies changes once and then lets normal gameplay continue.
Invalid existing terrain geometry and overlaps remain loadable. No whole-map
placement repair is added.

## Verification

Full `npm run check` passed: lifecycle integrity, content validation, checked world
build, all workspace typechecks, lint, 5,905 coverage tests across 954 files,
101 exhaustive tests across seven files, and asset validation. Coverage: 88.82%
statements, 84.19% branches, 94.45% functions and 92.90% lines.
Focused regression suites passed for smart fence strokes/corners/occupancy,
state serialization and delta round trips, one-shot resource commit/CAS, terrain
properties, audited schema actions, compact tooltips and retained controls.

Production Studio, game and world builds passed. `client:chunks:check` passed.
The reviewed Studio staging script passed its UI-kit guard, typecheck and source
manifest immutability comparison. Full private schema and public generated
bindings match the deployed world module; public bindings also match the checked
`packages/world-bindings/src` directory. No database migration is needed.
Build warnings remain for existing large client chunks and the terrain module
circular dependency; no new Studio import enters the game bundle.

Browser verification used the local development fixture, which cannot connect or
publish. Checked connected white fences, same-layer placement rejection through
regression tests, actual sprite tint, right-click Delete, right-drag pan without
opening a menu, growth changes from mature tree to sapling, and Smart/Exact palette
switching. A tooltip remained visible over twelve redraws; inspector scroll stayed
at 165 through twelve redraws. Growth dropdown remained open through redraws.

Review images:

- [Selection and labelled properties](review/studio-smart-placement/selection.png)
- [Compact tooltip and toolbar](review/studio-smart-placement/tooltip.png)
- [Exact terrain palette and native scrollbar](review/studio-smart-placement/exact-palette.png)
- [Object context menu](review/studio-smart-placement/context-menu.png)

## Release boundary

This feature requires the matching game renderer and world commit handler. Do not
install only the new Studio build against the old module: it cannot interpret the
new optional object/resource state correctly. Follow the unchanged-schema routine
lane in [PUBLISHING.md](../ops/orchard-runtime/PUBLISHING.md), including concrete
world/game approval, release artifact pinning, content CAS, deletion prohibition,
rollback and reconnect parity. Standing Studio-only approval does not cover this
combined release. No credentials were accessed or refreshed during this work.

Prepared local review artifacts:

- Source: `/home/toby/.local/state/orchard-release/studio-smart-0220-final-source`
- Studio: `/home/toby/.local/state/orchard-release/studio-smart-0220-final-artifact`
- Full/private schema and public-binding comparisons: `/tmp/orchard-studio-smart-release`
- Full-check log: `/tmp/studio-smart-check-final.log`

The routine release must pin the final committed candidate and revalidate the
installed production baseline at release time. PR57 integrates the separately approved PR53–55 release and publishes first.
Its frozen head `c64ab976` is integrated into PR56 in the isolated worktree.
Retain root0.22.0, client/UI0.20.0, assets0.17.2 and tools0.18.2. Both renderer
state resolution and the dialog button inset are retained in the reviewed source
fingerprint; combined visual baselines are regenerated from the updated native
workbench art. NavyBay handed canonical source/services/credentials to BoldEagle
after the verified PR57 release. The final merged PR56 candidate passed CI and the
guarded routine release checks recorded above; the earlier standalone Studio
artifact is review evidence, not the combined deployment artifact.

# Native cliff corrections — 2026-09-22

## Candidate and scope

Branch `fix/terrain-cliff-rules`, [PR #62](https://github.com/Dastari/orchard-cellar/pull/62),
based on merged PR #61 (`2e1d9a4f`). PR #62 is not merged.
Workspace 0.23.2, Studio 0.13.2, sim 0.21.1, engine 0.20.1.

The shared local placement helper prevents competing inset blocks only within
the original stroke plus its one-cell halo. Smart material and height brushes
use it; protected/ambiguous boundaries reject atomically with feedback. Exact
placement, loading and runtime rendering do not repair historical geometry.

Desert 1–3 use the true south crest, repeat and terminal wall courses, without
the unrelated compact ledge as a false foot. Shroomlands uses its true crest,
face/shadow and inverse corners. Volcanic uses both structural column courses.
Stone brushes select matching Grass 1–4; explicitly authored cliff caps use
native family artwork while preserving a different live asset override.

## Reviewable evidence

- [Independent review](independent-cliff-review.md): all ten outdoor cliff and
  seven flat formation strips passed the final visual review. This certifies
  the six displayed formations, not arbitrary geometry or mixed-material joins.
- [Guide](terrain/index.html): corrected diagonal input/output plans, amber
  assisted cells, native per-family grounds and unsupported raw-mask labels.
- [Role comparison](cliff-role-changes.json): exactly five bootstrap definitions
  differ from the reviewed Studio 0.13.1 source: desert 1–3, shroomlands, volcanic.
  This file is review evidence, **not** a captured live content release candidate.
- Local guide: `http://10.0.1.150:8872/docs/atlas-audit/terrain/index.html`, served by
  user unit `orchard-terrain-preview.service`. Its isolated web root exposes the
  audit, licensed art and five explicitly linked rule source files, not repository
  secrets or the whole checkout.

## Outstanding source and assembly gaps

Four interior assemblies are withheld: cave, dungeon 1–2 and volcanic interior.
The volcanic interior's legacy primary bank contains staircase sprites; keep its
saved IDs until a complete inverse wall bank is verified. Snow remains reserved.
Six shroomland blue/green/purple grass and tall-grass sheets remain unregistered;
gray ground and tan paths lack dedicated semantic material families. Mixed
desert/oasis, shroomland/path, repeated-height, ramp and waterfall interfaces
still need assembled source-reference evidence. Native paving kerb joins are
distinct from the existing grass fringe. These gaps are not certified as fixed.

## Release boundary

The server content catalogue supplies live cliff roles. Publishing the Studio
static artifact does not update those definitions, deploy the game engine or
rewrite map cells. A later authorized content/game release must capture the
actual current head, reconcile the five definition changes, prepare and verify a
guarded candidate, and perform reconnect/parity checks as described in
[the publishing runbook](../../ops/orchard-runtime/PUBLISHING.md).

Do not rebuild the older canonical checkout over the reviewed Studio artifact.
No game service, world module, content head or live map is changed by this task's
static editor release. Any later merge or content/world publication needs the
user's approval for that specific release.

## Validation and deployment evidence

- Full runtime coverage: 5,957 tests / 963 files passed; coverage thresholds met.
  Exhaustive terrain/canvas suite: 101 tests / seven files passed.
- The final asset step initially identified duplicate shroomland lower inverse
  art across tall and compact banks. Source pixels confirm primary frames 12/13
  at `(48,16)` / `(64,16)` equal ledge frames 10/11 at `(48,112)` / `(64,112)`.
  Only these aliases were declared using the existing mechanism; the validator
  was not relaxed. All 16 registry tests, sim types/lint and final asset validation
  pass after that metadata correction (1,320 assets, three songs, ten SFX).
- Workspace typecheck/lint, lifecycle/content validation and world build passed.
  The guarded Studio production build passed on the final source.
- Catalogue regeneration/check: 303 artifacts, 8,448 raw masks, 105 waterfall
  cases. Browser verification: all 295 displayed images and 559 local links load.
- Studio 0.13.2 deployed from application source `c51ea330477b62396187b99a78c39eab63bfd522`.
  All 3,826 tracked staged inputs match that source. Subsequent changes in this
  PR record generated catalogue metadata and release evidence only.
- Reviewed source: `/home/toby/.local/state/orchard-release/cliff-studio-0132-release-source`.
  Artifact: `/home/toby/.local/state/orchard-release/cliff-studio-0132-release-artifact`.
  Evidence and verified rollback: `/home/toby/.local/state/orchard-release/cliff-studio-0132`.
- Public bundle `/assets/index-BfqkjMMM.js`, SHA-256
  `bb2cb4e75e883fc4c391831500d92363eee98af289d0675cf4630d1997ad2849`.
  Installed manifest/public static checks pass. Authorized account verification
  opens the live map, loaded artwork and Published state on that exact bundle.
  Game/world service PIDs are unchanged; no map or content writes were performed.
- GitHub CI status is maintained on PR #62. The initial asset-check failure above
  is corrected in the final candidate; do not confuse obsolete run status with
  the current PR head.

# Native cliff corrections — 2026-09-22

## Candidate and scope

Branch `fix/terrain-cliff-rules`, based on merged PR #61 (`2e1d9a4f`).
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
  audit and licensed art only, not repository secrets.

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

Final aggregate check and release results are recorded below when complete.

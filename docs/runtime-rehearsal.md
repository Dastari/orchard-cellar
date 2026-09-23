# Runtime integration rehearsal — DO NOT MERGE

Coordinator: GoldCondor. Rehearsal owner: ChartreuseDuck. This isolated candidate
is evidence for source integration only. No source PR push, merge, deployment,
content publication or live activation is authorized by this rehearsal.

## Exact inputs

Base: refreshed source #79 `14718c628cc55d5d58f1ca55a17cffa88fd87846`, whose
production tree matches the green #87 rehearsal outside docs and CHANGELOG.

| Order | Source PR | Exact source head | Rehearsal merge |
|---|---|---|---|
| 1 | #80 traversal | `cd5009d3e5f53a1dcfd6411a25424816e6280945` | `7f267128` |
| 2 | #81 object state | `f2cef93447837f10f75ee67ece46328811f398b7` | `b8bf8344` |
| 3 | #83 chunk shadow | `b597b578a00ebb917e332e8973d41bc97d690a96` | `981e7a52` |

Branch: `integration/runtime-rehearsal` in
`/home/toby/projects/orchard-runtime-rehearsal`. Source branches remain frozen.
Timer PRs #84–86 are excluded and require their own later combined gate.

## Conflict ledger and review

Conflict paths and proposed resolutions were reported before edits in Agent Mail
#378, #381 and #382. Routine additive/generated/version resolutions are authorized
by the coordinator; this is not permission to change runtime policy.

- #81 alone versus refreshed #78 `1e7b2562`: CHANGELOG, lockfile, engine/bindings
  versions, and registry imports. The registry conflict joins progression and
  natural-object projection imports; no conflicting lifecycle implementation.
- #80 over #79: 18 conflicts. Union progression and world_rules definitions,
  loaders, ID kinds, registry/barrel exports, Studio table kinds and scope maps.
  Preserve progression's loot_progression mapping. Overworld conflict is only
  progression versus traversal imports. Retain higher versions and all exports.
- #81 over that candidate: nine conflicts. Union world/registry/barrel imports;
  combine engine traversal imports with resolved object appearance, deduplicating
  resolveObjectAppearance. Review and recapture the structural seam digest after
  inspecting collision/live-map changes. All other seam files are unchanged from
  the object-state source. Preserve additive CHANGELOG and higher versions.
- #83: ten conflicts. Union chunk authority imports with traversal/lifecycle
  imports, additive architecture/CHANGELOG sections, higher versions and all sim
  subpath exports. The network shadow subscriber auto-merges unchanged.
- Regenerate F1 from all combined definition types and bindings from the complete
  world module. Private lifecycle, environment, hazard and chunk blob tables stay
  private; generated public subscriptions contain only approved public contracts.

Combined authored content measures **921 definitions / 27 kinds**, hash
**dac96752**, runtime payload **620,770 bytes**, definition JSON **584,247 bytes**,
row envelope **776,116 bytes**. The measured next-whole-KiB guard is **607 KiB**.
Update the current bootstrap hash and Studio manifest only; historical migration
fixtures and hashes are unchanged.

## Preserved semantics

D6 policy remains shadow. Actor admission, independent solid geometry, hazards
and fractional hazard authority stay separate. Object state owns resolved solid
footprints and appearance, never traversal abilities. Keep optional
hasTraversalChannels metadata and invalidate compatibility projections on chunk
installation. The new bounded chunk store remains diagnostic, with no whole-map
adapter inserted into the gameplay path.

Lifecycle anchors, environment epochs, fractional growth remainder and bounded
caughtUp checkpoints remain private authority. No frame-time callback execution,
new public timing anchors, calendar-clock substitution or state backfill occurs.
Natural resources/crops retain legacy authoritative rows. Callback approval and
budgets stay unchanged. Chunk mode defaults off; only off/shadow builds exist.
Owner-only blob staging/CAS and topside limits remain intact. No generator or
legacy document removal, content engine epoch change or live policy activation.

## Validation

Validation is in progress; source PR results are not combined-candidate evidence.
Generated world bindings and workspace typecheck completed. First focused run:
48 passed, one expected structural seam mismatch; the combined seam was reviewed
and explicitly recaptured. Expanded focused run passed 78 tests across 19 files, including full-island
traversal/chunk parity. Workspace lint and full repository build passed.
Full npm run check will run on the stable committed production snapshot.
Logs use `/tmp/runtime-rehearsal-*.log`. Exact result counts and final source/tree
identities must be recorded before source propagation or completion is claimed.

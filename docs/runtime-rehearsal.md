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

Final clean `npm run check` **exited 0** on
`b6e37eb382cdb27e826d013339c3c466c76cff57`: lifecycle integrity, 921 content
definitions, checked world build, all workspace types/lint, **1,022 coverage files /
6,389 passed / one skip**, then **101 exhaustive tests / seven files**, followed by
1,320 art assets, 12 songs, 10 SFX, 55 palette colors and four seasonal remaps.
Coverage: statements 89.16%, branches 84.48%, functions 94.64%, lines 93.23%.
Durations: coverage 1,420.65s; exhaustive 153.74s. Final log:
`/tmp/runtime-rehearsal-full-check-final.log`.

Generated bindings, full repository build, guarded Studio production build,
shadow client build and normal bundle boundary gate passed. Expanded focused
integration: 78 tests / 19 files; corrected retirement fixture: 11 / one file.
Hosted CI is separate and pending; no hosted-green claim is made.


Diagnostic full check on `d94e73d6` completed with 1,022 files: 6,388 passing,
one skipped and one failing test. The only failure was the legacy-runtime
retirement fixture counting 26 bootstrap JSON imports; combined progression and
world_rules add up to 27. The fixture is corrected to the measured exact count.
No production behavior changes in this correction. This failed diagnostic is
not a clean full-check pass; the corrected snapshot passed the fresh full run recorded above.

Guarded Studio production, shadow client build and normal client chunk boundary
check passed. Explicit generator-free validation rejects the retained runtime as
expected. Six D6 core files, five object-lifecycle core files and seven chunk
shadow/controller/network files are byte-identical to their exact source heads.
Initial origin/main audit used `5578b49c96d8131f83bb7d642c7e09d840471b3c`.


## Source propagation gate

D6 owner SageIsland approved narrow additive integration in Agent Mail #431;
GoldCondor authorized ordered #80 → #81 → #83 propagation after final green in
#434. Current main `df509125ad4afa56c64ebe55b47b337c530dec70` has zero production
differences from the rehearsal base (excluding docs and CHANGELOG). Each source
prefix must retain its scope; final #83 production must equal the tested snapshot.
Only GoldCondor merges. P1 effects work waits the separately validated combined
runtime/timer baseline; PR93 owns that later gate. No live runtime activation.

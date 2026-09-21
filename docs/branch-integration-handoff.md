# Branch integration — 2026-09-21

The owner authorized integrating all branches and removing stale worktrees.
The integration branch starts at main `9e8168e0`, preserving every head from
PRs #17, #21–23, #25–36 through merge commits and an aggregate GitHub PR.
The six gameplay slices retain their dependency ancestry. Main is updated only
through GitHub. The owner previously selected local validation over queued CI.

## Integration decisions

- Preserve reviewed Studio source and its separate exports/build guard, Agent Mail,
  both audits and publishing instructions, all six gameplay slices, Willowharbour,
  the hoe/fish corrections and unified-action P0 tooling.
- Version the combined game/workspaces as 0.15.0 and independent Studio as 0.8.1.
- Recompute content manifests, structural seam fingerprint and action baseline
  from the combined reviewed sources. Content has 919 definitions, hash 0029513b,
  and 559,532 runtime bytes; the next-whole-KiB guard is 547 KiB.
- The action baseline must account for the four added items, newly edible preserves,
  specialist meals, compost and earned Delve keepsake. This updates the P0 starting
  inventory, not the future unified-action implementation.
- No game/world/content publication is authorized by this Git integration. Preserve
  current service processes, static artifacts, database and private inputs. The
  integrated game needs the additive schema/content/map release described in the
  gameplay stack and town handoffs before deployment.

## Preservation and cleanup

A complete pre-integration Git bundle, PR metadata and per-worktree status/process/
ignored-file inventories are kept privately under
`~/.local/state/orchard-integration/20260921/`.
The primary checkout hosts live services and is retained. Stale worktrees may be
removed only after committed work is integrated or retained in an archive and
non-reproducible ignored evidence/private files have been preserved.

## Historical branch disposition

The preflight found 16 current PRs and 17 worktrees, all clean. Only the primary
checkout hosted processes. Older release/fix branches are already merged through
PRs #7, #13, #16, #24 and #37 (some squash merges do not retain head ancestry).
The icon branch tree exactly matches its merged main commit `2aee1799`; the cooking
release-gate fixes match current source. The reviewed Studio archive is superseded
by #36's explicit source integration and its retained private source archive.

`perf59-*` are historical lane snapshots preserved by the September 14 checkpoint,
including alternate experiments and files absent from current source. They remain
recoverable in their existing local/remote refs and the full Git bundle; they are
not replayed over the reviewed product. This disposition avoids claiming that
patches with unique hashes are either unimplemented features or safe to discard.
The owner was offered a separate choice to revive these experiments; absent that
choice, retain them as archives.

Private worktree evidence archives preserve output captures, browser-state
folders and source-reference links without dereferencing them. Dependencies,
generated artifacts and coverage directories are regenerable. The primary
checkout's private inputs, licensed originals and live data remain in place.

Validation and final cleanup results are recorded below when complete.

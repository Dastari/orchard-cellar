# Source preservation and worktree cleanup — 2026-09-14

The accumulated game, content, authoring, rendering, world, and release-tooling
working changes are checkpointed on `main`. This is source preservation, not a
new deployment or a declaration that the doc 60 patch is complete. In particular,
the current game frontend remains the compatible login-recovery artifact described
in `ops/orchard-runtime/README.md`; newer source needs coordinated release checks.

No open pull requests existed when cleanup began. Existing local branch tips and
older performance worktree edits have been pushed to origin. The older snapshots
are retained on their branches; they must not replace newer main files wholesale.

## Reviewed Studio source

`archive/reviewed-studio-20260914` preserves the isolated reviewed source from
`/home/toby/projects/orchard-cellar-studio-release`. It is a source snapshot, not an
integration into the retired main renderer. Credentials, dependencies, generated
assets and local captures are excluded. The original reviewed directory remains in
place and the existing guarded build procedure remains authoritative.

The UI-kit guard remains byte-identical with SHA256
`425a634fc8e88722a151e3c58ee969cc0f534ab747c4b2811e0562c6ee97e9e9`.
The host-local `.git/cellar-ui-release.md` retains the active artifact and rollback
record. No live service or static artifact is changed by this cleanup.

## Preserved worktree tips

| Branch | Preserved commit |
| --- | --- |
| `perf59-integration` | `6c812233b918569390e3f7f6c5dfceb31a49d113` |
| `perf59-p2-builder` | `e2cc7ac679a684f8e98cdf749c03d7820c91abc7` |
| `perf59-p2-review` | `6c3c06eb4f27d78384a1bc25e8fa822d9d9d4a46` |
| `perf59-p3-builder` | `4734c2c55e38012f1fd2cee17ca280f59659eb02` |
| `perf59-p3-loader` | `d73694a398c380fc448eef30a8175b416b3d0612` |
| `perf59-p3-runtime` | `aca7d7c0877ff9b92cd3bd58fa791642fa4b579e` |
| `perf59-p4-receivers` | `e0978c86b5ee557f007386b71fc55430dbbeb48e` |
| `perf59-p4-runtime` | `096d2a0faf872f9bb998677246d00365cc1c3fd1` |
| `perf59-p5-tint-pool` | `577d95692c67edb865f160d49c826aaf50aa1236` |
| `perf59-p6-painter` | `6de7ba57c623b2a4e9cbd5abb70e41fb319d5138` |
| `perf59-p7-hud` | `3eac8bf0a27d187f59dd06920ac1d95d759a1100` |
| `perf59-p7-pacing` | `0355aadc3cb667095eff411847922791050f938d` |
| `perf59-p8-integration` | `a9a5fd98c01f93524de1f615e940ec9ad14eb229` |
| `perf59-p8-seam` | `f6fb38fc24a057264baf3ed1f75f84efc291062e` |
| `perf59-p8-webgl` | `748af6aa65599be1c2e1793043a1ba5e64a6d7b6` |

Each removed worktree also has a compressed local backup under
`/home/toby/.local/state/orchard-release/git-cleanup-20260914/`, together with
`worktrees.json` recording source differences and backup paths. Dependencies are
excluded from those backups. Local review output, browser state, release artifacts,
and native licensed tool artwork remain outside the public Git repository.

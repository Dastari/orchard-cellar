# Combined runtime and timer rehearsal

**DO NOT MERGE.** This isolated candidate combines runtime rehearsal #88 at
`b6e37eb382cdb27e826d013339c3c466c76cff57` and timer rehearsal #89 at
`7dd72ea2d303dfecc1dfe924bbd736b931e3b089`. Their shared wave2 production baseline
is source79 `14718c628cc55d5d58f1ca55a17cffa88fd87846`, subsequently merged to main.
The coordinator owns eventual source propagation and merges. Nothing here
publishes a world or restarts a live service.

## Conflict resolutions

The 12 actual conflict paths were reported to source owners before resolution.
Architecture sections and sim exports were combined. Runtime's higher versions
were retained with all dependencies and subpath exports. The sole overworld
conflict was additive imports: retain traversal policy/solid geometry and add
processor/growth timing. Automatic client changes preserve runtime collision,
object appearance and chunk-shadow behavior. The extraction seam digest was
recaptured after reviewing these combined UI and engine seams.

Generated field schemas and the Studio manifest were rebuilt from the combined
content: 921 definitions, 27 kinds, hash `0e741b0f`, 620,844 runtime bytes within
the existing 607 KiB regression budget. No source file was replaced wholesale.

## Lifecycle boundary

The automatic stateful-components merge only appends the read-only timing helper.
It retains runtime fractional growth credit, historical environment settlement,
and exact authority transition math. A new regression supplies a settled checkpoint
with 7,500 fractional basis-point credit at tick 30 and verifies the projected
finish at tick 40 against authority settlement, without mutating the checkpoint.
Missing/private lifecycle anchors are not inferred from public state JSON or
published through bindings. Missing, future or incomplete checkpoints retain
unavailable/pending timing; stale observations remain estimates.

## Validation

Initial combined focused run: 80 tests / 17 files pass. The added fractional-credit
regression and environment suite pass 11 tests / 2 files. Further boundary suites
pass 50 tests / 12 files; one cache suite initially could not load the local
`fake-indexeddb` dependency. Linking the already installed runtime test dependency
fixed the worktree setup, and its 3 tests pass. The same setup issue affected the
first typecheck; the complete rerun and final full-check results are recorded in
the PR. No production source fix was needed for that setup failure.

Asset generation, lint, world build, guarded Studio production build, default
client build and explicit shadow-mode client build pass. Existing build size and
circular-import warnings remain. Full validation applies only to this candidate;
source PR propagation requires exact writer coordination and independent checks.

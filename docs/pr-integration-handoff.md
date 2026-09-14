# Gameplay PR integration — 0.7.0

Integrates PRs [#3](https://github.com/Dastari/orchard-cellar/pull/3),
[#4](https://github.com/Dastari/orchard-cellar/pull/4) and
[#5](https://github.com/Dastari/orchard-cellar/pull/5), preserving each branch's
commit history. The user authorized committing remaining work and merging all
open PRs on 2026-09-15. Merge the integration PR through GitHub with a merge commit
so the original PR heads become reachable from main and close automatically.

The combined workspace version is 0.7.0; the standalone world 0.6.1 XP patch is
included. Combined authored content is 896 definitions, hash `34de4fe6`.
Mining payout/depletion XP belongs to Farming; historical XP remains unchanged.
Silver durability is 1,500 with unchanged repair cost and other stats.
Harvest and cellar progression changes are preserved alongside wall mining skills.

Local Git rules, the installed GitX skill (including its referenced files), and
its lockfile are included at the user's commit request. The licensed `references`
symlink is a local test fixture and must not be committed.

Review: https://github.com/Dastari/orchard-cellar/pull/6.
Combined full coverage execution completed: 826 files / 4,655 tests passed;
one content-budget assertion failed at 533,564 bytes against 520 KiB. The
0.7.0 budget is now 522 KiB, the smallest whole-KiB ceiling for the measured
pack. Definitions and gameplay are unchanged by this budget correction.
Wildlife multi-world functional fixtures now allow 120 seconds for coverage
overhead; all assertions remain intact and passed in the full run.
Focused authority/skill tests (48), world build, all-workspace typechecks,
lint, content/assets validation and production client build passed.
Final local coverage: all 827 files / 4,656 tests passed (678.95 seconds).
Statements 89.52%, branches 84.73%, functions 94.83%, lines 93.65%; all
configured thresholds passed. The final command was
`npx vitest run --coverage --fileParallelism --maxWorkers=2`.

GitHub CI remains environment-limited: prior completed runs fail on absent
licensed art under `references/art/kenmi`, plus coverage timeouts in the old
wildlife fixtures. The complete local run includes those art tests and passed.
Hosted checks on the current head were still running at merge preparation;
no hosted green check is claimed. The user-authorized merge uses the complete
local validation evidence. No licensed reference files are committed.
All current heads are included: #3 ac3dbdfd, #4 304b6815, #5 ce289b87.
Merge status is authoritative on PR #6; no deployment is part of this work.
No gameplay deployment is authorized by this merge request. Release world,
client, bindings and reviewed content together through the established process;
preserve the Studio prebuild guard and use its reviewed release source.

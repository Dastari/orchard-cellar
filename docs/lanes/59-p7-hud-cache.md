# Doc 59 P7 HUD cache lane

Worktree `/home/toby/projects/orchard-cellar-perf59-p7-hud`, base 1b0ed15e.
Read doc59 P7 and prior 59-p7-hud-review design. Own OverworldUi static drawing
and new HUD cache modules/tests only. Do not edit Video settings sections (root
owns pacing/backend rows), renderer, main, ledger, roadmap or unrelated files.
No commits, new dependencies, deployment or delegation. New modules <=400 lines.

Implement conservative ordered static HUD caches with explicit semantic model,
geometry/DPR/UI scale/art revision invalidation; no per-frame JSON serialization.
Keep live minimap, portraits, vitals, animated effects, tooltips/windows and
overlays in existing order. Root will merge OverworldUi hunks manually alongside
Video changes. Cache backing pixels at exact display resolution/transforms;
prove direct/cached pixels including translucent edges and fractional DPR.
If intermediate alpha rounding fails, restrict cache to portions that pass.
Do not cache the entire OverworldUi.draw as though all its callbacks are static.

Use real-browser pixel fixtures, meaningful lifecycle/invalidation tests, and
600-frame stationary reuse counters. Report exact paths, commands, source hashes,
and measurements under output/perf-59-20260906/P7/hud/. No full check (root runs
canonical), no fabricated gameplay stage timings while auth is unavailable.
Write/lint fixture scripts before copying to shared output. Three failed
approaches to one issue: report evidence, leave green and move on.

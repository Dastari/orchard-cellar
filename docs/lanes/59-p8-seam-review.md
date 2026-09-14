# Doc 59 P8 Canvas backend seam review

Read doc59 P8 and doc47 §15. Review the root-owned private worktree
`/home/toby/projects/orchard-cellar-perf59-p8-seam` read-only against integrated
P6 `af5588d6`; it also contains the reviewed P5 tint pool, which is separate.
Own no runtime edits, commits or delegation. Root remains sole integrator.

Review `renderer.ts`, new `world-pass-backend.ts`, `world-pass-canvas.ts`,
`world-pass-backend.test.ts`, and `world-pass-present.ts` dispose addition.
Check exact begin/reserve/composite ordering, Canvas ownership/disposal,
constructor failure, interface semantics and compatibility context assumptions.
The gameplay painter still submits through the existing context; semantic
sprite/chunk/cap/plane/weather/particle methods form the next migration boundary.
No WebGL prototype has been written. Pixel boards and scale/pond comparisons
under output/perf-59-20260906/P8 are exact. Report untested distinctions and
concrete defects; do not call this a finished WebGL or full submission migration.
No heavy checks; canonical P5 full gate is running.

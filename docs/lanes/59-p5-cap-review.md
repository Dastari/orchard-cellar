# Doc 59 P5 cap consolidation feasibility review

Read docs59 P5, doc58 visual invariants and the integrated implementation in
`/home/toby/projects/orchard-cellar-perf59`. Work read-only in the existing
review worktree. Do not edit runtime, renderer/main, ledger or roadmap; no commit
or delegation. Root owns cap integration. Inspect ground-cache projected runs,
raised-terrain-depth, ground-light-source, world-lighting-renderer and cutaway.

Give a concrete pixel/order-preserving design for one multiply per level with
zero groundSource operations, including flat fish-pool/entity artwork and
cutaway overlap. Identify required file-scope changes and retained-memory
bounds. Existing cutaway experiment shows flattening overlapping cliff subframes
then applying alpha changes pixels (max34), so do not assume it is equivalent.
Use finished, linted artifacts under output/perf-59-20260906/P5/cap-review if
needed; no stage-timing claim or heavy benchmark while canonical full check runs.

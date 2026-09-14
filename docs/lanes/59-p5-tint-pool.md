# Doc 59 P5 tint-page lane

Worktree `/home/toby/projects/orchard-cellar-perf59-p5-tint-pool`, based on
integrator P5 claim after P4 retained fields. Read doc59 P5 and its accuracy
OPENs, doc58 D4/D10, docs15 §8.1. Root owns renderer/main/ledger/roadmap.
Own only `packages/engine/src/receiver-frame-source.ts` and new modules/tests;
replace its obsolete cache tests in the same change after identifying consumers.
Do not edit other runtime files, commit, or delegate. No new dependencies.

Implement shelf-packed 512×2048 tint Canvas pages, bounded by the existing
4 MiB cache budget, page-generation eviction, exact RGB keys (five-bit accuracy
failed three attempts), and immutable input artwork. Preserve all existing
source API, alpha/emission behavior and immediate-draw scratch contract.
No per-entry Canvas, no world readback, no context.filter. Budget/surface failure
must still throw the established receiver_frame error prefix. Reuse allocated
page surfaces on generation rollover; reset zeros every surface/reference and
all counted bytes. Prevent clipping/composite operations from modifying other
packed entries; ensure returned nonzero x/y frame offsets work with callers.
Define behavior for a source wider/taller than one page or budget smaller than
one page; no silent oversize allocation. New modules <=400 lines.

Pixel verify existing lighting fixtures against current integrator Canvas
reference, including translucent pixels and emissive spans. Real browser
fixtures required for packing/composite isolation; unit mocks alone insufficient.
Prove 600 warm repeated frames allocate zero Canvas surfaces; include churn
and page rollover/budget/reset tests. Report exact source hashes and commands.
Artifacts `output/perf-59-20260906/P5/tint-pool-*`. Write/lint scripts inside
worktree first, then copy finished artifacts to canonical output; full check
may be running and scans output. Do not run heavy full check; root does it.
No real-client p95 claim while authentication is unavailable. Do not attempt
more five-bit quantization or dim formulas. Cap consolidation is root-owned.

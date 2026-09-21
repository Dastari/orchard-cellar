# Village order milestones handoff

PR: https://github.com/Dastari/orchard-cellar/pull/29 (open; CI queued at creation).

Implementation branch: `feat/village-order-milestones`, standalone version 0.11.0
from upstream main. The coordinator will stack this after compost and preserved
provisions. Do not merge into main or deploy without the user's explicit request.

Implemented two exclusive knowledge-gated meals, distinct family progress,
atomic receipt/payment/knowledge updates, private projections, milestone text,
learned notifications and full-hunger-safe generated callbacks. Existing order
payments, buyable plans and baseline tools are unchanged. Existing player history
cannot reconstruct distinct order credit; new milestones intentionally start empty.

Validation: 103 focused tests across 25 files; sim/reducer/view/crafting/lifecycle/UI coverage, all-workspace
typechecks, lint, lifecycle integrity, content/assets validation, measured content,
sim/tools/world builds and production client build. Full coverage/exhaustive checks
are coordinated on the final stacked snapshots. No live deployment or real-server
reconnect playtest was performed; persistence/reconnect were tested using actual
reducer/view callbacks with fake database boundaries.

Runtime payload: 904 definitions, 538,666 bytes (1,956 bytes above main), hash
`8f6dc3c5`.
The budget is the next whole KiB, 527 KiB. Integration must remeasure combined
content, preserve strict completeness checks, combine source lifecycle handlers,
regenerate lifecycle outputs/provenance and update reviewed inert metadata. Source
handlers share no meal IDs with preserved food. The order quote shape changed;
regenerate combined world bindings and release module/client together.

Both meals reuse the cooked-food icon; their inventory names and recipe patterns
are distinct. Hunger values and milestones need normal pacing playtests. The
retired Studio renderer guard remains unchanged; no Studio output was produced.

Ordinary food graphs are present alongside compiled callbacks, preserving the
existing edible-content contract. The generated callback remains the single
authoritative execution owner; world lifecycle ownership tests verify no duplicate
execution. Exact edible/catalog counts include both new meals.

## Stacked integration

The branch now merges `feat/preserved-expedition-provisions` (`c11e0792`), including
Compost, with a regular feature-branch merge. PR #29 targets that predecessor.
Combined version 0.11.0: 907 definitions, content hash `cf5c605d`, 548,878 runtime
bytes, 537 KiB measured ceiling. Lifecycle revision 18 contains 148 handlers; item
ownership is 339 live items, 148 callbacks, 90 inert, 69 graph, 32 transactions, with 53
edible foods. Generated artifacts, bindings, content canonicalization, exact-count
fixtures and the Studio manifest are refreshed together. The retired Studio
renderer guard remains unchanged; no Studio deployment is involved.

Combined focused validation: 125 tests across 31 files pass, including all three
loop authority paths, full food/callback ownership and the Studio manifest.
World/client builds, lifecycle integrity and canonical content validation pass.

## Reviewed main integration

Main `2aee1799` icon and Crafting UI updates are retained through provisions
`a04da808`. Version remains 0.11.0. Content has 907 definitions, hash `79c51393`,
and 548,870 runtime bytes within the unchanged 537 KiB ceiling. Lifecycle revision
18 and all 148 handlers are unchanged; existing order/meal behavior and bindings
are retained. Main's premium icon importer and structural UI baseline are preserved.

Validation after main integration: 188 focused tests across 16 files pass; the new
premium source-pixel test passes using the existing licensed art source symlink.
All workspace typechecks, lint, lifecycle integrity, canonical content validation,
and checked world/production client builds pass. No deployment.

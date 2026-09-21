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

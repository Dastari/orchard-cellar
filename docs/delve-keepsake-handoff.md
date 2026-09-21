# Delve keepsake handoff

- Branch `feat/delve-completion-keepsake`, version 0.13.0, implements [spec](delve-keepsake-spec.md) and [ADR](adr/003-delve-completion-keepsake.md).
- First complete final-guardian reward claim learns a non-saleable home-planter recipe; every full run increments a durable per-player completion total. Existing membership/run deletion makes retries inert. No new schema.
- Receipt uses one namespaced private quest flag; quest reset explicitly preserves it. Missing/retired content never blocks exit. Reconnect repairs the known recipe and completion statistic by exact delta. Generic recipes-learned statistics emit only with usable active metadata.
- Source asset is an exact-pixel alias of the reviewed townhouse flower planter, required to keep interior asset identity unambiguous. No new artwork was invented or generated.
- Passed: 177 tests across 11 focused files, including production finish/sync/quest-reset blocks, run admission, content, furniture rendering and UI. All workspace typechecks, lint, lifecycle integrity, source content validation, asset generation/validation, sim/world/client builds passed. Existing client large-chunk warning remains.
- No live deployment or browser playtest. Full coverage/exhaustive validation is coordinated on the final cumulative PR stack by root; no concurrent full suites were run here.
- Standalone source adds four content definitions (904 total; b19bf4bf fingerprint) and one art asset (1183 total). Refresh cumulative fixtures when stacking atop Orchard.

## Stacked integration

Merged the reviewed Orchard stack (32b5fbd7), retaining compost, provisions, village milestones, renewable trees, lifecycle revision 18 and regenerated additive bindings. The cumulative pack has 911 definitions, fingerprint `739112ea`, and 549,836 runtime payload bytes. Delve adds 1,642 bytes; the measured cap is the next whole KiB (537 KiB). Reviewed ownership is 340 items: 148 callbacks, 90 inert, 69 data graphs, 33 furniture transactions; 53 foods remain unchanged.

Stack checks passed: 56 focused tests across 13 files, all workspace typechecks, lint, lifecycle integrity, content validation and world/client builds. The inherited secondary-registration golden is 158, including both village meals. Root coordinates the final full suite on the economy tip.


Furniture-catalog regression followup explicitly partitions 32 purchasable plan-backed pieces and one earned keepsake, retains common residence/footprint/noncombat constraints for all 33, checks the unique art identity and zero-value economy, and proves the keepsake and a plan are absent from all shops. Homestead palette tests include the earned residence-only shape without adding it to outdoor construction.

Phase-zero seam review compared all five pinned sources against Orchard `666ef9fb`: only the reviewed Delve admission label changed, from “FIGHT THROUGH 12 ROOMS.” to “12 ROOMS. HOME RECIPE ON FIRST WIN.” The predecessor reproduces the old digest exactly; the recaptured digest retains every ownership, source-count and acyclic-import assertion. This followup changes no production code.

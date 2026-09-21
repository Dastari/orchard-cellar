# Delve keepsake handoff

- Branch `feat/delve-completion-keepsake`, version 0.13.0, implements [spec](delve-keepsake-spec.md) and [ADR](adr/003-delve-completion-keepsake.md).
- First complete final-guardian reward claim learns a non-saleable home-planter recipe; every full run increments a durable per-player completion total. Existing membership/run deletion makes retries inert. No new schema.
- Receipt uses one namespaced private quest flag; quest reset explicitly preserves it. Missing/retired content never blocks exit. Reconnect repairs the known recipe and completion statistic by exact delta. Generic recipes-learned statistics emit only with usable active metadata.
- Source asset is an exact-pixel alias of the reviewed townhouse flower planter, required to keep interior asset identity unambiguous. No new artwork was invented or generated.
- Passed: 177 tests across 11 focused files, including production finish/sync/quest-reset blocks, run admission, content, furniture rendering and UI. All workspace typechecks, lint, lifecycle integrity, source content validation, asset generation/validation, sim/world/client builds passed. Existing client large-chunk warning remains.
- No live deployment or browser playtest. Full coverage/exhaustive validation is coordinated on the final cumulative PR stack by root; no concurrent full suites were run here.
- Standalone source adds four content definitions (904 total; b19bf4bf fingerprint) and one art asset (1183 total). Refresh cumulative fixtures when stacking atop Orchard.

## Stacked integration

Merged the reviewed Orchard stack (32b5fbd7), retaining compost, provisions, village milestones, renewable trees, lifecycle revision 18 and regenerated additive bindings. The cumulative pack has 911 definitions, fingerprint `ceeaa585`, and 549,831 runtime payload bytes. Delve adds 1,645 bytes; the measured cap is the next whole KiB (537 KiB). Reviewed ownership is 340 items: 148 callbacks, 90 inert, 69 data graphs, 33 furniture transactions; 53 foods remain unchanged.

Stack checks passed: 56 focused tests across 13 files, all workspace typechecks, lint, lifecycle integrity, content validation and world/client builds. The inherited secondary-registration golden is 158, including both village meals. Root coordinates the final full suite on the economy tip.


Furniture-catalog regression followup explicitly partitions 32 purchasable plan-backed pieces and one earned keepsake, retains common residence/footprint/noncombat constraints for all 33, checks the unique art identity and zero-value economy, and proves the keepsake and a plan are absent from all shops. Homestead palette tests include the earned residence-only shape without adding it to outdoor construction.

Phase-zero seam review compared all five pinned sources against Orchard `666ef9fb`: only the reviewed Delve admission label changed, from “FIGHT THROUGH 12 ROOMS.” to “12 ROOMS. HOME RECIPE ON FIRST WIN.” The predecessor reproduces the old digest exactly; the recaptured digest retains every ownership, source-count and acyclic-import assertion. This followup changes no production code.

Commerce regression followup authors the earned planter with `buy: null, sell: 0`; both validation and runtime reward resolution reject any numeric purchase price, including zero. Existing commerce assertions remain unchanged. The three extra transport bytes keep the cumulative pack within the existing 537 KiB cap.

Commerce followup validation passed: 33 focused tests across nine files, all workspace typechecks, changed-file lint, source content validation, lifecycle integrity and sim/world builds.

Main-update integration: merged Orchard `b8870362`, including reviewed main `2aee1799` Kenmi icons and Crafting HUD. Compared all five structural seams against new main: only the Delve admission string differs; the independently calculated combined digest is pinned with both reviews. Preserved exclusive `buy: null` reward validation and the premium-icon extraction script. Updated content/Studio fingerprints to `ceeaa585` (911 definitions, 549,831 bytes, still within 537 KiB). Root owns final cumulative broad checks.

Updated-main merge validation: 174 tests across 14 files passed, including combined structural seams, Crafting HUD, premium source pixels, commerce, keepsake authority and content. Source content validation and conflict-resolution-file lint passed; no broad suite was repeated.

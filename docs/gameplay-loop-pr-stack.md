# Gameplay loop PR stack

The six implementation slices are separate GitHub pull requests, stacked in review order. Feature-branch integration does not merge any PR or change `main`; no production deployment has been performed. The final branch contains the combined candidate, version 0.14.0.

| Order | Pull request | Version | Review base | Gameplay connection |
|---|---|---|---|---|
| 1 | [#27 Crop compost](https://github.com/Dastari/orchard-cellar/pull/27) | 0.9.0 | `main` | Pressing Pomace + gathering Fiber → one-use crop growth advance |
| 2 | [#31 Preserved provisions](https://github.com/Dastari/orchard-cellar/pull/31) | 0.10.0 | `feat/pomace-compost` | Crops → preserving → edible provisions for outings |
| 3 | [#29 Village milestones](https://github.com/Dastari/orchard-cellar/pull/29) | 0.11.0 | `feat/preserved-expedition-provisions` | Diverse raw/preserved/bottle deliveries → permanent meal recipes |
| 4 | [#28 Renewable orchard](https://github.com/Dastari/orchard-cellar/pull/28) | 0.12.0 | `feat/village-order-milestones` | Mature fruit trees → renewable picking/seed recovery → continued cellar supply |
| 5 | [#32 Delve keepsake](https://github.com/Dastari/orchard-cellar/pull/32) | 0.13.0 | `feat/renewable-orchard-harvest` | Completed Delve → permanent home decoration recipe → peaceful materials/building |
| 6 | [#30 Connected progression](https://github.com/Dastari/orchard-cellar/pull/30) | 0.14.0 | `feat/delve-completion-keepsake` | Fishing → Farming skills; repeated production → meaningful room purchases |

## Future merge procedure (requires explicit approval)

PRs #31, #29, #28, #32 and #30 target their predecessor feature branch so each review shows only its own slice. After a predecessor is explicitly approved and merged into `main`, retarget the next PR to `main` before merging it. Do not merge a downstream PR into its predecessor branch or delete stack base branches early. If squash/rebase merging removes shared ancestry, rebase the remaining stack onto the new `main` and verify every PR diff and required check again. **No PR merges are currently authorized.**

## Gameplay dependencies

Pressing produces Must for bottles and Pomace for Compost. Compost consumes four Pomace and one Fiber, advancing a growing crop by 25% of its required growth once per planting. Harvests can be eaten, sold, preserved or delivered; all 22 existing preserves become edible. Diverse village deliveries unlock Pantry Lunch and Cellar Supper, which use preserved produce alongside ordinary crops/fruit. Renewable fruit picking sustains the cellar without requiring felling maintained trees.

Fishing now gives 5 Farming XP per catch and an extra 10 when an ordinary pool depletes, matching its specializations. A Delve victory unlocks an optional non-saleable keepsake recipe using ordinary home materials. Combat is never required to unlock ordinary farming, preserving, fishing, existing furniture or estate expansion.

The base home and cellar remain available before either room expansion. East and South cost 60,000 and 180,000 bronze respectively, **240,000 combined**. Bottle prices remain **5,000 / 10,000 / 20,000 / 40,000** across Vintage ranks, and the first-bottle quest remains **50,000**. Two base bottles plus the quest yield 60,000 gross, before spending; this is not a measured first-room acquisition time. See the [production-only report](connected-estate-economy-report.md).

## Authority and publication requirements

- Compost settlement, one-item consumption and exactly one `compost_applied` statistic commit together. Repeated or rejected treatment changes none of them. The appended `world_crop.composted` default initializes existing crops untreated.
- Preserved-food callbacks validate canonical Hunger restoration and selected-item custody. Full-Hunger rejection consumes nothing. Their content metadata and compiled lifecycle bundle must be published together.
- Village milestone progress records successful admitted deliveries in one bounded private row per player. Knowledge grants use existing recipe authority and remain idempotent; historical deliveries cannot be reconstructed from the old last-order receipt, so progress begins with new qualifying deliveries. Publish progress schema, authoritative module, content and current quote bindings together.
- Renewable picking uses the appended `world_resource.fruitReadyAtTick` default and current maturity, ownership, health, inventory custody and range checks. Readiness, drops, seeds, XP and statistics must remain one transaction. Release resource/loot content and regenerated bindings alongside the module.
- Delve completion relies on the persisted completed final-guardian run and its membership. The private lifetime receipt survives quest resets and repairs missing completion statistics/recipe knowledge when valid content returns. Deleting run/member/boon rows in that transaction prevents replay and preserves temporary-currency cleanup. The generic `recipes_learned` statistic is not backfilled for a grant made while that statistic was disabled.
- The final release must use the normal compatible additive migration and reviewed content publication procedure with data deletion disabled. Reverting only a pre-migration module is not a safe rollback for added columns/tables. UI prices and XP behavior require a matching module/client release. No Studio rebuild or retired-renderer guard bypass is part of this stack.

## Validation and remaining acceptance

Combined integration validation passed 541 tests across 106 focused files, all-workspace typecheck, lint, lifecycle integrity, checked world build, generated bindings, client build and asset build/validation. The compiled pack contains 911 definitions, hash `739112ea`, and 549,836 runtime bytes within the measured 537 KiB guard; lifecycle revision 18 contains 148 callbacks.

Each slice includes focused authority/content/client tests, documentation and relevant build checks. Integration refreshes compiled lifecycle artifacts, generated bindings, content fingerprints, exact inventory assertions and measured payload budget together. The coordinator runs the final combined `npm run check` (including coverage and exhaustive suites) serially; individual PR CI remains visible on the linked PRs.

Automated checks establish transactional and content contracts. No production migration, live browser playthrough, or fresh-player economy timing is claimed by this stack. The report excludes gathering, investment, manual handling and other spending. Existing unrelated icon/hoe PRs remain separate reviews.

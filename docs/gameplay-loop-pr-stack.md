# Gameplay loop PR stack

The six implementation slices were reviewed as separate stacked pull requests.
Their original combined candidate was 0.14.0; the integration status below is the
current source of truth. No production deployment is implied by Git integration.

| Order | Pull request | Version | Review base | Gameplay connection |
|---|---|---|---|---|
| 1 | [#27 Crop compost](https://github.com/Dastari/orchard-cellar/pull/27) | 0.9.0 | `main` | Pressing Pomace + gathering Fiber → one-use crop growth advance |
| 2 | [#31 Preserved provisions](https://github.com/Dastari/orchard-cellar/pull/31) | 0.10.0 | `feat/pomace-compost` | Crops → preserving → edible provisions for outings |
| 3 | [#29 Village milestones](https://github.com/Dastari/orchard-cellar/pull/29) | 0.11.0 | `feat/preserved-expedition-provisions` | Diverse raw/preserved/bottle deliveries → permanent meal recipes |
| 4 | [#28 Renewable orchard](https://github.com/Dastari/orchard-cellar/pull/28) | 0.12.0 | `feat/village-order-milestones` | Mature fruit trees → renewable picking/seed recovery → continued cellar supply |
| 5 | [#32 Delve keepsake](https://github.com/Dastari/orchard-cellar/pull/32) | 0.13.0 | `feat/renewable-orchard-harvest` | Completed Delve → permanent home decoration recipe → peaceful materials/building |
| 6 | [#30 Connected progression](https://github.com/Dastari/orchard-cellar/pull/30) | 0.14.0 | `feat/delve-completion-keepsake` | Fishing → Farming skills; repeated production → meaningful room purchases |

## Integration status — 2026-09-21

The owner authorized all branch integration and stale-worktree cleanup. Aggregate
[PR #38](https://github.com/Dastari/orchard-cellar/pull/38) retains all six exact
heads and their dependency ancestry, combines the town/hoe/Studio changes, and
refreshes shared content/version baselines. The candidate is game 0.15.0 and
Studio 0.8.1. See [the current integration handoff](branch-integration-handoff.md)
for validation and final state. The slice-specific results below are historical;
publication still requires the coordinated additive schema/content/map release.

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

The combined `npm run check` passed before the final upstream UI integration on 2026-09-21 at code commit `a4cdd26d5eae250fedac593cc35086c62f28cdf7`: 4,786 covered tests across 853 files plus 51 exhaustive tests across two files (4,837 total), all-workspace typecheck, lint, lifecycle integrity, checked world build and asset validation. Coverage is 92.7% of lines, 83.84% of branches, 94.12% of functions and 88.6% of statements, exceeding every required threshold. Matching bindings and sim/world/client production builds also passed. Asset validation covers 1,183 art assets, three songs, ten SFX, 55 palette colors and four seasonal remaps.

The compiled pack contains 911 definitions, hash `ceeaa585`, and 549,831 runtime bytes within the measured 537 KiB guard; lifecycle revision 18 contains 148 callbacks. The keepsake is explicitly unavailable to buy (`buy: null`), with a zero sale value.

Each slice includes focused authority/content/client tests, documentation and relevant build checks. Integration refreshes compiled lifecycle artifacts, generated bindings, content fingerprints, exact inventory assertions and measured payload budget together. The combined gate ran serially after correcting the purchase fixtures, reviewed UI fingerprint and nonbuyable keepsake definition. Main subsequently advanced to `2aee1799` with icon and Crafting UI changes (#24); all six branches now include it. At the integrated candidate `6afc2ea25ccb4dba24a1cc5de3ee7812a713066d`, production simulation source, world authority, lifecycle artifacts, dependencies and coverage configuration remain byte-identical to the covered commit. The only authored gameplay-content differences are four seed icon references and one skill icon reference. Coverage results above apply to the unchanged simulation source; the post-integration functional and build checks are recorded separately below. Individual GitHub CI runs remain visible on the linked PRs.

Post-integration validation at `6afc2ea2` passed: 4,792 functional tests across 854 files plus 51 exhaustive terrain/world tests across two files, **4,843 tests total**. Lifecycle integrity, all-workspace typecheck, lint, asset generation/validation and sim/tools/world/client production builds passed. Asset validation now covers 1,188 art assets; audio, palette and seasonal counts are unchanged. All six PRs are conflict-free against their recorded review bases. GitHub CI remains pending; only documentation changes follow this tested candidate.

Automated checks establish transactional and content contracts. No production migration, live browser playthrough, or fresh-player economy timing is claimed by this stack. The report excludes gathering, investment, manual handling and other spending. The merged icon update is preserved; the unrelated hoe fix remains a separate review.

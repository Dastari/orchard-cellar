# Preserved expedition provisions

Status: Accepted for implementation under the owner's 2026-09-21 request for separate gameplay-loop PRs.

## Objective and scope

Make the existing 22 preserved crops useful as carried food, connecting growing and barrel production to gathering and outdoor expeditions. Keep item IDs, batch processing, prices, orders and storage unchanged. This slice does not add spoilage, mandatory meal buffs, new art, processor timers or Delve consumables.

## Behavior and numbers

Selecting a preserved crop exposes the existing secondary eat action on keyboard/touch. Eating consumes one item, restores Hunger up to its existing 100-point cap, and records one `food_eaten` statistic with the preserved item kind. Full Hunger rejects without consuming or recording anything. Current authorization, custody, mounted/hands and Delve restrictions apply through the shared item-use authority.

Each preserve restores ten Hunger points more than its raw crop. Preserved wheat and sunflower restore 14 points because their raw forms are not edible. This gives 12–23 Hunger per portion: better portable plant provisions while cooked fish (24) and meat (28–40) keep their role. These exact values are documented alongside the live food economy and covered by golden tests. No persistent effect is granted; Orchard Tea and fruit buffs retain their separate purpose.

## Architecture and decision

Use authored `food.restoreCenti` and compiled item callbacks through the existing item-use/restoreHunger capability. No schema/API change, per-item reducer or parallel food framework. Update the lifecycle source, deterministic generated server/client metadata, ownership classification and bootstrap hash together. The published content pack and lifecycle module must be released together; editing only one is not a complete deployment. Existing preserve stacks become edible without migration.

Alternatives: a new ration item adds unnecessary conversion and inventory complexity; adding a temporary modifier to every preserve duplicates the existing tea/fruit effects and inflates combat assumptions. Simple hunger restoration closes the missing dependency with existing authority validation.

## Acceptance and failure cases

- All 22 preserved crops have consistent food metadata, a player-visible eat prompt and an executable generated callback.
- At partial hunger the callback requests exactly one consume, its authoritative restoration amount and a single typed statistic.
- Full hunger and missing food-state snapshots reject without effects; existing authority rejects invalid amounts, inaccessible stacks and restricted Delve use atomically.
- Barrel output and village-order prices/quantities remain unchanged; food classification agrees across bootstrap registry and compatibility projections.
- Compilation/integrity, ownership partition, focused food/processor/lifecycle/client tests, typecheck/lint, world/client builds and repository checks must pass before completion. No production deployment or PR merge is included.

## Impact measurement

Baseline: zero of 22 preserved crop kinds are edible (source audit). Target: 22/22 usable through the actual generated interaction path, with 0 item loss/statistics on rejected full-Hunger use. Measure in deterministic registry/callback tests and a local interaction preview. No live player-engagement improvement is claimed before deployment.

## Governance checklist

- Intent/vision, source audit and independent planning: established by gameplay-loop audit and owner implementation request.
- Plan/spec/decision, metric, adversarial review and tests: this spec plus implementation review.
- Existing architecture/CI/IaC/security/PR standards retained; no new infrastructure, secrets or external API.
- Business scope: improve existing connected play; no product/market expansion.
- Documentation/version/ledger: feature spec, live food rules, architecture note, changelog and PR record.
- Observability/research/large payload import: not needed; no new runtime instrumentation or external dataset.
- Unavailable superpowers skills: manual design, test-first and review workflow used.

## Validation and delivery record

The standalone slice authors matching legacy eat graphs as well as generated callbacks so content projections retain the existing food contract; ownership tests prove only the generated callback dispatches. Actual authority-writer tests cover capped recovery, exact consumption/statistics, stale custody, full Hunger, invalid amounts and replay without duplicate writes. Runtime content measures 546,092 bytes (900 definitions, hash `62fe3a18`), a 9,382-byte increase; the explicit budget is raised to the next whole KiB, 534 KiB.

The first full gate found stale catalog expectations and missing ignored art/atlas inputs in the isolated checkout. Expectations were corrected; licensed references were linked read-only from the original checkout and atlas assets rebuilt. That superseded full run was stopped before completion. The coordinator runs the combined stack gate after integration. No production deployment or live browser playtest is claimed.

Stack integration: this PR targets `feat/pomace-compost`. The combined content has 903 definitions, 546,914 runtime bytes and hash `304f22cc`; budget 535 KiB. Lifecycle revision17 contains 146 handlers. The combined focused suite passes 448 tests across84 files, including both actual authority writers and the full lifecycle/content contracts. Licensed pixel and map-export verification also pass after local fixture setup.

Forward-integrated reviewed main `2aee1799` via Compost `4d89af24`, preserving Kenmi item/skill art, the Crafting HUD, premium-icon extraction script and main structural-seam baseline. Main integration validation: 191 focused tests across 17 files passed, covering food/compost authority, lifecycle ownership, bootstrap fingerprint, structural seam, HUD and source-pixel contracts. Runtime remains within the existing 535 KiB cap.
Content export validation, lifecycle integrity, all-workspace typecheck, ESLint, checked world build and client production build also pass after the main integration. Full combined-stack gates remain coordinated on the final economy branch.

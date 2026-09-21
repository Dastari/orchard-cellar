# Pomace compost handoff

Implemented on `feat/pomace-compost` as the first independently reviewable gameplay-loop slice, version 0.9.0. No production deployment or PR merge is authorized or performed.

- Player path: press fruit → Pomace; handcraft four Pomace + one Fiber → Compost; select Compost and target a growing crop; F/primary pointer/touch advances required growth by 25%, once per planting.
- State: appended default-false `world_crop.composted`; bindings regenerated. Existing crops enter untreated through the additive schema default. Release must deploy module, matching bindings/client, and content through the normal release procedure.
- Authority: existing farm permissions, public-land crop ownership, three-tile reach, mounted/hands checks; settled elapsed growth; maturity cap; whole effect batch requires exactly one item consumption and one compost statistic. No treatment XP.
- Existing Pomace icon reused; explicit Compost name and one-use prompt distinguish the inventory item. A bespoke icon is outside this change.
- Root coordinator will stack the remaining five gameplay PRs above this branch. The standalone runtime content payload is 537,540 bytes (60 bytes below the existing 525 KiB limit); the combined stack needs a measured payload-budget review.

Validation: 461 tests across 87 focused files passed, covering authority, lifecycle, content/crafting and client routing tests; all-workspace typecheck; ESLint; lifecycle artifact integrity; checked module build/code generation; client production build; atlas build and asset validation. Full coverage/exhaustive gates are coordinated by the root agent to avoid concurrent CPU-heavy runs. No live browser/server deployment was performed.

Successful treatment also records exactly one authored `compost_applied` lifetime statistic in the same transaction. The preflight requires this exact unit increment alongside one treatment and one consumed item; rejected actions leave statistics unchanged. This supports future quest and milestone links without granting XP.

# Pomace compost specification

The pressing byproduct becomes a useful input to growing: handcraft four Pomace and one Fiber into one Compost, then select it and use F or the primary pointer action on a growing crop. No station or recipe book is required. Reuse the reviewed pomace icon; distinguish the item by name and help text.

One compost advances the crop by 25% of its required growth, capped at maturity, after settling elapsed watered growth. Each planting accepts compost once. It does not water soil, change seasons, grant XP, or affect trees. Existing crops default to untreated. Harvesting/replanting resets eligibility naturally with the crop row.

Use an authored place lifecycle with a narrow `compostCrop` engine effect. Validate authenticated sender, current space and target, build/farming permission, crop owner on public land, reach, hands/mount state, selected compost capability, growing crop and unused treatment. Preflight requires exactly one selected-item consumption; all application and consumption happen in the existing reducer transaction. Invalid targets, repeated application, mature crops or missing inventory leave growth and inventory unchanged.

Success: focused tests exercise actual authority checks and effect/consumption batching; content recipe and client capability tests establish the complete press → craft → crop path. Typecheck, lint, lifecycle integrity and world/client builds pass. Deployment uses the normal additive column migration and regenerated bindings, with no live release in this PR.

Successful treatment also records exactly one authored `compost_applied` lifetime statistic in the same transaction. The preflight requires this exact unit increment alongside one treatment and one consumed item; rejected actions leave statistics unchanged. This supports future quest and milestone links without granting XP.

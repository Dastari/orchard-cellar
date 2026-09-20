# Renewable orchard harvest

## Objective and scope

Connect maintained apple, pear, peach and cherry trees to repeatable cellar fruit supply. Mature generated and planted trees offer E/touch picking; axe felling remains forestry. Grafting and care are outside this change.

## Contract

Resource source content defines fruitHarvest item, quantity and cooldownTicks. Keep current mature fruit yields; recharge takes one game day. Picking preserves tree health and growth and pays the existing deterministic seed chance (including Orchard Seed Saver), fruit and Farming XP. Felling configured trees produces wood/sticks only. Small, medium, depleted, suppressed, distant or inaccessible trees cannot be picked. Existing permission, occupied-hand and mounting restrictions apply. Payout uses inventory first with reserved ground overflow.

Append world_resource.fruitReadyAtTick with default 0; existing mature trees begin ready, while old saplings/stumps still require maturity. Existing activationOrdinal advances after each successful pick or felling so retries cannot reroll. No background scan or schema reset is required. Publish with --delete-data=never; regenerate bindings. Reconciliation must preserve the timer on retained trees.

## Verification and success

Tests cover old rows, all four species, unchanged health, cooldown boundaries, reach and permission rejection, deterministic seeds, repeated calls, pick then fell, and regrowth. Client candidates and keyboard/touch share the existing interaction dispatch. Typechecks, lint, content validation, world/client builds and targeted tests must pass. One mature tree supplies multiple harvests without felling; no repeated call produces a second payout before its deadline.

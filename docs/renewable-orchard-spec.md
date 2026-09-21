# Renewable orchard harvest

## Objective and scope

Connect maintained apple, pear, peach and cherry trees to repeatable cellar fruit supply. Mature generated and planted trees offer E/touch picking; axe felling remains forestry. Grafting and care are outside this change.

## Contract

Resource source content defines fruitHarvest item, quantity and cooldownTicks. Keep current mature fruit yields; recharge takes one game day. Picking preserves tree health and growth and pays the existing deterministic seed chance (including Orchard Seed Saver), fruit and Farming XP. Felling configured trees produces wood/sticks only. Small, medium, depleted, suppressed, distant or inaccessible trees cannot be picked. Existing permission, occupied-hand and mounting restrictions apply. Picking also requires the current inventory protocol, unlocked persistent inventory and positive authority-settled health; rejected dead/custody/protocol retries do not advance readiness or award loot/XP. Payout uses inventory first with reserved ground overflow.

Append world_resource.fruitReadyAtTick with default 0; existing mature trees begin ready, while old saplings/stumps still require maturity. Existing activationOrdinal advances after each successful pick or felling so retries cannot reroll. No background scan or schema reset is required. Publish with --delete-data=never; regenerate bindings. Reconciliation must preserve the timer on retained trees.

## Verification and success

Tests cover old rows, all four species, unchanged health, cooldown boundaries, reach and permission rejection, deterministic seeds, repeated calls, pick then fell, and regrowth. Client candidates and keyboard/touch share the existing interaction dispatch. Typechecks, lint, content validation, world/client builds and targeted tests must pass. One mature tree supplies multiple harvests without felling; no repeated call produces a second payout before its deadline.

## Playing and release

Stand within the usual pickup reach of a fruit tree. The shared interaction prompt reads `PICK APPLE` (or the other authored fruit), explains immature growth, or counts down ripening. Use E or the touch interaction control. One pick grants two fruit and 4 Farming XP; fruit reappears after 18,000 authority ticks (15 real minutes). Orchard Seed Saver keeps its existing 5/15/25/35% seed chance. Axes still fell trees into wood or sticks.

Deploy the reviewed world module and updated resource/loot source content together through the normal content release procedure, then the client with regenerated bindings. Keep `--delete-data=never`. The new field is appended with a zero default; no backfill or deletion is necessary. Preserving the previous module alone is not a safe schema rollback: use the established compatible world rollback procedure. This PR does not deploy or change live content.

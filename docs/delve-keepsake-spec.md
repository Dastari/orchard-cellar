# Delve completion keepsake

## Objective and scope

Connect a complete 12-room Delve to an optional home decoration. First victory permanently reveals the Delver Memorial Planter recipe. Repeat victories count in lifetime statistics. No currency, gathered materials or combat power leave the run. Death and abandonment earn nothing; existing return positions, vitals, boons and run-currency cleanup remain intact.

## Contract

Only the persisted complete final guardian run can award a victory. Its existing member rows define recipients; deleting the run and memberships in the same transaction prevents replay. Store each player's completion total in one private player_quest_flag row, with stable ID `<identity>:delve.completed` and flag `delve.completed:<count>`. This narrow receipt is independent of active content and is the durable source of truth.

Resolve the unique active knowledge-gated recipe whose output item carries `reward.delve_completion`. Source content defines the planter, residence placement, reused reviewed townhouse-planter art and workbench recipe (4 stone, 8 fiber, 2 sunflower). Its sale value is zero. Players need no home or inventory space to learn it. Peaceful furniture acquisition remains available.

The receipt synchronizes an authored `delves_completed` statistic by positive difference and learns the recipe once. Reconnect repeats this synchronization safely. Missing/retired reward or statistic content does not block run exit: the durable receipt repairs the unlock/statistic after valid content returns. Zero reward definitions disables the reward; ambiguous/invalid definitions fail validation. Existing learned knowledge is never revoked.

## Verification

Execute production finish/sync helpers with fake tables: first victory, repeat victory, stale invocation, early rooms, death/abandon, multiple members, absent/retired content followed by reconnect, repeated login, saved vitals and upgrade cleanup. Content tests enforce recipe gating, crafting inputs, residence placement and zero sale value. Check typechecks, lint, builds, content and assets. No new schema or generated bindings are required.

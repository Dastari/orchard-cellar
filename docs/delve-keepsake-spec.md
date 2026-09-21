# Delve completion keepsake

## Objective and scope

Connect a complete 12-room Delve to an optional home decoration. First victory permanently reveals the Delver Memorial Planter recipe. Repeat victories count in lifetime statistics. No currency, gathered materials or combat power leave the run. Death and abandonment earn nothing; existing return positions, vitals, boons and run-currency cleanup remain intact.

## Contract

Only the persisted complete final guardian run can award a victory. Its existing member rows define recipients; deleting the run and memberships in the same transaction prevents replay. Store each player's completion total in one private player_quest_flag row, with stable ID `<identity>:delve.completed` and flag `delve.completed:<count>`. This narrow receipt is independent of active content and is the durable source of truth.

Resolve the unique active knowledge-gated recipe whose output item carries `reward.delve_completion`. Source content defines the planter, residence placement, reused reviewed townhouse-planter art and workbench recipe (4 stone, 8 fiber, 2 sunflower). Its purchase price is null (nonbuyable) and its sale value is zero. Numeric purchase prices, including zero, invalidate the reward in authoring and runtime resolution. Players need no home or inventory space to learn it. Peaceful furniture acquisition remains available.

The receipt synchronizes an authored `delves_completed` statistic by positive difference and learns the recipe once. Reconnect repeats this synchronization safely. Missing/retired reward or statistic content does not block run exit: the durable receipt repairs the unlock/statistic after valid content returns. Zero reward definitions disables the reward; ambiguous/invalid definitions fail validation. Existing learned knowledge is never revoked.

## Verification

Execute production finish/sync helpers with fake tables: first victory, repeat victory, stale invocation, early rooms, death/abandon, multiple members, absent/retired content followed by reconnect, repeated login, saved vitals and upgrade cleanup. Content tests enforce recipe gating, crafting inputs, residence placement, nonbuyable reward pricing and zero sale value. Check typechecks, lint, builds, content and assets. No new schema or generated bindings are required.

## Player and release notes

Claim the final guardian boon to complete a run, then open the recipe guide at a workbench. The keepsake recipe consumes peaceful materials; it grants no stat bonus, sale income or combat advantage. It can be placed in the residence and uses a distinct asset ID containing the exact reviewed townhouse planter pixels, because authored interior lookup requires unique sprite identities.

Publish the normal reviewed source-content update with the module/client. No schema change or data reset is needed. Old in-progress runs can finish normally even while keepsake content is absent: reconnect after content activation repairs the unlock. Quest resets retain the completion receipt. The existing learned-recipe row remains authoritative for knowledge, including across statistics resets. The generic recipes-learned statistic is emitted only if its active metadata is usable; it is not retroactively synthesized for unlocks made while that statistic was disabled.

# Renewable orchard PR handoff

Correction, 2026-09-22: chopping a ripe tree again pays its current fruit, seed roll and Farming XP with the wood. A tree that is still ripening after a pick stays forestry-only. See the spec.

- Branch: `feat/renewable-orchard-harvest`; version 0.12.0.
- Implements [spec](renewable-orchard-spec.md) and [ADR](adr/002-renewable-fruit-state.md). All four species grant two fruit per game day plus the existing seed-saver roll. E/touch picks; axe felling retains forestry loot.
- Appended defaulted readiness field and regenerated bindings; no deletion/backfill. Tree health/growth updates preserve readiness, as does generated relocation and planted-tree reconciliation.
- Passed: 48 focused tests across 10 files; all workspace typechecks; lint; sim/world/client builds; lifecycle integrity; content canonicalization/validation; asset validation. Client retains the existing large-chunk warning.
- Tests execute production reducer functions with fake table storage, including authority rejection, retry/ordinal behavior and pick/fell/regrowth. No live deployment, migration rehearsal or browser playtest was performed.
- Full coverage/exhaustive runs are coordinated by the root session on the final PR stack, to avoid concurrent CPU-heavy suites. This PR initially targets main, then will stack after village-order progression; root coordinates shared content/version integration. Do not merge without the user's instruction.

- Review correction: picking now admits current inventory protocol, persistent
  inventory custody and authority-settled health before cooldown or payout writes.
  Production reducer tests reject dead/locked/stale-protocol attempts and retries,
  then prove one successful payout after recovery.
  Correction verification: 21 relevant tests across 5 files, world typecheck,
  lint and checked world build passed.

## Stacked integration

This branch now includes Orders `31f7b085`, its provisions predecessor and Compost,
using feature-branch merges only. PR #28 targets `feat/village-order-milestones`.
The cumulative release is 0.12.0: 907 definitions, hash `dd04e7ff`, 548,194 runtime
bytes and a 536 KiB next-whole-KiB ceiling. Resource fruit timers, crop compost
markers and order milestone projections coexist in regenerated bindings.
Lifecycle revision 18 retains 148 callbacks, 339 live items, 90 inert owners,
69 graph owners, 32 transaction owners and 53 edible foods. Canonical content,
loader golden and Studio manifest are synchronized. The retired Studio renderer
guard remains unchanged and no live deployment occurred.

Cumulative focused validation passed 147 tests across 37 files, covering all four
connected loops, edible/lifecycle ownership, exact content manifests and default
quality projection. Checked world build and production client build pass.

## Reviewed main integration

Main `2aee1799` icon and Crafting UI updates are retained through Orders
`52b00ffc`. Version remains 0.12.0. Content has 907 definitions, hash `605f1cb9`,
and 548,186 runtime bytes within the unchanged 536 KiB ceiling. Lifecycle revision
18 and all 148 handlers are unchanged; all earlier gameplay and schema fields
remain present. Main's premium icon importer and structural UI baseline are preserved.

Validation after main integration: 210 focused tests across 21 files pass, including
main UI seam checks and premium source-pixel checks using existing licensed-art
source symlinks. Lifecycle integrity and canonical content validation pass. The
Orders predecessor passes all workspace typechecks, lint and checked world/client
builds; the coordinator runs final cumulative gates after this metadata-only merge.
No deployment.

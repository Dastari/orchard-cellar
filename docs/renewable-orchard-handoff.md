# Renewable orchard PR handoff

- Branch: `feat/renewable-orchard-harvest`; version 0.12.0.
- Implements [spec](renewable-orchard-spec.md) and [ADR](adr/002-renewable-fruit-state.md). All four species grant two fruit per game day plus the existing seed-saver roll. E/touch picks; axe felling retains forestry loot.
- Appended defaulted readiness field and regenerated bindings; no deletion/backfill. Tree health/growth updates preserve readiness, as does generated relocation and planted-tree reconciliation.
- Passed: 48 focused tests across 10 files; all workspace typechecks; lint; sim/world/client builds; lifecycle integrity; content canonicalization/validation; asset validation. Client retains the existing large-chunk warning.
- Tests execute production reducer functions with fake table storage, including authority rejection, retry/ordinal behavior and pick/fell/regrowth. No live deployment, migration rehearsal or browser playtest was performed.
- Full coverage/exhaustive runs are coordinated by the root session on the final PR stack, to avoid concurrent CPU-heavy suites. This PR initially targets main, then will stack after village-order progression; root coordinates shared content/version integration. Do not merge without the user's instruction.

# F2 named balance and progression handoff

PR: https://github.com/Dastari/orchard-cellar/pull/76

Owner-authorized part 1 of doc 62 F2 (Agent Mail #178). Branch
`feat/content-balance-and-progression`, based on `origin/main` `2e1d9a4f`.

## Delivered contract

Three balance profiles now expose named typed fields. `BALANCE_FIELD_METADATA`
records units, legacy bounds, and help; the same information is included in type
JSDoc for the #70 form generator. Legacy tuple JSON is accepted and canonicalized
to named fields. Both forms together and unknown field names are rejected.
Existing profile ownership, reference and range validation remains authoritative.

`progression:character` owns level cap, total-XP curve, respec cost ladder and 16
activity award formulas (`base + perUnit × units`). Runtime uses the singleton
active definition independent of its ID. A registry with no progression rows uses
the committed bootstrap definition during additive rollout. A retired-only or
ambiguous owner fails closed. Stored XP, ranks, respec counts and durable tables
are not migrated or rewritten. A tuning change can intentionally alter displayed
levels and currently available points; lowering the cap does not refund ranks.

Live skill purchase validation, respec costs, activity awards and client
skill/character displays use the same active progression. UI and simulation
compatibility callers without a registry use the committed definition.

## Award inventory

| Activity key | Legacy formula | Authority site |
|---|---|---|
| plant_seed | 2 | crop seed planting effect |
| plant_fruit_seed | 2 | fruit tree seed planting effect |
| homestead_upgrade | 20 × next rank | upgrade purchase |
| orchard_harvest | 2 × quantity | mature orchard harvest |
| resource_fruit_harvest | 2 × quantity | fruit-tagged resource drops |
| mine_rock | 2 | rock payout |
| mine_mixed_stone | 3 | mixed node stone payout |
| mine_mixed_ore | 6 | mixed node ore payout |
| mine_ore | 10 | pure ore payout |
| mine_depletion | maximum richness | depletion bonus |
| fish_catch | 5 | tutorial and pool catches |
| fish_depletion | 10 | last catch from pool |
| cultivate | 2 | cultivation tool effect |
| water | 1 | watering tool effect |
| crop_harvest | 8 + quantity | crop harvest |
| seal_barrel | 5 | barrel sealing |

Ordinary wood chopping currently grants **zero** XP. The nearby ×2 resource
literal rewards only fruit-tagged drops, so it is named accordingly. Craft/process
completion, cooked-item jobs, quest, wildlife/combat and encounter rewards already
come from content (`process`, `quest`, `creature`, `enemy`/`encounter`); they retain
those owners. This change introduces no second copy of those authored amounts.

## Integration and publishing

This branch predates wave1 merges. Preserve #65 object validations and #73 rule
catalogue parser/export changes while integrating. Regenerate combined content
hash fixtures, rather than choosing either standalone branch hash.

#70 is not in the base. Once integrated, run
`npx tsx scripts/generate-content-field-schemas.ts`, then its `--check` mode and
schema/form tests. This automatically exposes typed named fields and progression.
#68 is also not in the base: add `progression: 'loot_progression'` to
`packages/sim/src/studio-scopes.ts` and test the server-side permission mapping.
The current base already exposes balance/progression through World Tables.

Publishing requires separate approval and the publishing runbook. Under a guarded
maintenance window: back up; publish the additive parser/runtime module without
`--delete-data`; stage matching game and Studio readers; publish reviewed named
balance rows and the new progression row through a revision-checked content change
set; verify legacy-vs-named runtime values and all existing durable state; enforce
the existing client update gate before resuming traffic. Older readers cannot parse
the new kind/named form, so do not serve new content to them. Rollback requires
restoring old tuple content/removing the added progression row through reviewed
content revision recovery **before** rolling back the parser/runtime/client.
No table schema or generated bindings changed. No merge/deployment performed.

## Verification

- Final affected suites: 1,252 tests in 228 files passed (all world authority tests,
  content parsers/registry, progression, construction, export, Studio world-table
  model and changed UI consumers).
- Exhaustive terrain/world/canvas suite: 101 tests in seven files passed.
- Workspace typecheck, final client typecheck, lint, full build, final world/client
  rebuilds, content validation (920 definitions, 26 files), assets validation
  (1,320 assets) and client chunk boundaries passed.
- Actual authority tests confirm customized catch/depletion awards and preflight
  without rewards; published-curve tests confirm purchase eligibility, UI level
  cap/respec display and skill-point notices change with content.
- Pre-migration tuple snapshot retains durable hash `0f06c798`, loads through the
  actual world content cache, and uses identical fallback awards before backfill.
- A full coverage run began before the final test fixtures and encountered two
  now-fixed fishing test harness failures. The final affected run includes both
  corrected cases. Do not treat that earlier coverage run as a passing final
  snapshot; final complete coverage remains a CI gate before merge.

## Payload measurement

Standalone F2 pack: 920 definitions / 26 kinds, 561,743 runtime payload bytes
(excludes protocol/compression), 708,911 authoring row-envelope bytes; hash
`0cf1057f`. Named fields and progression add 2,211 runtime bytes (+0.40%) over
559,532. The existing regression guard moves from 547 KiB to the next whole KiB,
549 KiB (562,176 bytes), leaving only 433 bytes slack. This is not a wire limit.
Remeasure after wave1 integration; do not choose either branch budget blindly.

## Reviewed wave1 and multi-space integration

The refreshed source includes final wave1 main and preceding PR75/74, with every
existing content kind retained. Progression publication requires `loot_progression`;
world balance retains `world_rules`. F1 schemas and the current Studio manifest are
regenerated. Prefix content is 920 definitions / 26 kinds, hash `cfede075`,
584,644 runtime bytes under a measured 571 KiB guard.

The historical durable tuple fixture is now pinned from immutable PR76 source
`6148b89f` rather than reconstructed from evolving bootstrap. Its original hash
`0f06c798` remains unchanged; a separate test checks current content using legacy
tuples. Combined behavior passed PR87's full 6,310 coverage + 101 exhaustive tests.
Prefix checks and fresh source CI are recorded in the PR. No deployment.

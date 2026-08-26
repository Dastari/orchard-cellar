# 33 — Lifetime Player Statistics

Binding owner-directed specification (2026-08-26). This is a backend foundation;
there is deliberately no statistics window, public profile, leaderboard, or milestone
toast yet. It builds on [19-overworld-spacetimedb-spike.md](19-overworld-spacetimedb-spike.md)
(authority and private views), [22-netcode.md](22-netcode.md) (successful reducer
outcomes), and [25-stats-and-vitals.md](25-stats-and-vitals.md) (typed registries and
future combat hooks).

## 1. Purpose and invariants

The game records the detailed lifetime facts that cozy games and RPGs commonly turn
into journal pages, achievements, jokes, and retrospective milestones: play time,
distance on foot versus horseback, trees felled, each ore exhausted, every item
crafted or traded, conversations, tool whiffs, and similar outcomes.

- SpaceTimeDB is the sole authority. The client never submits a count or an elapsed
  duration.
- A statistic changes only in the same successful transaction as the gameplay result
  it describes. Validation failures and rolled-back reducers leave no statistic.
- Counters never decrease and saturate at `u64::MAX`; record statistics use a `maximum`
  aggregation instead of counter addition.
- Statistics are private character data. Only caller-filtered views are public.
- No leaderboard or cross-player query is exposed. A later social design must make
  visibility opt-in before adding one.
- Deployment starts truthful observation from this system's landing. It does not
  fabricate historic totals that the old schema never recorded.

## 2. Canonical registry

`packages/sim/src/player-statistics.ts` owns
`PLAYER_STATISTIC_DEFINITIONS`. Each definition declares:

```ts
{
  name, description,
  category,
  unit: 'count' | 'authority_ticks' | 'fixed_distance' |
        'bronze' | 'durability' | 'damage',
  aggregation: 'counter' | 'maximum',
  subject: 'none' | 'item_kind' | 'resource_kind' | ...,
  milestones: bigint[],
  reserved?: boolean,
}
```

Reducers call the typed `recordPlayerStatistic` authority helper with a
`PlayerStatisticKind`; raw string statistic names are forbidden. A subject gives one
registered definition stable breakdown rows without schema growth—for example:

- `distance_travelled / foot` and `/ horse`;
- `messages_sent / channel`, `/ whisper`, `/ say`, `/ shout`;
- `resources_depleted / ore_iron`;
- `items_obtained / apple`;
- `tool_uses / axe`.

Subjects must come from already validated authority data. Never accept an arbitrary
client-provided subject and never encode two dimensions into one undocumented string.
If a feature needs a new dimension, extend the subject type and this document.

`reserved: true` means the key is intentionally allocated but no reducer may increment
it until that gameplay exists. Combat already reserves damage dealt/taken, enemies
defeated, and knockouts; fishing and quests reserve their corresponding counters.

## 3. Storage

Both source tables are private:

```text
player_statistic
  id                 string PK  # identity|kind|subject
  identity           Identity, btree
  statisticKind      string
  subjectKind        string     # empty only for subject:none
  value              u64
  createdTick        u64
  updatedTick        u64

player_statistic_milestone
  id                 string PK  # statistic row id|threshold
  identity           Identity, btree
  statisticKind      string
  subjectKind        string
  threshold          u64
  achievedTick       u64
```

`ownPlayerStatistics` and `ownPlayerStatisticMilestones` are caller-filtered array
views. Generated bindings exist now for future UI work, but the client does not
subscribe to them yet.

Crossing one or several thresholds atomically inserts immutable milestone rows. A
single update from 0 to 100 therefore records 1, 10, 50, and 100 at the same authority
tick. Replaying or retrying cannot duplicate them because milestone ids are stable.

## 4. Time played and movement

`time_played` is measured in the standing 20 Hz authority ticks, not browser wall time.
It counts once per identity even with several tabs. The authority flushes it at most
once per second and on a clean final disconnect; offline time is never included. A
crashed connection can add at most the existing bounded presence lease before expiry.
Starting a genuinely new active session resets the accounting anchor and increments
`world_entries`; every accepted transport increments `connections_opened`.

Movement uses committed fixed-point coordinate deltas. Walking and mounted travel are
separate subjects. Horse jumps record their landing distance immediately and update
the `longest_horse_jump` maximum; they are not counted a second time by the movement
loop.

## 5. Initial roster

The registry initially covers:

| Area | Statistics |
|---|---|
| Account | time played, connections, world entries |
| Social | messages by kind, NPC interactions by kind, dialogue choices |
| Exploration | distance by foot/horse, mounts, dismounts, jumps, longest jump |
| Items/world | obtained, picked up, dropped, hand-gathered, resource hits/depletion by kind, trees, rocks, ore nodes |
| Tools | successful uses and whiffs by kind, repairs, durability restored, arrows fired and impact kinds |
| Farming | tilled/watered/restored tiles, crops planted/harvested, orchard tends, tea consumed |
| Crafting | recipe executions, output units by item, largest request batch |
| Commerce | buys/sells, items by kind, lifetime bronze spent/earned |
| Chests | placed, opened, picked up, broken |
| Reserved | combat damage/defeats/knockouts, fish caught, quests completed |

The complete names, descriptions, units, and milestone numbers live in the registry,
not this summary table.

## 6. Mandatory feature-integration contract

Whenever an agent adds or materially changes an authority-owned gameplay system, the
feature is incomplete until it performs this audit:

1. List its successful player outcomes and useful breakdown dimensions.
2. Reuse a registry definition when semantics match exactly; otherwise add a new
   definition, unit, subject contract, and milestone progression.
3. Record statistics only after all validation and only inside the authoritative
   transaction. Count produced/consumed quantities, not button presses.
4. Add registry unit tests plus reducer-path coverage showing success increments once
   and rejection increments zero times.
5. If the feature does not warrant a lifetime statistic, state why in its binding doc.
6. Update §5 when adding a new area. Do not add frontend subscriptions merely because
   backend rows now exist.

Combat specifically records damage only after final mitigation, attributes a defeat
exactly once to the authority-selected source, and records knockout on the transition
into zero Health—not on every tick while at zero. Crafting records output units;
harvesting records the actor who commits depletion; co-op assists need an explicit
future attribution rule rather than duplicate credit.

## 7. Migration, privacy, and operations

The rollout is additive: two new private tables and two caller-filtered views. Existing
players need no eager row migration; rows materialize on the first observed outcome.
The `time_played` zero row is anchored on the next active session. No existing table is
renamed, widened, or deleted.

Statistics are gameplay state, so normal SpaceTimeDB backups already contain them.
Restore acceptance must compare statistic and milestone row counts and sample values.
Administrators may inspect private rows operationally, but no reducer edits or resets
statistics in v1.

## 8. Acceptance

- Registry tests enforce ordered positive milestones, subject rules, counter
  saturation, maximum aggregation, and multi-threshold crossings.
- World build/codegen proves both private tables and caller views.
- Reducer review verifies hooks occur after successful validation and remain atomic.
- Two authenticated clients see only their own rows through both views.
- A populated database accepts the additive publish without `--delete-data`.
- Time played advances approximately 20 ticks per connected second, does not multiply
  across tabs, and does not advance while offline.
- Full repository typecheck, lint, tests, coverage, and asset validation pass.

Implementation evidence (2026-08-26): the populated local module created only
`player_statistic` and `player_statistic_milestone`, retained its existing database
identity, and accepted the final code-only update with an empty migration plan. The
caller-isolation smoke harness subscribes to and validates both new views. `npm run
check` passes 75 test files / 460 tests, 92.32% statement coverage, every workspace
typecheck, lint, the world build, and validation of 478 art assets.

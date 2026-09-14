# 48 — Repeatable Mining Loop

Binding implementation record (2026-08-30). Status: **phase one implemented**.
Builds on docs 20, 26, 28, 33, 34, and 36.

## Player loop

Find a visible vein or rock, strike it several times, collect its reserved drop,
consolidate nine matching fragments in the 3×3 crafting grid, smelt metal chunks,
sell or build with the result, improve Farming mining skills, and revisit newly
populated sites later. Mining awards Farming XP on yields and depletion, never for
empty swings.

## Node population and replenishment

- The current island owns hundreds of deterministic, biome-aware candidate sites,
  but materializes only 48 active surface ore rows. Candidate sites are simulation
  data and are never streamed to clients.
- Active surface nodes keep stable population-slot ids. After depletion they wait
  10–20 minutes, then relocate to a valid candidate at least 12 tiles from another
  active ore and clear of players, soil, placeables, and chests.
- Cave pure veins replenish in place after 15–30 minutes. Rocks replenish after
  5–10 minutes. All delays and richness rolls are deterministic.
- Surface nodes are predominantly mixed. A small deterministic minority are
  pristine discoveries. Gems are primarily underground and have only a 1% surface
  site chance.

## Yield rules

- One payout requires 12 shared work: four novice, three trained, or two expert
  pickaxe strikes. Richness is the number of remaining payouts, capped at six.
- Mixed nodes have 1–2 richness and start at 70% Stone / 30% matching fragment.
  Ore Dressing reduces the Stone chance to a 40% floor. Luck protection forces the
  final payout to be matching ore if the node has produced none.
- Pristine surface nodes yield full ore chunks. Pure cave nodes have 1–6 richness,
  yield full chunks, and visually shrink through large/medium/small authored states.
- Rocks have 1–6 richness, always yield a Pebble, and have a 1% base chance to add a
  weighted random ore fragment. Rockhound raises that chance to 3%.
- Every physical payout is reserved to the triggering miner for ten seconds and is
  shared world loot afterward.

## Parties and contribution ownership

Partial work is leased for 30 seconds to the triggering solo player or their party.
Only that player or a member of the same party can add to the partial work; another
party must wait for the lease to expire. The authority now has durable party,
membership, and invite tables plus create/invite/accept/leave/remove reducers. Party
UI is a later presentation phase. A party may contain up to five players.

## Progression

Mining lives under **Farming**, matching the authored mining skill branch:
Prospector reveals odds; Efficient Strikes reduces hits; Ore Dressing improves mixed
ore yield; Rockhound improves rock surprises; Mother Lode adds a fragment to the
first payout from a rich pure vein.

Pickaxe-tier rules are data-defined now. Surface nodes and rocks always require only
tier one; pure copper/iron require tier one, pure gold tier two, and pure gems tier
three. The currently shipped authored Iron Pickaxe is tier three, so phase one cannot
deadlock. When crude and copper pickaxe recipes/assets land, their inputs must be
obtainable from the preceding tier before the starter loadout changes.

Gem fragments follow the same nine-fragments-to-one-chunk recipe as metals. Silver is
not added as a mined material: the current ore sheet contains iron, copper, gold, and
five gems but no distinct silver resource row. Silver remains a currency denomination
until matching node, fragment, chunk, and bar art exists.

## Streaming and migration

Only active/depleted population rows are public and chunk-subscribed. Candidate sites
and loot decisions are deterministic simulation functions. `world_resource` gained
append-only defaulted mining columns and a depleted index; `world_item` gained
append-only loot-reservation fields. A bounded migration backfills legacy rocks and
underground ore without clearing player state.

## Mining XP track correction — integrated into 0.7.0

Ore and rock payout XP, including the final depletion bonus, now goes to Farming
instead of Explorer. This matches the track containing the authored mining skills.
The shared path covers all mining node classes, including basalt, cinder and
emberglass. Reward amounts and eligibility are unchanged: partial hits, empty
swings and rejected actions grant no XP. Cave-wall excavation still has no XP
reward. Existing historical XP is preserved; this fix routes future rewards only.

## 2026-09-15 mining skill coverage amendment

This amendment supersedes the earlier phase-one coverage limits. Mining's active
skill branch is Farming. Silver Pickaxe has 1,500 durability (twice Iron), with
unchanged speed, vigour, reach, permissions and one Silver Bar + five bronze repair.

Efficient Strikes contributes 3/4/6 work per hit at ranks 0/1/2 to both ore nodes
and cellar walls. Nodes retain their 12-work payout. Each wall requires its
seeded 5–6 base hits times three work: 5–6 novice, 4–5 trained, or three expert
hits. Contributions remain additive when players with different ranks alternate.
Append a private default-zero work column to cellar_dig_progress; the first new
strike converts legacy hits to three work each. Retain hits as a physical count.
Do not spend vigour, wear, progress or loot during preflight or rejected actions.
Each accepted wall hit still costs two durability; node hits cost one.

Mining Endurance uses the selected pickaxe's mining context, including applicable
gear bonuses, for both paths. Rockhound uses the same authored 1%/2%/3% weighted
ore-fragment bonus for ordinary rocks, basalt and each completed wall. Preserve
wall stone heaps and primary mineral payouts. Share the bonus loot definition so
probabilities cannot drift. Mother Lode adds one matching material on the first
payout from a pure vein with maximum richness >=5, including cinder/emberglass
(which have no fragment items). Ore Dressing applies only to mixed deposits with
a stone-versus-ore roll; guaranteed materials cannot benefit from it. Detection,
identification and mapping remain passive and never extend harvest reach.

Validation must cover all rank levels, alternating contributors, legacy partial
progress, preflight and rejected-action non-mutation, exact wear, mineral primary
payout preservation, conditional bonuses and authored overrides/retirement.
The module and content changes must be released together after PR review; this
work does not publish either live. Existing stored Silver durability remains at
its current value until repaired; newly created and repaired picks receive 1,500.

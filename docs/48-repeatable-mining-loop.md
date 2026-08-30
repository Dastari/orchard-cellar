# 48 — Repeatable Mining Loop

Binding implementation record (2026-08-30). Status: **phase one implemented**.
Builds on docs 20, 26, 28, 33, 34, and 36.

## Player loop

Find a visible vein or rock, strike it several times, collect its reserved drop,
consolidate nine matching fragments in the 3×3 crafting grid, smelt metal chunks,
sell or build with the result, improve Explorer mining skills, and revisit newly
populated sites later. Mining awards Explorer XP on yields and depletion, never for
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

Mining lives under **Explorer**, not Farming and not a fourth top-level tree:
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

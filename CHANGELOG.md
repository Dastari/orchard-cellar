# Changelog

## 0.8.5 — Kenmi tool, skill and seed icons

- Replace the hammer (including the build button) and all six shovel-tier icons
  with Kenmi silhouettes; retain distinct wood/stone/metal palettes and update
  both tool generators to preserve the new artwork.
- Use clearer native artwork for nine farming/mining skills and distinct packets
  for apple, cherry, peach and pear seeds. Orchard Seed Saver now has its own icon.
- Preserve item IDs, gameplay rules and tool animations; add reproducible imports,
  source-pixel checks and reviewed asset fingerprints.

## 0.8.4 — Anvil repair release

- Repair tools at an anvil again. Since the facing-swing change, F swung any tool
  with an authored swing, which is every pickaxe, axe and hoe, before the anvil
  branch could run. A damaged tool faced at an anvil now repairs; an undamaged
  one, or one facing anything else, still swings.
- Increase the measured content payload budget to 525 KiB for the existing heavy-station carry definitions.

## 0.8.3

- Carry placed barrels, fermentation casks, fruit presses, furnaces and anvils
  again. The content pack authored no carry policy for them, so F did nothing and
  the authority answered "not carryable". Each is now a heavy station: it is
  carried in both hands as the same world entity, contents and all, and never
  enters the inventory. Faced heavy stations show a `[F] CARRY` hint.
- Climb the cellar ladder from the tile directly below its bottom rung. The
  ladder art is drawn from its foot, so it stood three floor rows above the
  climb tile; the exit portal and the trapdoor arrival now sit on the chamber's
  first two floor rows and existing homesteads are repaired on connect.

- Repair mining after the facing-swing change. A pick swing measured a resource's
  contact point from the feet while the point itself is authored at chest height,
  which cost an upward swing more than half its reach; and the swing key returned
  before the cellar-wall strike it cannot perform, so cellar walls could not be
  mined with F at all. Swing reach and arc are unchanged.
- Draw fishing pools from their authored nature artwork again. A resource whose
  visual names a decoration family resolved to no atlas entry and rendered the
  placeholder "?" tile.
- Rain now waters crops. While a shower runs, every crop tile in an open-air space
  — the island and every homestead, never a residence or cellar — is topped up on
  the weather sweep, with growth settled first so no progress is lost. Tilled soil
  without a crop keeps its own decay timer.
- Climb a cellar ladder only from the tile at its foot while facing it. The prompt
  no longer reaches sideways or diagonally past nearby objects, and the reducer
  enforces the same tile and facing.
- Count a placed anvil as the crafting station its recipes require. Anvil recipes
  such as the watch reported "REQUIRES AN ANVIL WITHIN 2 TILES" even while the
  player stood against one, because a placed anvil reported no station at all.

## 0.8.2 — Unreleased

- Add a hammer button above the crafting spanner to toggle the build menu without a
  keyboard. Move the weapon shortcut above it to keep touch targets separate.

- Account for the published content hash in village-order quote verification while
  still checking every price, quantity, receipt and player-state field.

- Keep first world connection, subscription hydration and initial retries in the
  normal gateway loading window. Show Reconnecting only after an entered world
  loses its connection; retain update, offline and sign-in recovery actions.

## 0.8.1 — Unreleased

- Correct horse/boat interaction reach from 32 tiles to 2, horse dismount distance
  from 18 tiles to 1.125, and horse wander radius/speed to their original units.
- Prioritize dismounting on E while mounted, including beside homestead entrances,
  and use authored mount reach consistently in client targeting and server checks.
- Resolve wildlife and enemy action targets through their active creature/enemy
  definitions so valid sword/axe targets no longer fail as missing NPC definitions.
- Interpolate NPC/mob positions between rendered frames using the same frame
  fraction as the camera and players.
- Swing axes, swords, picks and hoes in the player's facing direction without a
  selected target. Hit every contact in the authored arc; spend stamina once and
  apply durability wear per contact, completing the swing before a tool breaks.
- Use a shorter, narrower pick arc. Preserve mining tiers, ownership and loot
  rules; left-click retains explicit cellar excavation and farming operations.
- Show a single-line tool name immediately, then detailed information after a
  short hover in a bounded panel above the hotbar, including current durability.
- Publish corrected NPC/item content and generated lifecycles with the module/client update.
  No stored schema changes; existing player and horse positions are preserved.

## 0.8.0 — Unreleased

- Regenerate world client bindings for the five existing legacy-farm admin endpoints
  so the guarded release can verify exact module/client API parity.

- Mature apple, pear, peach and cherry tree harvests can drop a matching plantable
  seed (5% base chance). Orchard Seed Saver adds 10 percentage points per rank,
  reaching 35% at rank three. Plant on clear grass or tilled soil in the homestead or
  overworld; the matching sapling grows and regrows normally. Tilling is optional.
- Advance the fruit-tree harvest ordinal for fresh rolls after regrowth and
  preserve player-planted trees during generated-world reconciliation.
- Publish module, resource/item/skill content and generated lifecycle artifacts
  together. No database schema migration.

## 0.7.1 — Unreleased

- Narrow the cellar wall ladder's interaction reach to the tile column in front of it.
  The ladder no longer claims the prompt from chests, crops or furniture placed a tile
  to either side. Prompt and authority share one reach contract.

- Run exhaustive procedural-terrain and survival-world suites without coverage
  profiling as part of `npm test`; retain every test and enforce unchanged source
  coverage thresholds in the remaining suites.

- Remove repeated world-module parsing from the cooking release gate and avoid
  parsing files without protected table names; retain mutation checks and test deadlines.

- Allow authorized content editors to repair verified historical packs before gameplay initialization; preserve strict publication results and isolate recovery disconnects.

- Preserve rotated release credentials through signing-key outages while withholding unverified identity tokens.

- Repair hosted CI prerequisites, dry-run portability and portable Keccak hashing;
  retain local licensed-art checks and pin reviewed imports for public CI.

- Allow verified historical content to be read during upgrades while strictly
  validating the candidate and preserving conflict checks and live-only content.
- Explain incompatible game content instead of labeling it a reconnect failure.
- Restore Sort & Stack for both chest and backpack panes in authored chest windows.
- Add shared chest inventory search by item name or ID, preserving physical slot
  routing for filtered items. Search stays above the hotbar when resized.

## 0.7.0 — Unreleased

- Mining payout and depletion XP now goes to Farming, matching its skill branch.
  Historical XP is preserved. Integration review and validation: [PR #6](https://github.com/Dastari/orchard-cellar/pull/6).

- Efficient Strikes now improves cave-wall excavation as well as ore-node mining.
  Fresh walls take 5–6 / 4–5 / 3 hits at ranks 0 / 1 / 2. Mixed-rank contributions
  and existing partial wall progress are preserved.
- Rockhound applies the same authored bonus-fragment roll to ordinary rocks,
  basalt and completed cave walls. Mother Lode also rewards eligible rich pure
  cinder and emberglass veins without replacing their primary material payout.
- Silver Pickaxe durability is 1,500, twice Iron Pickaxe. Its other stats and full
  repair cost (one Silver Bar plus five bronze) are unchanged.
- The private cellar_dig_progress table gains an appended default-zero work
  column. Release module and content together; no production deployment is part
  of this PR. Existing Silver tools gain the new maximum on repair.

### Harvest and cellar repairs

- Estate barrel/vintage upgrades apply in the cellar and residence, with an
  accessible upgrade menu in all home spaces.
- Clarify preserving barrels versus fermentation casks; preserve existing IDs,
  inventory and recipes.
- Implement Green Thumb, Seed Saver, Bountiful Harvest, Tender Hand, Soil
  Whisperer, Barreling, Master Grower and Harvest Festival. Enable the existing
  Sprinkler Engineering and Greenhouse Charter unlocks with prerequisite checks.
- Keep visitor growth/timing displays aligned with the active estate's skills
  and upgrades. Fix preserving timing when inputs occupy a nonzero slot.
- Add deterministic probability, daily boundary, authority, input restriction,
  processor and UI regression coverage.

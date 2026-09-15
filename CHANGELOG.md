# Changelog

## 0.7.1 — Unreleased

- Allow authorized content editors to repair verified historical packs before gameplay initialization; preserve strict publication results and isolate recovery disconnects.

- Preserve rotated release credentials through signing-key outages while withholding unverified identity tokens.

- Repair hosted CI prerequisites, dry-run portability and portable Keccak hashing;
  retain local licensed-art checks and pin reviewed imports for public CI.

- Allow verified historical content to be read during upgrades while strictly
  validating the candidate and preserving conflict checks and live-only content.
- Explain incompatible game content instead of labeling it a reconnect failure.

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

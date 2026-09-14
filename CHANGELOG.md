# Changelog

## 0.7.0 — Unreleased

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

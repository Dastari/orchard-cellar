# World module changelog

## 0.8.0 — Unreleased

- Add matching fruit-tree seed drops and authorized seed-to-sapling planting.
  Orchard Seed Saver raises the base 5% chance to 35% across three ranks.
- Preserve planted trees across generated resource reconciliation; advance the
  harvest ordinal after depletion. Publish module, content and lifecycle bundle
  revision 14 together. No database schema changes.

## 0.6.1 — Unreleased

- Award mining payout and depletion XP to Farming, matching the authored mining
  skill branch, instead of Explorer. Applies to all ore/rock node classes and
  basalt, cinder and emberglass. Reward amounts are unchanged.
- Preserve historical XP. Partial work, whiffs, rejected actions and cave-wall
  excavation retain their existing no-XP behavior.
- This module-only patch is independent of the Silver Pickaxe/mining-skill PR.
  Client, Studio, schema and authored content versions are unchanged.

Review: [PR #5](https://github.com/Dastari/orchard-cellar/pull/5) is open.
Local validation passed (24 focused tests, world build/typecheck, lint and
lifecycle/content/asset checks); GitHub CI was running at handoff. No merge or
deployment has been performed.

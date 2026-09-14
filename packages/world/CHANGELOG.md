# World module changelog

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

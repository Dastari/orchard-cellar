# Fruit seed harvest PR handoff

- PR: https://github.com/Dastari/orchard-cellar/pull/8
- Branch: `feat/fruit-seed-harvest`, from upstream main `88931047`.
- Implements fruit-tree seed secondary drops (5%, then 15/25/35% with Orchard
  Seed Saver), and planting on clear grass or tilled soil in overworld and
  authorized homesteads. See [design](fruit-seeds-spec.md).
- No schema migration. Release module, content and generated lifecycle revision
  14 together. Existing sapling growth and tree regrowth are reused.
- Focused authority, simulation, lifecycle, prompt and content tests pass; the
  fruit seed helper has 100% targeted V8 coverage. Typecheck, lint, affected
  builds, content validation and art validation pass. Full suite result is
  recorded in the PR testing section.
- Separate chest sort/search work uses `fix/chest-inventory-controls`. Its patch
  version is 0.7.1; retain this feature's newer 0.8.0 when integrating both.
- Neither merge nor production deployment was requested.
